# Kilroy in depth (Q3)

Checked 2026-10-04. Repo: https://github.com/danshapiro/kilroy. Local clone at HEAD
`b55fb0f` (2026-04-27, also the current `origin/main`). File paths below are relative to the repo
root unless noted. Line numbers are from `b55fb0f`.

## Summary

Kilroy is a Go CLI (`kilroy attractor run|resume|status|stop|validate|ingest|serve`), MIT-licensed,
that runs StrongDM Attractor DOT pipelines in a git repo. Each run gets its own git worktree and run
branch, with one commit per node, and logs run events to CXDB (StrongDM's execution DB, run as a
local Docker container). Most of the Attractor spec is implemented: the DOT engine, the shape-based
handler registry, conditions, the model stylesheet, fidelity, checkpoints/resume, human gates,
parallel fan-out/fan-in, manager loop, the unified LLM client and its own coding-agent loop.

Every provider has to be configured with `backend: cli` or `backend: api`:
- **CLI backend.** Shells out to `claude -p`, `codex exec` or `gemini -p`. Kilroy's own agent loop
  is not used; the external agent does the work.
- **API backend.** Kilroy's own agent loop (`internal/agent`) on its unified LLM client. Protocols:
  OpenAI Responses, OpenAI Chat Completions (any base URL), Anthropic Messages, Google, and a
  "codex app-server" protocol.

**Backend support:**

| Target | Supported? | How |
|---|---|---|
| Claude Code on a subscription | Yes | Default CLI path removes `ANTHROPIC_API_KEY` so `claude` uses its OAuth login. The `--tmux` path passes `--bare`, which needs an API key. |
| Codex on a ChatGPT subscription | Yes | If `OPENAI_API_KEY` is unset, Kilroy copies `~/.codex/auth.json` into an isolated `CODEX_HOME`. The `codex-app-server` provider is a second route. |
| GLM | Yes | Built-in `zai` provider (z.ai coding endpoint) and `cerebras`, API backend only. |
| DeepSeek | Partial | No built-in provider. Works as a custom OpenAI Chat Completions provider; the adapter parses DeepSeek's `reasoning_content`. |
| Qwen served locally | Partial | Same custom-provider route (base URL plus a dummy API key environment variable). Not tested by the project. An Ollama backend exists only on an unmerged fork branch, unwired. |
| ACP (Agent Client Protocol) | No | No code for it anywhere. |
| Sandbox | Worktree only | No container or VM. Agents run with permissions bypassed. |

**Project health:** activity has fallen off sharply. Commits by month on main: 774 in February 2026,
158 in March, 12 in April, and none since 2026-04-27. There is one release (v0.1.0, 2026-04-16).
Open issues get no maintainer replies. Work continued until 2026-05-15 on an unmerged "v2 reframe"
branch in a contributor's fork (mattleaverton/kilroy), then stopped. I found no statement about
maintenance status.

## Facts with sources

### 1. Overview

- **Identity.** "Kilroy is a local-first CLI for running StrongDM-style Attractor pipelines in a git
  repo" (README.md:3). Flow: ingest English to DOT (via the Claude CLI and a `create-dotfile`
  skill), validate, run in an isolated git worktree, resume from logs, CXDB or the run branch
  (README.md:5-10).
- **Language and license.**
  - Go 1.25+ (README prereqs, `go.mod`). About 200 non-test Go files under `internal/` and
    `cmd/kilroy`.
  - MIT license; the LICENSE text says "Copyright (c) 2026 StrongDM, Inc." `gh repo view` reports
    MIT.
- **How it runs.**
  - It is a CLI, not a daemon. `attractor run` can `--detach` (cmd/kilroy/run_detach*.go).
  - `kilroy attractor serve` is an experimental HTTP and SSE server with no authentication. It
    supports submitting and cancelling pipelines and answering human-gate questions
    (README.md:436-470; internal/server/).
  - Full command list: README.md:410-420 and cmd/kilroy/main.go:166.
  - Installs via Homebrew tap `danshapiro/kilroy`, `go install`, or from source (README.md:12-30).
    Open issue #69 says the brew install fails.
