# One handler for (almost) any model (Q33)

Captain's task (2026-10-05, decisions.md Q33). Find one handler that can run
DeepSeek and GLM on API keys and the operator's hosted Qwen (an
OpenAI-compatible endpoint), instead of a generic run-any-program handler.

Candidates:
- the Pi coding agent;
- Fabro's generic agent loop;
- generic harnesses over ACP;
- Omnigent.

The detail, with file:line sources, is in three supporting files under
[multi-model/](multi-model/):
- [pi.md](multi-model/pi.md)
- [acp-harnesses.md](multi-model/acp-harnesses.md): OpenCode, Goose, Qwen
  Code and others
- [pebble-omnigent.md](multi-model/pebble-omnigent.md)

This file compares them and recommends one.

## Summary

**Recommendation: Pi (`@earendil-works/pi-coding-agent`), driven through its
own `--mode json` event stream, as its own handler crate.** Structurally
it's a stream-json-style handler like `claude -p`, but with Pi's **own
schema** (JSONL `message_end` / `tool_execution_end` with
`message.stopReason`), so the claude-p parser can't be reused (Q31: a
separate crate). Not ACP. Pinned to an exact
version.

Why Pi:
- **Models:** DeepSeek, Anthropic and OpenAI are built in. GLM works with a
  `baseUrl` override to Z.ai pay-as-you-go. A hosted Qwen or a local
  `mlx_lm.server` is a `models.json` entry. It accepts any model id given a
  provider.
- **Per-run config:** everything can be set per run without touching the
  user's config. `PI_CODING_AGENT_DIR` points at an engine-written
  `models.json` and `settings.json`, alongside the flags `--model
  provider/id`, `--api-key` and `--thinking <level>`.
- **Sessions (Q25, Q28):** they fit exactly. `--session-dir <d>
  --session-id <id>` creates or resumes a session under the id the
  **caller** chooses, so the engine's GUID becomes the session id directly.
  Verified headless.
- **Smoke test:** it passed the only hands-on test against the operator's
  model family. Against the local Qwen3.8-27B-4bit on `mlx_lm.server`, a
  `write` tool call, then `bash`, then `stop` took 40 s. A resumed session
  recalled the first turn
  ([pi-smoke/evidence.txt](pi-smoke/evidence.txt)).
- **Status:** MIT, about 112k stars, very active.

Pi's costs and the handler's jobs:
1. **The success trap.** `--mode json` **exits 0 even when the provider
   fails**. The unknown-model case was seen in the smoke test; the 401 and
   refused-connection cases are in pi.md.
   - The failure is in the last assistant message's `stopReason` plus
     `errorMessage`.
   - Rule: `stopReason` **`error` or `aborted`**, or no final assistant
     message, means failure. Pi's own text mode uses exactly that
     (`packages/coding-agent/src/modes/print-mode.ts:145` at v1.0.3); json
     mode exits 0 for both.
   - The trap is handled because the handler reads `stopReason`. That's
     unlike codex-acp and Goose, where the error arrives with a success
     stop reason (`end_turn`) and only text tells it apart. dsh headless has
     the same exit-0 trap as Pi.
2. **Stdin.** Pi reads stdin to EOF when it isn't a TTY. Spawn it with
   stdin set to `/dev/null`, the same Codex hazard as in
   impl-harmonik-attractor.md §10.
3. **Releases.** Near-daily (v1.0.0 to v1.0.3 in 5 days), so pin a
   version.
4. **No sandbox or approvals.** `read`, `bash`, `edit` and `write` run
   unprompted, the same as PAS's Claude and Codex today.
5. **Config.** There's no `--base-url` flag, so endpoints go in the
   generated `models.json`.
   - Pass an exact `provider/id`, because `--model` also fuzzy-matches.
   - Set each model's limits in `models.json`. An unknown id falls back to
     a clone of the provider's default model with the id swapped, which
     inherits that model's limits (`model-resolver.ts:570-596`).
   - Set `PI_TELEMETRY=0`, `PI_OFFLINE=1` and `PI_SKIP_VERSION_CHECK=1`
     (pi.md: install telemetry, attribution headers, self-update).
6. **Profiles.** No model-tuned profile for Qwen, DeepSeek or GLM: one
   short generic system prompt. The operator's "right harness per model"
   is traded for one handler (Q33 chose that trade).

**Runner-up: OpenCode over ACP**, if or when an ACP handler is built anyway
(Q14 wants ACP possible).
- Strengths:
  - Honest failures: a JSON-RPC error on `session/prompt` for
    400/401/429, and exit 1 headless.
  - Built-in `deepseek` and `zai` (pay-as-you-go) providers.
  - Per-run config in one env var (`OPENCODE_CONFIG_CONTENT`).
  - Model and effort settable over ACP.
  - load, resume and list sessions.
