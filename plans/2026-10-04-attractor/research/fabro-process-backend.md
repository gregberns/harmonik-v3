# Fabro: a non-ACP process backend for Claude and Codex

Question (from the captain, 2026-10-04): how feasible is it to have Fabro
start and stop Claude Code and Codex as plain processes on their
subscriptions, without ACP and without API-rate spend?

## Summary

- **The removed `cli` backend had no subscription handling of its own.** It ran
  `claude -p --output-format stream-json`, `codex exec --json --full-auto` or
  `gemini -o json --yolo` inside the run's sandbox. But it got credentials
  from Fabro's resolver and injected them as API-key env vars. At
  `29b7cc0de^`, a keyless Claude stage reached `claude`'s own login only
  when Fabro had no vault. With a vault, the resolver returned
  `NotConfigured` and the stage errored before spawning. Its author
  recommended it for Claude Max in March (issue #143), but that setup
  predates this code and is unverified. It was deprecated when ACP landed
  (#93, 2026-05-12) and deleted on 2026-05-18 (PR #307, commit
  `29b7cc0de`): roughly 1,000-1,100 production lines of runtime and
  credential code, plus tests.
- **Re-adding it is a moderate change in two repos.** The engine now lives
  in Petri, and its agent step already has a clean two-variant seam: an
  `AgentBackend` enum and a `Session` enum with `open`, `prompt` and
  `shutdown`. It also has a sandbox-neutral `ExecEnv::spawn` that returns a
  process handle with stdin, stdout lines, `wait` and `signal`. A `cli`
  variant that spawns `claude -p` is about **500-800 production lines across
  6-9 files**, plus tests:
  - most of it in a new Petri module;
  - small edits to Petri's DOT frontend and lints;
  - a one-line enum change and display changes in Fabro.

  It would be a fork of both `petri` and `fabro`, both of which track git
  `main` and change weekly.
- **The planner's POC changes the baseline** (poc-claude-subscription.md,
  2026-10-04). `claude-agent-acp` 0.85.1 ran on the operator's Max login
  with no API key and no `authenticate` call. It returned
  `authMethods: []` to the same `initialize` Petri sends. So Fabro's
  existing ACP path with `acp.command="claude-agent-acp"` very likely
  already runs Claude on the subscription, with no code at all, **provided
  no `ANTHROPIC_API_KEY` is in Fabro's vault**. Petri injects any vault
  `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` or `OPENAI_API_KEY` into every ACP
  process (`petri:crates/attractor/steps/src/acp/command.rs:17`). The host
  sandbox doesn't filter explicit spec env (`sandbox-driver-host/src/exec.rs:59-61`),
  so a vault key would silently switch the adapter to API billing.
  **Update (spike-fabro.md, 2026-10-04): confirmed hands-on.** With an empty
  vault, `claude-agent-acp` 0.85.1 ran in Fabro on the Max login. It
  reported "Claude Max", was metered against the plan windows, and wrote a
  file. Petri tolerated 0.85.1's extra notifications (`_auth/status_update`,
  `configOptions`, `usage_update`) on the happy path. Its live tests still
  pin only `@zed-industries/claude-code-acp@0.16.2`.
  - The model can be fixed per node with `ANTHROPIC_MODEL` in
    `acp.config` env (haiku in the spike).
  - What it lacks is per-node model choice, because Petri never calls
    `session/set_config_option` (#649), and session reuse (#514).
  - The policy question is unchanged: SDK and ACP vs. `claude -p`.
- **Three more routes also need no fork:**
  1. **A command node** (`script="... | claude -p ..."`) works today and is
     the cheapest route. It runs in the sandbox, has a timeout and kill,
     pipes context in through `stdin_source`, and stores output in
     `command.output`. It loses the agent contract:
     - prompt assembly and fidelity;
     - `last_response` and `response.<node>`;
     - repair turns;
     - usage and cost;
     - steering and interrupt;
     - tool hooks.
  2. **A small ACP shim** around `claude -p` (about 250-400 lines in any
     language), configured with `acp.command`, keeps the agent node, its
     prompt assembly and its interrupts. It runs the real `claude` binary
     and strips `ANTHROPIC_API_KEY`, so the login is used.
  3. **For Codex,** the existing `codex-acp` adapter (ChatGPT login) is
     already an ACP route. Whether it reuses a headless login is
     UNVERIFIED (acp.md).
- **Upstream is unlikely to take `cli` back.** The maintainer called ACP
  "the right abstraction" and `cli` "deprecated and slated for eventual
  removal" (#93). He declined Claude-login support on ToS grounds (#313,
  2026-05-20), and pointed to ACP with an agent that is already logged in.
  He did promise to keep `cli` if ACP couldn't use a subscription (#93,
  2026-05-12). That rested on his "understanding" that ACP allowed it. The
  user said they'd test, never reported back in the thread, and `cli` was
  removed six days later. A user later confirmed that ACP with a pre-logged-in Docker
  image works (#313). Open issues ask to improve ACP instead: model
  selection (#649) and session reuse (#514).

**Recommendation:**
1. Spike Fabro with `acp.command="claude-agent-acp"` first (zero code). It
   keeps the agent contract.
   - Precondition: no `ANTHROPIC_API_KEY` in the vault.
   - Pass check: the adapter's `_auth/status_update` shows label
     "Claude Max", as in the POC.
   - Also check that Petri tolerates 0.85.1's extra notifications.
   - **Done: passed** (spike-fabro.md). Codex via `codex-acp` on the ChatGPT
     login passed too.
2. Use command nodes where a node needs a specific model or must use the
   `claude` binary on PATH.
3. Write the shim only if the operator wants the `claude -p` route for
   policy reasons, or per-node models without one `acp.command` per model.
4. Fork for a `cli` backend last.

## Facts

Sources:
- fabro-sh/fabro clone at `7fc0edbf8` (2026-10-03).
- Removal commit `29b7cc0de` (2026-05-18, PR #307). Code before it was read
  at `29b7cc0de^`.
- lithoscomputer/petri at `91d1b77b` (2026-10-01), the revision in
  Fabro's `Cargo.lock` (`git+...petri.git?branch=main#91d1b77b`).
- GitHub issues via `gh`, 2026-10-04.

Paths prefixed `petri:` are in the petri repo, `fabro@29b7cc0de^:` in Fabro
before the removal; others are in Fabro at HEAD.

### 1. The removed CLI backend

**Removal**
- PR #307 "feat(workflow): enforce strict api/acp backends", merged
  2026-05-18T17:20:57Z, commit `29b7cc0de`, by Bryan Helmkamp; generated
  with Codex.
- Stated reason: "API-backed stages use Fabro-owned model/provider auth,
  while ACP-backed stages launch a user-supplied stdio process that owns its
  own auth and tools. That removes the legacy CLI backend and prevents ACP
  execution from accidentally resolving or forwarding provider credentials."
- 48 files changed, +1,119 / −4,251. Deleted:
  - `lib/crates/fabro-workflow/src/handler/llm/cli.rs`: 1,568 lines, about
    730 of them production code (the test module starts at :731). With
    `launch_env.rs` and the CLI credential code in `resolve.rs`, the deleted
    production code is roughly 1,000-1,100 lines.
  - `handler/llm/launch_env.rs`: 121 lines.
  - CLI credential code in `fabro-auth/src/resolve.rs`: −289/+ net.
  - `agent.cli.*` events.
  - Live CLI tests (`real_cli.rs`, much of `integration.rs` and
    `daytona_integration.rs`).
- No discussion on the PR: the only review is the Claude bot's stock notice.

**How it spawned the process** (`fabro@29b7cc0de^:.../handler/llm/cli.rs`)
- The CLI was chosen from the node's provider profile: `AgentCli::for_profile_kind`, :53-75.
- It checked the binary exists in the sandbox; Fabro "does not install agent
  CLIs" (:77-110).
- The prompt was written to `/tmp/fabro_cli_<uuid>_prompt.txt` in the
  sandbox and piped in with `cat` (:411-417, :120-156).
- Commands (:143-155):
  - `cat P | codex exec --json --full-auto [-m M]`
  - `cat P | gemini -o json --yolo [-m M]`
  - `cat P | CLAUDECODE= claude -p --verbose --output-format stream-json --dangerously-skip-permissions [--model M]`

**Env and auth**
- Flow: `resolve_agent_launch_env` (`launch_env.rs:26-121`) →
  `CredentialUsage::CliAgent` → `to_cli_credential`
  (`fabro@29b7cc0de^:lib/crates/fabro-auth/src/resolve.rs:472-511`).
- The resolved API key or OAuth token went into the provider's API-key env
  var. For OpenAI Codex it set `OPENAI_API_KEY` (plus `CHATGPT_ACCOUNT_ID`)
  and ran a `codex login` command.
- With no resolver, it copied the provider's env vars from the process
  env (:84-98).
- The vars went into an env file sourced before the command
  (`cli.rs:452-475`).
- Nothing strips `ANTHROPIC_API_KEY` or relies on a `claude` login.
- Keyless runs (plan-reviewer finding, confirmed in code):
  - `fabro@29b7cc0de^:lib/crates/fabro-workflow/src/pipeline/initialize.rs:353`
    builds a resolver whenever a vault exists, and passes it to
    `AgentCliBackend::new` (:175-179).
  - `launch_env.rs:35-48` resolves `CredentialUsage::CliAgent` and returns
    its error ("Failed to resolve CLI credential").
  - Anthropic's catalog credentials are only `env:ANTHROPIC_API_KEY` and
    `vault:ANTHROPIC_API_KEY` (`fabro-model/src/catalog/providers/anthropic.toml:9`).
    `find_credential` returns `NotConfigured` when neither is set
    (`resolve.rs:299-315`).
  - So with a vault, a keyless Claude stage failed before `claude` was
    spawned. Only the no-vault `new_from_env` path (`launch_env.rs:80-97`)
    reached `claude` with no key, where the CLI falls back to its own login.
  - `launch_env.rs` dates from `234bd5663` (2026-05-11), so the March setup
    behind #143 is unverified.

**Output**
- NDJSON parsers per CLI: `parse_claude_ndjson`, `parse_codex_ndjson`,
  `parse_gemini_json` (:166-313). They produced text plus input and output
  tokens, billed through the catalog (:640-660).
- Changed files came from git snapshots before and after (:406, :640).

**Timeouts and kill**
- `sandbox.exec_command_streaming` with the node `timeout`, plus a child of
  the run's cancel token (:481-530). The comment says the earlier detached
  `setsid &` launcher "could not be cancelled mid-flight".
- Terminations Cancelled, TimedOut and Exited emitted
  `AgentCliCancelled/TimedOut/Completed` (:562-610).
- Sandbox auto-stop was disabled for long runs (:476-479).
- `thread_id` was ignored: "Every CLI call starts fresh" (#227).

**Sandboxes**
- Yes. Everything went through the `Sandbox` trait (`write_file`,
  `exec_command_streaming`), so it ran in local, Docker and Daytona alike.
  Daytona live tests existed and were deleted in #307.

### 2. Today's extension points (petri `91d1b77b`)

**The backend enum**
- `petri:crates/attractor/steps/src/agent/backend.rs:26-33`:
  `enum AgentBackend { Acp, #[default] Api }`.
- Fabro's copy: `lib/foundation/fabro-types/src/llm_backend.rs:21-24`
  (`Api, Acp`; a test asserts `"cli"` is rejected, :38-43). Also used in
  `run_projection.rs`.

**The session seam**
- `backend.rs:35-38`: `enum Session { Acp(Box<Client>), Pebble(Box<NativeSession>) }`.
- `Session::open` (:85-153), `prompt` (:156-186), `shutdown` (:194-207),
  `export` (:209-214), `metrics` (:215-221).
- `prompt` takes the node deadline and the control channel. ACP enforces the
  deadline with `tokio::time::timeout` and terminates on expiry, with class
  `retry_requested` (:163-183).
- `run_session` (`agent.rs:495-581`) is backend-neutral:
  - assembles the prompt (fidelity, contract);
  - loops on repair turns against the output contract;
  - writes `response.<node>`, `last_response`, `last_stage`, `output.<node>`
    and routing directives.

  A new `Session::Cli` variant gets all of this for free.

**Process spawning in the sandbox**
- `petri:crates/core/executor/src/env.rs:292-297`:
  `trait ExecEnv { async fn spawn(&self, spec: ProcessSpec) -> Result<Box<dyn ProcessHandle>> ; fn workspace_path() ... }`.
- `ProcessSpec` (:26-41) has `program`, `args`, `env`, `cwd`, `stdin`
  (`Null` | `Piped`, :73-80), `output` (lines or bytes) and `timeout`.
- `ProcessHandle` (:250-271) has `lines()`, `bytes()`, `stdin()`, `wait()`
  and `signal(Sig)`.
- The sandbox driver supplies the implementation (host, Docker, Daytona).

**Stop and cancel**
- `Client::terminate` (`petri:crates/attractor/steps/src/acp/mod.rs:800-810`)
  sends SIGTERM, waits `grace`, then SIGKILL. A CLI session would do the
  same.
- Interrupts arrive as `Control` messages on `ctx.control` (`acp/mod.rs:720,768`).
  For a one-shot CLI process, an interrupt maps to terminate.

**Frontend and validation**
- `petri:crates/attractor/frontend/src/lower/nodes.rs:293-310` accepts only
  `"acp" | "api"` and lowers `acp.command`/`acp.config` (:452-482).
- The ACP lints are in `lower/lints.rs:259-300`.

**Size of a `cli` backend that spawns `claude -p --output-format stream-json`** (estimate)

| Piece | Where | Rough size |
|---|---|---|
| CLI session: build argv per CLI, strip `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` from the spec env, write the prompt on piped stdin, read stdout lines, parse Claude stream-json and Codex `--json` JSONL into text and usage, deadline, terminate on interrupt | new `petri:crates/attractor/steps/src/cli/` | 300-450 |
| `AgentBackend::Cli`, `Session::Cli` arms in open/prompt/shutdown/export/metrics | `agent/backend.rs`, `agent.rs` (metadata at :391), `admission.rs` | 40-80 |
| Accept `backend="cli"` plus a `cli.command` or `cli.agent` attribute; lints | `frontend/src/lower/nodes.rs`, `lints.rs` | 60-120 |
| Fabro enum, projection, web display | `fabro-types/src/llm_backend.rs`, `run_projection.rs`, web | 20-60 |
| Tests (parsers, a fake CLI, cancel/timeout) | both repos | 300-600 |

Total: about 500-800 production lines in 6-9 files, plus tests.

- Gives up nothing against today's ACP path. It could also do what ACP
  can't here: per-node `--model` from the stylesheet (#649 asks this for
  ACP) and `--resume <session-id>` for `full` fidelity (#514, #227).
- Cost: two forks on fast-moving `main` branches. Fabro averages about 500
  commits a month (impl-fabro.md).
- Codex note: run `codex exec` with an explicit `--sandbox workspace-write`,
  or `--full-auto` as the old backend did. Without it, Codex's default is
  read-only (impl-kilroy.md).

### 3. Without forking

**a. A command node running `claude -p`** (works today)
- A node with `script` is a command node; `language` is shell or python;
  `stdin_source` names a context key to pipe in; `output_schema="routing"`
  reads the last JSON object as a routing directive
  (`docs/public/reference/dot-language.mdx:165,179-183,224-265`).
- The script substitutes only `{{ goal }}`, `{{ inputs.NAME }}` and
  `{{ vars.NAME }}`, each quoted as one shell word. The `{{ secrets.* }}`
  and `{{ env.* }}` template forms are rejected, but the script can read
  env vars as `$NAME`, for example a `CLAUDE_CODE_OAUTH_TOKEN` passed as
  sandbox env (`docs/public/workflows/variables.mdx:66-101`).
- Runtime: `petri:crates/attractor/steps/src/command.rs`.
  - Spawns through the same `ExecEnv` (sandbox), with a default deadline of
    600,000 ms when the node sets no `timeout` (:109-110).
  - Nonzero exit → failure class `exit_status`, normal retries (:345-352).
  - Output → `command.output` (:373-374), offloaded when large.
  - A routing directive can merge `context_updates` (:378-400).
- Example shape (UNTESTED):

  ```
  implement [script="{ cat .fabro/prompts/implement.md; cat; } | claude -p --output-format json --dangerously-skip-permissions --model opus | jq -r .result", stdin_source="command.output", timeout="45m"]
  ```

- **Keeps:** sandbox placement, timeout and kill, retries on nonzero exit,
  per-node model and CLI (it's just argv), and any CLI (`codex exec`,
  `qwen`, `opencode run`, `pi -p`).
- **Loses** against an agent node:
  - prompt templating (MiniJinja, fidelity preambles, `{{ goal }}` inside
    a prompt file);
  - `response.<node>` and `last_response`: only `command.output`, which the
    next command overwrites;
  - output-contract repair turns (schema failures are non-retryable,
    dot-language.mdx:255);
  - usage and cost accounting;
  - steering and interrupt into a live turn;
  - tool hooks;
  - `files_touched` events;
  - display as an agent stage in the UI.
- **Auth:** the local (host) sandbox inherits the process env. It drops
  names ending in `_api_key`, `_secret`, `_token`, `_password` or
  `_credential`, except for a safelist (`PATH`, `HOME`, `USER`, `SHELL`,
  `LANG`, `TERM`, `TMPDIR`, `GOPATH`, `CARGO_HOME`, `NVM_DIR`). Explicit
  spec env is not filtered
  (`sandbox-driver/crates/sandbox-driver-host/src/exec.rs:47-71,192-195`,
  impl-fabro.md). So `claude` should find the host login, and no inherited
  API key leaks in. A command node gets no vault keys unless the workflow
  passes them as env. UNVERIFIED by a run.
  In Docker the login isn't there. A `CLAUDE_CODE_OAUTH_TOKEN` must be
  passed through the environment's secret env (sandboxes.md), with the
  exfiltration caveat.

**b. An ACP shim that wraps `claude -p`**
- A stdio JSON-RPC program, set as `acp.command="claude-shim --model opus"`:
  - answers `initialize` with no auth required;
  - on `session/prompt`, spawns `claude -p --output-format stream-json`
    without `ANTHROPIC_API_KEY`, streams `session/update` message chunks,
    and returns the final text;
  - maps `session/cancel` to SIGTERM.
- About 250-400 lines in TypeScript, Python or Go (estimate).
- Keeps the agent node: prompt assembly, contract and repair turns,
  `last_response`, interrupts and Fabro's hooks around permission requests.
  It doesn't get API-backend usage accounting.
- Petri's client advertises no fs or terminal capabilities and
  authenticates only through API-key methods
  (`petri:.../acp/mod.rs:611-660,619`). A shim that does its own work
  through `claude` needs neither.
- ACP nodes reject `model`, so the model goes in the shim's argv.
  Workaround: one `acp.command` per model class in the stylesheet.
- Petri passes `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and `OPENAI_API_KEY` to
  ACP processes if they're in the vault (`acp/command.rs:17`). The shim must
  drop them, and the vault should not hold them.
- Compared with `claude-agent-acp`, which already works on the subscription
  (POC): the shim adds nothing technical except using the `claude` on PATH
  rather than the SDK's bundled build. Both get the model from argv or
  config rather than the stylesheet. The shim runs `claude -p` on the
  unmodified binary, which is the "local usage of ... `claude -p`" carve-out
  the maintainer cited (#143). `claude-agent-acp` goes through the Agent
  SDK, whose docs carry the third-party-login restriction (acp.md). Either
  way, policy for heavy automated use stays open (comparison.md).

**c. Codex**
- Use `codex-acp` (ChatGPT login, `@agentclientprotocol/codex-acp`), or the
  same shim pattern around `codex exec --json --sandbox workspace-write`.
- Fabro's own `api` backend also reaches Codex with a ChatGPT login, but in
  Fabro's loop, not the Codex harness (impl-fabro.md).

**d. Plugins and hooks**
- Fabro hooks run around tool calls and stages; they don't add a backend
  (impl-fabro.md §4).
- Sandbox-driver plugins add sandboxes, not agent backends.
- No plugin point for agent backends was found.

### 4. Would upstream accept a `cli` backend back?

- #143 (2026-03-23, natea, "Use of Claude Max subscription plan..."):
  Helmkamp recommended `backend="cli"` as "the behavior of running
  `claude -p`", citing "public statements which suggest that 'local' usage
  of Agent SDK and `claude -p` is acceptable".
- #93 (2026-03-18 → 05-12, "ACP protocol for CLI agents"): ACP merged in
  #237. Helmkamp: "I think ACP is the right abstraction for us, and I'd like
  to consider the `cli`-based agent execution deprecated and slated for
  eventual removal."
  - natea relies on `cli` for Max.
  - Helmkamp: "if that is not correct then we will maintain `cli` to ensure
    you can continue".
  - Removal followed six days later.
- #227 (2026-05-07/08): CLI session reuse deferred: "My hope is that ACP may
  be able to serve as a replacement for the `cli` mode agents".
- #313 (2026-05-19/20): OAuth login support requested.
  - jessmartin: "I've gotten this to work by creating a Docker image where
    I'm already logged in and using ACP."
  - Helmkamp: offering Claude logins is against Anthropic's terms (quotes
    the Agent SDK docs). "The ACP-mode agents are an alternative to Fabro
    managing the authentication." Closed.
- #273: an ACP Claude smoke test failed on auth. The reporter then wrote
  that `[run.sandbox.env] ANTHROPIC_API_KEY = ""` "passes the host's
  `ANTHROPIC_API_KEY`" and mentioned a Max subscription "providing the key".
  Helmkamp asked where the key came from in the working form, and nobody
  answered. This is ambiguous and not evidence that ACP worked on a
  subscription.
- Still open: #649 (model stylesheets for ACP nodes via
  `session/set_model`, 2026-07-26) and #514 (`fidelity="full"` session reuse
  for ACP, 2026-06-18). No issue or PR asking to restore `cli` was found
  (searched "cli backend", "backend=cli", "restore cli", "subscription",
  "claude max").
- Reading: a `cli` PR contradicts a stated direction, and a maintainer who
  frames subscription auth as the user's business behind ACP. Contributions
  to #649 and #514 fit the direction. Acceptance odds for `cli`: low (an
  inference).

## Open questions

- Answered by spike-fabro.md: Fabro's ACP path with `claude-agent-acp`
  0.85.1 runs on the Max login, and `ANTHROPIC_MODEL` in `acp.config` env
  picks the model.
- Does a command node in the local sandbox find the macOS Keychain
  `claude` login (with `HOME` and `USER` kept but the env otherwise cleared)?
  About 10 minutes in a scratch repo with Fabro nightly, outside this repo.
- Did the old `cli` backend error out with no Anthropic credential, or run
  `claude` on its login? It's moot for re-adding, but it explains #143.
- Does `codex-acp` reuse `~/.codex/auth.json` headlessly under Petri's
  API-key-only authenticate? (acp.md open question.)
- Would Helmkamp take a PR for #649 (model via ACP `session/set_model`)?
  That plus the shim would remove the main reason to fork.
- Policy for heavy, parallel `claude -p` use on a subscription is the same
  open question as in comparison.md.