- **Required infrastructure.** CXDB at configured binary and HTTP endpoints, or autostarted via
  `scripts/start-cxdb.sh` (Docker). Also an OpenRouter model-info JSON file for the model catalog
  (README "Important" bullets; `modeldb.*` config). `--no-cxdb` exists (cmd/kilroy/main.go:248).

**Attractor spec coverage**

- **DOT parser and validator.** internal/attractor/dot, internal/attractor/validate. `attractor
  validate` supports `--batch` and `--json` (main.go:839-853).
- **Handler registry** (internal/attractor/engine/handlers.go):
  - `NewCoreRegistry` (:70-85) registers start, exit, conditional, parallel, parallel.fan_in, tool,
    loop.begin/end and concurrent.split/join.
  - `stack.manager_loop` is added in `NewDefaultRegistry` (:88-97).
  - The shape mapping is in `shapeToType` (:141-171): `box` maps to agent, `hexagon` to
    wait.human, `diamond` to conditional, `component` to parallel, `tripleoctagon` to fan-in,
    `parallelogram` to tool, `house` to manager loop.
  - The engine defines the Handler interface (handlers.go:34) and optional capability interfaces
    (FidelityAware, SingleExecution, ProviderRequiring).
- **Human in the loop.**
  - `wait.human` is in internal/attractor/workflows/human_gate.go.
  - Interviewers: Console, Callback and Queue (internal/attractor/engine/interviewer_impls.go:17,
    236, 261) and AutoApprove (handlers.go:1380). HTTP answers go through `serve`.
- **Other spec pieces:**
  - Conditions: internal/attractor/cond (with a fuzz test).
  - Stylesheet: internal/attractor/style/stylesheet.go.
  - Fidelity: engine/fidelity.go.
  - Checkpoints and resume: engine/resume*.go and runtime/. Resume works from logs_root, CXDB
    context or run branch.
  - Retry, goal gates and failure classes: engine/failure_policy.go, retry_*, goal_gate_test.go.
  - Loop restart: engine/loop_restart_policy.go.
  - Manager loop: engine/manager_loop.go.
- **Unified LLM client.**
  - internal/llm: client, streaming, retry, middleware, tool validation, generate_object.
  - Provider adapters: internal/llm/providers/{openai, anthropic, google, openaicompat,
    codexappserver}.
- **Coding-agent loop.**
  - internal/agent: session.go, tool_registry.go, apply_patch.go, subagents.go, profiles for
    openai, anthropic, google and codex-app-server (profile_registry.go:10-17).
  - The only ExecutionEnvironment is local (env.go:20-35; env_local*.go).
- **Compliance claims.**
  - spec-compliance-audit.md says "All 53 violations resolved" (dated 2026-02-14, updated
    2026-02-18, last touched 2026-03-05).
  - plan-parity-matrix.md maps the spec's 22-row parity matrix to tests
    (engine/parity_matrix_test.go).
- **Beyond the spec:** ingest, CXDB event sinks, git commit per node, preflight prompt probes,
  provider failover, a stall watchdog, `--tmux` agent sessions, and workflow packages
  (`workflows/*/workflow.toml`, `--package`).
- **Missing or not found:**
  - ACP.
  - Non-local execution environments: the spec's Docker/SSH style ExecutionEnvironment
    alternatives. Only `env_local` exists.
  - Container sandboxing.

### 2. Backends and agents

The provider registry is in internal/providerspec/builtin.go. Backend routing is
`AgentRouter.Run` in internal/attractor/engine/agent_router.go: `runAPI` at :168 or `runCLI` at
:1085, chosen by `backendForProvider` at :130. A backend is mandatory per provider (config.go:341-360,
"invalid backend ... (want api|cli)").

**CLI backend**

Uses the external agent's own loop. Invocation templates (builtin.go):

