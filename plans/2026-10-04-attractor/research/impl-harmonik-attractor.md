# harmonik-attractor (PAS) in depth

Captain's task (2026-10-04). Investigate the operator's fork
https://github.com/gregberns/harmonik-attractor of
citadelgrad/pascals-discrete-attractor ("PAS") against decisions.md Q12-15:
1. Agents configured, not hard-coded.
2. A separate handler interface with ACP, direct-executable and tmux handlers.
3. Git worktrees per run.

Read-only clone at `~/github/harmonik-attractor`; nothing was changed or
pushed.

## Summary

- **What it is:**
  - A Rust workspace of 10 crates: about 54k source lines plus about 18k
    lines of integration tests. The binary is `pas`. It's dual-licensed
    MIT OR Apache-2.0.
  - The fork is identical to upstream: both are at `50945da`
    (2026-09-29), with 218 commits.
  - It builds cleanly (`cargo build`, 24 s), and **1,289 tests pass, 0
    fail, 2 are ignored**.
  - A 3-node pipeline (Claude → Codex → tool check with `goal_gate`) ran
    end to end in a scratch repo on both subscriptions.
- **Agent execution is a hard-coded closed set.**
  - A `codergen` node must name `llm_provider` = `claude`, `codex` or
    `gemini`. A closed enum `LlmProvider` maps each to a fixed binary name
    on `PATH` and a fixed argument list, with
    `--dangerously-skip-permissions`, `--yolo` and
    `--approval-mode yolo` built in.
  - Configurable: model (`llm_model`), node timeout, workdir, and for
    Claude only a set of settings flags (settings mode, settings JSON,
    tools, agents, plugin dirs, MCP config) via `pas.toml`, CLI flags or
    context. `allowed_tools` and `max_budget_usd` are Claude-only.
  - Not configurable: the binary path (a `program` override exists only
    for tests), extra arguments, environment (the child inherits the
    parent env; nothing is stripped or added), and reasoning level.
    `reasoning_effort` is explicitly **rejected** as an unsupported
    capability.
  - Adding a provider means editing the enum, the command builder, the
    output parser and the usage summarizer.
- **"Direct API handlers" aren't wired into pipelines.** The `attractor-llm`
  (OpenAI, Anthropic, Gemini adapters) and `attractor-agent` (an agent
  loop) crates exist as libraries, but no pipeline handler or CLI command
  uses them. My earlier notes said pascals had direct API handlers; that's
  wrong for node execution.
- **No ACP.** The clean seam is the `NodeHandler` + `ProviderNodeHandler`
  traits and the `HandlerRegistry`. The provider-specific part is one
  function, `build_cli_command_with_program`, plus parsers keyed on the
  `LlmProvider` enum. That enum is the thing to replace (Q14).
- **No worktrees.** A run executes in one caller-supplied `--workdir`
  (default: the current directory), shared by every node.
  - PAS takes a per-git-worktree lock (`<git-dir>/pas-run.lock`) so two
    runs don't share a worktree by accident.
  - It observes commits (`HEAD` before and after each node) but never
    creates branches, worktrees or commits.
  - Q15 is entirely new work.
- **Driver interface: the CLI plus run-dir files.**
  - `pas run <dot> --workdir <dir> --json [--run-id <uuid>]` prints
    `{"v":1,"ok":true,"run_id","run_dir"}` first.
  - `pas runs [--active] --json` gives status.
  - `pas stop <id>` stops after the current stage. `pas kill <id>` sends
    SIGTERM, then SIGKILL.
  - `pas answer` handles human gates.
  - Re-running the same `pas run` resumes from the last checkpoint under
    the same run ID (verified).
  - The loopback web Monitor (`pas monitor`, port 7777) is a browser UI,
    not a driver API.
    - Its GETs return HTML, apart from one SSE stream, and nothing returns
      JSON.
    - Its POSTs need a per-server CSRF token that exists only in the page.
    - Fabro, by contrast, has a JSON REST API with a bearer token
      (driver-and-assembly.md, spike-fabro.md).
  - The state is files: `events.jsonl`, `run.json`, `control/`,
    `answers/` and `transcripts/` in the run dir.
- **Subscriptions: confirmed.**
  - Claude ran with `apiKeySource: "none"` and Max rate-limit windows in
    its transcript. The default `subscription_bare` mode passes
    `--safe-mode`, not `--bare`, so the OAuth login works and the
    operator's customizations are disabled.
  - Codex ran `codex exec --json --yolo --skip-git-repo-check --ephemeral`
    on the ChatGPT login (`~/.codex/auth.json`), with no sandbox.
  - Caveat: an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in the caller's
    environment would be inherited and would win.
  - Risk (driver-and-assembly.md): Claude Code plans to make `--bare` the
    `-p` default (headless.md:70). Bare mode never reads OAuth or the
    keychain, and 2.1.280 has no opt-out; `--safe-mode` doesn't prevent
    it. PAS's default mode would then lose the Max login. This matters for
    the `claude -p` handler (Q14).
  - `--safe-mode` isolates only Claude. Codex runs with the operator's
    `~/.codex` (`config.toml`, `AGENTS.md`, hooks); `CODEX_HOME` is the
    lever.
