# PAS: testing without a real agent, and run output

For decisions.md Q19 (a fake agent so the engine can be tested end to end),
Q20 (run output and transcripts in a well-defined place) and Q22 (crashes and
timeouts). Read-only desk research, 2026-10-05, on the fork at
`~/github/harmonik-attractor`, commit `50945da`; nothing was built, run or
changed. Paths are relative to `crates/` unless noted. Builds on
[impl-harmonik-attractor.md](impl-harmonik-attractor.md). "Unverified" means
inferred from code, not observed.

## Summary

- **Testing.** No test ever runs a real agent. PAS fakes agents three ways:
  in-process `NodeHandler` doubles (most engine tests), a test-only `program`
  override with `/bin/sh` stubs (31 handler tests), and `claude`/`codex`
  scripts put first on `PATH` for the real `pas` binary (CLI tests). Routing,
  retries, goal gates, stop/resume, kill and human gates are covered end to
  end, but with doubles or tool nodes. Only about 5 tests take a codergen
  node through a real subprocess in a whole pipeline, and none has an agent
  edit or commit files, or retries, times out or resumes a codergen node
  through `pas run`.
- **A digital twin is cheap for Claude.** PAS reads only the last
  `{"type":"result"}` line (`result`, `is_error`, `subtype`, cost, turns)
  plus usage. An executable named `claude` on `PATH`, choosing its scenario
  from an env var, works today with no code change; the CLI tests already do
  this. For "selected by config" PAS needs a production setting for the
  agent program; the fake also needs the node id and attempt, and stdin
  should be closed.
- **Run output.** PAS already has a versioned run folder: a live
  `events.jsonl`, a 30 s heartbeat, `run.json`, a machine-wide run index and
  one transcript per agent spawn, written and flushed line by line. Gaps for
  spotting a hung agent: stderr is never written to disk, nothing on disk
  links a running transcript to its node or records the agent's PID (the
  `LlmInvoked` event comes only at the end), and the heartbeat shows `pas`
  is alive, not the agent. About **3-4 days** closes the Q20 gaps; the two
  Q22 rows here (timeouts and crashes as routable failures, graceful kill)
  add about **2 days**. The full Q22 list and effort, including first-edge
  fallback, exhausted RETRY and the Claude subtype fix, is in
  [spec-gaps-pas.md](spec-gaps-pas.md).
- **Known issues a twin would confirm cheaply:** a result with
  `subtype:"error_max_turns"` and `is_error:false` is recorded as Success
  (already in impl-harmonik-attractor.md §10 and spec-gaps-pas.md;
  `codergen_provider.rs:707` checks only `subtype == "error"`); a timed-out
  or crashed agent fails the whole run and skips routing. New here
  (unverified by a run): if `pas` itself is SIGKILLed, a silent or blocked
  agent and any descendants keep running.

## 1. Testing today

### How tests exercise agent nodes

| Mechanism | Where | What it covers |
|---|---|---|
| In-process doubles registered as `"codergen"` | `attractor-pipeline/src/engine_tests.rs:11-51` (`MockCodergenHandler`) and ~20 ad-hoc handlers (`FailHandler` :394, `RetryThenSuccess` :508, `SlowHandler` :868, `TaskStage` :3015 commits in-process, …); `attractor-pipeline/tests/integration.rs:26-80` (7 tests), `integration_advanced.rs:30-189` (12) | Routing, retries, goal gates, budget, resume, commits. No subprocess |
| `program` override, unused outside tests, + `#!/bin/sh` stub | field `CodergenExecutionControls.program` in the production struct, `handlers/codergen_handler.rs:59-69`, used at :288-291; the only non-test caller passes `None` (:574); `pub(crate)` entry `execute_configured_with_program` :579-626; the 24 handler tests reach it via `execute_with_controls(... program: Some(...))`. Tests: `codergen_handler_tests.rs:555-1452` (24), `codergen_regression_tests.rs` (7, stub at :508-534) | Success, slow streaming, recorded-fixture replay, crash (`exit 3`), non-zero exit after a result, hang vs timeout, silent and garbage output, Codex/Gemini formats |
| `claude`/`codex`/`gemini` scripts first on `PATH`, real `pas` binary | `attractor-cli/tests/cli_semantics.rs:29-64` (`provider_shims()`, response from `$PAS_TEST_PROVIDER_RESPONSE`); all three names print a Codex-format `item.completed` line (:29-40), so only the budget test's own `claude` shim (`run_lifecycle.rs:440-480`) feeds Claude's parser through `pas run` | Provider resolution and label routing through `pas run` |

