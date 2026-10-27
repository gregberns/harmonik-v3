import { test, expect } from "claude-code/testing";
import { CONFIG, register, parseIntOr, findMarkerLine } from "../hooks/index.js";

// Invoke actual registered callbacks, including their downstream chain.
// These fakes check sequencing; live interactive runs prove host behavior.
function harness(options: any = {}) {
  const hooks: any = {}, calls: any[] = [], logs: string[] = [];
  register((name: string, callback: any) => { hooks[name] = callback; }, {});
  const sentinel = { additionalContext: ["other hook"], text: "native answer", usage: { tokens: 7 }, custom: true };
  let clearing = false;
  let tokens = options.tokens ?? 250000;
  let compactFailures = options.compactFailures ?? (options.failure ? Infinity : 0);
  let finishSessionChain: (() => void) | undefined;
  const $ = {
    env: { get: async (name: string) => {
      if (options.envFailures && options.envFailures-- > 0) throw new Error("env read failed");
      return ({ KEEPER_ENABLED: "1", ...options.env })[name];
    } },
    ui: { log: (line: string) => logs.push(line) },
    session: {
      usage: async () => {
        if (options.usageFailure) throw new Error("usage failed");
        return { context: { tokens } };
      },
      compact: async (args: any) => {
        calls.push(["compact", args]);
        // A queued message (a teammate's) starts the next turn first.
        if (compactFailures-- > 0) throw new Error("a turn is in flight; the conversation compacts between turns");
        if (options.skip) return { skip: "veto" };
        const tokensBefore = tokens;
        tokens = options.tokensAfter ?? 4000;
        return { tokensBefore, tokensAfter: tokens };
      },
    },
    prompt: { submit: async (args: any) => {
      if (clearing) throw new Error("startup nested inside clear");
      calls.push(["prompt", args]);
    } },
    command: { run: async (args: any) => {
      calls.push(["command", args]);
      if (args.command === "clear") {
        clearing = true;
        if (options.clearFailure) throw new Error("clear failed");
        if (!options.noConfirm) {
          const confirmation = fire("classic.SessionStart", { source: "clear" });
          if (!options.detachedSession) await confirmation;
        }
        calls.push(["clear returned"]);
        clearing = false;
      }
    } },
  };
  async function fire(name: string, event: any = {}) {
    return hooks[name]($, event, async (forwarded: any) => {
      expect(forwarded).toEqual(event);
      if (name === "classic.SessionStart" && clearing && options.detachedSession) {
        await new Promise<void>((resolve) => { finishSessionChain = resolve; });
      }
      return sentinel;
    });
  }
  const finish = (event: any = {}) => fire("turn.complete", { reason: "answer", answer: CONFIG.handoffMarker, ...event });
  const setTokens = (n: number) => { tokens = n; };
  return { fire, finish, calls, logs, sentinel, setTokens, releaseSessionChain: () => finishSessionChain?.() };
}

test("registered hooks preserve downstream results and compact then start once", async () => {
  const h = harness();
  expect(await h.fire("classic.SessionStart", { source: "startup" })).toEqual(h.sentinel);
  const result = await h.fire("classic.PostToolUse");
  expect(result.additionalContext.length).toBe(2);
  expect(result.custom).toBe(true);
  expect(await h.finish()).toEqual(h.sentinel);
  expect(h.calls).toEqual([["compact", undefined], ["prompt", { text: CONFIG.startupPrompt }]]);
  expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
  await h.finish();
  expect(h.calls.length).toBe(2);
});

test("async env threshold is strict, positive, and absolute", async () => {
  for (const bad of ["0", "-1", "1junk", "1.5", "Infinity", "9007199254740992"]) expect(parseIntOr(bad, 200000)).toBe(200000);
  expect(parseIntOr("500", 200000)).toBe(500);
  const below = harness({ tokens: 199999 });
  expect(await below.fire("classic.PostToolUse")).toEqual(below.sentinel);
  const low = harness({ tokens: 500, env: { KEEPER_RESTART_TOKEN_COUNT: "500" } });
  expect((await low.fire("classic.PostToolUse")).additionalContext.length).toBe(2);
});

test("concurrent tool hooks request only one handoff", async () => {
  const h = harness();
  const results = await Promise.all([h.fire("classic.PostToolUse"), h.fire("classic.PostToolUse")]);
  expect(results.filter((r: any) => r.additionalContext.length === 2).length).toBe(1);
});

