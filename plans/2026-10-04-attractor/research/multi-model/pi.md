# Pi coding agent

Checked 2026-10-05.

- Pi: `github.com/earendil-works/pi` (`badlogic/pi-mono` redirects there), tag `v1.0.3` (`d78dc83`, 2026-10-05), the version installed and tested; first read on `main` at `5b6c792`, and the line refs checked match at the tag (plan-reviewer, 2026-10-05). Paths below are relative to `packages/coding-agent/` unless they say otherwise.
- pi-acp: `github.com/svkozak/pi-acp` at `b0581c9` (tag `v0.0.34`, 2026-09-24).
- Empirical checks: `npm install @earendil-works/pi-coding-agent@1.0.3` into the scratchpad. Each run had `HOME`, `PI_CODING_AGENT_DIR` and the cwd pointed at scratch directories, a scratch git repo as cwd, and fake API keys. I used the real DeepSeek and Z.ai endpoints, where a fake key gets a free 401, and closed localhost ports. The user's real config was never touched.

## Summary

- **Package names changed.** They are now `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai`, version 1.0.3. `@mariozechner/pi-coding-agent` (last version 0.73.1) is npm-deprecated and points to the new name.
- **Providers.** DeepSeek and Z.ai are built-in providers that read API keys from env vars. Any OpenAI-compatible endpoint, such as hosted Qwen or `mlx_lm.server`, is added through `models.json`. There is no `--base-url` CLI flag.
- **Clean per-invocation config is possible.** Point `PI_CODING_AGENT_DIR` at a generated directory that holds `models.json` and `settings.json`. Keys go in env vars, or `--api-key` for one model. The model is set with `--provider/--model`, and thinking with `--thinking`.
- **Headless works.** Use `pi --mode json` for JSONL events or `pi --mode rpc` for a long-lived JSONL command protocol. The process runs in the spawn cwd; there is no `--cwd` flag.
- **Trap 1: open stdin hangs Pi.** Pi reads stdin until EOF whenever stdin is not a TTY, so the caller must pass `/dev/null` or close stdin (verified: it hung).
- **Trap 2: `--mode json` exits 0 on provider failure** (401, connection error, unknown model). The failure only shows as `stopReason:"error"` plus `errorMessage` on the final assistant `message_end`/`turn_end`. `-p` (text mode) does exit 1 (verified).
- **Sessions are well suited to a pipeline.** `--session-id <id>` creates the session or resumes it, and `--session-dir <dir>` chooses where it is stored. Both work headless (verified).
- **Tools run without any approval prompts** and there is no built-in sandbox.
- **pi-acp is a thin, Zed-oriented MVP** (v0.0.34). It maps all failures except cancellation to `stopReason: end_turn`. It never reads `message_end`, so a non-retryable provider error (such as a 401) shows up as an empty successful turn. That is worse than codex-acp, which at least includes the error text. It cannot pass CLI flags to pi, other than through a wrapper script set with `PI_ACP_PI_COMMAND`.
- **Recommendation for the Attractor handler:** drive `pi --mode json` (one-shot per node) or `pi --mode rpc` directly from Rust, not through pi-acp.

## Facts

### 1. Providers and models

**DeepSeek.** Built-in provider `deepseek`:
- base URL `https://api.deepseek.com`, API `openai-completions`, env `DEEPSEEK_API_KEY` (`packages/ai/src/providers/deepseek.ts:7-13`)
- catalog in v1.0.3 (from `pi --list-models deepseek`): `deepseek-flash` and `deepseek-v4-pro`, both 1M context and both with thinking support

