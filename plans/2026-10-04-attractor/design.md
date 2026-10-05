# Attractor design: the PAS fork

A plan, not code. It covers decisions Q12-24 for the operator's fork of PAS
(`~/github/harmonik-attractor`, at `50945da`). Code changes come later, in
that repo. Terms follow [CONTEXT.md](CONTEXT.md); module, interface, seam,
adapter, depth, leverage and locality are used as in the codebase-design
skill.

Inputs: [decisions.md](decisions.md) Q12-24 and, in [research/](research/),
[impl-harmonik-attractor.md](research/impl-harmonik-attractor.md),
[spec-gaps-pas.md](research/spec-gaps-pas.md),
[test-and-output-pas.md](research/test-and-output-pas.md) and
[kilroy-git.md](research/kilroy-git.md). Paths below are under the fork's
`crates/` unless noted.

Every choice the operator hasn't made is in [Operator
questions](#operator-questions) at the end. Where this document shows one
option, it is the proposal those questions would confirm or change.

## Summary

- **Agent handler crate.** A new crate, `attractor-agents`, owns
  everything about running one agent process: profile resolution, argv,
  environment, stdin, the transcript and stderr files, the start event,
  timeouts and graceful kill, output parsing and failure classification.
  The engine keeps prompt assembly, routing, retries and git. Three shapes
  were designed in parallel (one call; a session interface; ports and
  adapters). The proposal is a hybrid: the one-call interface of the first,
  with a crate-private protocol seam from the third, justified because two
  mechanisms move in: the new `claude -p` and today's Codex path, ported
  rather than dropped (decision Q5). No other mechanism is built.
- **Agent config.** A shipped `agents.toml` of named agent profiles replaces
  the closed `LlmProvider` enum. A new model or flag, or a new agent that
  speaks an output format PAS already reads, is a config edit. An agent
  with a new output format (dsh, ZCode, Qwen Code) needs a new mechanism,
  which is code; a plain `exec` mechanism would remove that limit (operator
  question). Reasoning level becomes a profile field passed through (Claude:
  `--effort <level>`, present in `claude --help` 2.1.280).
- **Worktree and commits.** Each run gets its own git worktree and branch.
  The location is a project setting with a CLI override. The engine commits
  after every node attempt.
- **Run folder.** PAS's existing run folder becomes a documented contract,
  plus an agent-start event, an on-disk stderr file, the prompt, per-node
  results and a final result file.
- **Failure routing (Q22).** Timeouts and crashes become routable FAIL
  outcomes with a failure class. Exhausted retries become FAIL, the
  first-edge fallback goes, and `retry_target`/`fallback_retry_target`
  apply to FAIL as the spec says. The Claude error-subtype bug is fixed.
- **Digital twin.** A fake `claude -p` executable, selected through a test
  profile behind an explicit flag, drives the real production path in end
  to end tests.

## 1. The agent handler crate (Q14, Q23)

### Today

`CodergenHandler` (`attractor-pipeline/src/handlers/codergen_handler.rs`)
mixes four jobs: prompt assembly; invocation bookkeeping (transcripts, the
`LlmInvoked` event); timeout and process-group kill; and a provider-specific
command builder and parser keyed on `LlmProvider { Claude, Codex, Gemini }`
(`execution_plan.rs:15-52`, `codergen_provider.rs:348-840`). The agent
process is a true external dependency; a fake executable is a local
stand-in for it.

Constraints on any interface:
- The engine owns git (Q15-17), prompts, routing and retries; the crate
  never touches them.
- Every way an agent can fail must come back as data the engine can route
  (Q22), not as an error.
- A start event with pid and file paths must reach the journal before the
  agent produces output (Q20).
- The fake agent must go through the same code as `claude` (Q19).
- ACP, direct exec, tmux and a remote host must fit later without changing
  the engine's side (Q14, Q23).

### Three shapes considered

**A. One call.** `Agents::load`, `Agents::check(selection)` (plan-compile
validation) and `async Agents::run(request) -> AgentResult`. `run` never
returns an error: the result has `Completed` or `Failed(class)`. An
optional observer gets `Started` and `Finished`. A crate-private
`Mechanism` trait holds the adapters.
- Depth: high. The caller learns three functions and two statuses; about a
  thousand lines of process, stream and parsing code sit behind them.
- Weak: no mid-run control (steer, attach); remote is awkward because the
  request carries a local `cwd`.

**B. Sessions.** A public `Mechanism` trait (`validate`, `start`,
`attach`) returning an `AgentSession` (`events`, `send`, `cancel`, `wait`,
`detach`), with declared capabilities and a `drive()` helper for the
one-shot case.
- Depth: lower. `claude -p` uses none of `send`, `attach`, `detach` or most
  capability fields, so the interface is a guess until ACP or tmux exists.
- Strong: a journaled session handle lets a restarted `pas` reattach or kill
  an agent left running; tmux and long-lived agents fit naturally.

**C. Ports and adapters.** One deep `AgentRunner::invoke(request, observer,
cancel)` plus two public ports: a `Launcher` (where the process runs:
local, ssh, tmux) and an `AgentProtocol` (how to drive and decode it:
claude stream-json, ACP).
- Depth: high in the runner; every requirement (env, files, start event,
  kill, failure table) lives once and every mechanism and host inherits it.
- Weak: the `Launcher` port has one adapter (local) today, so it is a
  hypothetical seam; nonsense pairs (tmux × ACP) type-check.

Compared:
- **Leverage:** A and C equal for the engine (one call, one result); B asks
  the engine to drive a session.
- **Locality:** C's runner and A's shared runner both put env, files, kill
  and classification in one place; B spreads some of it into each session.
- **Seam placement:** all three put the seam between "engine semantics"
  (prompt, routing, git) and "running an agent". They differ on how much
  of the inside is public: A none, C two ports, B the whole session.

### Proposal: A's interface with C's insides

- **Public interface** (A):

  ```rust
  pub struct Agents;                       // loaded, validated profiles
  impl Agents {
      pub fn load(layers: &[ConfigSource], allow_test_agents: bool) -> Result<Agents, ConfigError>;
      pub fn check(&self, sel: &Selection) -> Result<(), ConfigError>;       // used by plan compile
      pub async fn run(&self, req: AgentRequest<'_>) -> AgentResult;          // never Err
  }
  pub struct Selection { pub profile: String, pub model: Option<String>, pub reasoning: Option<String> }
  pub struct AgentRequest<'a> {
      pub selection: Selection,
      pub prompt: String,            // assembled by the engine
      pub workdir: PathBuf,          // the run's worktree
      pub timeout: Option<Duration>, // node timeout, else profile timeout
      pub record: Record,            // run_id, node_id, attempt, invocation_id, output dir
      pub observer: Option<&'a dyn AgentObserver>,   // Started, Finished -> journal
      pub cancel: CancellationToken, // pas stop / kill
  }
  pub struct AgentResult {
      pub invocation_id: String,
      pub status: AgentStatus,       // Completed | Failed(FailureClass) | Cancelled
      pub text: String, pub detail: String,
      pub usage: Usage, pub exit: Option<ExitInfo>, pub duration: Duration,
      pub files: InvocationFiles,    // prompt, transcript, stderr
  }
  pub enum FailureClass { Reported, Timeout, Crash, NoResult, Launch }
  ```

- **Inside the crate** (C): a runner that owns files, env, the start event,
  the timer, kill and the failure table. Behind it, a crate-private
  `Protocol` trait with two adapters: `claude-p` (new) and `codex-exec`
  (today's Codex command and parser, `codergen_provider.rs:406-421,
  715-757`, moved, not rewritten). Two adapters make it a real seam.
  Process launching stays concrete local code; a `Launcher` trait is
  extracted only when a remote or tmux launcher is built ("one adapter
  means a hypothetical seam").
- **From B:** the start event carries the process-group id, so a later
  `pas` can find and kill an agent left running (section 4).

Invariants of `run`:
1. Before spawn: `<id>.prompt.txt`, an empty `<id>.jsonl` and an empty
   `<id>.stderr.log` exist under the output directory.
2. The child gets `cwd = workdir`, stdin `/dev/null` (a protocol pipe for a
   future ACP mechanism, never the inherited stdin), its own process group,
   and an environment the runner computes from the profile: the parent's
   environment minus the profile's `remove` list, then the profile's `set`
   (applied after `remove`), plus `PAS_RUN_ID`, `PAS_NODE_ID`,
   `PAS_ATTEMPT` and `PAS_INVOCATION_ID`. The complete map is passed to the
   launch, so a future remote launcher can send it explicitly.
3. `Started` (invocation id, pid, pgid, file paths, profile, model) is sent
   once, after spawn and before the first line is read. No spawn, no
   `Started`.
4. stdout and stderr are appended and flushed line by line to their files.
5. Timeout or cancel: SIGTERM to the group, wait the profile's
   `kill_grace` (default 10 s), then SIGKILL. A drop guard still kills the
   group if the future is dropped.
6. `Finished` is sent exactly once, including on launch failure and cancel,
   and equals the return value.
7. The crate never touches git, never retries and never writes outside the
   output directory.

`claude-p` failure table (first match wins):

| Observed | Status |
|---|---|
| cancelled | `Cancelled` |
| timeout fired | `Failed(Timeout)` |
| final `result` line, `is_error` or `subtype` starting `error` | `Failed(Reported)` (fixes `codergen_provider.rs:707`) |
| final `result` line otherwise | `Completed`, even after a non-zero exit (today's rule) |
| no result line, non-zero exit or signal | `Failed(Crash)` |
| no result line, exit 0 | `Failed(NoResult)` |
| could not start | `Failed(Launch)` |

The `claude-p` mechanism adds only the flags its parser depends on: `-p
<prompt> --output-format stream-json --verbose`. Everything else comes from
the profile.

### Engine side

- `CodergenHandler` keeps prompt assembly (`codergen_handler.rs:237-276`),
  label extraction and context updates. It calls `run` and maps the
  result: `Completed` → Success; `Failed(class)` → Fail with
  `failure_reason` and `<node>.failure_class`; `Cancelled` → the engine's
  stop path.
- Plan compilation calls `check` in place of the `llm_provider` checks
  (`execution_plan.rs:970, 1024-1043`). A node names `agent="<profile>"`;
  `llm_model` and `reasoning_effort` are overrides. `reasoning_effort` is
  no longer rejected (`docs/execution-capabilities.md:22`).
- `codergen_provider.rs`, `provider_stream.rs` and `process_group.rs` move
  into the crate. `LlmProvider` is deleted. Codex keeps working as the
  `codex-exec` mechanism; Gemini's fate is an operator question.
- **Compatibility:** `llm_provider="claude"` and `"codex"` stay accepted
  as aliases for the default profiles of the same name, with a deprecation
  warning, so existing `.dot` files run unchanged. `[codergen.claude]` in
  `pas.toml` is read into the `claude` profile's `args` with a warning
  (operator question on how long to keep both).

### How other mechanisms fit (not built)

| Mechanism | Fits as |
|---|---|
| direct exec | a protocol: text = stdout (or a result file), status from the exit code |
| ACP | a protocol with stdin as a JSON-RPC pipe: `initialize`, `session/new` (cwd), `session/prompt`; transcript = the update stream; cancel sends `session/cancel` before TERM; permission answers from a profile policy |
| tmux | a launcher that runs the agent in a pane, streams `pipe-pane` output, and reads exit status from a file; no structured result unless the profile defines one |
| remote (Q23) | a launcher that runs the command on another host with the environment sent explicitly (invariant 2 makes this possible), streams lines back into the local files, and maps signals over the connection. The worktree must exist on that host; the previous attempt's node commit (or `base_sha` for the first node, section 3) is the starting point the host checks out, and its work comes back by push. "Host unreachable" is a `Launch` failure |

## 2. Agent and model config (Q13)

- **File:** a default `agents.toml` ships with PAS and is embedded in the
  binary, so a fresh install works. A project file and a `--agents <file>`
  flag layer over it; a later layer replaces whole profiles by name. (Where
  the project file lives is an operator question.)
- **Profile fields:** `mechanism`, `command`, `args`, `model`,
  `model_args`, `reasoning`, `reasoning_args`, `timeout`, `kill_grace`,
  `env` (`remove`, `set`; `set` applied after `remove`), `test_only`,
  `inherit_from`. Templates: `{model}`, `{reasoning}`. An allowlist env mode
  is added only if the operator chooses it (question 5).
- **Limit of "config, not code" (Q13 vs Q14):** a profile can point at any
  binary, but the engine must read its output. Agents that print Claude
  stream-json or Codex JSON need no rebuild; an agent with another format
  (dsh's NDJSON, ZCode, Qwen Code) needs a new mechanism. A trivial `exec`
  mechanism (stdout is the text, exit code is the status) would make any
  CLI usable from config alone, at the cost of losing cost and usage data.
  Whether to build it now is an operator question.
- **Example (default file):**

  ```toml
  [defaults]
  timeout = "10m"
  kill_grace = "10s"
  [defaults.env]
  remove  = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
             "OPENAI_API_KEY", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX"]

  [profiles.claude]
  mechanism = "claude-p"
  command   = ["claude"]
  args      = ["--safe-mode", "--no-session-persistence", "--dangerously-skip-permissions",
               "--strict-mcp-config", "--disable-slash-commands"]
  model_args     = ["--model", "{model}"]
  reasoning_args = ["--effort", "{reasoning}"]

  [profiles.codex]
  mechanism  = "codex-exec"
  command    = ["codex"]
  args       = ["exec", "--json", "--yolo", "--skip-git-repo-check", "--ephemeral"]
  model_args = ["--model", "{model}"]

  [profiles.claude-opus]
  inherit_from = "claude"
  model = "opus"
  reasoning = "high"
  ```

- Removing `ANTHROPIC_API_KEY` by default keeps a stray key from silently
  moving a node from the Max subscription to API billing
  (impl-harmonik-attractor.md §7). A profile that routes Claude Code to
  GLM or DeepSeek (harnesses.md) sets `ANTHROPIC_BASE_URL` and a key in its
  own `set`, which is applied after `remove`.
- The `[codergen.claude]` section of `pas.toml`
  (`attractor-quality/src/manifest.rs:43-59`) folds into profile `args`.
- Validation: `pas validate` resolves every profile a pipeline uses
  (`check`); an unknown profile or an override the profile can't take
  (`reasoning` without `reasoning_args`) fails before the run starts.

## 3. Worktree and node commits (Q15-17)

- **Creation:** at run start the engine creates a branch `pas/run/<run-id>`
  from the source repo's current `HEAD` and a worktree for it. Every node
  runs with `workdir` = that worktree.
- **Location:** `worktree_root` in the project config, overridable with
  `--worktree-root`; the worktree is `<worktree_root>/<run-id>`. The
  default root is an operator question.
- **Ordering fix:** PAS today canonicalizes the workdir and takes its
  locks before it knows the run id (kilroy-git.md §9). Locks still come
  first, so a refused run leaves no trace (PAS's rule C5,
  `attractor-cli/src/commands/run.rs:838-843`). The new order in
  `prepare_run` (`run.rs:781+`):
  1. resolve the pipeline folder from `--logs` and take the Pipeline lock
     (`<logs_dir>/run.lock`, `run.rs:377-392`), which needs no run id;
  2. read the checkpoint, which gives the run id on resume, or mint one
     (or take `--run-id`);
  3. create or reuse `<worktree_root>/<run-id>` and its branch;
  4. take the Worktree lock (`<git-dir>/pas-run.lock`);
  5. record `worktree`, `branch` and `base_sha` in `run.json`.
- In a linked worktree `--absolute-git-dir` is `.git/worktrees/<name>`, so
  with one worktree per run the Worktree lock is per run and nearly
  redundant, and `--allow-shared-workdir` loses its meaning. It stays for a
  run that opts out of worktrees (if allowed) and as a guard against two
  processes resuming the same run.
- **Node commit:** after every node attempt ends, whatever its status, the
  engine runs `git add -A` (excluding the run folder if it is inside the
  worktree) and `git commit --allow-empty -m "pas(<run-id>): <node> attempt
  <n> (<status>)"` with trailers `Pas-Run`, `Pas-Node`, `Pas-Attempt`,
  `Pas-Status`. The SHA goes into the journal (`StageCompleted` or
  `StageFailed`) and the checkpoint. If the agent committed during the node,
  the engine's commit stacks on top (often empty), as Kilroy does.
  `CommitsCreated` (`engine.rs:575-585, 653-693`) keeps reporting agent
  commits. If the repo has no `user.name`/`user.email`, the engine commits
  with a fixed identity (`PAS <pas@localhost>`) via `-c` options, as Kilroy
  does (`git.go:140-169`).
- **What proves completion** and **what resume does with the worktree**
  are operator questions (Q16 and resume below).
- **Cleanup and merge-back:** none by default; the branch and worktree stay
  for the user (as Kilroy). A `pas runs prune` that removes worktrees is
  not built (operator question 10).
- Commits use `--no-verify`, so the target repo's pre-commit hooks don't
  block a node commit (an operator question).

## 4. Run folder as the central location (Q20)

PAS already writes a versioned run folder (test-and-output-pas.md §2). The
design keeps its layout and adds what a reader needs to spot a hung agent
and read results:

```
<logs>/<stem>-<hash>/
  checkpoint.json
  run.lock
  runs/<run-id>/
    run.json                    + worktree, branch, base_sha
    events.jsonl                + LlmStarted, failure_class, commit SHAs
    transcripts/<inv>.jsonl     stdout, live (unchanged)
    transcripts/<inv>.stderr.log  NEW, live
    transcripts/<inv>.prompt.txt  NEW, prompt + argv + env names (no values)
    nodes/<node>/<attempt>.json   NEW, outcome: status, failure_class, reason, notes, commit, invocation
    tools/<node>-<attempt>.{stdout,stderr}.log  NEW, tool-node output
    final.json                  NEW, run status, last node, final commit, cost
    answers/, control/          unchanged
```

- **New journal event `LlmStarted`** `{invocation_id, node_id, attempt,
  profile, model, pid, pgid, transcript, stderr}`, written from the crate's
  `Started` before the agent's first output. With it, a reader can map a
  growing transcript to its node and see the agent's pid.
- **Agent progress:** the 30 s `Heartbeat` (`run.rs:42-108`) gains
  `invocation_id` and `last_output_at`, so "pas alive, agent silent" is
  visible without reading file times.
- **Final and per-node results** let a reader skip parsing the journal;
  `final.json` appearing marks the end.
- **Contract:** a `docs/run-folder.md` in the fork lists every file, its
  format, when it is written and its version field. New files and events
  carry `v`; readers ignore unknown event types (already true,
  `attractor-journal/src/event.rs:9-11`).
- **Orphans:** `LlmStarted` also records the host and the leader's start
  time. On start or resume, if the journal's last `LlmStarted` has no
  matching `LlmInvoked`, the engine checks that the host matches and that
  the leader pid still exists with the same command and start time; only
  then does it kill that group before re-running the node. On any mismatch
  (reboot, reused pid) it skips with a warning. Today an agent can outlive
  a SIGKILLed `pas` (test-and-output-pas.md §2).

## 5. Failure routing (Q22)

From spec-gaps-pas.md, matching spec §3.5 and §3.7:

1. **Agent and tool failures are outcomes.** With the crate, an agent
   timeout, crash, no result or launch failure returns Fail with
   `failure_class`, not `Err`. Tool nodes get the same treatment: a tool
   command that times out or cannot start becomes Fail with `timeout` or
   `launch` (`handlers/tool_handler.rs`); a non-zero exit is already a Fail.
   The engine's `Err` path (`engine.rs:635-640`) remains only for engine
   faults (bad config, I/O on the run folder).
2. **Retries:** the engine retries an attempt whose failure class is
   `timeout` up to `max_retries`, then the outcome stays Fail and is
   routed. No codergen path produces `RateLimited` today
   (`attractor-types/src/error.rs:16, 103-106`): a Claude rate limit is an
   `is_error` result, so it is `Reported` and not retried. A `rate_limited`
   class detected from the result or `rate_limit_event` is an operator
   question.
3. **Exhausted RETRY becomes FAIL** (`engine.rs:589, 627-634`; spec
   510-515).
4. **No first-edge fallback:** when every outgoing edge is conditional and
   none matches, edge selection returns none (spec 448-453), replacing
   `edge_selection.rs:65-75`.
5. **FAIL with no matching edge:** node `retry_target`, then
   `fallback_retry_target`, then the run fails (spec 564-571). Today these
   apply only at goal gates (`goal_gate.rs:46-49`).
6. **Conditions can use the class:** `<node>.failure_class` is in context,
   so `condition="outcome=fail && build.failure_class=timeout"` works with
   the existing condition language (`condition.rs`).
7. **Claude subtype:** `subtype` starting `error` is a failure (section 1).

Behaviour changes across this design:
- Existing tests that assert direct run failure (for example
  `executor_emits_exactly_one_pipeline_failure_for_runtime_errors`) change.
- Graphs that relied on the first-edge fallback route differently. A lint
  warns when a node has only conditional edges and no `outcome=fail` path.
- `llm_provider` becomes an alias for `agent=` and `[codergen.claude]`
  moves into profile `args` (section 1, compatibility), both with warnings.
- Agents run in a new worktree, not the caller's `--workdir`.

## 6. Digital twin test harness (Q19)

- **The fake:** `tests/agents/fake-claude`, an executable that accepts
  every `claude` flag the profile passes, reads a scenario from
  `FAKE_AGENT_SCENARIOS` keyed by `PAS_NODE_ID` and `PAS_ATTEMPT`, and
  prints stream-json. Scenarios (test-and-output-pas.md §1): success,
  reported failure, `error_max_turns` with `is_error:false`, label routing,
  crash, crash after result, garbage, silent, hang, slow stream, budget,
  edit and commit, flaky (counter file).
- **Selection:** a test profile `fake` with `test_only = true`, pointing
  `command` at the script. `Agents::load` refuses it unless `pas run
  --allow-test-agents` is given (Kilroy's `--allow-test-shim` guard,
  `provider_exec_policy.go:41-49`), so it can't run by accident.
- **Path under test:** the fake goes through the real crate (argv, env,
  files, timers, parser) and the real engine (routing, retries, commits,
  resume). Only `argv[0]` differs from production.
- **Seams (proposed, to confirm):**
  1. `Agents::run` with the fake: start event, files, failure table, kill.
  2. `pas run` end to end with the fake: routing on each failure class,
     retries, node commits in the worktree, stop and resume, orphan kill,
     run-folder contents.
- **Loop:** vertical slices, one failing test then the code for it,
  starting with "a one-node pipeline with the fake succeeds and leaves a
  node commit", then one failure class per slice.
- Existing in-process `NodeHandler` doubles stay for engine unit tests.

## 7. What we deliberately don't build

- ACP, direct exec, tmux and remote mechanisms (the crate leaves room;
  section 1).
- New mechanisms beyond `claude-p` and the ported `codex-exec` (Gemini,
  `exec`, ACP, tmux, remote), unless the operator chooses otherwise.
- `pas runs prune` worktree cleanup.
- Parallel fan-out and fan-in, manager loops, context fidelity and thread
  reuse: still rejected at compile time.
- An HTTP or JSON driver API; the CLI plus the run folder is the driver
  interface (Q20). The Monitor stays as it is.
- Merge-back, pull requests or pushing run branches.
- Sandboxing (decision Q7).
- A queue or one process per work item (Q20, later).
- Planning for `--bare` becoming the `-p` default (Q21).
- Steering or mid-run interaction with an agent.

## Rough effort

| Piece | Days |
|---|---|
| Agent crate with `claude-p`, Codex ported as `codex-exec`, config loader, aliases, engine wiring, `LlmProvider` removal | 5-7 |
| Worktree, branch and node commits, prepare_run reorder | 2-3 |
| Run-folder additions and `docs/run-folder.md` | 3-4 |
| Failure routing (section 5, agent and tool nodes) incl. test updates | 2-3 |
| Digital twin and end-to-end tests | 2-3 |
| **Total** | **14-20** |

Estimates come from the research files' per-item figures plus the crate
extraction; none is measured. The run-folder and twin rows (5-7 days)
exceed test-and-output-pas.md's 3-4 days for the same gaps because they add
orphan reaping, `final.json`, tool-output files, the run-folder doc and
end-to-end tests across the new failure classes.

## Operator questions

Each is a separate choice. Where a recommendation is given, it is only a
recommendation.

1. **Handler crate shape.** A (one call), B (sessions), C (public ports),
   or the proposed hybrid (A's interface, C's split kept private)?
2. **Codex and Gemini today.** Decision Q5 says Claude and Codex are the
   two that need their own harness, so dropping Codex would be a regression.
   Proposed: port today's Codex path into the crate as `codex-exec` (moved
   code, not new). Gemini: port it the same way, or drop it?
3. **A plain `exec` mechanism now?** Without it, an agent with a new output
   format (dsh, ZCode, Qwen Code) needs a new binary, against Q13. Build
   `exec` now (Q14 said "possible, not built"), or accept the limit?
4. **Config location.** Where does the project's agent config live: a
   separate `agents.toml` beside `pas.toml`, an `[agents]` section in
   `pas.toml`, or both?
5. **How much of argv is config.** Should safety flags
   (`--dangerously-skip-permissions`, `--safe-mode`) be editable in a
   profile, or fixed in code with only extras configurable?
6. **Environment default.** Inherit everything minus a strip list (keeps
   PATH, HOME and logins working), or also offer an allowlist mode (safer,
   more to maintain)?
7. **Compatibility window.** Keep `llm_provider` and `[codergen.claude]`
   working as deprecated aliases (proposed), for how long, or switch
   existing pipelines to `agent=` now?
8. **Worktree location default.** Under the run folder (Kilroy), a
   sibling directory of the repo (`../<repo>.pas-worktrees/`), or the state
   directory (`$PAS_STATE_DIR/worktrees`)?
9. **Branch and base.** Name `pas/run/<run-id>` from the current `HEAD`?
   Refuse to start when the source repo has uncommitted changes, or branch
   from `HEAD` and ignore them?
10. **What proves a node completed (Q16).** You said the commit is the
   proof. Kilroy actually uses the checkpoint and the node's status file;
   the commit records code state and exists for failed nodes too.
   Recommendation: the journal and checkpoint are the source of truth for
   completion and status; the node commit records the code and carries
   `Pas-Node`/`Pas-Status` trailers, and resume checks that the worktree's
   `HEAD` matches the checkpoint's SHA. Commit-as-proof would mean resume
   reads `git log` trailers, which breaks if an agent rewrites history.
11. **Resume and the worktree.** When a run resumes after a crash mid-node,
   the worktree may hold the node's partial edits. Kilroy's git resume
   resets to the last checkpoint and discards them (and its CLI resume
   skips git entirely, a bug). Options: (a) reset to the last node commit
   and re-run the node clean; (b) keep the partial work and re-run the node
   on top; (c) commit the partial work as an "interrupted" node commit,
   then reset and re-run, so nothing is lost and the re-run starts clean.
12. **Cleanup.** Leave the worktree and branch after a run (Kilroy), remove
    the worktree on success but keep the branch, or remove both on success?
    Build `pas runs prune` for worktrees now or later?
13. **Commit details.** Q16 says commit after every node. Commit after
    every *attempt* (so a retried node has one commit per try, including
    failed ones), or once per node when it finishes? And commit with
    `--no-verify`, skipping the target repo's hooks?
14. **Failure routing changes.** Accept the spec behaviour in section 5,
    including removing the first-edge fallback, which can change how
    existing graphs route?
15. **Retry defaults by failure class.** Retry `timeout` by default (as
    today)? Ever retry `crash` or `no_result` without an explicit
    `max_retries`? Add a `rate_limited` class, detected from Claude's
    result or `rate_limit_event`, that is retried with a longer backoff?
16. **Idle timeout.** Add a no-output timeout now (kill an agent silent for
    N minutes), or rely on the node timeout and the heartbeat's
    `last_output_at` for now?
17. **Run folder location.** Keep the default relative to the `pas`
    process's directory (`.pas/logs/...`), or default to the state directory
    so a driver always knows where to look? And should `pas init` add
    `.pas/` to the target repo's ignore files?
18. **Test seams and fake language.** Agree the two seams in section 6? Is
    the fake a shell script, or a small Rust test binary built with the
    workspace (portable, typed scenarios)?