Fixtures: `attractor-pipeline/tests/fixtures/providers/` has a recorded
`claude-2.1.282.stream.jsonl` (init, status, two assistant messages,
`rate_limit_event`, result), a recorded Codex 0.151.0 stream and constructed
Gemini output.

### End to end without a real agent

| Test | Agent nodes run by |
|---|---|
| `integration.rs`, `integration_advanced.rs`, `engine_tests.rs` | doubles through `PipelineExecutor` (library); one real `CodergenHandler` with a shell stub (`engine_tests.rs:3686`) |
| `cli_semantics.rs:67, 127, 179`; `run_lifecycle.rs:440` | `pas run` with `PATH` shims |
| `run_lifecycle.rs` (rest), `stop.rs`, `kill.rs`, `human_gate.rs`, `answer.rs`, `runs.rs`, `monitor_*` | `pas run` with tool nodes (`tool_command`), or `--dry-run`, which never spawns an agent (`codergen_handler.rs:200-232`) |

Not covered end to end: an agent that edits or commits files and a gate that
checks the result; retry, timeout or resume of a codergen node through
`pas run`; Claude error subtypes with `is_error:false`. Parallel is rejected
at compile time, so it can't be tested (`cli_semantics.rs:415`).

### What PAS does with an agent (what the twin must match)

- **Spawn:** binary `claude`/`codex`/`gemini` from `PATH` unless the test
  override is set (`codergen_handler.rs:288-291`; closed `LlmProvider` enum,
  `execution_plan.rs:15-52`). Claude argv: a leading settings-mode flag
  (`--safe-mode`, `--bare` or `--setting-sources S`,
  `codergen_provider.rs:356-369`), then `-p <prompt> --output-format
  stream-json --verbose --no-session-persistence
  --dangerously-skip-permissions --strict-mcp-config
  --disable-slash-commands`, plus optional `--mcp-config`, `--settings`,
  `--tools`, `--agents`, `--plugin-dir`, `--model`, `--allowedTools`,
  `--max-budget-usd` (:380-405). The twin must accept every one. Codex and Gemini have their own
  argv (:406-432); Gemini is first probed with `--help` (:291-335).
- **Process:** cwd is the run workdir (:435-437); stdout and stderr piped;
  **stdin inherited**; **env inherited**, so a scenario env var reaches the
  fake (proven by `PAS_TEST_PROVIDER_RESPONSE`). Own process group, SIGKILLed
  on timeout (`process_group.rs:40-50`).
- **Prompt:** `Pipeline goal: …`, prior `.result`/`.output` context, then
  `Task (<label>): <prompt>`, plus a label instruction on conditional nodes
  (`codergen_handler.rs:235-275`). **The node id and attempt are not
  passed**, so a fake must key on prompt text or a counter file.
- **Parse:** the last JSON line with `type=="result"`, else the whole stdout
  (`codergen_provider.rs:683-713`); fields `result`, `is_error`, `subtype`,
  `total_cost_usd`, `num_turns` (:22-33); `is_error = is_error ||
  subtype=="error"` (:707). Usage and model from `system/init`, `assistant`
  and `modelUsage`/`usage` (:546-608). `session_id` is never read.
- **Outcome:** `Fail` if `is_error`, else `Success`; never `Retry`
  (`codergen_handler.rs:470-527`). Non-zero exit with no result line is a
  `HandlerError` (:416-433). Only timeouts, rate limits and retryable
  provider errors are retried (`attractor-types/src/error.rs:99-110`); a
  handler error after retries fails the run, bypassing routing
  (`engine.rs:609-641`).

### A Claude digital twin

Minimum output (only the last line is required):

```
{"type":"system","subtype":"init","session_id":"fake-0001","model":"fake-model","cwd":"<pwd>","tools":[]}
{"type":"assistant","message":{"model":"fake-model","role":"assistant","content":[{"type":"text","text":"working"}],"usage":{"input_tokens":10,"output_tokens":5}}}
{"type":"result","subtype":"success","is_error":false,"result":"DONE\nAPPROVE","total_cost_usd":0.01,"num_turns":1,"usage":{"input_tokens":10,"output_tokens":5}}
```