**Z.ai / GLM.** There are two built-in providers, and **both point at the Coding Plan endpoints**:
- `zai`: `https://api.z.ai/api/coding/paas/v4`, env `ZAI_API_KEY` (`packages/ai/src/providers/zai.ts:7-11`). Catalog: glm-4.7, glm-5-turbo, glm-5.2(-highspeed), glm-5.3(-flash/-highspeed).
- `zai-coding-cn`: `https://open.bigmodel.cn/api/coding/paas/v4`, env `ZAI_CODING_CN_API_KEY` (`packages/ai/src/providers/zai-coding-cn.ts:10`; `docs/providers.md:46-47`).
- **There is no built-in pay-as-you-go provider.**
- To use pay-as-you-go, override only the base URL in `models.json`: `{"providers":{"zai":{"baseUrl":"https://api.z.ai/api/paas/v4"}}}`. This keeps the built-in model list, so `--list-models glm-5.3` still listed the models.
- I verified the override takes effect by pointing `baseUrl` at a closed localhost port: the error became "Connection error." instead of a 401. The pay-as-you-go URL itself (`/api/paas/v4`) is from Z.ai's public docs and is UNVERIFIED with a real key.
- There is Z.ai-specific request handling in `packages/ai/src/api/openai-completions.ts:1600-1611` (base URL sniffing for `api.z.ai` and `open.bigmodel.cn`, and `isDeepSeek` sniffing) and in `packages/ai/src/utils/overflow.ts:30-57`.

**Other built-ins.** Anthropic (`ANTHROPIC_API_KEY`) and OpenAI (`OPENAI_API_KEY`) are built in. So are about 30 others, including Qwen Token Plan (`QWEN_TOKEN_PLAN_API_KEY`), OpenRouter, Groq and Moonshot (`docs/providers.md:31-65`).

**Custom OpenAI-compatible endpoints** (`docs/models.md:45-66`, schema in `src/core/model-config.ts:200-262`). Define them in `<agent-dir>/models.json`:

```json
{ "providers": { "<name>": { "baseUrl": "...", "api": "openai-completions", "apiKey": "$ENV_NAME",
  "models": [ { "id": "...", "contextWindow": 131072, "maxTokens": 16384, "reasoning": true } ] } } }
```

- `apiKey` and header values accept a literal, `$NAME`/`${NAME}` env interpolation, or `!command` (`docs/models.md:64`).
- Per-model fields: `baseUrl`, `headers`, `thinkingLevelMap`, `samplingParams`, `samplingParamsByThinkingLevel`, and `compat`. `compat` covers `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsUsageInStreaming`, `maxTokensField`, `thinkingFormat` (`openai|deepseek|zai|qwen|qwen-chat-template|chat-template|...`), `chatTemplateKwargs` and more (`src/core/model-config.ts:84-122`).
- `modelOverrides` patches metadata on built-in models.
- Provider extensions (`pi.registerProvider()`, loadable per run with `-e ./x.ts`) handle custom auth and streaming (`docs/custom-provider.md:21-30`).

**Catalog entry not required.** With `--provider` (or a `provider/` prefix), an unknown model id falls back to a clone of that provider's default model with the id swapped. Pi prints the warning `Model "X" not found for provider "Y". Using custom model id.` to stderr (`src/core/model-resolver.ts:570-596`, `buildFallbackModel` at `:175-189`). Verified with `deepseek/deepseek-bogus-9`.

**Caveat on model matching.** `--model` also does fuzzy and glob matching (`docs/cli.md:65-66`). A bare pattern without a provider can resolve to a different model than intended. Always pass exact `provider/id`. The fallback clone also inherits the default model's context window and limits (UNVERIFIED whether that matters per model).

**Credential precedence:** `--api-key` first, then `auth.json`, then `models.json` `apiKey`, then env vars (`docs/models.md:23`).

**Model catalog refresh.** Pi can overlay a newer catalog from pi.dev over its bundled one. `PI_OFFLINE=1` or `--offline` disables this network fetch (`docs/cli.md:229-230`).

### 2. Per-invocation configuration (no edits to `~/.pi`)

**CLI flags** (`docs/cli.md:63-74`; parser `src/cli/args.ts:91-236`):
- `--provider <name>` requires `--model`.
- `--model <pattern>` accepts `provider/id` and an optional `:<thinking>` suffix.
- `--api-key <key>` is a non-persistent override and requires `--model`/`--models`.
- `--thinking off|minimal|low|medium|high|xhigh|max` is clamped to what the model supports.
- `--models`, `--list-models [search]`.
- **There is no `--base-url` and no `--settings`/`--config` flag.**

