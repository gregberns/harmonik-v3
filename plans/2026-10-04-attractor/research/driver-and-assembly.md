# Driving the Attractor, and how the pieces fit

Desk research, 2026-10-04: code and docs read, nothing built or run. The
researcher's hands-on Fabro spike is [spike-fabro.md](spike-fabro.md).
Pins: Kilroy `danshapiro/kilroy@b55fb0f` (2026-04-27); Fabro
`fabro-sh/fabro@7fc0edbf8` (2026-10-03) with Petri
`lithoscomputer/petri@91d1b77b` (from Fabro's Cargo.lock). `api.yaml:N` is
`fabro:docs/public/api-reference/fabro-api.yaml` (OpenAPI 3.1, v0.2.0).

## Summary

- **Agent tool** means a program that runs a coding agent's loop for one
  task: it sends the prompt to a model, lets the model call tools (read and
  edit files, run shell commands), feeds the results back, and repeats until
  done. Claude Code, Codex CLI, OpenCode, Pi and Qwen Code are agent tools.
  Each vendor's tool carries prompts and tool definitions tuned to its
  models. Both engines also have a **built-in generic loop**: their own
  implementation of the spec's coding-agent loop, which talks to any model
  API but is tuned to none.
- **Both engines can be driven from outside.** Neither works with a
  CLI-only driver today:
  - **Kilroy**: start, watch, stop and resume work from the CLI and run
    files, but CLI runs auto-approve every human gate (they take the first
    edge), and resume has gate and tmux bugs. A fork needs about **6-8
    days** (file-based gate channel, resume fixes, Codex sandbox, exit
    codes, end-to-end tests), plus **1-2 days** for the driver adapter.
  - **Fabro**: a full HTTP API (SSE events, questions and answers, cancel,
    resume, retry, artifacts) already covers every driver need. No fork
    needed for driving; the adapter is **4-8 days** (MVP about 2). The CLI
    has no standalone cancel and answers gates only interactively or with
    `--auto-approve`, so the driver uses HTTP.
- **Assembly.** In both engines Claude Code and Codex are meant to run in
  their own tuned harness (Kilroy: `claude -p` and `codex exec`; Fabro: ACP
  adapters). Caveats: Kilroy's default `codex exec` is likely read-only and
  needs the sandbox fix; Fabro's Claude and Codex over ACP both PASS on
  the subscriptions in the spike (Claude Max; ChatGPT login with
  `NO_BROWSER=1`); Fabro's built-in `openai-codex` route is Fabro's own
  loop, not the Codex harness.
  Hosted Qwen, DeepSeek and GLM fall back to the engine's generic loop. A
  tuned harness for them needs fork work in Kilroy (OpenCode or Pi
  templates) or an ACP agent in Fabro (Qwen Code, OpenCode), both untested.
- **Claude Code vs Codex** differ in process model (CLI vs JSON-RPC
  app-server), safety model (per-tool permissions vs OS sandbox),
  defaults (`codex exec` is read-only and needs a git repo), events,
  usage reporting and failure reporting. Kilroy bridges them with
  per-harness CLI specs and a `status.json` the agent writes; Fabro with
  ACP plus an engine-side text contract, where codex-acp likely reports a
  failed turn as success (code reading). Options and trade-offs below; no
  recommendation.
- The operator's guess holds partly: Kilroy is little work to *wrap*, but
  its human gates and resume need fork fixes first. Fabro needs no engine
  changes to drive, and Claude on Max works through ACP in the spike; the
  driver must still check node outcomes itself (a failed node can leave the
  run SUCCEEDED).

## The assembly

```
 driver (external; out of scope)
   │  start / watch / answer gates / stop / collect
   ▼
 Attractor engine (Kilroy fork, or Fabro server)
   │  walks the graph; each box node is one agent task
   ▼
 per-node backend ── how the engine runs that task
   ├─ agent tool (own, tuned loop) ── Claude Code ── Claude, Max login
   │                                └ Codex CLI ─── GPT, ChatGPT login
   └─ engine's generic loop ───────── OpenAI-compatible API
                                      ├ Qwen (operator's LAN endpoint)
                                      ├ DeepSeek API key
                                      └ GLM (Z.ai) API key
```

| Model and access | Kilroy fork: backend → agent tool | Fabro: backend → agent tool | Harness |
|---|---|---|---|
| Claude on Max subscription | provider `anthropic`, backend `cli` → `claude -p --output-format stream-json` with `ANTHROPIC_API_KEY` stripped (`providerspec/builtin.go:42-48`, `agent_router.go:1845-1861`). Needs an explicit run.yaml: autodetect only fires with a key (`autodetect.go:34-41`) | `backend="acp"`, `acp.command="claude-agent-acp"` → Claude Code via the Agent SDK. Works on Max outside Fabro ([poc-claude-subscription.md](poc-claude-subscription.md)) and through Fabro/Petri with 0.85.1 (spike-fabro.md: PASS, `_claude/rateLimit` shows Max windows). Keep `ANTHROPIC_API_KEY` out of Fabro's vault or Petri injects it (`petri:crates/attractor/steps/src/acp/command.rs:17`). Petri's own live tests still pin `claude-code-acp` 0.16.2; the spike's pass check was the "Claude Max" auth status | Tuned (Claude Code) |
| Codex on ChatGPT login | provider `openai`, backend `cli` → `codex exec --json` with `auth.json` copied per stage (`builtin.go:14-20`, `agent_router.go:1611-1692`); default is probably read-only, fork fix. Alternative `codex-app-server` provider = Kilroy's loop driving Codex's server (`agent_router.go:527-555`) | `backend="acp"` → `codex-acp`; or `api` with provider `openai-codex` (Fabro's loop, `gpt56` profile copying Codex's tools, not the real harness; `models.mdx:144`), which logs in with the Codex CLI's OAuth client id `app_EMoamEEZ73f0CkXaXp7hrann` (terms unverified, impl-fabro.md:35). codex-acp 2.1.1 passes through Fabro on the existing ChatGPT login with `NO_BROWSER=1` (spike-fabro.md); it must already be logged in, since Petri can't run its ChatGPT login. Keep `OPENAI_API_KEY` out of the vault | Tuned (Codex) on `cli`/ACP; partly tuned on app-server / `openai-codex` |
| Qwen, hosted on the LAN (OpenAI-compatible) | custom provider, backend `api`: `protocol: openai_chat_completions`, `base_url`, `profile_family: openai` (`engine/config.go:24-39, 345-352`) → Kilroy's generic loop | `[llm.providers.qwen] base_url=...`, `auth={type="none"}` or bearer → Fabro's generic loop (`user-configuration.mdx:187-205`) | Generic. Tuned only via Qwen Code: Kilroy needs a new template; Fabro could use `qwen --acp` (untested; Qwen Code's ACP auth is API-key only, acp.md) |
| DeepSeek API | custom provider, backend `api`: `base_url: https://api.deepseek.com`, `api_key_env: DEEPSEEK_API_KEY` → generic loop (inferred) | built-in `deepseek` provider, `DEEPSEEK_API_KEY` → generic loop (`models.mdx:75`) | Generic. DeepSeek's own harness `dsh` (ACP-capable) could be a Fabro ACP agent, untested |
| GLM API (pay per token) | built-in `zai`, backend `api` only; override `api.path: /api/paas/v4/chat/completions` (default is the Coding Plan, `builtin.go:83-93`) → generic loop | built-in `zai`; override `base_url` to `https://api.z.ai/api/paas/v4` (default is the Coding Plan, lithos `zai.toml:6,15`) → generic loop | Generic. Subscription alternative: the QwenCloud Token Plan serves glm-5.2 to any tool (models.md); the operator chose pay-per-token (decisions.md Q2) |

How a node picks its model:
- **Kilroy:** node attributes `llm_provider` and `llm_model`, or the graph
  `model_stylesheet` (`style/stylesheet.go:51`). Whether a provider runs as
  `cli` or `api` is set per provider in run.yaml, not per node
  (`agent_router.go:130-148`).
- **Fabro:** stylesheet properties `model`, `provider`, `reasoning_effort`,
  `speed`, `backend` (`petri:crates/attractor/frontend/src/stylesheet.rs:13`).
  ACP nodes cannot take a model; setting one on the node is an error
  (`petri:.../lower/lints.rs:259-292`), and `acp.command` is a node or graph
  attribute only (`nodes.rs:452-487`). So it's one `acp.command` per model,
  with the model fixed in that command's args or settings.

Fabro behaviours the driver must handle (spike-fabro.md):
- A failed agent node still ends the run SUCCEEDED unless the node has
  `goal_gate=true` (`outcomes.mdx:110-116`; spec `attractor-spec.md:463-474`).
  This is by design: #273, closed 2026-05-16, only fixed the error message.
  Routing on `outcome` changes the path but not the run status. The driver
  can't trust run status alone.
- After a `kill -9` of the server mid-node, the restarted server re-runs the
  in-flight node: at-least-once execution.
- `claude-agent-acp` hard-codes `settingSources: ["user","project","local"]`
  (`dist/acp-agent.js:6827`), so Fabro's Claude nodes load the operator's
  `~/.claude` (CLAUDE.md, hooks, plugins, MCP). The lever is
  `CLAUDE_CONFIG_DIR`; whether the Keychain login survives it is unverified.
  Kilroy's `claude -p` loads the same user settings unless given
  `--setting-sources` (unverified for Kilroy's invocation).

Other agent tools:
- **Kilroy:** OpenCode only with `--tmux`, Anthropic-only
  (`templates/opencode.go:24-57`). No Pi, Goose or ACP
  (`templates/registry.go:10-17`).
- **Fabro:** any ACP agent (OpenCode, Qwen Code, Goose, Pi through `pi-acp`),
  but only Claude and Gemini are live-tested in Petri (acp.md).

## Driver interface

| Need | Kilroy (CLI + run files) | Fabro (HTTP API) |
|---|---|---|
| Start with graph + inputs | `kilroy attractor run --detach --graph G --config run.yaml --run-id ID --logs-root D --workspace REPO --input json` (`cmd/kilroy/main.go:165, 236-326, 393-405`). Prints `key=value` lines. No `--goal`: graph attr `goal` or `$input.goal` | `POST /api/v1/workflow-versions` (graph and every file it reads), `POST /api/v1/runs` (`target`, `args.inputs`, `goal`), `POST /runs/{id}/start` (`api.yaml:1091-1230, 2163-2200`). Or `fabro create --json` to package, then HTTP start |
| Watch progress | tail `D/progress.ndjson` (flushed per event, `engine/progress.go:78-82`); ends with `run_completed`/`run_failed` (`engine.go:2066-2090`); `final.json` marks done; `attractor status --json` | SSE `GET /runs/{id}/attach?after=<seq>` or global `/api/v1/attach` (`api.yaml:3061-3094, 5467-5490`); dense `stream_seq` for reconnect; `GET /runs/{id}` status incl. `blocked` (`api.yaml:9274-9370`) |
| Human gates | **CLI auto-approves** (first edge): no interviewer set (`main.go:642-668`), default `AutoApproveInterviewer` (`engine_bootstrap.go:17`, `handlers.go:1380-1387`). Only `serve` asks over HTTP, with a hardcoded 30-min timeout (`server/handlers.go:183`). Gate events go to CXDB only (`human_gate.go:59, 99`) | `GET /runs/{id}/questions`, `POST .../questions/{qid}/answer` (`api.yaml:3537-3609`); 409 if already answered. CLI has no non-interactive answer (`attach.rs:324-333`) |
| Stop | `attractor stop --logs-root D [--force]` (SIGTERM, then SIGKILL; `attractor_stop.go:27-150`) | `POST /runs/{id}/cancel` (`api.yaml:1692-1736`); also pause/unpause. CLI: no standalone cancel (`attach` cancels on detach when `kill_on_detach` is set, `fabro-cli/src/commands/run/attach.rs:404-416`); gates only interactively or with `--auto-approve` (`args.rs:278-279`) |
| Resume | `attractor resume --logs-root D` from checkpoint (`resume.go:49-56`); no `--detach`. Probably runs gate nodes as LLM nodes after resume (`resume.go:242`, `handlers.go:92`; inferred) and drops `--tmux` | `POST /runs/{id}/start {"resume":true}` (`server/handler/lifecycle.rs:50-115`); runs resume on server restart (`server.rs:3304-3344`) |
| Retry | graph/node attrs `max_retries`, `retry_target`, `goal_gate`, `loop_restart`; `runtime_policy` in run.yaml | graph attrs; `POST /runs/{id}/retry` (new run, terminal runs only, `api.yaml:2383-2430`); rewind/fork need a GitHub target |
| Outputs | run branch in `D/worktree`, one commit per node; graph `outputs=` copied to `D/outputs/` + `outputs.json` (`output_contract.go:25-108`); `final.json` status | folder target: changes stay in the folder; `/files`, `/commits`, `/artifacts/download` (opt-in globs), `/usage`. Also `GET /runs/{id}/stages`, `/stages/{stageId}/artifacts` and `/stages/{stageId}/logs/output` (command stages only; `api.yaml:3500, 3610, 3876`). Per-node agent text only in the unstable `/state` or events |
| Parallel runs | own `--run-id`/`--logs-root` each → own worktree and branch (`git.go:86`). Shared: SQLite run DB (WAL, `rundb.go:27-45`), tmux socket, optional CXDB. No cross-run cap | server cap `max_concurrent_runs`, default 5 (`defaults.toml:39-40`); **runs blocked at a gate hold a slot** (`server.rs:3089-3097`). Folder runs in one directory collide: one git worktree per run |

### Thin adapter: Kilroy fork

- Launch: write run.yaml per run, run `attractor run --detach`, parse stdout.
- Watch: tail `progress.ndjson` by byte offset; liveness by `run.pid`;
  done when `final.json` exists. Read the status from `final.json`, not the
  exit code (0 or 1 only).
- Gates: needs the fork's file interviewer (question JSON under the run
  directory, answer file written atomically by the driver).
- Stop/resume: `attractor stop --force`; `attractor resume` backgrounded by
  the driver.
- Collect: `final.json`, `outputs.json`, the run branch and final SHA.
- Alternative: drive `kilroy attractor serve` (HTTP, SSE, questions
  already exist), but every run dies with the server, there is no resume
  endpoint, gates time out after 30 min, and it is labelled experimental.

Fork changes (engineer-days):

| Change | Days |
|---|---|
| File interviewer + `--interviewer auto\|file` flag (`interviewer_impls.go`, `main.go:642`) | 1-1.5 |
| Gate events into `progress.ndjson` | 0.25 |
| Resume: restore gate handler, interviewer and tmux; `resume --detach` (`resume.go:43-47, 242`) | 1 |
| Codex default path: explicit `--sandbox` or bypass (`builtin.go:16`) | 0.5 |
| Distinct exit codes, optional `--goal` | 0.25 |
| Provider configs for DeepSeek and LAN Qwen, smoke graphs | 0.5-1 |
| End-to-end on every backend, parallel, gate and resume tests | 2-3 |
| **Total** | **6-8** (items sum to 5.5-7.5, rounded up for unknowns; 8-10 with OpenCode/Pi as CLI backends) |

Not counted: catching up with `claude` and `codex` flag changes since April
2026 (Kilroy is dormant).

### Thin adapter: Fabro

- Connection: dev token over TCP or the Unix socket; generated TS/Rust
  clients, or curl/jq.
- Submit: `fabro create <run.toml> -I k=v --json` (packaging), then
  `POST /start`; target `{kind:"folder", path:<per-run worktree>}` with the
  `local` environment.
- Watch: SSE with saved `stream_seq`; map `visit.started`, `step.finished`,
  `run.finished`, `run.lifecycle` to the driver's statuses.
- Gates: on `blocked` or a `question` item, `GET /questions` → human →
  `POST /answer`.
- Control: cancel, resume, retry; optionally `/steer`, `/interrupt`.
- Collect: the worktree diff, `/artifacts/download`, `/usage`, final status.
- Parallel: one worktree per run; raise `max_concurrent_runs` above the
  number of runs expected to wait at gates.
- Config: `settings.toml` providers, ACP commands on the host PATH, no
  Anthropic/OpenAI keys in the vault.
- Skip MCP: it is for LLM clients and has no resume, retry, pause or
  artifacts (`fabro-tool/src/interact.rs:15-33`).

Effort: **4-8 days** (submit 0.5-1, SSE consumer 1-2, gate bridge 0.5-1,
control and collect 0.5-1, config 0.5-1, tests 1-2); a curl/jq MVP in
about 2. No Fabro or Petri fork, unless Claude needs the non-ACP process
backend ([fabro-process-backend.md](fabro-process-backend.md)).

Fabro gaps: folder runs have no checkpoints (no rewind/fork; resume keeps
whatever files survived, `checkpoints.mdx:80-102`); parallel branches inside
one run share a checkout (`stages-and-nodes.mdx:170-208`, correcting
impl-fabro.md); no stable per-node output endpoint; API at 0.2.0 and
Petri's event contract already renamed once
(`petri:crates/core/execution/EVENTS.md:13-43`).

## Claude Code and Codex as node backends

The operator's main concern: Qwen, DeepSeek and GLM are easy (a simple loop
or Pi), but Claude Code and Codex are fundamentally different things for a
node to drive. This section compares them and does not recommend an
architecture (decisions.md Q9 is withdrawn).

Sources: local `claude` 2.1.280 and `codex-cli` 0.156.1 `--help` output;
`openai/codex@rust-v0.156.1` (`exec/lib.rs` = `codex-rs/exec/src/lib.rs`,
`exec/events.rs` = `codex-rs/exec/src/exec_events.rs`); the app-server
protocol generated offline with `codex app-server generate-ts`;
`@anthropic-ai/claude-agent-sdk` 0.3.289 `sdk.d.ts`; `claude-agent-acp`
0.85.1 (`cacp:`) and `codex-acp` 2.1.1 (`xacp:`); docs checked 2026-10-04:
code.claude.com/docs/en/headless and /authentication,
learn.chatgpt.com/docs/non-interactive-mode, /agent-approvals-security,
/auth and /app-server (developers.openai.com/codex redirects there). No
model calls were made for this section.

### Where they differ most

- **Process model.** Claude Code is a CLI; the Agent SDK and
  claude-agent-acp both spawn it and talk stream-json over stdio. Codex is
  built around a JSON-RPC **app-server** (help: "[experimental]"), and
  `codex exec` is itself an in-process app-server client
  (`exec/lib.rs:1113-1310`).
- **Unit of work.** Claude: a session, each turn closed by one `result`
  message. Codex: a thread of turns, each turn a list of typed items.
- **Safety model.** Claude asks "may this tool call run?" (permission
  modes, allow/deny rules, hooks; its OS sandbox is opt-in and Bash-only).
  Codex asks "what may a shell command touch?" (an OS sandbox) and "who
  approves escalation?" (approval policy). Only the full bypasses are true
  peers.

### Comparison

| Dimension | Claude Code (`claude -p`, Agent SDK, claude-agent-acp) | Codex (`codex exec`, `codex app-server`, codex-acp) |
|---|---|---|
| Headless invocation | `claude -p "<prompt>"` one-shot; with `--input-format/--output-format stream-json` a long-lived process (how the SDK drives it). SDK `query()` spawns the bundled CLI. claude-agent-acp: one Node process per connection, many sessions. `--bare` skips hooks, plugins, CLAUDE.md, MCP and the Keychain; docs say it "will become the default for `-p`" (headless doc) | `codex exec "<prompt>"` one-shot (one thread, one turn). `codex app-server` long-lived JSON-RPC over stdio, unix or ws, many threads. codex-acp spawns `codex app-server` (it depends on `@openai/codex ^0.159.1`, newer than the local 0.156.1) |
| Prompt input | argument or stdin; `--system-prompt`, `--append-system-prompt`; CLAUDE.md (AGENTS.md only when no CLAUDE.md exists; version 2.1.277 unverified) | argument or stdin (`-`); no system-prompt flag: `-c developer_instructions=...`, or `model_instructions_file` (replaces the prompt, "STRONGLY DISCOURAGED"); AGENTS.md (32 KiB cap unverified, fallback names configurable); `-i/--image` (`config.schema.json:6474,7211,7332`) |
| Output and events | `--output-format json\|stream-json`: `system/init`, `assistant`/`user` (Messages-API blocks), `rate_limit_event`, `permission_denied`, final `result`. `--json-schema` → `result.structured_output` (`sdk.d.ts:5671-5800`) | `--json` JSONL: `thread.started`, `turn.started`, `turn.completed{usage}`, `turn.failed{error}`, `item.*` (`agent_message`, `command_execution`, `file_change`, …) (`exec/events.rs:11-136`). `--output-schema FILE` makes the final message text the JSON; `-o FILE` writes the last message on success. App-server: about 90 notification types |
| Session continuation | `--resume <id\|path>`, `--continue`, **`--session-id <uuid>` pre-assigns the id**, `--fork-session`; SDK `resume`; ACP `loadSession`/`resumeSession` | `codex exec resume <id>\|--last`, `exec fork`; id from `thread.started` (no flag to pre-assign, unverified); `exec resume` takes no `-s`/`-C`. App-server `thread/start`, `thread/resume`, `thread/fork`, `turn/steer` |
| Permissions and sandbox | modes `acceptEdits`, `auto`, `bypassPermissions`, `manual` (was `default`), `dontAsk`, `plan`; `--allowedTools`/`--disallowedTools` rules; `--dangerously-skip-permissions`; `--permission-prompts host\|none` (default `host`; with `none` any prompt is denied, `claude --help` 2.1.280); OS sandbox only with `sandbox.enabled`, Bash only. Without `--bare`, `-p` runs the project's `.claude/settings.json` hooks and `.mcp.json` servers "even in a folder you've never trusted" (headless.md:41) | `-s read-only\|workspace-write\|danger-full-access`; **`exec` defaults to read-only and hard-codes approval `never`**, except with the auto-review reviewer (`exec/lib.rs:563-575, 758-773`); exec rejects approval requests. 0.156.1 rejects `--full-auto`, `untrusted` and `on-failure`, which the docs still mention. Workspace-write: no network, `.git` read-only |
| cwd and file writes | process cwd (SDK `cwd`, ACP `session/new.cwd`); `--add-dir` grants tool access; **no git requirement**; writes gated by permissions, not an OS sandbox | `-C/--cd`; `--add-dir` makes a directory writable; **needs a git repo** or `--skip-git-repo-check` (`exec/lib.rs:962-970`); a node that commits needs `danger-full-access` or an engine-side commit |
| Auth and subscription | order: `ANTHROPIC_AUTH_TOKEN` > `ANTHROPIC_API_KEY` (always used in `-p` when set) > `apiKeyHelper` > `CLAUDE_CODE_OAUTH_TOKEN` > Keychain OAuth; `--bare` reads neither OAuth source; `CLAUDE_CONFIG_DIR` for separate logins; `apiKeySource: "none"` under OAuth (auth doc; [POC](poc-claude-subscription.md)) | `CODEX_HOME/auth.json` (copyable, refreshes itself), `codex login --device-auth`; `CODEX_API_KEY` switches to API billing; codex-acp honours `NO_BROWSER` |
| Usage and limits | `result.total_cost_usd` (list-price estimate), `usage`, `modelUsage`; `rate_limit_event` with plan windows; `--max-budget-usd` | `exec`: tokens only in `turn.completed.usage`, **no cost and no rate-limit event** (event set is thread/turn/item/error only, `exec/events.rs:11-136`). Plan windows only from the app-server (`account/rateLimits/read\|updated`) |
| Interrupts and cancellation | `-p`: SIGINT ends the turn with a result; SIGTERM exits 143 and records no result (headless doc). SDK `interrupt()` and ACP `session/cancel` keep the session | `exec`: SIGINT sends `turn/interrupt`, exits 1, **no closing `turn.*` event** and the final message is cleared (`event_processor_with_jsonl_output.rs:559-563`), no `-o` file, exit 1 via `error_seen` (`exec/lib.rs:1113-1118, 1255-1265, 1307-1311`). Only `tokio::signal::ctrl_c` is installed (`exec/lib.rs:1115`), so SIGTERM takes the default action: no closing event, only the exit status (whether the npm `codex` wrapper forwards signals first is unverified). App-server `turn/interrupt` → `turn/completed{status: interrupted}`; codex-acp `cancel` → `stopReason: "cancelled"` |
| Node outcome | one `result`: `subtype` (`success`, `error_max_turns`, `error_max_budget_usd`, `error_during_execution`, …), `is_error`, `result` text, `terminal_reason`, `structured_output`; non-zero exit on failure (exact codes unverified) | success = final `item.completed{agent_message}` then `turn.completed`; failure = `turn.failed{error.message}` or `error`; exit 1 on any failure. Typed `codexErrorInfo` (`usageLimitExceeded`, `contextWindowExceeded`, `sandboxError`, …) only on the app-server |

Neither reports whether *the task* succeeded, only whether the turn ran to
completion. Task success has to come from the agent's output (text, a
schema field, a file) or from checks the engine runs.