| Scenario | Fake does | PAS today |
|---|---|---|
| success | result line, exit 0 | Success |
| reported failure | `is_error:true` | Fail → edges, goal gate |
| error subtype probe | `subtype:"error_max_turns"`, `is_error:false` | Success (suspected bug) |
| label routing | result text ends with a label line | `preferred_label` |
| crash | partial output, stderr, `exit 3`, no result | run fails (Q22) |
| crash after result | result line, then `exit 1` | parsed normally |
| garbage / silent | non-JSON, or nothing | handler error, run fails |
| hang | init line, then `sleep` past the timeout | timeout, retried if `max_retries` |
| slow stream | lines with delays | transcript grows live |
| budget | large `total_cost_usd` | budget exhausted |
| edit and commit | write files, `git commit` in `$PWD` | `CommitsCreated` (`engine.rs:545, 582`) |
| flaky | counter file: hang or fail N times, then succeed | retries on timeouts and retryable provider errors; codergen never returns `Retry`, and an exhausted retry is not turned into Fail (spec-gaps-pas.md) |

What it needs from PAS:

- **Works today:** a `claude` executable first on `PATH` for `pas run`, with
  the scenario chosen by an env var (e.g. a scenario-file path). Edits and
  commits land in `--workdir`.
- **For "selected by config" (Q19):** a production setting for the agent
  program (node attribute, `pas.toml` or env) feeding `controls.program`,
  today `pub(crate)` and test-only (`codergen_handler.rs:582`). Kilroy's
  guard is a good model: a `test_shim` profile plus an explicit
  `--allow-test-shim` flag, so a fake can't be used by accident.
- **Node identity:** pass node id, attempt and run id to the child (env),
  so scenarios are keyed per node and attempt. None is passed today (no
  `env::var` for them in `src`, unverified beyond grep).
- **Stdin:** `Stdio::null()` (`codergen_provider.rs:435-440`), so a fake or
  Codex can't block on inherited stdin.
- **Harder parts:** the closed provider enum and fixed argv (the fake must
  accept every Claude flag, including `--safe-mode`); Codex's different
  event format; Gemini's `--help` probe; codergen can't return `Retry`, so
  only timeouts exercise retries.

### Prior art

- **Kilroy** (`b55fb0f`), closest to Q19: a config-selected fake executable
  that only works under `llm.cli_profile=test_shim` plus `--allow-test-shim`
  (`internal/attractor/engine/provider_exec_policy.go:41-49`, exercised in
  `cmd/kilroy/main_exit_codes_test.go:557-570`; :112-152 handle the
  `KILROY_*_PATH` overrides).
  Fakes are bash scripts written per test that answer `--help`, print
  stream-json and write Kilroy's `status.json`. Scenarios: file edit
  (`run_with_config_integration_test.go:380-430`), call counter via
  `$KILROY_CALL_COUNT_FILE` (`retry_classification_integration_test.go:188-216`),
  hang for the stall watchdog (`agent_heartbeat_test.go:447-461`),
  timeout-then-succeed (`agent_schema_test.go:230-275`), process-group kill
  (`agent_process_test.go:20-46`).
- **Petri** (`91d1b77`), best model for scenario breadth:
  `crates/fabro/acceptance/testdata/fake_acp_agent.py` picks a behaviour
  with `ACP_MODE` (`timeout` :83, `early_exit` :89, `write_file` :92,
  `malformed`, `cancel`, `permission`, …) and records pid, env and prompt to
  files named by env vars, so tests can assert what the agent received.
- **Fabro** (`7fc0edb`): `twin-openai`, an external deterministic model
  server with per-test namespaces and scenario builders
  (`lib/foundation/fabro-test/src/lib.rs:2193-2300`); heavier and API-level.
- **Codex** and the ACP adapters fake the model API or SDK (wiremock SSE,
  `vi.mock`), not the CLI.