**Config dir override.** `PI_CODING_AGENT_DIR` replaces `~/.pi/agent` (`src/config.ts:584-609`; `docs/environment-variables.md:81`). It holds `models.json`, `settings.json`, `auth.json`, `trust.json`, `bin/`, `sessions/` and `AGENTS.md`.
- Verified: Pi wrote `auth.json` and `models-store.json` into the overridden dir and nothing into `~/.pi`.
- Verified: a `settings.json` there containing `{"retry":{"enabled":false}}` took effect.
- So the handler can generate one directory per node or run, holding `models.json` and `settings.json`, and keep keys in env vars.

**Other process env** (`docs/environment-variables.md:79-96`):
- `PI_CODING_AGENT_SESSION_DIR`
- `PI_OFFLINE`, which also stops fd/rg auto-download from GitHub into `<agent-dir>/bin` (`src/utils/tools-manager.ts:12-18`)
- `PI_SKIP_VERSION_CHECK`
- `PI_TELEMETRY=0`, which disables install telemetry and provider attribution headers
- `PI_CACHE_RETENTION`

**Project-level config.** `<cwd>/.pi/settings.json`, `.pi/extensions` and similar files load only if the project is trusted. Headless with no saved decision, they are skipped unless `defaultProjectTrust: "always"` is set or `--approve` is passed; `--no-approve` forces them off (`docs/security.md:37-82`).
- Context files `AGENTS.md`/`CLAUDE.md` load regardless of trust. `-nc`/`--no-context-files` disables them (`docs/cli.md:202-203`; `docs/security.md:57`).

**Prompt and resource flags:**
- `--system-prompt <text|path>` and `--append-system-prompt` (`docs/cli.md:217-220`)
- `-ne`, `-ns`, `-np` (no extensions, skills or prompt templates), plus explicit `-e`/`--skill` (`docs/cli.md:184-203`)

### 3. Headless operation

**Modes** (`docs/cli.md:43-51`; `docs/cli-integration.md`):
- `-p/--print`: final assistant text goes to stdout.
- `--mode json`: one-shot JSONL events on stdout.
- `--mode rpc`: long-lived JSONL commands on stdin, responses and events on stdout.
- Mode selection is in `src/main.ts:112-122`. Any non-TTY stdin or stdout selects print mode unless json or rpc is set.

**JSON mode schema** (`docs/json.md`):
- The first record is a session header: `{"type":"session","version":3,"id":...,"cwd":...}`.
- Then come `agent_start`, `turn_start`, `message_start`/`message_update`/`message_end` (roles `system`, `user`, `assistant`, `toolResult`), `tool_execution_start`/`_update`/`_end` (with `isError`), `turn_end`, `agent_end{willRetry}` and `agent_settled`.
- Also: `auto_retry_start`/`auto_retry_end{success,finalError}`, `compaction_start`/`compaction_end`, `queue_update` and `thinking_level_changed`.
- `message_update` is delta-only. `message_end.message` is authoritative and carries `stopReason`, `errorMessage`, `usage` (with cost), `provider` and `model`.
- `agent_settled` means no more automatic work (`docs/json.md:31-60`).
- Framing is strict LF. Do not split on U+2028/2029 (`docs/json.md:13-19`).

**RPC mode** (`docs/rpc.md`; command list in `docs/rpc-commands.md`):
- Commands carry an optional `id`. Each gets a `{"type":"response","command":...,"success":bool,"error"?}` reply, and events stream alongside the responses.
- Command list: `prompt`, `steer`, `follow_up`, `abort`, `clear_queue`, `new_session`, `get_state`, `get_messages`, `set_model`, `cycle_model`, `get_available_models`, `set_thinking_level`, `set_auto_compaction`, `set_auto_retry`, `abort_retry`, `bash`, `abort_bash`, `get_session_stats`, `export_html`, `switch_session`, `fork`, `clone`, `get_entries`, `get_tree`, `get_last_assistant_text`, `set_session_name` and `get_commands`.
- A `prompt` response only means the prompt was accepted. Wait for `agent_settled` before treating the run as complete.
- Closing stdin shuts Pi down cleanly (`docs/rpc.md:58-95`).
- Extension dialogs are a sub-protocol (`docs/rpc-extension-ui.md`).