test("subagent hooks never consume the main cycle", async () => {
  const h = harness();
  expect(await h.fire("classic.PostToolUse", { agent_id: "child" })).toEqual(h.sentinel);
  await h.fire("classic.PostToolUse", { agent_type: "custom-main-agent" });
  await h.finish({ agentId: "child" });
  expect(h.calls).toEqual([]);
  await h.finish();
  expect(h.calls.length).toBe(2);
});

test("re-arms after a completed cycle only once usage falls below the threshold", async () => {
  const h = harness();
  await h.fire("classic.PostToolUse");
  await h.finish();
  expect(h.calls.length).toBe(2);
  // Still over the threshold after compaction (a tiny threshold): no loop.
  h.setTokens(250000);
  expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
  h.setTokens(4000);
  expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
  h.setTokens(260000);
  expect((await h.fire("classic.PostToolUse")).additionalContext.length).toBe(2);
  await h.finish();
  expect(h.calls).toEqual([["compact", undefined], ["prompt", { text: CONFIG.startupPrompt }],
    ["compact", undefined], ["prompt", { text: CONFIG.startupPrompt }]]);
});

test("abort, refusal, error, or missing final marker never starts, and asks again", async () => {
  for (const event of [{ reason: "aborted" }, { reason: "refusal" }, { reason: "error" }, { answer: "HANDOFF_READY\nstill working" }]) {
    const h = harness();
    await h.fire("classic.PostToolUse");
    await h.finish(event);
    await h.finish();
    expect(h.calls).toEqual([]);
    expect((await h.fire("classic.PostToolUse")).additionalContext.length).toBe(2);
  }
  expect(findMarkerLine('Quoted "HANDOFF_READY"', "HANDOFF_READY")).toBe(false);
  expect(findMarkerLine("Done\nHANDOFF_READY\n\n", "HANDOFF_READY")).toBe(true);
});

test("failed or vetoed compaction never starts another turn, and is retried at every turn end", async () => {
  for (const option of [{ failure: true }, { skip: true }]) {
    const h = harness(option);
    await h.fire("classic.PostToolUse");
    await h.finish();
    expect(h.calls.length).toBe(1);
    // No new handoff request while the compaction is owed.
    expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
    await h.finish({ answer: "other work" });
    await h.finish({ reason: "aborted" });
    expect(h.calls).toEqual([["compact", undefined], ["compact", undefined], ["compact", undefined]]);
  }
});

test("compaction refused by a queued turn is retried at that turn's end without a new handoff", async () => {
  const h = harness({ compactFailures: 1 });
  await h.fire("classic.PostToolUse");
  await h.finish();
  expect(h.calls).toEqual([["compact", undefined]]);
  // The queued turn runs: no second handoff request.
  expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
  await h.finish({ answer: "replied to a teammate" });
  expect(h.calls).toEqual([["compact", undefined], ["compact", undefined], ["prompt", { text: CONFIG.startupPrompt }]]);
});

test("ceiling: any main turn end over threshold + margin compacts without a handoff or startup", async () => {
  const ceiling = CONFIG.restartAtTokens + CONFIG.ceilingMargin;
  const h = harness({ tokens: ceiling - 1 });
  await h.finish({ answer: "text-only turn" });
  expect(h.calls).toEqual([]);
  h.setTokens(ceiling);
  await h.finish({ agentId: "child", answer: "subagent turn" });
  await h.finish({ reason: "aborted", answer: "" });
  expect(h.calls).toEqual([]);
  await h.finish({ answer: "text-only turn" });
  expect(h.calls).toEqual([["compact", undefined]]);
});

test("ceiling: an ignored handoff request still ends in compaction", async () => {
  const h = harness();
  await h.fire("classic.PostToolUse");
  h.setTokens(CONFIG.restartAtTokens + CONFIG.ceilingMargin + 5);
  await h.finish({ answer: "kept working" });
  expect(h.calls).toEqual([["compact", undefined]]);
});

test("ceiling sits above a heavy post-compaction baseline, so it cannot compact every turn", async () => {
  const after = CONFIG.restartAtTokens + CONFIG.ceilingMargin + 10000;
  const h = harness({ tokens: after + 50000, tokensAfter: after });
  await h.finish();
  expect(h.calls.length).toBe(1);
  await h.finish();
  expect(h.calls.length).toBe(1);
  h.setTokens(after + CONFIG.ceilingMargin);
  await h.finish();
  expect(h.calls.length).toBe(2);
});

