# Driving the Attractor, and how the pieces fit

Desk research, 2026-10-04: code and docs read, nothing built or run. The
researcher's hands-on Fabro spike is [spike-fabro.md](spike-fabro.md) (in
progress).
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
  needs the sandbox fix; Fabro's Claude and Codex over ACP are unverified
  pending the spike; Fabro's built-in `openai-codex` route is Fabro's own
  loop, not the Codex harness.
  Hosted Qwen, DeepSeek and GLM fall back to the engine's generic loop. A
  tuned harness for them needs fork work in Kilroy (OpenCode or Pi
  templates) or an ACP agent in Fabro (Qwen Code, OpenCode), both untested.
- The operator's guess holds partly: Kilroy is little work to *wrap*, but
  its human gates and resume need fork fixes first. Fabro needs no engine
  changes to drive, but Claude on Max depends on ACP through Petri, which
  the spike is testing.

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
| Claude on Max subscription | provider `anthropic`, backend `cli` → `claude -p --output-format stream-json` with `ANTHROPIC_API_KEY` stripped (`providerspec/builtin.go:42-48`, `agent_router.go:1845-1861`). Needs an explicit run.yaml: autodetect only fires with a key (`autodetect.go:34-41`) | `backend="acp"`, `acp.command="claude-agent-acp"` → Claude Code via the Agent SDK. Works on Max outside Fabro ([poc-claude-subscription.md](poc-claude-subscription.md)); through Petri unverified (spike). Keep `ANTHROPIC_API_KEY` out of Fabro's vault or Petri injects it (`petri:crates/attractor/steps/src/acp/command.rs:17`). Petri is live-tested only with `claude-code-acp` 0.16.2 (0.85.1 sends extra notifications); the pass check is the "Claude Max" auth status (fabro-process-backend.md) | Tuned (Claude Code) |
| Codex on ChatGPT login | provider `openai`, backend `cli` → `codex exec --json` with `auth.json` copied per stage (`builtin.go:14-20`, `agent_router.go:1611-1692`); default is probably read-only, fork fix. Alternative `codex-app-server` provider = Kilroy's loop driving Codex's server (`agent_router.go:527-555`) | `backend="acp"` → `codex-acp`; or `api` with provider `openai-codex` (Fabro's loop, `gpt56` profile copying Codex's tools, not the real harness; `models.mdx:144`), which logs in with the Codex CLI's OAuth client id `app_EMoamEEZ73f0CkXaXp7hrann` (terms unverified, impl-fabro.md:35). codex-acp is not live-tested in Petri and must already be logged in, since Petri can't run its ChatGPT login. Keep `OPENAI_API_KEY` out of the vault | Tuned (Codex) on `cli`/ACP; partly tuned on app-server / `openai-codex` |
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

## Corrections made elsewhere

The two Fabro corrections above (parallel branches share one checkout; the
stylesheet can't route nodes to ACP agents) are now also in impl-fabro.md
and comparison.md (researcher).

## Open questions

- Does `claude-agent-acp` 0.85.x work through Petri's ACP client on Max?
  The spike answers this; it decides whether Fabro can run Claude without
  restoring a process backend.
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