**SDK.** `@earendil-works/pi-coding-agent` exports `createAgentSession`, `RpcClient` and related functions (`docs/sdk.md`). It is Node/Bun only, so it is not directly usable from Rust.

**cwd.** There is no `--cwd` flag. Pi uses the process cwd for tools, `@file` paths, project config and session grouping (`docs/cli.md:39`). The session header echoes `cwd` (verified).

**Stdin.** In print and json modes, Pi reads stdin to EOF whenever stdin is not a TTY, then prepends it to the prompt (`src/main.ts:79-96` and `:890-898`).
- **Verified hang:** `sleep 8 | pi --mode json ... "hi"` emitted nothing and was killed by `timeout 4`.
- The caller must use `stdin=/dev/null` (or a closed pipe), or deliberately pipe the prompt in.
- RPC mode does not do this read.

**Signals.** Print and json mode handle SIGTERM (exit 143) and SIGHUP (exit 129), and dispose the runtime first (`src/modes/print-mode.ts:50-66`).

### 4. Output and success/failure signalling

Exit codes in print and json mode come from `src/modes/print-mode.ts:139-161`:

| Mode | Exit code |
|---|---|
| Text (`-p`) | 1 if the last assistant message has `stopReason` `error` or `aborted`; `errorMessage` goes to stderr |
| JSON | Always 0 unless the invocation throws (startup or config error). A failed assistant response does **not** make the exit code nonzero (`docs/cli-integration.md:30,46`) |

**JSON mode trap, verified:**
- A fake-key 401 from DeepSeek gave exit=0. The final `message_end`/`turn_end` had `stopReason:"error"` and `errorMessage:"401: {...authentication_error...}"`, followed by a normal `agent_end` and `agent_settled`.
- An unknown model id only produced the stderr warning, then the provider's error (a 401 with the fake key). With a real key it would presumably be a 400 or 404 in `errorMessage` with exit 0 (UNVERIFIED).
- A connection refused on a custom endpoint gave 4 attempts (3 `auto_retry_start`, each assistant `message_end` with `stopReason:"error"`, `errorMessage:"Connection error."`), then `auto_retry_end` with `finalError`, and exit 0.
- **Success rule for the handler:** treat the run as failed if the last assistant `message_end` before `agent_settled` has `stopReason` `error` or `aborted`. An `auto_retry_end{success:false}` is also a failure. Whether `length` should count as a failure is a policy choice.
- Provider errors never become plain assistant text. They are always typed through `stopReason:"error"`.

**Retry policy** (`packages/ai/src/utils/retry.ts:7-80, 250-255`; settings `docs/settings.md:125-133`):
- The agent retries when `errorMessage` matches a regex that includes `429`, `500`-`504`, rate limit, overloaded, connection and timeout. The defaults are `retry.maxRetries: 3` and `retry.baseDelayMs: 2000` (exponential backoff).
- Quota and billing texts are not retried (`insufficient_quota`, `billing`, ...).
- 401 and 400 are not retried (verified for 401).
- Quirk: the match is a plain substring regex over the whole error text, so an error body containing "500" or "429" anywhere, for example inside a request id, would be retried.
- Context overflow goes to compaction, not retry (`src/core/agent-session.ts:3660-3664`).

### 5. Sessions

**Storage** (`docs/sessions.md:48-54`; `docs/cli.md:86-107`):
- The default is `~/.pi/agent/sessions/<encoded-cwd>/`, or `<PI_CODING_AGENT_DIR>/sessions/...`. `--session-dir`, then `PI_CODING_AGENT_SESSION_DIR`, then the `sessionDir` setting override it.
- File name: `<ISO-timestamp>_<id>.jsonl`. Verified: `sess/2026-10-05T13-45-25-278Z_node-a.run-1.jsonl`.
- Format v3 (JSONL tree) is documented in `docs/session-format.md`.