- Costs:
  - Model ids must be in the catalog or declared in config.
  - The client can't choose the session id, so the engine records the
    returned one.
  - Effort starts at `low` over ACP.
  - Unbounded `retry-after` waits.
- **Qwen Code** is the ACP fallback: any model id, a client-chosen UUID
  session id, and reasoning mapped per host. The costs are minutes of
  silent 429 retries, and edit and shell are hidden headless without
  `--yolo`.

**Not recommended:**
- **Goose:** a 400 or 429 ends as `end_turn` or exit 0 with error text,
  the same trap as codex-acp.
- **pi-acp:** reports provider failures as successful turns, and is early
  (v0.0.34).
- **Pebble, Fabro's agent loop:** it works standalone, as a Rust library
  and as a `pebble exec --json` CLI. But:
  - its crates are git-only on `main` and about 5 weeks old;
  - the CLI can't resume;
  - DeepSeek and GLM are live-untested.

  It is the best in-process option if the operator later wants no Node
  runtime.
- **Omnigent** (`omnigent-ai/omnigent`, Databricks, Apache-2.0, alpha): a
  meta-harness server wrapping Claude Code, Codex, Pi, OpenCode and other
  agents. It has no one-shot headless mode, and a heavy install (Python
  3.12, Node, pnpm, tmux) with telemetry on by default. It's a peer of the
  Attractor rather than a node handler.

## Comparison

Checked 2026-10-05. "Tested" means run here:
- Pi against the local mlx_lm.server;
- OpenCode, Goose and Qwen Code against a fake OpenAI-compatible server
  returning 200, a tool call, 400, 401 and 429. The OpenCode and Goose
  cases were re-run and saved with the scripts in
  [multi-model/fake-server/](multi-model/fake-server/).

Real endpoints (DeepSeek, Z.ai) were called only with fake keys, giving
free 401s (pi.md). No paid call was made.

