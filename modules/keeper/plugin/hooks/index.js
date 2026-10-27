/**
 * hk3-keeper: a small function-hooks plugin proof of concept.
 *
 * Watches absolute token usage during a running session. Once a low
 * configurable threshold is crossed, it asks the agent (mid-turn, via
 * PostToolUse additionalContext) to write its usual HANDOFF.md and finish
 * with a distinctive marker line. Once that marker shows up in the turn's
 * final answer (never in quoted tool output), the plugin calls Claude's own
 * `session.compact`, and only on a confirmed success does it auto-submit a
 * configured startup message to resume work. Independently, any main turn
 * that ends over a hard ceiling is compacted without a handoff, and a
 * refused compaction is retried at every turn end until it succeeds.
 *
 * @type {import('claude-code').Register}
 */

// ---------------------------------------------------------------------------
// CONFIG — the single default source. Edit these constants to change the
// plugin's behavior. A handful support env-var overrides for quick testing
// (see the literal variable names below); everything else, edit here.
// ---------------------------------------------------------------------------
export const CONFIG = {
  // Absolute token threshold (not a percentage of the model's window) that
  // triggers the handoff/compact/startup cycle. Override for a quick test
  // with the env var KEEPER_RESTART_TOKEN_COUNT (e.g. `KEEPER_RESTART_TOKEN_COUNT=500`).
  // A small value may already sit below this project's normal system/tool
  // baseline — that shows up as an immediate trigger, which is expected,
  // not a bug. Watch the logged "usage observed" lines to pick a threshold
  // near the real baseline.
  restartAtTokens: 200000,

  // Exact line the agent must end its handoff turn with. The plugin checks
  // the turn's final answer for a line equal to this marker — never text
  // quoted inside a tool call or tool output.
  handoffMarker: "HANDOFF_READY",

  // Delivered as PostToolUse additionalContext once the threshold is
  // crossed. Keep it aligned with the project's existing HANDOFF workflow;
  // this is a coordination signal, not a new checkpoint protocol.
  handoffPrompt:
    "Context is approaching the configured restart threshold. Please finish " +
    "your current step and write (or update) HANDOFF.md as you normally would.",

  // Optional instructions passed to session.compact(); leave empty to use
  // Claude's own default compaction summary.
  compactInstructions: "",

  // "prompt" submits startupPrompt as plain text via $.prompt.submit.
  // "command" runs it as a slash command via $.command.run (NOT shell
  // execution — this is the engine's own command dispatch, the same path
  // typing "/foo" takes).
  startupKind: "prompt",

  // Exact message or command submitted once compaction (or, in clear mode,
  // a confirmed clear) succeeds.
  startupPrompt: "Read HANDOFF.md and continue from its next step.",

  // Experiment B. EXPERIMENTAL: the reference declarations expose no
  // plugin-callable "clear" API distinct from compact — only /clear as a
  // slash command, and SessionStart{source:"clear"} as an after-the-fact
  // observation. When enabled, the plugin runs /clear via $.command.run and
  // waits for a SessionStart hook reporting source === "clear" as evidence
  // before treating it as successful and submitting startup. A generic
  // command.run resolution with no such SessionStart is logged as
  // unconfirmed, not treated as success. Override with
  // KEEPER_RESTART_CLEAR_MODE=1.
  clearMode: false,

  // Handoff requests in a row that end without the marker (or with an
  // aborted, refused or errored turn) before keeper stops asking. It asks
  // again once usage has fallen below the threshold. The ceiling below still
  // applies meanwhile.
  maxFailedAttempts: 3,

  // Hard ceiling: at the end of any main turn with usage at or over
  // restartAtTokens + ceilingMargin, keeper compacts without asking for a
  // handoff. A refused compaction is retried at every later turn end.
  ceilingMargin: 100000,
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function parseIntOr(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const text = String(raw).trim();
  const parsed = Number(text);
  return /^\d+$/.test(text) && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseBoolOr(raw, fallback) {
  if (raw === undefined || raw === null || raw === "") return fallback;
  return raw === "1" || raw === "true";
}

// Replace {name} and {role} (from HK3_AGENT_NAME / HK3_ROLE) in a
// configured prompt.
export function fillTemplate(text, vars) {
  return text.replace(/\{(name|role)\}/g, (_, key) => vars[key] || "");
}

export function isSubagentEvent(e) {
  // BaseHookInput.agent_id is present on any classic hook fired from inside
  // a subagent; agent_type alone is not sufficient (it also appears on the
  // main thread of an --agent session).
  return Boolean(e.agent_id);
}

export function isSubagentTurn(e) {
  // turn.complete is not a classic event: it carries agentId (camelCase),
  // absent on the main loop, present on every subagent's turn too.
  return Boolean(e.agentId);
}

export function findMarkerLine(text, marker) {
  if (!text) return false;
  return text.trimEnd().split("\n").pop().trim() === marker;
}

// ---------------------------------------------------------------------------
// Per-load state and config. createState() gives register() (and each test)
// fresh state, never shared across plugin loads or across tests.
//
// Keeper checks usage at every tool call (to ask for a handoff) and at every
// main turn end (to compact). After a compaction it asks for a handoff again
// once usage has been seen below the threshold, so a threshold under the
// post-compaction baseline cannot loop. A compaction that is refused (a
// queued message already started the next turn, a PreCompact veto) is owed
// and retried at every turn end until it succeeds.
// ---------------------------------------------------------------------------

export function createState() {
  return {
    armed: true, // may request a handoff at the next tool boundary over the threshold
    failedAttempts: 0, // handoff requests in a row that ended without the marker
    awaitingHandoff: false, // threshold crossed, waiting for the marked answer
    compactOwed: false, // a compaction was refused; retry at the next turn end
    handoffWritten: false, // the owed compaction follows a completed handoff: send startup after it
    floor: 0, // tokens left by the last compaction; the ceiling never sits below floor + margin
    pendingClearConfirm: false, // clear mode: waiting for SessionStart source=clear
    clearConfirmed: false,
    configCache: null,
  };
}

export async function resolveConfig($, state) {
  if (state.configCache) return state.configCache;
  // $.env.get requires a literal variable name at the call site (so the
  // plugin's env reads can be statically listed) -- these literal names
  // are the full set of env variables this plugin reads. It also
  // resolves a Promise (confirmed live: calling it without await silently
  // passes a Promise object through instead of a string, so every override
  // is ignored without an error).
  state.configCache = (async () => {
    // Set by hk3 (harmonik-v3). Without it the plugin is inert, so loading it
    // anywhere other than a keeper-launched session does nothing.
    const enabled = await $.env.get("KEEPER_ENABLED");
    const tokensOverride = await $.env.get("KEEPER_RESTART_TOKEN_COUNT");
    const clearModeOverride = await $.env.get("KEEPER_RESTART_CLEAR_MODE");
    // Per-project prompt overrides, usually set in <project>/.harmonik-v3/config.env.
    const handoffPrompt = await $.env.get("KEEPER_HANDOFF_PROMPT");
    const startupPrompt = await $.env.get("KEEPER_STARTUP_PROMPT");
    const startupKind = await $.env.get("KEEPER_STARTUP_KIND");
    const vars = {
      name: await $.env.get("HK3_AGENT_NAME"),
      role: await $.env.get("HK3_ROLE"),
    };
    return {
      ...CONFIG,
      enabled: parseBoolOr(enabled, false),
      restartAtTokens: parseIntOr(tokensOverride, CONFIG.restartAtTokens),
      clearMode: parseBoolOr(clearModeOverride, CONFIG.clearMode),
      handoffPrompt: fillTemplate(handoffPrompt || CONFIG.handoffPrompt, vars),
      startupPrompt: fillTemplate(startupPrompt || CONFIG.startupPrompt, vars),
      startupKind: startupKind === "command" || startupKind === "prompt" ? startupKind : CONFIG.startupKind,
    };
  })().catch((err) => {
    // Do not cache a failed read for the rest of the load.
    state.configCache = null;
    throw err;
  });
  return state.configCache;
}

function log($, message) {
  $.ui.log(`[hk3-keeper] ${message}`);
}

function errText(err) {
  return err && err.message ? err.message : err;
}

// readTokens: the context size, or undefined when it cannot be read (an
// unknown size must not look like a small one).
async function readTokens($) {
  try {
    const usage = await $.session.usage();
    const tokens = usage && usage.context && usage.context.tokens;
    return Number.isFinite(tokens) ? tokens : undefined;
  } catch (err) {
    log($, `session.usage() failed: ${errText(err)}`);
    return undefined;
  }
}

function ceilingOf(cfg, state) {
  return Math.max(cfg.restartAtTokens, state.floor) + cfg.ceilingMargin;
}

// handoffFailed: the handoff turn ended without the marker. Ask again at the
// next tool call unless that has happened maxFailedAttempts times in a row.
function handoffFailed($, cfg, state) {
  state.failedAttempts += 1;
  state.armed = state.failedAttempts < cfg.maxFailedAttempts;
  log($, state.armed
    ? `handoff failed (attempt ${state.failedAttempts} of ${cfg.maxFailedAttempts}); will ask again at the next tool call`
    : `handoff failed ${state.failedAttempts} times in a row; not asking again until usage falls below the threshold; compacting without a handoff at ${ceilingOf(cfg, state)} tokens`);
}

// compactNow: compact; on success send startup if a handoff was written. A
// refused or vetoed compaction is owed and retried at the next turn end.
async function compactNow($, cfg, state, why) {
  let result;
  try {
    result = await $.session.compact(cfg.compactInstructions ? { instructions: cfg.compactInstructions } : undefined);
  } catch (err) {
    // E.g. "a turn is in flight": a queued message (often a teammate's)
    // started the next turn as soon as the handoff turn ended.
    state.compactOwed = true;
    log($, `${why}: compaction failed: ${errText(err)}; retrying at the next turn end`);
    return;
  }
  if (result && typeof result === "object" && "skip" in result) {
    state.compactOwed = true;
    log($, `${why}: compaction skipped: ${result.skip}; retrying at the next turn end`);
    return;
  }
  const tokensBefore = result && result.tokensBefore;
  const tokensAfter = result && result.tokensAfter;
  log($, `${why}: compaction completed (tokensBefore=${tokensBefore ?? "?"} tokensAfter=${tokensAfter ?? "?"})`);
  const startup = state.handoffWritten;
  Object.assign(state, { compactOwed: false, handoffWritten: false, armed: false, failedAttempts: 0,
    floor: Number.isFinite(tokensAfter) ? tokensAfter : 0 });
  if (startup) await submitStartup($, cfg);
}

async function submitStartup($, cfg) {
  try {
    if (cfg.startupKind === "command") {
      const match = cfg.startupPrompt.trim().match(/^\/?([^\s/]+)(?:\s+([\s\S]*))?$/);
      if (!match) throw new Error("startupPrompt must contain a command name");
      await $.command.run({ command: match[1], args: match[2] || "" });
    } else {
      await $.prompt.submit({ text: cfg.startupPrompt });
    }
    log($, `startup submitted (${cfg.startupKind}): ${cfg.startupPrompt}`);
  } catch (err) {
    log($, `startup submission failed: ${errText(err)}`);
  }
}

// ---------------------------------------------------------------------------
// A. Observe usage at a tool boundary during a running turn, and deliver the
// handoff request mid-turn via PostToolUse additionalContext. Text-only turns
// have no tool boundary; the ceiling check at turn end covers them.
// ---------------------------------------------------------------------------
export async function handlePostToolUse($, e, state) {
  if (isSubagentEvent(e)) return {};
  if (state.awaitingHandoff || state.compactOwed) return {};

  const cfg = await resolveConfig($, state);
  if (!cfg.enabled) return {};
  const tokens = await readTokens($);
  if (tokens === undefined) return {};
  log($, `usage observed: ${tokens} tokens (threshold ${cfg.restartAtTokens})`);

  if (tokens < cfg.restartAtTokens) {
    if (!state.armed) {
      state.armed = true;
      state.failedAttempts = 0;
      log($, `usage below the threshold; re-armed`);
    }
    return {};
  }
  // Another concurrent tool handler may have acted while usage was read.
  if (!state.armed || state.awaitingHandoff || state.compactOwed) return {};

  state.awaitingHandoff = true;
  state.armed = false;
  log($, `threshold reached at ${tokens} tokens; requesting handoff`);
  return { additionalContext: [cfg.handoffPrompt +
    "\nEnd your final answer for this turn with a line containing exactly: " + cfg.handoffMarker] };
}

// ---------------------------------------------------------------------------
// B. Wait for the handoff turn to finish, then call native compaction --
// from turn.complete, NOT classic.Stop.
//
// Confirmed live (not by reading the declarations alone): calling
// $.session.compact from a classic.Stop handler is refused by the host --
// "called from a classic.Stop hook, it would compact under the turn this
// hook is holding; call it from a later event (turn.complete)". classic.Stop
// fires before the turn is actually done unwinding; turn.complete is the
// event the host itself points to instead. This is the ordinary turn.complete
// fallback the plan asked to be documented if used: turn.complete carries the
// same final answer text (`e.answer`, never quoted tool text) that
// classic.Stop's last_assistant_message would have given, plus a `reason`
// that distinguishes a normal answer from an aborted/refused/errored turn,
// which classic.Stop's shape does not expose as directly.
// ---------------------------------------------------------------------------
export async function handleTurnComplete($, e, state) {
  // turn.complete's result shape is { text, usage? }, not the classic
  // hooks' additionalContext shape -- passing e.answer straight through
  // leaves the turn's own visible text untouched in every branch below.
  const passthrough = { text: e.answer };

  if (isSubagentTurn(e)) return passthrough;
  const cfg = await resolveConfig($, state);
  if (!cfg.enabled) return passthrough;

  if (state.awaitingHandoff) {
    state.awaitingHandoff = false;
    if (e.reason !== "answer") {
      // An explicit user interruption (aborted), a model refusal, or an API
      // error ended this turn instead of a normal answer.
      log($, `turn ended with reason="${e.reason}" instead of a normal answer; treating the handoff as failed`);
      handoffFailed($, cfg, state);
    } else if (!findMarkerLine(e.answer || "", cfg.handoffMarker)) {
      log($, "turn completed without the handoff marker; treating handoff as failed");
      handoffFailed($, cfg, state);
    } else {
      log($, `handoff completed (found marker "${cfg.handoffMarker}")`);
      state.failedAttempts = 0;
      state.handoffWritten = true;
      if (cfg.clearMode) {
        await clearNow($, cfg, state);
        return passthrough;
      }
      await compactNow($, cfg, state, "handoff");
      return passthrough;
    }
  }

  if (state.compactOwed) {
    await compactNow($, cfg, state, "owed");
    return passthrough;
  }
  // The operator interrupted this turn; leave them in control until the next.
  if (e.reason === "aborted") return passthrough;
  const tokens = await readTokens($);
  if (tokens !== undefined && tokens >= ceilingOf(cfg, state)) {
    await compactNow($, cfg, state, `ceiling reached at ${tokens} tokens`);
  }
  return passthrough;
}

// clearNow: clear mode after a completed handoff. A failed or unconfirmed
// clear falls back to compaction, retried until it succeeds.
async function clearNow($, cfg, state) {
  log($, "clear mode is experimental; requesting /clear via command.run, success unconfirmed until SessionStart reports source=clear");
  state.pendingClearConfirm = true;
  state.clearConfirmed = false;
  try {
    await $.command.run({ command: "clear" });
    // SessionStart runs inside command.run(clear). Starting a new prompt
    // there deadlocks; wait until clear has returned before submitting.
    if (state.clearConfirmed) {
      Object.assign(state, { handoffWritten: false, armed: false, floor: 0 });
      await submitStartup($, cfg);
    } else {
      log($, "clear unconfirmed; compacting at the next turn end instead");
      state.compactOwed = true;
    }
  } catch (err) {
    log($, `clear command invocation failed: ${errText(err)}; compacting at the next turn end instead`);
    state.compactOwed = true;
  } finally {
    state.pendingClearConfirm = false;
    state.clearConfirmed = false;
  }
}

// ---------------------------------------------------------------------------
// C. Experiment B only: confirm /clear actually happened before trusting it,
// using SessionStart's own source field as the evidence.
// ---------------------------------------------------------------------------
export async function handleSessionStart($, e, state) {
  if (!state.pendingClearConfirm) return {};

  if (e.source === "clear") {
    state.clearConfirmed = true;
    log($, "clear confirmed via SessionStart source=clear");
  }
  return {};
}

export const register = (on, _options) => {
  const state = createState();
  on("classic.PostToolUse", async ($, e, next) => {
    const downstream = await next(e);
    const ours = await handlePostToolUse($, e, state);
    if (!ours.additionalContext) return downstream;
    return { ...downstream, additionalContext: [
      ...(downstream.additionalContext || []), ...ours.additionalContext,
    ] };
  });
  on("turn.complete", async ($, e, next) => {
    const downstream = await next(e);
    await handleTurnComplete($, e, state);
    return downstream;
  });
  on("classic.SessionStart", async ($, e, next) => {
    // Observe clear before yielding to downstream hooks: command.run can
    // resolve while that chain is still settling. No startup runs here.
    await handleSessionStart($, e, state);
    return next(e);
  });
};