**Flags:**
- `-c/--continue` resumes the latest session for the cwd.
- `-r/--resume` opens a picker, so it is interactive.
- `--session <path|id>` takes a path, exact id or partial id.
- **`--session-id <id>` opens the exact id or creates it**, so the caller chooses the id. Ids use `[A-Za-z0-9._-]` and must start and end with an alphanumeric.
- `--fork <path|id>` (combine it with `--session-id` to name the fork), `--no-session`, `-n/--name`.

**Headless runs.** Verified: two `--mode json --session-dir D --session-id node-a.run-1` runs appended to the same file, and the second run's header carried the same id and timestamp. `--session <file>` also resumed. The id appears in the json header, and `get_state` returns it in RPC.

**Persistence is lazy.** The file is created only once the session has a user or assistant message (`src/core/session-manager.ts:1172-1189`). Verified: killing the process early (SIGPIPE through `| head -1`) left no file. Tools also see `PI_SESSION_ID` and `PI_SESSION_FILE` (`docs/environment-variables.md:22-30`).

### 6. Tools, permissions, sandboxing

**Built-in tools** (`docs/cli.md:128-146`):
- On by default: `read`, `bash`, `edit`, `write`.
- Also available: `grep`, `find`, `ls` (which use rg and fd from PATH, auto-downloaded unless offline), and `powershell` on Windows.
- Optional: `codemode` (JS in QuickJS calling other tools) and `tool_search`.
- Selection: `--tools` replaces the set, `--exclude-tools` removes tools, `--no-builtin-tools`, `--no-tools`.

**`edit` tool** (`src/core/tools/edit.ts:23-49,151`):
- Takes `path` plus `edits[]` of `{oldText,newText}`. Each `oldText` must match a unique, non-overlapping region of the *original* file, and several disjoint edits are allowed in one call.
- Matching is exact first, then **fuzzy**: trailing whitespace stripped, NFKC, and Unicode quotes and dashes normalized (`src/core/tools/edit-diff.ts:28-38,202-205`).
- A legacy single `oldText/newText` form is still accepted (`edit.ts:126-131`).
- Quality on DeepSeek, GLM and Qwen is UNVERIFIED here.

**`bash` tool.** Optional per-call timeout in seconds, with a maximum cap (`src/core/tools/bash.ts:27-37`).

**Permissions.** There are **no approval prompts**: "it does not ask for approval before every tool call" (`docs/security.md:3`). Tools run with the user's OS permissions in headless and interactive mode alike.
- Gating is opt-in through extensions: a `tool_call` handler can return `{block:true}` (`docs/extensions.md:105,169-175`). Examples include `examples/extensions/permission-gate.ts`, `protected-paths.ts` and `confirm-destructive.ts`.

**Sandboxing.** There is no built-in sandbox (`docs/security.md:3,99`).
- Example extension `examples/extensions/sandbox/` wraps `bash` with `@anthropic-ai/sandbox-runtime` (sandbox-exec on macOS, bwrap on Linux).
- There is also a `gondolin` example, and `docs/containerization.md` covers running Pi in a container.
- Running the handler in a worktree inside a container or VM is the recommended boundary.

### 7. pi-acp (svkozak/pi-acp)

**Maintenance.**
- v0.0.34, published 2026-09-24 (npm `pi-acp`). MIT, 713 stars, 90 open issues.
- About 34 releases; the last commits are dated 2026-09-22/24.
- The README calls it an "MVP-style adapter", centered on Zed, and says to "expect some minor breaking changes".
- Requires Node 22+ and pi v0.81+ on PATH.

**Architecture.** It speaks ACP JSON-RPC over stdio and spawns `pi --mode rpc --no-themes [--session <path>]` in the session cwd with the full `process.env` (`src/pi-rpc/process.ts:162-171`).
- **No other pi flags can be passed.** Model, base URL and `--approve` cannot be set per session, except through `PI_ACP_PI_COMMAND`, which points at a wrapper script (`src/acp/agent.ts:281-287`).
- Env such as `PI_CODING_AGENT_DIR` and provider keys passes through.