| | Pi (`--mode json`) | OpenCode (ACP) | Qwen Code (ACP) | Goose (ACP) | Pebble (lib / `pebble exec`) | Omnigent |
|---|---|---|---|---|---|---|
| Version, date | 1.0.3, 2026-10-05 | 1.18.34, 2026-09-30 | 0.25.0, 2026-10-05 | 1.53.0, 2026-10-02 | git `5ece45d1` (no releases) | 0.16.0, 2026-09-29 (alpha) |
| License, runtime | MIT, Node ≥ 22.19 | MIT, Bun binary via npm | Apache-2.0, Node ≥ 22 | Apache-2.0, Rust binary | MIT (lithos-llm MIT OR Apache-2.0), Rust | Apache-2.0, Python 3.12 + Node |
| DeepSeek | built-in | built-in | via host-detected adapter | built-in | built-in (live-untested) | yes |
| GLM pay-as-you-go | built-in `zai` with `baseUrl` override | built-in `zai` = `/api/paas/v4` | `baseUrl` (unverified on the real endpoint) | `zhipu` + base URL | built-in, override `base_url` | via gateway (unverified) |
| Custom OpenAI-compatible (hosted Qwen, mlx) | `models.json` entry; **tested with mlx** | config provider | `OPENAI_BASE_URL` | `OPENAI_BASE_URL` | custom provider TOML | gateway |
| Arbitrary model id | yes, with a warning | no (catalog/config) | yes; over ACP only declared models | yes | yes, with unknown limits | n/a |
| Per-run config, no global edits | `PI_CODING_AGENT_DIR` + flags | `OPENCODE_CONFIG_CONTENT` | `QWEN_HOME`, settings path env | `GOOSE_PATH_ROOT` + env | `PEBBLE_HOME` / library args | server config |
| Reasoning level | `--thinking` | ACP `effort` (starts at `low`) | ACP `reasoning_effort` | ignored on OpenAI-style engines | library: yes; CLI: settings file | n/a |
| Failure signal | **exit 0**; `stopReason:"error"` + `errorMessage` (tested) | JSON-RPC -32603 (tested) | -32603; silent 429 retries | **`end_turn` + text** (tested) | exit 1; report has the error | n/a |
| Session resume | `--session-id` (caller's id) + `--session-dir` (**tested**) | load/resume/list; agent's id | load/resume/list; caller's UUID | load/list; no resume | library only | own server sessions |
| Tools | read, bash, edit (exact replace), write; no approvals | edit, write, bash; allowed by default | edit/shell need `--yolo` headless | per `GOOSE_MODE` | 8 tools, `edit_file` | wraps the agent |
| Mechanism for PAS | stream-json-style handler (own crate) | ACP handler | ACP handler | ACP handler | in-process crate or CLI wrapper | HTTP client |

## Facts

Sources and full evidence are in the supporting files. The key points:

### Pi
[multi-model/pi.md](multi-model/pi.md); smoke test in
[pi-smoke/evidence.txt](pi-smoke/evidence.txt).

- Package `@earendil-works/pi-coding-agent` 1.0.3. The repo
  `earendil-works/pi` (formerly `badlogic/pi-mono`) is MIT. Install with
  `npm i` (pin a version); needs Node 22.19 or newer.
- Per-run isolation: `PI_CODING_AGENT_DIR` replaces `~/.pi/agent`. The
  engine writes `models.json` (providers, `baseUrl`, `apiKey`, `api:
  openai-completions`, models) and `settings.json` (for example `retry`).
- Flags: `--model provider/id`, `--api-key`, `--thinking`, `--mode
  json|rpc`, `--session-dir`, `--session-id`, `--no-session`. There's no
  `--cwd`: it runs in the process cwd.
- Sessions:
  - `--session-id smoke-1` with `--session-dir` created
    `<dir>/<timestamp>_smoke-1.jsonl` (header `"id":"smoke-1"`).
  - A second call with the same pair resumed it: the model answered "I
    wrote the exact text `hi from pi` … into `hello.txt`".
  - Pi warns "No project session found with id …; creating a new session"
    on first use.
- Success is the last assistant `message_end` with `stopReason:"stop"`.
  Tool turns end `toolUse`.
- Failure is `stopReason:"error"` (or `"aborted"`) with `errorMessage`, at
  exit code 0 in json mode.
  - Verified locally with an unknown model id. Pi passed the id through,
    and mlx_lm.server answered 404, wrapping a Hugging Face download's 401
    (pi-smoke/evidence.txt run 3).
  - The 401 and refused-connection cases are from pi.md.
- Retries: 429, 5xx and network errors are retried 3 times by default,
  found by a text match on the error. The engine can turn this off in
  `settings.json`.
- Stdin: Pi reads to EOF when stdin isn't a TTY. Spawn it with
  `/dev/null`.
- pi-acp (svkozak) 0.0.34 isn't suitable: provider failures look like
  successful turns, flags can't be passed through, and it writes into
  `~/.pi`.

### OpenCode, Qwen Code, Goose and others
[multi-model/acp-harnesses.md](multi-model/acp-harnesses.md).

- These are the ACP-side facts: the comparison table above, plus the
  failure tests against a fake server.
- Kimi Code also reports failed turns as `end_turn`. Cline reports errors
  as JSON-RPC errors. dsh (DeepSeek Harness, alpha) reports errors
  honestly.
- Corrections to acp.md and harnesses.md:
  - the registry's `kimi` entry still launches the archived `kimi-cli`;
  - Kilo is in the registry;
  - Qwen Code is now 0.25.0.

### Pebble and Omnigent
[multi-model/pebble-omnigent.md](multi-model/pebble-omnigent.md).

- Pebble (`lithoscomputer/pebble`):
  - Usable as a Rust library (`CodingAgent` over lithos-llm, with
    session export and resume) and as `pebble exec --json`. Events go to
    stderr as JSONL, the answer to stdout, and exit codes are 0, 1 and 130.
  - Git-only crates on `main`; about 5 weeks old with about 1,650 tests.
  - DeepSeek, GLM and custom providers all get the generic `openai`
    profile.
- Correction to impl-fabro.md: lithos-llm is MIT OR Apache-2.0, not
  Apache-2.0 only.
- Omnigent: see the summary. Three unrelated projects share the name.

### Mechanism implied

- Pi means a **stream-json-style handler**, structurally like the `claude
  -p` handler. Per node it:
  - spawns a process with an engine-written config dir and stdin from
    `/dev/null`;
  - reads JSONL events;
  - decides success from the last assistant `stopReason`;
  - records the session id it passed.
  This is its own protocol, not ACP. Pi's `--mode rpc` (a long-lived
  command protocol) exists if mid-run control is wanted later (Q26).
- OpenCode or Qwen Code means an **ACP handler**. That one handler would
  then cover any ACP agent (Claude via `claude-agent-acp`, Codex via
  `codex-acp`, Kimi, Cline). Per-agent quirks would need handling: Goose's
  and Kimi's `end_turn` errors, codex-acp's `end_turn` errors
  (spike-fabro.md §4b), and who chooses the session id.

## Open questions

- Edit quality and tool-call reliability of DeepSeek, GLM and the hosted
  Qwen under Pi's generic prompt. Only the local 27B Qwen was tried, on
  one trivial task. A short bake-off with real keys would settle it.
- The Z.ai pay-as-you-go URL with a real key, under Pi and OpenCode, is
  unverified.
- Version pinning: Pi releases almost daily. Pin it, and re-run the
  smoke test on upgrade?
- If an ACP handler is built later for other reasons, should OpenCode
  replace Pi to keep one mechanism, or keep both?
- Pi's `bash` and `edit` run unprompted with no sandbox. That's
  acceptable under decision Q7 (sandboxing deferred), but worth noting.