### What a common node contract has to normalize

1. **Launch:** executable and args, prompt delivery, model id format, and
   scrubbing keys that switch billing (`ANTHROPIC_API_KEY`,
   `CODEX_API_KEY`/`OPENAI_API_KEY`, also `CLAUDECODE`).
2. **Instructions and context:** a system-prompt append
   (`--append-system-prompt` vs `-c developer_instructions`); CLAUDE.md vs
   AGENTS.md precedence; full context load vs `--bare`. Without `--bare`,
   `claude -p` runs the target repo's `.claude/settings.json` hooks and
   `.mcp.json` servers with no trust dialog (headless.md:41), and the ACP
   adapter loads the operator's `~/.claude` (`settingSources`,
   `dist/acp-agent.js:6827`): a node-security point for target repos.
3. **Working directory:** cwd vs `-C`; extra directories (access vs
   writable); Codex's git-repo requirement; who commits.
4. **Safety level:** one abstract level (read-only, edit workspace, full)
   mapped to Claude mode + rules (+ optional sandbox) and to Codex sandbox +
   approval policy; what happens to unanswered permission requests; network.
5. **Session handle:** pre-assigned (Claude) vs harness-minted (Codex);
   resume and fork; whether settings can change on resume.
6. **Event stream:** one small schema (started, assistant text, tool call
   start/end, file changed, usage, retry, rate limit, finished), keeping the
   raw stream as an artifact.
