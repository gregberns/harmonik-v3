import { test, expect } from "claude-code/testing";
import { CONFIG, register, parseIntOr, findMarkerLine } from "../hooks/index.js";

// Invoke actual registered callbacks, including their downstream chain.
// These fakes check sequencing; live interactive runs prove host behavior.
function harness(options: any = {}) {
  const hooks: any = {}, calls: any[] = [], logs: string[] = [];
  register((name: string, callback: any) => { hooks[name] = callback; }, {});
  const sentinel = { additionalContext: ["other hook"], text: "native answer", usage: { tokens: 7 }, custom: true };
  let clearing = false;
  let finishSessionChain: (() => void) | undefined;
  const $ = {
    env: { get: async (name: string) => ({ KEEPER_ENABLED: "1", ...options.env })[name] },
    ui: { log: (line: string) => logs.push(line) },
    session: {
      usage: async () => ({ context: { tokens: options.tokens ?? 250000 } }),
      compact: async (args: any) => {
        calls.push(["compact", args]);
        if (options.failure) throw new Error("compact failed");
        return options.skip ? { skip: "veto" } : { tokensBefore: 250000, tokensAfter: 4000 };
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
  return { fire, finish, calls, logs, sentinel, releaseSessionChain: () => finishSessionChain?.() };
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

test("abort, refusal, error, or missing final marker consumes cycle without starting", async () => {
  for (const event of [{ reason: "aborted" }, { reason: "refusal" }, { reason: "error" }, { answer: "HANDOFF_READY\nstill working" }]) {
    const h = harness();
    await h.fire("classic.PostToolUse");
    await h.finish(event);
    await h.finish();
    expect(h.calls).toEqual([]);
    expect(await h.fire("classic.PostToolUse")).toEqual(h.sentinel);
  }
  expect(findMarkerLine('Quoted "HANDOFF_READY"', "HANDOFF_READY")).toBe(false);
  expect(findMarkerLine("Done\nHANDOFF_READY\n\n", "HANDOFF_READY")).toBe(true);
});

test("failed or vetoed compaction never starts another turn", async () => {
  for (const option of [{ failure: true }, { skip: true }]) {
    const h = harness(option);
    await h.fire("classic.PostToolUse");
    await h.finish();
    expect(h.calls.length).toBe(1);
  }
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
