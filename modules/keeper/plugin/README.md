# hk3-keeper

A standalone Claude Code plugin: reach a token threshold, ask the agent to
write its usual HANDOFF, compact or clear, then submit a configured startup
message. No Go helper, Node/npm install, or keeper is needed.

## Try it

Requires Claude Code **2.1.280**, the version tested here. Function hooks are
early access. Use an interactive terminal; native compaction rejects `-p`
and SDK sessions on this version.

From inside a project:

```sh
hk3 new agent claude --name alpha
hk3 resume agent claude <session-id>   # omit the id for the picker
```

`hk3` (`harmonik-v3` at the repo root) loads settings (see the top-level
README), sets `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and `KEEPER_ENABLED=1`, and
runs `claude --plugin-dir modules/keeper/plugin` from the project's git root.
The plugin lives in hk3's keeper module (`modules/keeper/`), next to
`defaults.sh`, which holds the `KEEPER_*` defaults hk3 applies.

The plugin is never installed: `--plugin-dir` loads it for that launch only.
It is also inert unless `KEEPER_ENABLED=1`, so it does nothing if loaded
some other way.

Run in a disposable test project without keeper managing that session. To
load the plugin there, replace the path with the absolute plugin path in
your clone. Existing keeper `PreCompact` hooks can block this experiment.
`--plugin-dir` adds this plugin for this launch; it does not install it or
change global settings. Your other configured plugins/hooks still apply.

Give the agent a task that uses tools and has a next step after HANDOFF.
Watch for `[hk3-keeper]` logs: observed tokens, handoff requested,
handoff completed, compaction completed (before/after counts), startup
submitted. Check that the resumed agent reads HANDOFF and completes the
next step without another keystroke.

500 tokens is deliberately below most system/tool baselines, so the first
tool call should trigger it. Omit the token override for the **200,000-token**
default. The plugin performs **one cycle per load**, including failed cycles;
relaunch to repeat. This prevents a tiny test threshold causing a loop.

## Configuration

Edit the `CONFIG` object near the top of `hooks/index.js`. It contains all
behavior defaults:

| Setting | Purpose |
|---|---|
| `restartAtTokens` | Absolute token threshold, default 200000. |
| `handoffPrompt` | Message asking the agent to persist state. |
| `handoffMarker` | Required final non-empty answer line; appended to the request automatically. |
| `compactInstructions` | Optional instructions for Claude's built-in summarizer. |
| `startupKind` | `"prompt"` or `"command"`. |
| `startupPrompt` | Startup text, or slash command such as `/session-resume task one`. Commands are Claude commands, not shell commands. |
| `clearMode` | Use `/clear` instead of built-in compaction, default false. |

`KEEPER_HANDOFF_PROMPT`, `KEEPER_STARTUP_KIND` and `KEEPER_STARTUP_PROMPT`
override the prompts per project; `{name}` and `{role}` are filled from
`HK3_AGENT_NAME` and `HK3_ROLE` (a team member's name is `<team>--<member>`,
so `HANDOFF-{name}` gives `HANDOFF-alpha--builder`).

Two environment overrides make quick tests easy:

- `KEEPER_RESTART_TOKEN_COUNT=500` overrides the threshold. Invalid, fractional,
  zero, and negative values fall back to the configured default.
- `KEEPER_RESTART_CLEAR_MODE=1` selects clear (`true` also enables it).

The agent writes HANDOFF before either transition. Compaction uses Claude's
own summary. Clear discards the conversation; startup tells the agent where
to read its HANDOFF. The plugin constructs no replacement conversation.

## Mechanism and limits

`classic.PostToolUse` checks usage on the main agent's tool boundaries and
adds the handoff request to `additionalContext`. A text-only turn has no
threshold check. Parallel tool callbacks request only one handoff.

`turn.complete` checks that the main turn finished normally and its final
non-empty answer line equals the marker. Abort, refusal, error, or a missing
marker ends the experiment without restarting. `classic.Stop` is too early:
Claude rejects compaction from a hook still holding the turn open.

After successful compaction, the plugin submits startup. Compaction errors
or vetoes do not submit startup. In clear mode, `SessionStart.source=clear`
records confirmation during `command.run(clear)`. Only after that command
returns does startup run. Submitting startup inside SessionStart deadlocks.
All registered hooks call `next(e)` and preserve downstream results.

Interactive tests on Claude Code 2.1.280 verified the candidate plugin with
both compaction → prompt continuation and clear → prompt continuation. Each
agent wrote HANDOFF, resumed automatically, read it, and completed the next
task. Native validation passed and all 10 registered-callback tests passed.
A third live test changed only the startup configuration to a local slash
command with an argument; Claude expanded the command and wrote the expected
argument into the result file after clear.

This POC has no repeated cycles, three-tier warnings, or keeper integration.

## Checks

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate modules/keeper/plugin --json
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test modules/keeper/plugin
```

Tests invoke the actual registered callbacks with fake engine operations and
downstream hook results. They check ordering, hook chaining, configuration,
subagent exclusion, concurrent tool calls, abort/failure/veto handling, and
one-shot behavior. They cannot prove real host scheduling; interactive
canaries supply that evidence.