7. **Final text:** `result.result` vs the last `agent_message`.
8. **Structured output:** inline vs file schema, where the value lands, how
   it fails; or skip both and validate text in the engine.
9. **Outcome status:** success, failed, interrupted, cancelled,
   budget/turns exhausted, auth required, rate limited, from Claude's
   `subtype`/`is_error`/`terminal_reason` and Codex's
   `turn.completed`/`turn.failed`/`codexErrorInfo` plus exit codes; which
   failures are transient.
10. **Usage:** tokens (both), USD (Claude only), plan windows (Claude
    in-band; Codex only via the app-server).
11. **Cancellation:** graceful interrupt, then hard kill, and what each
    leaves recorded.
12. **Auth:** subscription vs key, credential location (Keychain or
    `CLAUDE_CONFIG_DIR` vs `CODEX_HOME`), per-node isolation, detecting
    which source is in use. Pin non-bare mode explicitly or detect it:
    `--bare` "will become the default for `-p` in a future release"
    (headless.md:70) and "never reads OAuth credentials or the system
    keychain" (:43, :49), which would move every `claude -p` subscription
    route off the Max login.

### How Kilroy bridges the gap

- **Per-provider CLI specs** (`providerspec/builtin.go`): Claude
  `claude -p --dangerously-skip-permissions --output-format stream-json
  --verbose --model {{model}} {{prompt}}` (:42-48); Codex `codex exec --json
  -m {{model}} -C {{worktree}}` with the prompt on stdin (:14-20). Prompt mode
  is hard-coded per provider (`agent_router.go:1192-1198`).