test("stops asking after maxFailedAttempts unmarked handoffs, but the ceiling still compacts", async () => {
  const h = harness();
  for (let i = 0; i < CONFIG.maxFailedAttempts; i++) {
    expect((await h.fire("classic.PostToolUse")).additionalContext.length).toBe(2);
    await h.finish({ answer: "no marker" });
  }
  expect(h.calls).toEqual([]);
  expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
  h.setTokens(CONFIG.restartAtTokens + CONFIG.ceilingMargin);
  await h.finish({ answer: "no marker" });
  expect(h.calls).toEqual([["compact", undefined]]);
  // Below the threshold after compaction: asks for a handoff again.
  await h.fire("classic.PostToolUse");
  h.setTokens(250000);
  expect((await h.fire("classic.PostToolUse")).additionalContext.length).toBe(2);
});

test("unreadable usage neither re-arms nor compacts", async () => {
  for (const option of [{ usageFailure: true }, { tokens: undefined as any }]) {
    const h = harness({ ...option });
    if (!option.usageFailure) h.setTokens(undefined as any);
    expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
    await h.finish({ answer: "text" });
    expect(h.calls).toEqual([]);
  }
});

test("a failed settings read is not cached for the rest of the load", async () => {
  const h = harness({ envFailures: 1 });
  await h.fire("classic.PostToolUse").catch(() => {});
  expect((await h.fire("classic.PostToolUse")).additionalContext.length).toBe(2);
});

test("clear confirms inside SessionStart but starts only after clear returns", async () => {
  const h = harness({ env: { KEEPER_RESTART_CLEAR_MODE: "1" } });
  await h.fire("classic.PostToolUse");
  await h.finish();
  expect(h.calls).toEqual([["command", { command: "clear" }], ["clear returned"], ["prompt", { text: CONFIG.startupPrompt }]]);
  await h.fire("classic.SessionStart", { source: "clear" });
  expect(h.calls.length).toBe(3);
});

test("unconfirmed or failed clear never resumes, even after a later manual clear", async () => {
  for (const option of [{ noConfirm: true }, { clearFailure: true }]) {
    const h = harness({ ...option, env: { KEEPER_RESTART_CLEAR_MODE: "1" } });
    await h.fire("classic.PostToolUse");
    await h.finish();
    await h.fire("classic.SessionStart", { source: "clear" });
    expect(h.calls.some((c: any) => c[0] === "prompt")).toBe(false);
  }
});

test("configured marker is sent automatically and command startup separates name and args", async () => {
  const saved = { ...CONFIG };
  try {
    CONFIG.handoffMarker = "CUSTOM_READY";
    CONFIG.startupKind = "command";
    for (const command of ["/session-resume task one", "session-resume task one"]) {
      CONFIG.startupPrompt = command;
      const h = harness();
      const result = await h.fire("classic.PostToolUse");
      expect(result.additionalContext[1].endsWith("CUSTOM_READY")).toBe(true);
      await h.finish();
      expect(h.calls[1]).toEqual(["command", { command: "session-resume", args: "task one" }]);
    }
  } finally { Object.assign(CONFIG, saved); }
});


test("clear confirmation is recorded before slow downstream SessionStart hooks settle", async () => {
  const h = harness({ detachedSession: true, env: { KEEPER_RESTART_CLEAR_MODE: "1" } });
  await h.fire("classic.PostToolUse");
  await h.finish();
  expect(h.calls).toEqual([["command", { command: "clear" }], ["clear returned"], ["prompt", { text: CONFIG.startupPrompt }]]);
  h.releaseSessionChain();
});

test("inert unless launched by keeper (KEEPER_ENABLED)", async () => {
  for (const value of [undefined, "0"]) {
    const h = harness({ env: { KEEPER_ENABLED: value } });
    expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
    await h.finish();
    expect(h.calls).toEqual([]);
    expect(h.logs).toEqual([]);
  }
});

test("env prompt overrides fill {name} and {role}", async () => {
  const h = harness({ env: {
    KEEPER_HANDOFF_PROMPT: "Run /session-handoff {name} as {role}.",
    KEEPER_STARTUP_KIND: "command",
    KEEPER_STARTUP_PROMPT: "/session-resume {name}",
    HK3_AGENT_NAME: "fred",
    HK3_ROLE: "builder",
  } });
  const result = await h.fire("classic.PostToolUse");
  expect(result.additionalContext[1].startsWith("Run /session-handoff fred as builder.")).toBe(true);
  await h.finish();
  expect(h.calls[1]).toEqual(["command", { command: "session-resume", args: "fred" }]);
});