- **New models need no rebuild on the pipeline path.** `llm_model` is
  passed through to `--model` unvalidated. What forces a rebuild today:
  - the provider set and its binaries;
  - every CLI flag;
  - the Claude settings modes;
  - the default timeout;
  - the hard-coded `--model sonnet` in `pas generate`;
  - and, in the unused library crates, model defaults and a model catalog.

  See §9.
- **Codex failures are detected, unlike in Fabro**, with one hazard. With
  stdin closed, an invalid Codex model gave `turn.failed` and the node
  failed (`is_error=true`). With `goal_gate=true` the run failed: "Goal
  gate unsatisfied: node 'build' did not reach SUCCESS", exit 1 (verified).
  - But PAS doesn't set the agent's stdin. With an open stdin, `codex exec`
    printed "Reading additional input from stdin..." and hung until the
    node timeout (120 s in the test).
  - A driver should pass `</dev/null`, or the handler should set
    `Stdio::null()` (§10). `</dev/null` is safe for human gates: the
    interviewer uses the terminal only when stdin is a TTY, and otherwise
    takes answers from files (`attractor-pipeline/src/interviewer.rs:165-174`).
- **Two classes of failure** (§10 step 8):
  - A reported error (`is_error`) is a failed node, which routing or a
    `goal_gate` decides.
  - A crash, a non-zero exit with no result, or a timeout fails the run
    directly. A timeout is retryable, so a stuck agent costs the full
    timeout on every retry.
- **Hazard from code reading:** a Claude error result with
  `is_error: false` would count as success. PAS checks
  `subtype == "error"`, but Claude's error subtypes are
  `error_during_execution`, `error_max_budget_usd` and `error_max_turns`
  (§10 step 6).
- **Spec gaps that matter for the operator's goals:**
  - Multi-edge parallel fan-out and fan-in, manager loops, `fidelity`,
    `thread_id` and `reasoning_effort` are all **rejected** at compile
    time (`docs/execution-capabilities.md`).
  - So this is a sequential pipeline runner with goal gates, retries,
    checkpoints and human gates. It is smaller in scope than Kilroy or
    Fabro.

## Facts