- **Codex gets most special handling:** a fixed `--output-schema`
  `{final, summary}` plus `-o` (`agent_router.go:1170-1188, 2233-2240`),
  retry without the schema on validation errors (:1408-1430), a fresh
  `CODEX_HOME` on state errors (:1469-1535), an idle watchdog
  (:1986-2085), and stream disconnects reclassified as transient
  (:1560-1578).
- **Claude's stream-json is parsed only to split transcripts for CXDB**
  (`cli_stream_parser.go`); its `result` message is never read for the
  outcome.
- **The outcome contract is a file, not either event format:** the exit
  code maps to fail through a stderr classifier (`agent_router.go:1104-1118`),
  raw stdout becomes `response.md` (`handlers.go:651-669`), and success
  needs the agent to write `status.json` at a path given in the prompt
  (`stage_status_contract.go:10-52`), or `auto_status=true`.
- **`codex-app-server` provider:** Codex as a *model* behind Kilroy's own
  loop (`codexappserver/transport.go:21-33`). Kilroy drives tools through its
  transcript (`request_translator.go:20`) and declines only client-defined
  dynamic tool calls (`item/tool/call`) and approval requests
  (`transport.go:957-973`). Codex's built-in tools (shell, apply_patch) are
  not disabled and, with `approvalPolicy: never` and `danger-full-access`
  (`agent_router.go:536-551`), run with full access if Codex uses them
  (unverified by a run). Not Codex the harness.