**ACP methods and capabilities.**
- Methods: `initialize` (protocol v1; `loadSession:true`; `session list`/`delete`; image prompts; MCP not supported), `session/new` (requires an absolute cwd), `session/prompt`, `session/cancel`, `session/load`, `session/list`, `session/delete`, `setSessionMode` (thinking), and `unstable_setSessionModel` (`src/acp/agent.ts:236-270, 446, 903-1200`).
- `setSessionConfigOption` takes the ids `model` and thought level, and maps them to pi `set_model` and `set_thinking_level` (`agent.ts:1175-1200`).
- There is no `resume` method separate from `load`.
- The session map is stored at `~/.pi/pi-acp/session-map.json`, hard-coded to `homedir()` and ignoring `PI_CODING_AGENT_DIR`. **It writes into the user's home** (`src/acp/paths.ts:9-15`).

**Auth.** Advertises a "terminal" auth method (`pi-acp --terminal-login`, which opens interactive pi). `session/new` raises ACP `authRequired` when pi's `get_state`/`get_available_models` errors match substrings such as `api key`, `401` or `unauthorized` (`src/acp/auth-required.ts`).

**Error reporting (trap).**
- `prompt` returns `stopReason: 'end_turn'` for every outcome except a cancellation. A comment says "ACP StopReason does not include 'error'; if pi fails we map to end_turn for now" (`src/acp/agent.ts:895-900`).
- A turn settles on `agent_settled` and always resolves to `end_turn` unless the turn was cancelled (`src/acp/session.ts:460-467, 905-907`).
- The event handler never inspects `message_end`, so `stopReason:"error"`/`errorMessage` is dropped (`session.ts:586-913`; no `message_end` case). A non-retried provider error (401, 400) therefore reaches the client as **an empty successful turn with no error text**.
- Retries surface only as text chunks (`session.ts:849-863`).
- Its `auto_compaction_start`/`_end` handlers listen for event names that pi 1.0.3 no longer emits; pi emits `compaction_start`/`compaction_end`, and grep finds no `auto_compaction_start` in pi src. Those handlers are dead code.
- Tools are never gated. `requestPermission` is used only for extension UI confirm and select dialogs (`session.ts:1002`).

### 8. License, maturity, install, runtime

- **License:** MIT, © 2025 Mario Zechner (`LICENSE`). The org is now Earendil Works.
- **Repo stats** (`gh api`): 112.6k stars, 14.3k forks, 272 open issues, pushed 2026-10-05.
- **Releases:** 326 tags in total, with a very fast cadence: v0.99.0 on 2026-09-29, v1.0.0 on 2026-10-01, v1.0.1 on 10-03, v1.0.2 on 10-04 and v1.0.3 on 10-05.
- **Monorepo packages:** `pi-ai`, `pi-agent-core`, `pi-tui`, `pi-mcp`, `pi-codemode`, `pi-durable`, `pi-env`, `pi-server`, `pi-client`, `pi-protocol` and others, all at 1.0.3.
- **Install:** `npm install -g @earendil-works/pi-coding-agent`. The bin is `pi` (`dist/bundle/cli.js`). Nix is also supported (`flake.nix`; `pi update` defers to Nix). No standalone binary was seen; Bun build code exists in `src/bun/` (UNVERIFIED whether a compiled binary is distributed).
- **Runtime:** Node `>=22.19.0` (engines in every package). There is a `legacy-node20` dist-tag at 0.74.2. Tested locally with Node v26.3.0.
- **Pinning:** given the daily releases and `pi update` self-update, pin an exact version with a local `npm install` rather than a global install. Set `PI_SKIP_VERSION_CHECK=1` and `PI_OFFLINE=1` for reproducible runs.

### 9. Local smoke-test plan (no paid keys)

Run every test in a scratch git repo with an isolated agent dir. Steps a, b and c below were actually run; d needs a server running.