- **openai** (builtin.go:14-20): `codex exec --json -m {{model}} -C {{worktree}}`, prompt on
  stdin. `runCLI` adds `--output-schema <stage>/output_schema.json -o <stage>/output.json`
  (agent_router.go:1176-1187).
  - `--sandbox workspace-write` was removed globally in commit `f23e0dc` (2026-03-03, "fix(provider):
    disable codex sandbox globally"; sandbox blocked `.git` writes for merges).
  - README.md:296 still shows `--sandbox workspace-write`, so the README is stale.
- **anthropic** (builtin.go:42-48): `claude -p --dangerously-skip-permissions --output-format
  stream-json --verbose --model {{model}} <prompt>`. The prompt is an argument, and stdin gets
  `y\n` (agent_router.go:1275-1282).
- **google** (builtin.go:61-68): `gemini -p --output-format stream-json --yolo --model {{model}}
  <prompt>`.
- **Restrictions.**
  - CLI backend is only allowed for built-in providers that have a CLI contract: "backend=cli
    requires builtin provider with cli contract" (config.go:354-356).
  - In `cli_profile: real`, executable overrides and `KILROY_*_PATH` are rejected. Shims need
    `test_shim` plus `--allow-test-shim` (config.go:361-363; README.md:300-304).

**Claude Code on a subscription: yes, on the default (non-tmux) path**

- `conflictingProviderEnvKeys` removes `ANTHROPIC_API_KEY` (and `CLAUDECODE`) for the anthropic
  CLI (agent_router.go:1845-1861). The comment says "The Claude CLI uses OAuth/session-based auth
  by default; an inherited ANTHROPIC_API_KEY causes it to attempt (and fail) external API key
  authentication."
- Issue #90 (2026-05-08) confirms the shape `env -u ANTHROPIC_API_KEY claude
  --dangerously-skip-permissions --print ...`. It also reports that an expired CLI login gives
  opaque failures or apparent hangs.
- **Caveat: the `--tmux` path differs.** Its Claude template
  (internal/attractor/agents/templates/claude.go:18-28) uses `--bare --dangerously-skip-permissions
  --print ...`. The `claude --help` text for `--bare` says "Anthropic auth is strictly
  ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)". So
  `--tmux` on main needs an API key.
- The unmerged v2 branch adds `--bare` only when `authMethod != "cli_oauth"`
  (kilroy-v2 templates/claude.go:29-33).

**Codex on a ChatGPT subscription: yes**

- `buildCodexIsolatedEnvWithName` (agent_router.go:1611-1692) sets `HOME`, `CODEX_HOME` and
  `XDG_*` to a per-stage directory.
  - If `OPENAI_API_KEY` is set, it writes an apikey-mode `auth.json`.
  - Otherwise it copies `~/.codex/auth.json`, which is the subscription login (:1629-1667).
- The code comment warns that "gpt-5-codex and other exec-mode models aren't accessible under
  ChatGPT subscription auth". So which models work depends on the subscription.
- The user's `~/.codex/config.toml` is deliberately not copied.
- **Second route: `codex-app-server` provider** (builtin.go:22-31; protocol `codex_app_server`).
  - Spawns `codex app-server --listen stdio://` (internal/llm/providers/codexappserver/transport.go:22,33,605).
  - It uses Codex as a model behind Kilroy's own agent loop. Requests are serialized as a "stateless
    transcript" with tool-call markers (request_translator.go:672-697).
  - Codex's built-in tool approvals are declined (transport.go:957-973).
  - The engine passes `approvalPolicy: never`, `sandbox: danger-full-access`
    (agent_router.go:527-555).
  - No API key is needed; it registers when `api_key_env` is empty
    (api_client_from_runtime.go:26-28).
  - It uses whatever login `codex` has. I did not test that this works with a ChatGPT login.
    `account/chatgptAuthTokens/refresh` returns "not configured" (transport.go:970-971), which
    suggests the codex login handles token refresh itself.

**API backend (own loop)**

- `newAPIClientFromProviderRuntimes` (api_client_from_runtime.go:18-61) maps the protocol to an
  adapter: openai_responses, anthropic_messages, google_generate_content, openai_chat_completions
  (`openaicompat`, with base URL, path, options key and extra headers) and codex_app_server.
- Default `agent_mode` is `agent_loop`; `one_shot` is also supported (agent_router.go:174-181).
- Built-ins (builtin.go): openai, anthropic, google (alias gemini), kimi (anthropic_messages at
  api.kimi.com/coding), zai, cerebras, minimax, inception. README.md:291 says
  "`kimi`, `zai`, `cerebras`, and `minimax` are API-only in this release."
- Base URL overrides come from `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, `GEMINI_BASE_URL` and
  `MINIMAX_BASE_URL` (api_client_from_runtime.go:63-92), or from the per-provider
  `api.base_url`/`api.path` in run.yaml (provider_runtime.go:59-77).
- **Custom (non-built-in) provider keys are allowed for `backend: api`.**
  - They need `api.protocol` (config.go:345-352).
  - The model catalog check only warns for providers not in the OpenRouter catalog
    (run_with_config.go:466-480).
  - They must set `api.profile_family` to a registered family (openai/anthropic/google/codex),
    otherwise `NewProfileForFamily` errors with "unsupported profile family"
    (internal/agent/profile_registry.go:30-38; engine/agent_router.go:1042-1066).
  - The adapter is registered only if the named API-key env var is non-empty
    (api_client_from_runtime.go:30-36). A keyless local server needs a dummy key env var.
  - A test fixture uses an `acme` custom provider (engine/config_test.go:854-858).

**Per-target answers**

- **GLM.** Built-in `zai`: OpenAI Chat Completions at `https://api.z.ai`,
  `/api/coding/paas/v4/chat/completions`, `ZAI_API_KEY` (builtin.go:82-93; README run.yaml
  example). Cerebras is commented as hosting "GLM 4.7" (agent_router.go:529-535).
  `stabilizeZAIFailoverModel` is at agent_router.go:786. API only: there is no z.ai CLI driver.
- **DeepSeek.** No built-in. A custom provider works with `protocol: openai_chat_completions`,
  `base_url: https://api.deepseek.com`, `path: /chat/completions`, `api_key_env`,
  `profile_family: openai`. The openaicompat adapter parses DeepSeek's `reasoning_content`
  (internal/llm/providers/openaicompat/adapter.go:338, 648). I inferred this config from the code;
  it is not documented or tested.
- **Local Qwen (Ollama, vLLM, llama.cpp, LM Studio).**
  - Same custom-provider route. Example: `base_url: http://localhost:11434`,
    `path: /v1/chat/completions`, `api_key_env: <var set to any value>`,
    `profile_family: openai`.
  - There is no mention of ollama, vllm, llama.cpp or qwen in non-test Go code on main.
  - Whether the tool-calling quality of local models is good enough is untested.
  - The fork branch `mattleaverton/kilroy@feat/v2-reframe` (`e39e170`, 2026-05-15) has
    `internal/attractor/agents/ollama_backend.go`, which talks to Ollama `/api/chat` (default
    `http://localhost:11434`). Nothing calls `NewOllamaBackend` outside its definition and tests,
    so it is unwired.
- **Gemini CLI.** Yes, the built-in google CLI contract above.
- **OpenCode.** Only through `--tmux` (cmd/kilroy/main.go:315, 130-139).
  - The template internal/attractor/agents/templates/opencode.go runs
    `opencode run --format json --pure --model <provider/model> --dir <wt> <prompt>`.
  - It injects `OPENCODE_CONFIG_CONTENT` with an Anthropic apiKey from the environment.
  - Selected by the node attribute `agent_tool=opencode` (tmux_handler.go:326-345).
- **`--tmux` mode** (TmuxAgentHandler, internal/attractor/agents/tmux_handler.go). Runs
  claude, codex, gemini or opencode in tmux sessions on socket `kilroy`.
  - Its codex template uses `exec --sandbox workspace-write --skip-git-repo-check --json -c
    web_search="disabled"` (templates/codex.go:19). Unlike the default path, it keeps the sandbox.
- **Pi, Amp, Cursor, Aider, Goose:** not present.
- **ACP:** not present. A repo grep for "acp" or "agent client protocol" finds nothing.

### 3. Sandboxing

- **Git worktree isolation.**
  - Per-run git worktree plus a run branch: `git worktree add` in
    internal/attractor/gitutil/git.go:86. Commit per node; README "Run Artifacts" lists
    `worktree/`.
  - `git.require_clean` and `run_branch_prefix` are in run.yaml.
- **Per-stage environment isolation for codex.** HOME and CODEX_HOME are set to a per-stage
  directory (agent_router.go:1611-1692). Other CLIs get the base environment minus the scrubbed
  keys (agent_router.go:1268-1274).
- **No container, VM or seatbelt.**
  - Claude runs with `--dangerously-skip-permissions`, gemini with `--yolo`.
  - Codex on the default path has no `--sandbox` flag (commit `f23e0dc`), so it falls back to codex
    defaults.
  - codex-app-server uses `danger-full-access`.
  - Docker is used only to host CXDB (scripts/start-cxdb.sh).
- `rust_sandbox_preflight.go` is a toolchain-path preflight for Rust stages, not an isolation
  layer.
- `kilroy attractor serve` has no authentication and binds to localhost by default (README.md:470).
- The two paths are easy to confuse:
  - The default CLI backend uses `providerspec/builtin.go:44`: `claude -p --dangerously-skip-permissions`, with no `--bare`, and `ANTHROPIC_API_KEY` is stripped (agent_router.go:1848). So it can use the subscription.
  - The `--tmux` path uses templates/claude.go:20, which has `--bare` and so needs an API key.
  - The codex invocation in builtin.go has no `--sandbox` flag. The merge-node `stripSandboxFlag` in agent_router.go:1136-1149 is now dead code on the default path, but it still applies to the tmux codex template.
  - Re-checked 2026-10-04 at `b55fb0f` after the planner's sandboxes.md attributed `--bare` and `--sandbox workspace-write` to the default path.

### 4. Extensibility

- **New API provider.**
  - If it speaks one of the five protocols, it needs only config: `llm.providers.<key>` with
    `backend: api` and `api.{protocol, base_url, path, api_key_env, profile_family, headers}`
    (engine/config.go:24-39).
  - For a built-in, add an entry to internal/providerspec/builtin.go.
  - For a new wire protocol, implement `llm.ProviderAdapter` (`Name`, `Complete`, `Stream`;
    internal/llm/client.go:10-14), add an `APIProtocol` constant (providerspec/spec.go:10-16), and
    add a case in engine/api_client_from_runtime.go:37-57.
- **New agent-loop behavior.** `agent.ProviderProfile` (internal/agent/profile.go:24-32), registered
  through `agent.RegisterProfileFamily` (profile_registry.go:20-28).
- **New CLI agent (default path).** Three places need changes:
  - Add a `CLISpec` (`DefaultExecutable`, `InvocationTemplate` with `{{model}}`, `{{worktree}}`
    and `{{prompt}}`, plus `PromptMode` and capability probes) to a built-in provider in
    providerspec/builtin.go.
  - `runCLI` hardcodes provider names for prompt mode (agent_router.go:1191-1197), codex
    semantics (:2190-2196) and executable env overrides (provider_exec_policy.go:143-154).
  - Output parsing lives in engine/cli_stream_parser.go.
  - So it is not purely declarative.
- **New CLI agent (tmux path).** Add a `templates.Template` and register it in
  internal/attractor/agents/templates/registry.go:10-17. template.go:1-3 says: "Adding a new CLI
  tool means defining its template — no code changes to the session manager." Log parsers are in
  agents/agentlog/.
- **Node-level extensibility.** Implement `engine.Handler` (`Execute(ctx, *Execution, *model.Node)`;
  handlers.go:34-36) and `HandlerRegistry.Register(type, h)`. Nodes select it by `type=` or shape.
  This is how the tmux handler replaces the default agent handler (cmd/kilroy/main.go:130-139).
- **ACP.** The natural fits are a new `engine.Handler`, so an ACP agent replaces the agent node
  (like TmuxAgentHandler), or a new `llm.ProviderAdapter`, like codexappserver, which already does
  a JSON-RPC-over-stdio subprocess. Nothing exists yet.
- **v2 fork.** The unmerged branch introduces `agentbackend.AgentBackend` (StartTurn/TurnStream)
  with SDKBackend and TmuxBackend, a policy file mapping classes to drivers
  (`internal/policy/data/policy.toml`: drivers claude_cli, codex_cli, gemini_cli, anthropic_sdk,
  openai_sdk, google_sdk), and an auth chain (`kilroy auth init/check`). That would be the cleaner
  extension point if it ever merges.

### 5. Project health (gh, 2026-10-04)

- **Repo facts.**
  - Created 2026-02-06. Last push 2026-04-27T17:57:05Z. Not archived and not a fork.
  - 221 stars, 52 forks, 8 watchers. The description is empty.
- **Commits on main by month** (`git log origin/main`): 2026-02: 774, 2026-03: 158, 2026-04: 12,
  May through October: 0. Last commit `b55fb0f` 2026-04-27 by mattleaverton (PR #88). No other
  branch has commits after 2026-04-27.
- **Contributors** (GitHub API, by commits): DanMoraes 712, mattleaverton 52, mvanhorn 30,
  vadimcomanescu 17, danshapiro 15, glowforgedan 10, thewoolleyman 7, park9140 5, and 5 others
  with 2-3 each. 13 total.
  - Many commits are authored as "Kilroy Attractor <kilroy-attractor@noreply.anthropic.com>" with
    Claude co-author trailers (for example `f23e0dc`), so they are largely agent-written.
- **Releases.** One: v0.1.0, 2026-04-16 (https://github.com/danshapiro/kilroy/releases/tag/v0.1.0).
- **Open issues (8).** #92 (2026-05-15), #91, #90, #89, #80 (portkey), #79, #69 (brew install
  fails), #63 (Vertex).
  - Maintainers have not commented on any of them. The only comment is the reporter's own on #89.
  - #90-#92 were filed by danshapiro himself and refer to a newer CLI (`kilroy run coding-loop`,
    `kilroy check`, `kilroy auth check`, "kilroy-from-matt/AGENTS.md") that is not on main.
- **Open PRs.** #74 (gofmt, 2026-04-01) has no response. The last merged PRs were #83-#88
  (2026-04-24 to 2026-04-27).
- **Successor or continuation.**
  - `mattleaverton/kilroy` branch `feat/v2-reframe`: 234 commits ahead of main, all in May 2026,
    last `e39e170` 2026-05-15. Its README says "Status: alpha. Public surface is
    `kilroy run <workflow>`".
  - The most recently pushed fork is x85446/kilroy (2026-07-09).
  - I found no explicit deprecation, maintenance notice or named successor. danshapiro's recent
    repos (freshell, nanoclaw, onecli, Amplifier bundles) are active through 2026-10, which
    suggests his attention moved elsewhere. That is an inference.

## Open questions / unverified

- I did not build or run Kilroy. Everything above comes from reading the code and GitHub
  metadata.
- **Codex default path without `--sandbox`:** with an isolated CODEX_HOME and no config.toml, what
  sandbox and approval mode does `codex exec` actually use? If the default is read-only, edits
  could fail. Unverified; no `--full-auto` or bypass flag was found in non-test code.
- Whether ChatGPT-subscription auth works for the models a graph names, and whether the
  `codex-app-server` route works under a ChatGPT login. Untested.
- Whether a local OpenAI-compatible server (Ollama/vLLM/llama.cpp with Qwen) works end to end:
  tool-call format, streaming, and preflight prompt probes against a custom provider. Inferred
  from the code paths only.
- DeepSeek as a custom provider: inferred, not tested.
- Whether the v2-reframe branch (Ollama backend, driver policy, cli_oauth handling) will ever be
  merged or published under a different repo. Issues #90-#92 suggest Dan uses it privately.
- Why the LICENSE names StrongDM, Inc. as copyright holder. Possibly copied from the spec repo;
  unverified.
- Exact CLI flag compatibility with current `claude`, `codex` and `gemini` versions as of
  2026-10. The code was last touched in April 2026.