- Trade-offs: each harness's native flags are used fully and nothing is
  lost to an adapter; but outcome fidelity drops to exit code plus
  `status.json`, native cost and error taxonomy aren't surfaced, the
  default Codex path is read-only, and the specs have not followed CLI flag
  changes since April 2026.

### How Fabro bridges the gap

- **ACP is the common layer** (Petri `steps/acp/mod.rs`): one launch path
  (`initialize`, `session/new`), one event path (`agent_message_chunk` text
  concatenated, `tool_call` updates to hooks, `usage_update` to metrics),
  one permission rule (allow always, or once with a `pre_tool_use` hook,
  `mod.rs:400-430`), and one cancel path (`session/cancel`, then TERM and
  KILL, `mod.rs:672-811`).
- **Outcome and structured output are enforced by the engine on text:**
  Petri appends a final-output contract to the prompt, parses routing or
  validates JSON Schema, and runs repair turns (`steps/contract.rs`,
  `steps/agent.rs:513-580`). `stopReason` `end_turn` or `refusal` counts as
  success (`mod.rs:736-751`). No resume: "ACP never reuses threads"
  (`steps/agent/backend.rs:83`).
- **The two adapters report failure differently.** claude-agent-acp turns
  `is_error` into a JSON-RPC error, so Petri sees the failure
  (`src/acp-agent.ts:4651-4653` at `a44c486`; in the 0.85.1 dist,
  `dist/acp-agent.js:4325-4327, 4368-4370`). codex-acp (code reading, not
  run):
  - Any client gets `stopReason: "end_turn"` for a failed turn
    (`xacp: src/CodexAcpServer.ts:3398-3416`; normal path :3044-3048).
  - AIR clients (`clientCapabilities._meta.jetbrains.air` with the
    session-failure key; `AirExtension.ts:73-88`, `CodexAcpServer.ts:242-244`)
    get the failure in `PromptResponse._meta`.
  - Other clients get the error as agent text
    (`CodexEventHandler.ts:974-979`); `handleFailedTurn` does nothing
    without an error notification (:338-349).
  - Exceptions: auth errors become `authRequired` (:937, :339-341);
    `usageLimitExceeded` becomes an internal error (:974-978).
  - Petri sends no jetbrains meta and treats `end_turn`/`refusal` as
    success (`petri: steps/src/acp/mod.rs:739-740`). So a failed Codex
    turn would likely be recorded as a successful stage whose text is the
    error, unless the output contract then fails. A cheap check: a Codex
    node with an invalid model id. Petri also counts
  a Claude `refusal` as success (`mod.rs:740`).