The Kilroy and Petri file:line references were gathered by a sub-agent;
three were spot-checked (Kilroy's test-shim gate, Petri's `ACP_MODE`,
Fabro's twin).

## 2. Run output today

### Layout

The root is `pas run --logs <dir>`; default
`.pas/logs/<dot-stem>-<8-hex hash of the dot path>`, relative to the `pas`
process's cwd, not `--workdir` (`attractor-cli/src/commands/run.rs:154-180,
833-837`). No `pas.toml` setting. Layout from
`attractor-journal/src/layout.rs:1-28`, briefly documented in
`docs/cli-reference.md:78-93`:

```
<logs>/<stem>-<hash>/                  pipeline folder, shared by all runs of this .dot
  checkpoint.json                      one per pipeline; deleted when a run succeeds
  run.lock                             flock + {"pid","run_id"}
  runs/<run-id>/                       UUID v7, or --run-id
    run.json                           metadata, written once (meta.rs:15-44)
    events.jsonl                       run journal
    transcripts/<invocation-id>.jsonl  one per agent spawn: raw stdout
    answers/<question-id>.json         human-gate answers
    control/stop                       stop request
    console.log                        only when the Monitor started the run
$PAS_STATE_DIR/runs.jsonl              machine-wide run index (index.rs:55-108)
```

| File | When written | Live? |
|---|---|---|
| transcript | created before spawn; each stdout line appended and flushed (`handlers/provider_stream.rs:63-80, 95-134`) | yes, per line (no fsync) |
| agent stderr | never; kept in memory, shown only in the error when the agent exits non-zero with no result (`provider_stream.rs:120-126`; `codergen_handler.rs:417-432`) | no |
| `events.jsonl` | each event, one unbuffered write; fsync at most every 5 s and on attempt end or a human gate (`attractor-journal/src/writer.rs:89-107`) | yes |
| `Heartbeat{pid}` | every 30 s from 30 s after start (`attractor-cli/src/commands/run.rs:42-108`) | yes |
| `LlmInvoked` | **only when the agent finishes** (or from `Drop` on timeout) (`codergen_handler.rs:76-133`) | end only |
| `checkpoint.json` | before each attempt (`engine.rs:541`) and after each edge (:1130-1147); deleted on success (:1166-1169) | yes |
| `run.json`, index line | once at start | — |
| tool-node output | never on disk; only in context (`handlers/tool_handler.rs:129-214`) | no |

Not present: per-node directory, prompt file, final result or status file,
artifacts directory.

### Can another process spot a hung agent?

- **Yes for `pas` itself:** the journal's heartbeat and `run.lock` (pid plus
  flock), with a derived status (`running`, `completed`, `failed`, `stopped`,
  or `crashed` after 2 min without a heartbeat and a dead pid;
  `attractor-journal/src/status.rs:53-96`), exposed by `pas runs --json`.
  `attractor_journal::tail` polls the journal every 200 ms (`reader.rs:13-80`).
- **Only indirectly for the agent:** the newest transcript's mtime and size,
  matched to the last `StageStarted`. Nothing on disk says which node a
  running transcript belongs to or what the agent's PID is, and there is no
  idle (no-output) timeout.

### Timeouts and crashes today (Q22)

- **Timeout:** node `timeout`, default 600 s (`codergen_handler.rs:378-410`;
  plus an engine deadline when set, `engine.rs:564-573`). On expiry the agent's
  process group gets an immediate SIGKILL, no SIGTERM first
  (`process_group.rs:40-50`); `LlmInvoked{status:"timeout"}` and
  `StageFailed` are journaled. Retried if attempts remain; otherwise the run
  fails and the checkpoint is kept, so re-running resumes at that node.
- **Agent crash** (non-zero exit, no result line): a handler error that is
  not retried and fails the run, skipping routing, `retry_target` and goal
  gates (`engine.rs:635-640`).
- **`pas` SIGTERM:** the agent's group is killed, `AttemptEnded{stopped}` is
  journaled, exit 143 (`run.rs:715-753`).
- **`pas` SIGKILL:** shown as `crashed` after 2 min; re-running resumes and
  repeats the in-progress stage. The agent leads its own process group, so it
  is not killed: it runs in its own group (`process_group(0)`,
  `process_group.rs:5`), `killpg` runs only in `Drop` (:40-50),
  `kill_on_drop` needs `Drop` (`codergen_handler.rs:310`), and there is no
  parent-death signal (macOS has none). But its stdout and stderr are pipes
  to `pas` (`codergen_provider.rs:438-439`), so a streaming `claude -p`
  likely dies on SIGPIPE/EPIPE at its next write. A silent or blocked agent
  (e.g. Codex waiting on the inherited stdin) stays running, and
  descendants survive either way. `pas kill` can't find them once `pas` is
  dead (it walks the ppid chain, `attractor-cli/src/commands/kill.rs:317-327`).
  Unverified; the twin's hang scenario plus `kill -9` of `pas` is the test.

### Making the run folder a stable "central location"

The base is good: versioned envelopes (`v`, `seq`, `ts`), a reader that
tolerates unknown event types (`event.rs:9-11, 343-349`), golden contract
tests (`attractor-journal/tests/contract_golden.rs`), and a journal crate
with no engine dependencies. The code cites "ADR 0001" and "spec C1-C6",
but neither is in the repo.

| Gap | Change | Effort |
|---|---|---|
| No agent-start event: running transcript ↔ node and agent PID unknown | `LlmStarted{invocation_id, node_id, attempt, provider, child_pid, transcript}` right after spawn (`codergen_handler.rs:345-365`); add to `event.rs` and goldens | 0.5 d |
| stderr not on disk | stream to `transcripts/<id>.stderr.log` (`provider_stream.rs:120-126`) | 0.25-0.5 d |
| No agent-progress signal | add `node_id`, `invocation_id`, `last_output_at` to the heartbeat; optional idle timeout in `run_streaming` | 0.5-1 d (+0.5) |
| Prompt and argv not saved | `transcripts/<id>.prompt.txt` before spawn | 0.25 d |
| No result files | per-node outcome file and `runs/<id>/final.json`, or outcome in `StageCompleted` | 0.5 d |
| Tool output not on disk | tee to `runs/<id>/tools/<node>-<attempt>.{stdout,stderr}.log` | 0.25 d |
| Run-folder doc | `docs/run-folder.md`: every file, format, write timing, versioning | 0.5 d |
| Root relative to `pas` cwd; checkpoint per pipeline | drivers pin `--logs` and `--run-id` today; per-run checkpoint is larger | 0.25 d / 1-2 d |
| **Q22:** timeout or crash fails the run | map them to `Outcome{Fail, failure_reason: timeout\|crash}` after retries, so edges and goal gates decide (`engine.rs:609-641`) | 1 d + tests |
| **Q22:** kill hygiene | SIGTERM, grace, SIGKILL; record the child pgid so orphans can be reaped; `stdin(Stdio::null())` | 0.5-1 d |

Totals: about **3-4 engineer-days** for the Q20 rows (first seven), about
**5-6** with the two Q22 rows here. The full Q22 list (also the first-edge
fallback when no conditional edge matches, `edge_selection.rs:65-75`; an
exhausted RETRY that never becomes FAIL, `engine.rs:589, 627-634`; the
Claude subtype fix) and its effort are in [spec-gaps-pas.md](spec-gaps-pas.md). A run index, pid and lock already exist (`runs.jsonl`,
`run.lock`), so no `run.pid` is needed.

Compared with Kilroy's run folder at `b55fb0f` (`progress.ndjson` flushed
per event, `engine/progress.go:78-84`, with `live.json` as the last event;
`run.pid`; `final.json`, `runtime/final.go:16-27`; per node `prompt.md`,
`response.md`, `status.json`, and for CLI agents `stdout.log`, `stderr.log`,
`events.ndjson`; README.md:386-407): PAS is ahead on journal
versioning, resume and the run index, and behind on stderr, a live status
snapshot, mapping a running transcript to its node, and a final result file.

## Open questions

- Confirm the `error_max_turns` with `is_error:false` → Success path
  (known; spec-gaps-pas.md) with one twin scenario.
- Which agents survive a `pas` SIGKILL? A twin that hangs silently, plus
  `kill -9` of `pas`, would show it.
- Should the twin be a separate provider (a new enum variant with its own
  argv), or impersonate `claude` exactly? Impersonating needs no engine
  change; a variant is cleaner but touches the parser and summarizer.
- Where should run folders live for a driver: under the target repo
  (`.pas/`, not gitignored by `pas init`, unverified) or under a state
  directory?