Clone: `~/github/harmonik-attractor` at `50945da` ("docs: document new
commands, flags and Monitor", 2026-09-29), cloned 2026-10-04.
`gh api repos/citadelgrad/pascals-discrete-attractor/commits` gives the
same HEAD `50945da`, so the fork has no commits of its own. Paths below are
relative to `crates/` unless they start with `docs/` or `README.md`.

### 1. Workspace layout

Workspace version 0.11.0, `MIT OR Apache-2.0` (`Cargo.toml`, `LICENSE-MIT`,
`LICENSE-APACHE`). The crates, with lines of `src/*.rs` and of `tests/*.rs`:

| Crate | src | tests | Role (Cargo description, plus what the code shows) |
|---|---|---|---|
| attractor-types | 794 | 0 | Shared types, errors, context, outcome |
| attractor-dot | 1,566 | 0 | DOT parser for the strict Graphviz subset |
| attractor-journal | 2,369 | 969 | Run Journal, Run Index, run-folder layout (`events.jsonl`, transcripts) |
| attractor-quality | 987 | 0 | `pas.toml` manifest schema and walk-up resolution, quality tooling; holds `ClaudeSettingsMode` |
| attractor-llm | 3,232 | 0 | Unified LLM client: `ProviderAdapter` trait, OpenAI/Anthropic/Gemini adapters with `with_base_url`. Library only (§2) |
| attractor-tools | 2,154 | 0 | Tool trait, built-in tools, `HostExecutionEnvironment` / `RootConfinedExecutionEnvironment` for the agent loop |
| attractor-agent | 1,837 | 0 | Coding-agent loop (LLM + tool cycle). Library only (§2) |
| attractor-pipeline | 25,338 | 3,727 | The engine: compilation (`execution_plan.rs`), executor (`engine.rs`), handlers (`handlers/`), checkpoints, conditions, stylesheet, goal gates, events |
| attractor-cli | 7,855 | 8,114 | The `pas` binary (`[[bin]] name = "pas"`): run/stop/kill/runs/answer/monitor plus planning commands (plan, decompose, scaffold, generate, launch, init) |
| attractor-monitor | 8,522 | 4,970 | Loopback web UI and control endpoints (axum) |

Inside attractor-pipeline the main files are `execution_plan.rs` (2,095),
`engine.rs` (1,209), `handlers/codergen_provider.rs` (855),
`handlers/codergen_handler.rs` (822), `handler.rs` (648),
`handlers/wait_human.rs` (697) and the beads integration (`beads_adapter.rs`,
`handlers/beads.rs`).

### 2. Agent and model execution

**Provider set: a closed enum**
- `attractor-pipeline/src/execution_plan.rs:15-52`:
  `enum LlmProvider { Claude, Codex, Gemini }`. `parse` accepts
  `claude|anthropic`, `codex|openai`, `gemini|google`. `binary_name()`
  returns `as_str()`: `claude`, `codex`, `gemini`.
- A provider-consuming node with no `llm_provider` is a compile error
  ("Add llm_provider=\"claude\", \"codex\", or \"gemini\"",
  `execution_plan.rs:1024-1043`). An unknown provider string is also
  rejected (`:970`). README.md:227-231: "There is no implicit runtime
  provider."

**How a codergen node runs**
- Handler: `handlers/codergen_handler.rs`, registered in
  `handler.rs:407-419` (`default_registry`).
  - `CodergenHandler` implements `NodeHandler` (`:136`) and
    `ProviderNodeHandler` (`:532`).
  - Execution is in `execute_with_controls` (`:175-`).
- Model: node `llm_model`, else graph `model` (`codergen_handler.rs:278-285`).
  The stylesheet can set both `llm_model` and `llm_provider`
  (`stylesheet.rs:294-298`).
  The value is passed through as `--model`.
- Binary: `controls.program`, else `provider.binary_name()`, resolved on
  `PATH` (`:288-291`).
  - `program` is `None` in production (`:560`). Only tests set it
    (`execute_configured_with_program`, `:582`; used at
    `engine_tests.rs:3678`).
- Command: `build_cli_command_with_program` (`handlers/codergen_provider.rs:348-440`).
  - Claude, by settings mode:
    - `subscription_bare` (the default, `:254-264`) adds `--safe-mode`;
    - `strict_bare` adds `--bare`;
    - `inherit` adds `--setting-sources`.
    - Then always: `-p <prompt> --output-format stream-json --verbose
      --no-session-persistence --dangerously-skip-permissions
      --strict-mcp-config --disable-slash-commands`.
    - Optional: `--mcp-config`, `--settings`, `--tools`, `--agents`,
      `--plugin-dir`, `--model`; plus node `allowed_tools` →
      `--allowedTools` and `max_budget_usd` → `--max-budget-usd`
      (`:356-405`).
  - Codex: `exec --json --yolo --skip-git-repo-check --ephemeral
    [--model M] [--cd <workdir>] <prompt>` (`:406-421`). `--yolo` is a
    hidden alias that codex-cli 0.156.1 accepts (checked locally).
  - Gemini: `--output-format json|stream-json --approval-mode yolo
    [--model M] <prompt>`. The format is probed from `gemini --help`
    (`:291-335`, `:422-432`).
  - All three: `current_dir(workdir)`, piped stdout and stderr
    (`:435-440`).
- Process control: `kill_on_drop(true)` plus a process group
  (`codergen_handler.rs:310-311`). Default timeout 600 s, or the node's
  `timeout` (`:379-380`). Validation warns `CODERGEN_NO_TIMEOUT` when it
  isn't set.
- Environment: the codergen command is not env-cleared. No
  `env_clear`/`env_remove` in `codergen_handler.rs` or
  `codergen_provider.rs` (grep). Only the quality handler clears env
  (`handlers/quality_handler.rs:199`). So the child inherits everything,
  including any `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or
  `ANTHROPIC_BASE_URL`.
- Output: per-provider serde types and parsers (`codergen_provider.rs:22-95`,
  `:461-840`), normalized into `NormalizedCliResult` and `InvocationUsage`.
  Each spawn is one "Model Invocation" with a transcript file under the run
  dir (`codergen_handler.rs:313-322`). Codex and Gemini costs are
  untracked (`PROVIDER_COST_UNTRACKED` warning).

**Configurable vs hard-coded**

| Aspect | Status | Where |
|---|---|---|
| Provider / harness | Hard-coded set of 3 | `LlmProvider` enum |
| Binary path | Hard-coded name on `PATH` (test-only override) | `codergen_handler.rs:288-291` |
| Arguments | Hard-coded per provider. Claude-only extras come from config | `codergen_provider.rs:348-432` |
| Model | Configurable: node `llm_model`, graph `model`, stylesheet | `codergen_handler.rs:278-285` |
| Reasoning level | **Rejected** (`unsupported_execution_capability`) | `docs/execution-capabilities.md` row "fidelity, reasoning_effort, …"; test `stylesheet_reasoning_effort_is_rejected_instead_of_ignored` |
| Environment | Inherited from the caller; nothing configurable | §2 above |
| Claude settings | Configurable: `[codergen.claude]` in `pas.toml` (`attractor-quality/src/manifest.rs:43-59`), `--codergen-claude-*` CLI flags (`attractor-cli/src/main.rs` `Run`), context overrides (`codergen_handler.rs:638-760`) | |
| Timeout | Configurable per node (default 600 s) | `codergen_handler.rs:379` |
| Workdir | Configurable per run (`--workdir`, context `workdir`) | `engine.rs:311` |

**Adding a provider**
- No docs or extension point; it's a code change in four places:
  1. a variant and its strings in `LlmProvider` (`execution_plan.rs:15-52`);
  2. a match arm in `build_cli_command_with_program`;
  3. output types plus `parse_*_output`;
  4. `summarize_*` for usage (`codergen_provider.rs:538-680`).
- Every match on `LlmProvider` must be extended, which the compiler
  enforces.

**The direct API crates are libraries only**
- `attractor-llm` has `trait ProviderAdapter { complete, stream, name,
  default_model, supports_* }` (`attractor-llm/src/provider.rs:12-24`), and
  the adapters take `with_base_url` (`anthropic.rs:32`).
- `attractor-agent` is an agent loop over it.
- But nothing in `attractor-pipeline/src` or `attractor-cli/src` imports
  `attractor_llm` or `attractor_agent` (grep: no matches outside the crates
  themselves). The `attractor-pipeline` and `attractor-cli` Cargo.tomls list
  `attractor-llm` as a dependency but never import it, and neither depends
  on `attractor-agent`.
  No registered handler runs a node through an API.
- `docs/execution-capabilities.md` lists `SessionConfig.*` as supported,
  but only for the `AgentSession` library API.

### 3. ACP

- None: no ACP code, dependency or doc mention (grep for "acp" and
  "agent client protocol" over `crates/` and `docs/`).
- Where an ACP handler would plug in:
  - As a new `NodeHandler` registered in `HandlerRegistry`
    (`HandlerRegistry` at `handler.rs:277`; the `NodeHandler` trait at
    `:131-150`; `default_registry` at `:407-419`), selected by node `type`.
    This needs no provider, but it loses provider compilation.
  - Or as a new execution path inside `CodergenHandler` keyed on a new
    provider or "executor" field. The provider-specific part is
    `build_cli_command_with_program` plus `parse_cli_output`, and those
    would be swapped for an ACP client session: spawn the agent, then
    `initialize`, `session/new`, `session/prompt`, stream updates, and
    `session/cancel` on timeout or stop.
- What would have to change: the closed `LlmProvider` enum and its
  compile-time check (`execution_plan.rs:970, 1024-1043`). Today an
  unknown provider fails validation, so any new executor needs either a
  new variant or a replacement of the enum by a configured agent registry.

### 4. Existing abstractions and seams

- Traits (`attractor-pipeline/src/handler.rs`):
  - `NodeHandler` (`:131-150`): `handler_type()`, `provider_handler()`,
    `resolved_handler()`, `resumes_interrupted_attempt()`, `execute`.
  - `ProviderNodeHandler` (`:108-128`): `execute_resolved(node, resolved,
    context, graph)` and `execute_configured(…, HandlerExecutionContext, …)`.
    The doc comment calls it the "typed execution contract for handlers
    that consume compiled provider semantics".
  - `ResolvedNodeHandler` (`:80-106`) is the same shape for non-provider
    handlers.
  - `HandlerExecutionContext` (`:23-73`) carries the resolved config, the
    run dir, the event sink and the workflow context.
- `HandlerIdentity` enum (`execution_plan.rs:66-79`): Start, Exit,
  Codergen, Conditional, WaitHuman, Tool, Parallel, FanIn, ManagerLoop,
  Quality, Custom(String).
- Provider dispatch is a `match cfg.provider` over the `LlmProvider` enum
  in one builder function and in the parsers and summarizers. There are no
  free-form string matches in the hot path; strings are parsed once at
  compile time.
- Separability:
  - The handler trait layer is already an interface: handlers register by
    type, and the engine dispatches on a compiled plan.
  - The coupling is inside `CodergenHandler`. Prompt assembly (labels,
    goal), invocation bookkeeping (transcripts, `LlmInvocation` events,
    costs), timeout and process-group handling, and the provider command
    and parse are all in one handler, with the provider enum threaded
    through compilation (`ResolvedNode`).
  - Extracting "how to run an agent" into a handler crate means splitting
    those parts. Generic: prompt, workdir, timeout, events, outcome.
    Per mechanism: CLI exec, ACP, tmux. The `LlmProvider` enum would need
    to move out of `execution_plan.rs` or become data.
  - That's a description of the seams only; no design here (per the task).

### 5. Worktrees and cwd

- No worktree creation. "worktree" appears only for locking and the
  monitor UI.
  - `attractor-cli/src/commands/run.rs:359-433`: `RunLock` on the pipeline,
    plus `<git-dir>/pas-run.lock` when the workdir is in a git worktree. A
    second run warns and fails with `worktree_locked`, unless
    `--allow-shared-workdir`.
  - `attractor-monitor/src/plans.rs:372`: a `.git` file counts as a
    worktree.
- Cwd:
  - One per run: `pas run --workdir <dir>` (`main.rs` `Run.workdir`), or
    the context key `workdir` (`engine.rs:311`).
  - Every codergen node gets `current_dir(workdir)`, and Codex also gets
    `--cd` (`codergen_provider.rs:416-419, 435-437`). Per-node cwd isn't
    supported.
- Commits: `run_commits.rs:1-9`, "The engine reads `HEAD` before and after
  each stage attempt … PAS only observes commits; it never creates them."
- Verified: the spike run wrote `word.txt` and `upper.txt` straight into
  the scratch repo's working tree as untracked files. No branch or commit
  was made.

### 6. Invocation by an external driver

- Start: `pas run <file.dot|dir> --workdir <dir> --json [--run-id <uuid>]
  [--fresh] [--max-budget-usd N] [--max-steps N] [--dry-run]`
  (`attractor-cli/src/main.rs:41-112`).
  - With `--json` the first stdout line is
    `{"ok":true,"run_dir":…,"run_id":…,"v":1}`, and the rest goes to
    stderr (`:101-104`).
  - It runs in the foreground; a driver backgrounds it.
- Status:
  - `pas runs [--active] [--json]` lists running, completed, failed,
    stopped, crashed or missing (`:178-188`).
  - The run dir `.pas/logs/<pipeline>-<hash>/runs/<id>/` holds
    `events.jsonl`, `run.json`, `transcripts/`, `control/` and `answers/`.
    The state dir is `PAS_STATE_DIR` (README.md:240).
- Stop: `pas stop <id> [--json]` writes `control/stop`, and the run ends
  `stopped` after the current stage (`:135-149`). `pas kill <id> [--grace
  10s]` sends SIGTERM, then SIGKILL (`:151-164`).
- Resume: re-run the same `pas run` command; the checkpoint is kept
  (`:34-40`).
- Human gates: `pas answer <run_id> <question_id> <choice>` (`:114-133`).
- Monitor: `pas monitor [--port 7777]`, loopback only
  (`attractor-monitor/src/lib.rs:37-83`). It's a **browser UI, not a
  driver API**.
  - `GET /runs/:id/events` is SSE. `/runs`, `/runs/:id` and
    `/runs/:id/summary` return HTML views; there is no `Json(` response
    anywhere in the crate (grep).
  - `POST /runs/:id/stop|kill|resume|rerun` and `/runs/:id/answers/:qid`
    need the `x-csrf-token` header (`security.rs:64, 113-135`). The token
    is generated per server and embedded only in the rendered page
    (`views/run.rs:558`).
  - So a driver uses the CLI (`--json` on run, runs, stop, kill and
    answer) plus the run-dir files. Fabro has a JSON REST API with a
    bearer token (driver-and-assembly.md, spike-fabro.md).
- Verified on the spike repo (§8):
  - `pas stop` during the Claude node → "Stopped before build; resume with
    the same pas run command", and `pas runs` showed `stopped`.
  - Re-running the same command printed "Resuming from checkpoint -- next
    node: build", under the same run ID, ran only `build` and `check`, and
    completed.

### 7. Subscription use

- Claude: the transcript of the spike's `plan` node has
  `"apiKeySource":"none"` and a `rate_limit_event`
  (`rateLimitType: five_hour`, utilization 0.12 / 0.24,
  `overageStatus: rejected`). So it ran on the Max login and counted
  against the plan windows.
  - The caller's environment had no `ANTHROPIC_*` or `OPENAI_*`
    variables (`env | grep -c` = 0).
  - The default `--safe-mode` (not `--bare`) keeps the OAuth login and
    disables CLAUDE.md, skills, plugins, hooks, MCP servers and custom
    commands (`claude --help`, 2.1.280). That avoids the config leak seen
    with Fabro's ACP adapter (spike-fabro.md).
  - `strict_bare` would use `--bare`, which needs an API key.
  - `--safe-mode` plus `--strict-mcp-config` also neutralises the target
    repo's hooks and `.mcp.json`, which `-p` would otherwise run with no
    trust dialog (headless.md:41, per driver-and-assembly.md). `inherit`
    mode loses that protection.
  - Risk: `--bare` is planned to become the `-p` default (headless.md:70).
    Bare never reads OAuth or the keychain, and 2.1.280 has no opt-out, so
    PAS's default `subscription_bare` mode would lose the Max login. Re-test
    on each Claude Code upgrade.
- Codex isolation: none. Codex runs with the operator's `~/.codex`
  (`config.toml`, `AGENTS.md`, hooks). codex 0.156.1 also has
  `--dangerously-bypass-hook-trust`, which PAS doesn't pass. `CODEX_HOME`
  would isolate it.
- Codex: `codex exec --json --yolo …` on `~/.codex/auth.json`
  (`auth_mode: chatgpt`). The node completed (`turn.completed` in its
  transcript) and wrote `upper.txt`. `--yolo` means no Codex sandbox and no
  approvals.
- Caveat: env is inherited (§2). A key in the caller's environment switches
  the CLI to API billing; PAS doesn't strip it.

### 8. Build, tests and a run

- `cargo build --workspace`: OK in 24 s (dev profile, Rust toolchain
  already present).
- `cargo test --workspace`: exit 0. Across 64 test binaries, **1,289
  passed, 0 failed, 2 ignored**.
- Evidence kept in this repo under [pas-spike/](pas-spike/): `spike.dot`,
  `codexbad.dot`, `codexbad-gate.dot` and `evidence.txt`. `evidence.txt`
  has the cargo test summary, the Claude transcript's `apiKeySource` and
  rate-limit lines, the node results, stop and resume, Codex's
  `turn.failed`, the timeout error and the goal-gate failure. The scratch
  repo itself is session-only.
- Spike (scratch repo `<scratchpad>/pas-spike/proj`, `git init`, one
  commit):

  ```dot
  digraph PasSpike {
      goal = "Spike: Claude then Codex then a deterministic check"
      start [shape="Mdiamond"]
      plan  [llm_provider="claude", llm_model="haiku", prompt="Use the Write tool to create word.txt containing exactly one lowercase word: banana. Then reply DONE."]
      build [llm_provider="codex", prompt="Read word.txt and create upper.txt containing that word in uppercase and nothing else. Then reply DONE."]
      check [type="tool", tool_command="test \"$(tr -d '[:space:]' < upper.txt)\" = BANANA && echo CHECK_OK", goal_gate=true]
      done  [shape="Msquare"]
      start -> plan -> build -> check -> done
  }
  ```

  - `pas validate` warned only about a goal gate with no `retry_target`.
  - `pas run spike.dot --workdir proj --json --max-budget-usd 1` → run
    `01a10a5c-10c3-…`:
    - Claude completed in 5 s on `claude-haiku-4-5-20251001`, $0.0116
      list price;
    - Codex completed in 16 s;
    - the check exited 0.
    - "Pipeline completed", total about 22 s.
  - The repo kept `word.txt` and `upper.txt`, untracked.
- The bundled `pipelines/*.dot` are the project's own build pipelines
  (beads issues), not tiny examples, so I wrote the one above.

### Corrections to earlier notes

- implementations.md:
  - License is `MIT OR Apache-2.0`, not Apache-2.0.
  - Coverage "P A L" overstates it. The pipeline uses only the CLI
    agents; the LLM client and agent loop crates exist but aren't wired
    into node execution. Parallel fan-out and fan-in, manager loop,
    fidelity and thread reuse are rejected.
  - "direct API handlers for OpenAI, Anthropic and Gemini" is wrong for
    pipelines; they're library adapters only.
- comparison.md (citadelgrad row):
  - Sandbox: none. Claude runs with `--dangerously-skip-permissions`,
    Codex with `--yolo`, Gemini with `--approval-mode yolo`.
  - Harness per node: `llm_provider` per node from a fixed set of 3.
  - Reasoning: rejected.
  - Option B' should note the scope gaps (no fan-out, no worktrees, no
    ACP).

### 9. What forces a rebuild when a new model ships (scope update, 2026-10-04)

Everything hard-coded that a new model, provider or CLI flag would need
changed. Production code only; test fixtures excluded.

**Pipeline execution path** (what `pas run` uses)

| What | Where | Notes |
|---|---|---|
| Provider set: `Claude`, `Codex`, `Gemini` | `attractor-pipeline/src/execution_plan.rs:15-20` | A closed enum |
| Provider name aliases (`anthropic`, `openai`, `google`) | `execution_plan.rs:23-30` | |
| Binary name = provider name (`claude`, `codex`, `gemini` on `PATH`) | `execution_plan.rs:40-42`; used at `handlers/codergen_handler.rs:288-291` | Production `program` is always `None` (`:560`) |
| Display names | `execution_plan.rs:44-50` | |
| Provider is mandatory and must be one of the 3 | `execution_plan.rs:970, 1024-1043` | Validation error otherwise |
| Claude flags: `-p`, `--output-format stream-json`, `--verbose`, `--no-session-persistence`, `--dangerously-skip-permissions`, `--strict-mcp-config`, `--disable-slash-commands`; mode flags `--safe-mode`, `--bare`, `--setting-sources` | `handlers/codergen_provider.rs:353-376` | Only the extras are configurable (§2) |
| Codex flags: `exec --json --yolo --skip-git-repo-check --ephemeral`, `--model`, `--cd`, prompt positional | `codergen_provider.rs:406-421` | |
| Gemini flags: `--output-format`, `--approval-mode yolo`, `--model`, prompt positional; format probe via `--help` with a 10 s timeout | `codergen_provider.rs:270-335, 422-432` | |
| Default Claude settings mode `SubscriptionBare` | `codergen_provider.rs:254-264`; enum in `attractor-quality/src/manifest.rs:74-79` | |
| Output schemas per CLI (Claude `result` line, Codex JSONL events, Gemini JSON and stream) | `codergen_provider.rs:22-95, 461-840` | A CLI output-format change needs a rebuild |
| Default node timeout 600 s | `codergen_handler.rs:379` | |
| Allowed node attributes (`allowed_tools`, `max_budget_usd` Claude-only; `reasoning_effort` etc. rejected) | `execution_plan.rs` fail-closed validation; `docs/execution-capabilities.md` | Adding a reasoning knob needs code |
| Default provider for scaffolded pipelines: `"claude"` | `attractor-cli/src/commands/scaffold.rs:88` | |

- Model names: **none hard-coded** on this path. `codergen_handler.rs:278-285`
  takes node `llm_model`, else graph `model`, and passes it as `--model`
  without checking it against a list.
- So a new Claude, Codex or Gemini model works with no rebuild, as long as
  the CLI accepts the name.
- Cost is read from the CLI's own report (Claude `total_cost_usd`); there
  is no price table.

**Planning commands** (not used by `pas run`)
- `attractor-cli/src/commands/generate.rs:184-199`:
  `claude -p - --model sonnet --system-prompt … --settings '{"enabledPlugins":{}}' --strict-mcp-config {} --tools '' --output-format json --no-session-persistence`.
  The model `sonnet` is hard-coded.
- `plan.rs:101-107`: `claude -p <prompt> --dangerously-skip-permissions
  --no-session-persistence`, no model.
- `decompose.rs:280-287`: `claude -p <prompt> --output-format json
  --no-session-persistence`, no model.

**Library crates** (not wired into `pas run`)
- `attractor-agent/src/lib.rs:43`: default `SessionConfig.model =
  "claude-sonnet-4-5-20250929"`.
- `attractor-llm/src/client.rs:100-150`: a `ModelCatalog` with fixed model
  ids, context windows and reasoning flags (claude-opus-4-6,
  claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001, gpt-4o,
  gpt-4o-mini, o1, o3-mini, gemini-2.5-pro, gemini-2.5-flash).
- Adapter default models: `openai.rs:30` (`gpt-4o`), `gemini.rs:30`
  (`gemini-2.5-pro`), `anthropic.rs:427`.
- These would matter only if the API crates were wired in.

### 10. The Claude CLI path, step by step (starting point for a `claude -p` handler)

1. **Compile:** the node must resolve to `codergen` with
   `llm_provider="claude"` (`execution_plan.rs:1024-1043`).
2. **Prompt** (`codergen_handler.rs:237-276`). In order:
   - `Pipeline goal: <goal>`;
   - `Context from prior pipeline steps:` with every context key ending
     in `.result` or `.output`;
   - `Task (<label>): <prompt>`;
   - for an LLM-backed conditional node, "You MUST end your response with
     exactly one of these labels on its own line: …".
3. **Command** (`codergen_provider.rs:353-405`), with the defaults:

   ```
   claude --safe-mode -p "<full prompt>" --output-format stream-json --verbose      --no-session-persistence --dangerously-skip-permissions --strict-mcp-config      --disable-slash-commands [--mcp-config X] [--settings X] [--tools X] [--agents X]      [--plugin-dir D ...] [--model M] [--allowedTools T] [--max-budget-usd B]
   ```

   - cwd = run workdir;
   - stdout and stderr piped; **stdin not set** (inherited);
   - env inherited; `kill_on_drop` plus its own process group
     (`codergen_handler.rs:297-311`).
   - Spike transcript: `apiKeySource: "none"` (subscription).
4. **Run:** `tokio::time::timeout(node.timeout or 600 s, run_streaming(child,
   transcript))` (`:379-411`). Stdout is streamed into the per-invocation
   transcript file. Timeout gives `CommandTimeout`, and the process group
   is killed.
5. **Exit check** (`:416-433`): if the exit status is non-zero **and**
   there's no final `{"type":"result"}` line, it's a `HandlerError`
   ("Claude Code exited with …: <stderr>"). A non-zero exit that still has
   a result line goes on to parsing.
6. **Parse** (`codergen_provider.rs:461-487, 683-713`):
   - Empty stdout is an error.
   - Otherwise take the last line that is JSON with `type == "result"`,
     falling back to all of stdout for `json` mode or older CLIs, and
     deserialize `ClaudeOutput { result, is_error, subtype,
     total_cost_usd, num_turns }` (`:22-33`).
   - `is_error = is_error || subtype == "error"` (`codergen_provider.rs:707`).
   - **Hazard (from code reading, unverified by a run):**
     - Claude's error subtypes are `error_during_execution`,
       `error_max_budget_usd` and `error_max_turns`, so `== "error"` never
       matches.
     - `claude-agent-acp` handles those subtypes both with and without
       `is_error` (`src/acp-agent.ts:6270-6315`, per the plan-reviewer), which implies the CLI can
       emit them with `is_error: false`.
     - PAS would then record Success, for example when the
       `--max-budget-usd` it passes is exceeded.
     - Fix: `subtype.starts_with("error")`.
   - Usage (tokens, `model_actual`, cost) comes from `summarize_claude` over
     the whole stream (`:550-608`).
7. **Decide** (`codergen_handler.rs:466-531`):
   - `StageStatus::Fail` if `is_error`, else `Success`. On failure,
     `failure_reason = "Claude Code returned an error"`.
   - Conditional nodes take `preferred_label` from the response text via
     `extract_label` (`:795-`).
   - Context updates: `<node>.completed`, `<node>.result` (the result
     text), `<node>.provider`, `<node>.cost_usd`, `<node>.turns` and
     `<node>.label`.
   - `notes` = the result text.
8. **Run status, two classes:**
   - **Reported errors** (`is_error`) become `StageStatus::Fail`, an
     ordinary outcome. Routing can send it to a fix-up path, and only a
     `goal_gate` fails the run, as in Fabro.
   - **Handler errors**: a non-zero exit with no result line
     (`HandlerError`, `codergen_handler.rs:416-433`), unparseable output,
     or a timeout (`CommandTimeout`, `:379-411`) return `Err`. The engine
     emits `StageFailed` and fails the run directly, bypassing routing and
     gates (`engine.rs:635-640`).
   - `CommandTimeout` is retryable (`attractor-types/src/error.rs:100-110`),
     so with `max_retries` set, a stuck agent (for example the Codex stdin
     hang) is retried at the full timeout each time.

**Codex for comparison** (`codergen_provider.rs:715-757`):
- `turn.failed` or `error` events set `is_error`; the last `agent_message`
  is the text.
- Verified with an invalid model and stdin closed:
  - `Codex CLI completed is_error=true`, so the node failed (a reported
    error). Without a gate the run completed.
  - With `goal_gate=true` (`pas-spike/codexbad-gate.dot`): `Error: Goal
    gate unsatisfied: node 'build' did not reach SUCCESS`, exit 1.
- With stdin inherited and open, `codex exec` waited on stdin ("Reading
  additional input from stdin...") and the node hit its 120 s timeout,
  giving `Error: Command timed out after 120000ms` and the run `failed`.
  That's a handler error, so the run failed directly (no `max_retries`
  was set, so there was no retry).
- My first, successful spike run didn't hang under what looked like the
  same invocation, so this is environment-dependent. Setting
  `Stdio::null()` on agent commands would make it deterministic. Only the
  Gemini probe sets it today (`codergen_provider.rs:306`).

## Open questions

- Is a sequential-only engine acceptable, or is fan-out needed? Today it's
  rejected at compile time, not merely unimplemented.
- Should PAS clear or allowlist the agent environment (as the quality
  handler does) so a stray API key can't switch billing?
- `--safe-mode` disables the operator's Claude customizations, but hk3
  passes `--plugin-dir`/`--settings` per launch. Does `--safe-mode` also
  ignore `--plugin-dir`/`--settings` passed through PAS's config?
  Untested.
- Claude error subtypes: should PAS treat `subtype.starts_with("error")`
  as failure? Unverified whether the CLI emits them with `is_error:
  false` (§10 step 6).
- `--bare` becoming the `-p` default would break the subscription route
  for the `claude -p` handler. What's the plan: pin the Claude Code
  version, or move to the Agent SDK/ACP?
- Codex isolation: should the handler set `CODEX_HOME` to a clean dir
  (with `auth.json` copied in) so the operator's `~/.codex` doesn't leak
  in?
- Should agent commands get `stdin(Stdio::null())`? Codex hangs on an
  open inherited stdin (§10).
- Codex model selection on the ChatGPT login: the spike used Codex's
  default. Model ids aren't validated by PAS.