- **Settings come from the adapter, not the node:** Claude's permission mode
  from settings `permissions.defaultMode`; Codex's mode from
  `INITIAL_AGENT_MODE`, default `agent` (workspace-write, on-request, with
  auto-review; `xacp: src/AgentMode.ts:67-95`). Petri never calls
  `session/set_config_option`.
- Lost through ACP: `--json-schema`/`--output-schema`, `--append-system-prompt`
  and plugin/settings flags (unless `_meta.claudeCode.options`, which Petri
  doesn't send), cost and plan windows as fields (only `_meta`),
  `terminal_reason` and `codexErrorInfo`, file-change detail, and resume.
- Trade-offs: one uniform path for both harnesses (and any other ACP agent)
  with engine-enforced outcomes; but harness-native signals are lost, and
  failure semantics depend on each adapter's choices, which differ.

### The options the gap leaves

- **Native CLIs with per-harness specs** (Kilroy's way): full control of
  flags and context; the engine must own one parser and outcome mapping
  per harness, and keep up with flag changes. If `--bare` becomes the
  default for `-p`, `claude -p` stops using the Max login unless non-bare
  mode is pinned.
- **ACP as the common layer** (Fabro's way): one client for every agent
  tool, including Qwen Code, OpenCode or Pi later; the adapters decide
  outcome and settings, and lag their CLIs.
- **Long-lived native protocols** (Agent SDK stream-json and the Codex
  app-server): the richest signals (typed errors, plan windows, steer,
  resume); two different protocols to implement, and the app-server is
  labelled experimental.
- **Engine-side contract on top of any of these** (Kilroy's `status.json`,
  Petri's output contract): hides the harness differences for outcome, at
  the cost of trusting the agent to report it.

## Corrections made elsewhere

The two Fabro corrections above (parallel branches share one checkout; the
stylesheet can't route nodes to ACP agents) are now also in impl-fabro.md
and comparison.md (researcher).

## Open questions

- Claude vs Codex details not verified: exact `claude -p` exit codes per
  `result.subtype`; whether `codex exec resume`
  keeps the thread's sandbox and cwd; Petri's handling of a failed Codex
  turn through codex-acp (code reading only); the docs-vs-binary conflicts
  on `--full-auto` and `on-failure` (check against codex 0.160+); when
  `--bare` becomes the default for `-p`.
- Kilroy: does `$input.goal` expand inside the graph `goal` attribute?
  The resume gate bug is inferred from code, not run: `NewDefaultRegistry`
  leaves out `wait.human` ("registered by cmd/kilroy/", `handlers.go:90-92`)
  and resume builds its engine through `newBaseEngine` without the layered
  registry (`resume.go:220-242`), so gate nodes fall through to
  `CodergenHandler`.
- Tool-calling quality of the hosted Qwen in either generic loop: unknown
  until tried against the operator's endpoint (endpoint TBD, decisions.md
  Q1).
- Is a tuned harness for Qwen, DeepSeek or GLM worth it? No same-model
  benchmark exists (harnesses.md). Fabro can try one through ACP with
  config only; Kilroy needs new templates.
- Fabro: the key name for the built-in `zai` provider, and current catalog
  ids for DeepSeek and GLM.