```bash
# setup
export SCR=/path/to/scratch; mkdir -p $SCR/agent $SCR/work && git -C $SCR/work init
npm install --prefix $SCR/pi @earendil-works/pi-coding-agent@1.0.3
PI=$SCR/pi/node_modules/.bin/pi
export HOME=$SCR PI_CODING_AGENT_DIR=$SCR/agent PI_OFFLINE=1 PI_SKIP_VERSION_CHECK=1 PI_TELEMETRY=0
cat > $SCR/agent/models.json <<'EOF'
{ "providers": { "mlx": { "baseUrl": "http://127.0.0.1:8080/v1", "api": "openai-completions", "apiKey": "$MLX_KEY",
  "models": [ { "id": "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit", "contextWindow": 131072, "maxTokens": 16384,
                "compat": { "supportsDeveloperRole": false } } ] } } }
EOF
echo '{"retry":{"enabled":false}}' > $SCR/agent/settings.json
cd $SCR/work

# a) catalog / config load
MLX_KEY=dummy $PI --list-models mlx
# b) provider error path, exit code + stopReason (DeepSeek fake key → 401, free)
DEEPSEEK_API_KEY=sk-fake $PI --mode json --no-session --model deepseek/deepseek-flash "hi" </dev/null > e.jsonl; echo $?
jq -c 'select(.type=="message_end" and .message.role=="assistant") | .message | {stopReason,errorMessage}' e.jsonl
# c) server down → "Connection error." (with retry disabled: one attempt)
MLX_KEY=dummy $PI --mode json --no-session --model mlx/mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit "hi" </dev/null | jq -c 'select(.type=="message_end")|.message.stopReason'
# d) with mlx_lm.server running on :8080 — real tool round-trip + session resume
MLX_KEY=dummy $PI --mode json --session-dir $SCR/sess --session-id smoke-1 \
  --model mlx/mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit --thinking off \
  "Create hello.txt containing 'hi', then cat it" </dev/null > d1.jsonl
jq -c 'select(.type|test("tool_execution_end|message_end"))|{type,toolName,isError,stop:.message.stopReason}' d1.jsonl
MLX_KEY=dummy $PI --mode json --session-dir $SCR/sess --session-id smoke-1 \
  --model mlx/mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit "What file did you create?" </dev/null > d2.jsonl
# e) RPC: printf '{"id":"1","type":"get_state"}\n' | $PI --mode rpc --no-session --model mlx/...   (closing stdin ends it)
```

`supportsDeveloperRole:false` above is a guess for `mlx_lm.server` (UNVERIFIED). Whether `mlx_lm.server` handles tool calls and streaming usage the way Pi expects is UNVERIFIED and is the main thing step d tests.

## Open questions

1. **Z.ai pay-as-you-go.** Does the `zai` provider with `baseUrl` overridden to `https://api.z.ai/api/paas/v4` behave the same (thinking format, `tool_stream`)? The base-URL sniffing in `openai-completions.ts:1600` still matches `api.z.ai`, so probably yes (UNVERIFIED with a real key).
2. **Bad model id with a real key.** Is the exact error text for a 400/404 from DeepSeek, Z.ai or Qwen an `errorMessage` with `stopReason:"error"` and exit 0? Inferred from the code path; only the 401 was observed.
3. **Fallback model limits.** For model ids missing from the catalog, the fallback clone inherits the provider default's `contextWindow`/`maxTokens`/`reasoning`. Could that mis-size compaction for hosted Qwen? Prefer explicit `models.json` entries.
4. **Tool calling on local models.** Does `mlx_lm.server` tool calling work with the `openai-completions` API and its streaming tool-call deltas? Which `compat` flags does it need?
5. **Edit tool quality** on DeepSeek, GLM and Qwen (the multi-edit `edits[]` schema) is not measured.
6. **Retry regex false positives.** Error bodies that contain "500" or "429" inside ids would trigger retries. This is minor, but it affects time budgets; per-node `retry.*` settings can cap it.
7. **Version pinning vs. churn.** Five releases in five days around 1.0. Pin a version and re-verify the json event schema on upgrades.
8. **pi-acp.** Its error mapping and stale event names suggest it is not suitable for a pipeline where success or failure matters, unless patched. Is it worth an upstream PR (map `message_end.stopReason:"error"` to an ACP error or `refusal`)?
