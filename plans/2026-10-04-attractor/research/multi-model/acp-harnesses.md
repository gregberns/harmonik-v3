# Generic harnesses over ACP

Checked 2026-10-05. Extends [acp.md](../acp.md) and [harnesses.md](../harnesses.md);
it does not repeat them. Repos read at: `anomalyco/opencode@907b3bc` (dev,
2026-10-02), `aaif-goose/goose@d7ce0cd` (2026-10-05),
`QwenLM/qwen-code@dd82140` (2026-10-05), `agentclientprotocol/registry@8ed458f`
(2026-10-05), `MoonshotAI/kimi-code@21406fb`, `cline/cline@68b24a9`,
`Kilo-Org/kilocode@a93088b`, `charmbracelet/crush@8da3490`,
`deepseek-ai/deepseek-harness@5badb15`. Binaries tested: OpenCode 1.18.34,
Goose 1.53.0 and Qwen Code 0.25.0. Each ran against a fake
OpenAI-compatible server (Python; it returns 200, a tool call, 400, 401 or
429), from a scratch git repo with HOME, XDG and config dirs isolated under
the scratchpad. No real DeepSeek, Z.ai, Qwen or mlx_lm.server endpoint was
called. "Tested" means seen in those runs.

## Summary

All three main candidates can run DeepSeek, GLM on Z.ai pay-as-you-go, a
hosted Qwen and a local mlx_lm.server, and none needs the user's global
config. The main difference is **how they report a failed turn**:

- **OpenCode** and **Qwen Code** return a JSON-RPC error (-32603) on
  `session/prompt` for 400, 401 and 429. In headless mode they exit 1.
- **Goose** has the codex-acp trap. A 400 (bad model) or 429 ends as
  `stopReason: end_turn` over ACP, or as exit 0 with a `complete` event in
  `goose run`. The only sign of failure is error text in the assistant
  message.

Recommendation: **OpenCode** as the multi-model handler, with **Qwen Code**
as the fallback. Not Goose.

- **Why OpenCode:**
  - Built-in `deepseek` and `zai` (pay-as-you-go `api/paas/v4`) providers.
  - One env var (`OPENCODE_CONFIG_CONTENT`) carries the whole per-node
    config.
  - `model`, `effort` and `mode` can be set over ACP.
  - Full `load`/`resume`/`list` support.
  - Failures are honest.
- **OpenCode's costs:**
  - Model ids must be in the catalog or declared in the config.
  - Over ACP, effort starts at `low` unless the client sets it.
  - The client cannot choose the session id.
  - Edit, write and bash are allowed by default.
  - `retry-after` is honoured with no upper limit.
- **Why Qwen Code as fallback:**
  - Accepts any model id.
  - The client can choose the session id (as a UUID).
  - Reasoning effort is mapped per host for DeepSeek and Z.ai.
- **Qwen Code's costs:**
  - A 429 keeps retrying silently for minutes.
  - Headless mode hides the edit and shell tools unless `--yolo` is given.
  - Over ACP, only models declared in `modelProviders` can be switched to.
  - The codebase is huge and changes daily.

Whichever is chosen, the Attractor needs its own per-node wall-clock timeout.

| | OpenCode | Goose | Qwen Code |
|---|---|---|---|
| Version / date | v1.18.34, 2026-09-30 | v1.53.0, 2026-10-02 | v0.25.0, 2026-10-05 (registry pins 0.24.7) |
| License / runtime / stars | MIT / Bun binary via npm / ~212k | Apache-2.0 / Rust static binary / ~55k | Apache-2.0 / Node >= 22 / ~28k |
| ACP launch | `opencode acp` | `goose acp` | `qwen --acp` |
| DeepSeek | built-in `deepseek` (`DEEPSEEK_API_KEY`) | built-in `custom_deepseek` (base URL fixed) | `openai` auth + `api.deepseek.com/v1` (DeepSeek adapter by host) |
| GLM pay-as-you-go | built-in `zai` = `api.z.ai/api/paas/v4`, `ZHIPU_API_KEY` | `zhipu` + `ZHIPU_BASE_URL=https://api.z.ai/api/paas/v4` | `openai` + `baseUrl https://api.z.ai/api/paas/v4` (Z.ai adapter by host); UNVERIFIED on the real endpoint |
| Custom OpenAI-compatible | `@ai-sdk/openai-compatible` provider in config | `OPENAI_BASE_URL`, or `custom_providers/*.json` | `OPENAI_BASE_URL`/`OPENAI_API_KEY`, or `modelProviders` |
| Arbitrary model id | no: must be in the catalog or declared in config | yes | yes at launch; over ACP only declared models |
| Per-run config without global edits | `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG_DIR`, `OPENCODE_PERMISSION`, `OPENCODE_DB` | `GOOSE_PATH_ROOT` + `GOOSE_*` env | `QWEN_HOME`, `QWEN_CODE_SYSTEM_SETTINGS_PATH`, `OPENAI_*` env, flags |
| ACP model / effort | `set_config_option` model, effort (`thought_level`), mode; `set_model` | `set_config_option` provider, model, mode, `thinking_effort`; no `set_model` | `set_config_option` model, `reasoning_effort`, mode; `set_model` |
| Reasoning for DeepSeek/GLM/Qwen | yes (`reasoning_effort`); ACP starts at `low` | **no** on OpenAI-style engines (silently `off`); yes on the `zai` Anthropic engine | yes, mapped per host |
| ACP 400 / 401 / 429 | -32603 / -32603 / -32603 after 5 retries | **`end_turn` + text** / -32000 / **`end_turn` + text** | -32603 / -32603 / silent retries for over 150 s |
| Headless failure signal | `error` event, exit 1 | **exit 0 on 400 and 429**; exit 1 on 401 | `result.is_error`, exit 1 |
| ACP sessions | load, resume, list, fork, close | load, list, fork, delete, close; **no resume** | load, resume, list |
| Client picks session id | no | no (native: `-n <name>`) | yes (`_meta["qwen-code/sessionId"]`, UUID) |
| Default permissions | everything allowed; only "ask" rules send `request_permission` | depends on `GOOSE_MODE` (`auto` sends no requests) | ACP `auto`: safe actions run; headless hides edit/shell without `--yolo` |
| Local mlx_lm.server | custom provider in `OPENCODE_CONFIG_CONTENT` | `GOOSE_PROVIDER=openai OPENAI_BASE_URL=...` | `OPENAI_BASE_URL=... OPENAI_API_KEY=none --auth-type openai` |

**Corrections to acp.md and harnesses.md**

- **Kimi.** The registry's `kimi` entry (v1.52.0) still launches the archived
  Python `MoonshotAI/kimi-cli`, not its successor `MoonshotAI/kimi-code`
  (`registry/kimi/agent.json` at `8ed458f`). kimi-code 2.1.1 has its own
  `kimi acp` (see D).
- **Kilo.** harnesses.md says it is "not on the ACP agents page". It is in
  the registry: `kilo acp`, v7.8.3. It is an OpenCode fork:
  `packages/opencode/src/acp/*` is the same layout, and the env vars are
  renamed `KILO_CONFIG*` (`packages/opencode/src/config/config.ts:450,900`).
- **Goose.** The registry still links `block/goose`. Goose has no
  `session/resume`.
- **Qwen Code.** "Any OpenAI-compatible endpoint works" needs a caveat:
  over ACP you can only switch to models declared in `modelProviders`. The
  current version is 0.25.0, not 0.24.7.
- **DeepSeek Harness (dsh).** acp.md lists `set_config_option` but not how
  errors surface. dsh rejects a failed turn with a JSON-RPC internal error
  (see D).

## Facts

### A. OpenCode

Checked 2026-10-05. Source: `anomalyco/opencode` branch `dev` at `907b3bc`
(2026-10-02). Paths are relative to `packages/opencode/src/` unless they
start with `core/` (= `packages/core/src/`). Tested: npm `opencode-ai@1.18.34`
installed into the scratchpad, driven by a small Python ACP client against
a fake OpenAI-compatible server (modes: ok, tool call, 400, 401, 429). All
config, data and HOME paths were isolated via `XDG_*`/`HOME`. "Tested" below
means observed in that run.

**7. License, maturity, runtime**
- MIT; about 211.8k stars; pushed 2026-10-05. Latest release v1.18.34
  (2026-09-30). Releases come every few days (v1.18.27 to v1.18.34 in four
  weeks).
- Install: `npm i -g opencode-ai` (bundled Bun binary per platform), or brew
  or curl. The ACP registry launches `opencode acp`; acpx uses
  `npx -y opencode-ai acp`.
- At startup it writes `opencode.jsonc` and `package.json` and runs a
  background `npm install @opencode-ai/plugin` in the global config dir
  (`config/config.ts:452-470`). Tested: these appeared under the isolated
  `XDG_CONFIG_HOME/opencode/`, and the project repo stayed clean
  (`git status` empty).

**1. Providers and models**
- The catalog comes from models.dev, bundled in the binary and refreshed from
  `https://models.opencode.ai` unless `OPENCODE_DISABLE_MODELS_FETCH=1`
  (`core/models-dev.ts:160,222`). `OPENCODE_MODELS_PATH` points at a local
  file instead.
- Built-in providers, from models.dev `api.json` fetched 2026-10-05:
  - `deepseek`: env `DEEPSEEK_API_KEY`, `https://api.deepseek.com`,
    `@ai-sdk/openai-compatible`. Models `deepseek-flash`,
    `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `deepseek-v4-pro`.
    The bundled 1.18.34 snapshot lists only `deepseek-flash` and
    `deepseek-v4-pro` (tested with `opencode models deepseek`).
  - `zai`: the **pay-as-you-go** endpoint `https://api.z.ai/api/paas/v4`,
    env `ZHIPU_API_KEY`, 18 models including `glm-5.3`. `zai-coding-plan`
    uses `.../api/coding/paas/v4`. `zhipuai` is the China endpoint
    `open.bigmodel.cn`.
  - For `zai` and `zhipuai` on openai-compatible, OpenCode adds
    `thinking: {type: "enabled", clear_thinking: false}` to the request
    (`provider/transform.ts:1265-1272`).
  - DeepSeek's `reasoning_content` is carried as interleaved reasoning
    (`provider/provider.ts:1596`).
  - Also built in: `alibaba` (DashScope intl, `DASHSCOPE_API_KEY`),
    `openai` and `anthropic` (API keys), plus OpenCode Zen free models (see
    the trap below).
- **Custom OpenAI-compatible endpoints** are a `provider` entry with
  `npm: "@ai-sdk/openai-compatible"`, `options.baseURL` and `options.apiKey`.
  `{env:VAR}` substitution works. Tested: the key arrived as
  `Authorization: Bearer <value of FAKE_KEY>`.
- **Model ids must exist in the catalog or in the config.** Tested:
  - `opencode run -m fok/some-unlisted-id` fails with
    `ProviderModelNotFoundError`. It surfaces as a generic
    `UnknownError "Unexpected server error"` event and exit 1.
  - Over ACP, `set_config_option model=fok/not-in-catalog` returns -32602
    "model not found".
  - Workaround: declare the id under `provider.<id>.models` in the
    per-invocation config. Any string works as the id.
- **Trap:** with no `enabled_providers`, the ACP model list and the default
  model include OpenCode Zen free models (`opencode/big-pickle` and others),
  which need no key. Tested: they appeared in `configOptions`. Pin
  `"enabled_providers": [...]` and `"model"` so the agent never silently
  falls back to Zen.

**2. Per-invocation config, without touching global config**
- Load order (`config/config.ts:412-560`), later entries win:
  1. global `$XDG_CONFIG_HOME/opencode/opencode.json[c]`, replaced by
     `OPENCODE_CONFIG_DIR` (`packages/core/src/global.ts:64`)
  2. `OPENCODE_CONFIG` (file)
  3. project `opencode.json[c]` from cwd up to the worktree, skipped with
     `OPENCODE_DISABLE_PROJECT_CONFIG=1`
  4. `.opencode/` dirs
  5. `OPENCODE_CONFIG_CONTENT` (inline JSON)
  6. account and managed config (MDM)
  7. `OPENCODE_PERMISSION` (JSON merged into `permission`)
- So one env var, `OPENCODE_CONFIG_CONTENT`, can carry the provider, base
  URL, key reference, model list, `model`, `enabled_providers` and
  `permission`. Global config is still merged unless `OPENCODE_CONFIG_DIR`
  (or `XDG_CONFIG_HOME`) points elsewhere. Keys stored by `opencode auth
  login` live in `$XDG_DATA_HOME/opencode/auth.json`
  (`auth/index.ts:10`).
- Other isolation knobs:
  - `OPENCODE_DISABLE_CLAUDE_CODE` (or `_PROMPT` / `_SKILLS`): stop reading
    Claude Code prompts and skills (`effect/runtime-flags.ts:24-29`).
  - `--pure` / `OPENCODE_PURE`: no external plugins.
  - `OPENCODE_DISABLE_AUTOUPDATE`.
  - `OPENCODE_DB`: session database path.
- `opencode run` flags (`cli/cmd/run.ts:143-256`): `-m provider/model`,
  `--variant <effort>` ("provider-specific reasoning effort"), `--agent`,
  `--dir`, `--session`, `--continue`, `--fork`, `--format json`, `--auto`
  (alias `--yolo` / `--dangerously-skip-permissions`), `--attach <url>`.
- **Over ACP**, the model, effort and mode can all be set per session:
  - Config options (`acp/config-option.ts:31-116`):
    - `model`, category `model`; values `provider/model`, optionally
      `provider/model/variant`
    - `effort`, category `thought_level`; offered only when the model has
      variants
    - `mode`, category `mode`; `build` or `plan`
  - `session/set_config_option` handles all three
    (`acp/service.ts:409-466`). `session/set_model` (unstable) and
    `session/set_mode` are also implemented (`acp/service.ts:468-495`).
  - Tested: `set_config_option model` switched providers mid-session, and
    `effort=high` was sent as `reasoning_effort: "high"`.
  - The endpoint and key cannot be set over ACP; they come from env and
    config at spawn.
- **Reasoning-level trap (tested).**
  - A custom model needs `"reasoning": true` to get variants: `low`,
    `medium`, `high`, plus `max` for ids containing `deepseek-v4`
    (`provider/transform.ts:576,995-1001`).
  - Over ACP, when the model has no `default` variant, the session starts at
    the **first variant, `low`** (`acp/service.ts:910-915`). Tested: requests
    carried `reasoning_effort: "low"` until the client set `effort`.
  - `opencode run` without `--variant` sends no `reasoning_effort`.
  - The title-generation call always used `low`.

**3. Headless, cwd, TTY, stdin**
- `opencode acp [--cwd]` starts an in-process HTTP server on a random
  localhost port and bridges ACP over stdio (`cli/cmd/acp.ts:19-71`). It
  exits when stdin closes. `session/new.cwd` sets each session's
  directory. No TTY is needed (tested from a pipe).
- `opencode run` needs no TTY, but when stdin is not a TTY it **reads stdin
  to EOF** and appends it to the message (`cli/cmd/run.ts:416`,
  `resolveRunInput` at 40-50). Tested: `sleep 6 | opencode run ...` waited
  about 6 s. Always pass `</dev/null` or pipe the prompt in.
- Each run also makes an extra small request for the session title, before
  the main turn and to the same model unless `small_model` is set (tested:
  two requests per one-turn run).

**4. Output and failure signalling**
- **ACP (tested):** provider errors are **JSON-RPC errors, not `end_turn`**.
  `promptResponse` maps the assistant message error (`acp/service.ts:839-888`)
  and `toRequestError` converts it (`acp/error.ts:63-93`):
  - 400 "Model Not Exist" →
    `{"code":-32603,"message":"Internal error: Model Not Exist","data":{"service":"session","errorName":"APIError"}}`
  - 401 → -32603 `"Internal error: Authentication Fails..."`. A plain HTTP
    401 is an `APIError`, **not** ACP `auth_required`. -32000
    auth_required appears only for `ProviderAuthError`/`LoadAPIKeyError`
    (missing key) (`acp/service.ts:879-881,1204-1218`).
  - 429 → retried, then -32603 "Rate limit reached". With
    `retry-after: 1` the call took 5.2 s.
  - `stopReason` values: `end_turn`; `cancelled` (MessageAbortedError);
    `max_tokens` (MessageOutputLengthError); `refusal` (ContentFilterError).
  - Successful results carry `usage {inputTokens, outputTokens,
    totalTokens}`. A `usage_update` (context used, size, USD cost) is sent
    after each prompt (`acp/service.ts:639-681`).
- **Retry policy** (`session/retry.ts:25-31,85-100`): up to 5 retries,
  2 s × 2^n with jitter, capped at 30 s without headers. Retries cover
  429, 5xx and network errors. `retry-after` / `retry-after-ms` are
  honoured **uncapped** (up to 2^31 ms), so a long Retry-After can stall a
  node; the orchestrator needs its own timeout. 400 and 401 are not
  retried.
- **`opencode run --format json` (tested):** NDJSON events
  `{type, timestamp, sessionID, ...}` (`cli/cmd/run.ts:678-692`):
  - `step_start`
  - `text` (only once the part is complete)
  - `reasoning` (only with `--thinking`)
  - `tool_use` (only completed or errored tools)
  - `step_finish` (`part.reason` such as `stop`, `tokens`, `cost`)
  - `error`: `{name:"APIError", data:{message, statusCode, isRetryable,
    responseBody, ...}}`
  - There is no final "done" or result event: success is exit 0 after the
    session goes idle.
- **Exit codes (tested):** 0 on success; 1 on 400, 401, 429 (after retries),
  unknown model or unknown provider (`cli/cmd/run.ts:837-873`). An unknown
  model's error event is only `UnknownError "Unexpected server error"`,
  with the real cause in `$XDG_DATA_HOME/opencode/log/`.

**5. Sessions**
- `initialize` advertises `loadSession: true` and
  `sessionCapabilities {close, fork, list, resume}`
  (`acp/service.ts:112-130`). `session/load` replays history as
  `user_message_chunk` / `agent_message_chunk`; `session/resume` does not
  replay. Both are in `acp/service.ts:211-334`; list is at 249-293.
- Tested: a session created by `opencode run` was resumed by a fresh
  `opencode acp` process, prompted, then loaded with replay. `session/list`
  returned all sessions for the cwd, from both `run` and ACP.
- **The client cannot pick the session id.** `session/new` ignores
  `_meta.sessionId` (tested); ids look like `ses_...`. Read the id from the
  `session/new` result, or from the `sessionID` field of `run` JSON events.
- Storage: SQLite at `$XDG_DATA_HOME/opencode/opencode.db`, overridable with
  `OPENCODE_DB` (an absolute path or `:memory:`) (`core/database/database.ts:43-55`).
  `run --session <id>` / `--continue` / `--fork` resume natively.

**6. Tools and permissions**
- Built-in tools: `read`, `edit`, `write`, `apply_patch`, `bash` (`shell`),
  `glob`, `grep`, `list`, `webfetch`, `websearch` (Exa, opt-in), `task`
  (subagents), `todowrite`, `skill`, `lsp`, `question` (`tool/`). Tested:
  10 tools were sent to the model.
- Edit style: exact string replace (`oldString`/`newString`/`replaceAll`,
  must Read first; `tool/edit.txt`). Models whose id contains `gpt-` (not
  `oss`, not `gpt-4`) get `apply_patch` instead of edit/write
  (`tool/registry.ts:297-300`). DeepSeek, GLM and Qwen get edit/write.
- **Default permissions are permissive** (`agent/agent.ts:119-135`):
  - `"*": "allow"`, so edit, write and bash run without asking
  - `doom_loop: ask`
  - `external_directory: ask` (outside the project, except whitelisted
    temp and skill dirs)
  - `read *.env: ask`
  - `question`, `plan_enter` and `plan_exit` deny
- **Over ACP**, only "ask" rules produce `session/request_permission`:
  - Options `once` (allow_once), `always` (allow_always), `reject`
    (reject_once) (`acp/permission.ts:20-24`).
  - A client error or cancel → reject (`acp/permission.ts:56-82`).
  - Tested: with the defaults, a bash tool call ran with no request. With
    `OPENCODE_PERMISSION='{"bash":"ask"}'` a request arrived. Rejecting it
    marked the tool `failed`, and the turn still ended `end_turn`.
  - The client `fs` and `terminal` capabilities are not used for
    execution: tools run inside OpenCode. On an approved `edit` it
    additionally calls `fs/write_text_file` if the client offers it.
- **`opencode run`**: without `--auto`, any "ask" is **auto-rejected**
  (`cli/cmd/run.ts:800-819`). With `--auto`, it replies `once`. `question`
  and plan tools are denied in non-interactive runs
  (`cli/cmd/run.ts:430-447`).

**`opencode serve`**
- A headless HTTP server (OpenAPI, SSE `/event`) that `run --attach` and
  the SDK talk to. ACP mode starts the same server internally. It is an
  alternative to ACP for a Rust client, but the schema is OpenCode-specific.

**Local mlx_lm.server (OpenAI-compatible)**
- Config, passed per invocation:
  ```sh
  OPENCODE_DISABLE_MODELS_FETCH=1 OPENCODE_DISABLE_AUTOUPDATE=1 \
  OPENCODE_CONFIG_CONTENT='{
    "provider": {"mlx": {"npm": "@ai-sdk/openai-compatible", "name": "mlx",
      "options": {"baseURL": "http://127.0.0.1:8080/v1", "apiKey": "none"},
      "models": {"mlx-community/Qwen3.8-27B-4bit": {"name": "Qwen3.8 27B local",
        "tool_call": true, "reasoning": true,
        "limit": {"context": 131072, "output": 16384}}}}},
    "model": "mlx/mlx-community/Qwen3.8-27B-4bit",
    "enabled_providers": ["mlx"]}' \
  opencode acp      # or: opencode run --format json --dir <cwd> "<prompt>" </dev/null
  ```
- The model key must equal the id mlx_lm.server expects (the served model
  path or repo).
- Verified only against the fake server on the same provider shape, not
  against a real mlx_lm.server. Whether mlx_lm.server emits OpenAI
  `tool_calls` reliably for Qwen3.8: UNVERIFIED.
- Drop `"reasoning": true` if the server rejects `reasoning_effort` (it
  would then be sent at `low` over ACP).

**Hosted Qwen (OpenAI-compatible)**
- Same shape: `baseURL` set to the vendor endpoint and
  `apiKey: "{env:QWEN_KEY}"`. Or use the built-in `alibaba` provider
  (`DASHSCOPE_API_KEY`) if the id is in the catalog.

**DeepSeek and GLM on API keys**
- `DEEPSEEK_API_KEY=... opencode acp` with `model: "deepseek/deepseek-v4-pro"`.
- `ZHIPU_API_KEY=...` with `model: "zai/glm-5.3"` (pay-as-you-go
  `api/paas/v4`).
- Ids missing from the bundled snapshot need either a models fetch or an
  explicit `models` entry under `provider.deepseek` / `provider.zai`.
  Merging a models entry into a built-in provider: UNVERIFIED (tested only
  with custom providers).

**UNVERIFIED / not tested**
- Real DeepSeek, Z.ai or Qwen endpoints (no keys used).
- `session/cancel` mid-turn producing `stopReason: cancelled`.
- `max_tokens` / `refusal` mapping in practice.
- Behaviour of `--attach` with `serve`.

### B. Goose

Checked 2026-10-05. Source: `aaif-goose/goose` at `d7ce0cd` (main, 2026-10-05).
Paths below are relative to `crates/`. Binary tested: release v1.53.0
(`goose-aarch64-apple-darwin.tar.gz`). The experiments ran in a scratch git
repo against a fake OpenAI-compatible server (python; it returns 200, 401, 400
or 429, or a `write` tool call). HOME, XDG and `GOOSE_PATH_ROOT` were isolated
under the scratchpad, with `GOOSE_DISABLE_KEYRING=1`. Nothing touched the
user's config or keychain. "Observed" means I ran it.

**1. Providers and models**
- **DeepSeek.** There is a built-in declarative provider `custom_deepseek`.
  - Engine `openai`, `DEEPSEEK_API_KEY`, base `https://api.deepseek.com`.
  - Catalog: `deepseek-flash`, `deepseek-v4-pro`, `deepseek-reasoner`.
  - The base URL is hard-coded, with no env override.
  - Source: `goose-providers/src/declarative/definitions/deepseek.json:1-43`.
- **GLM / Z.ai.** Three providers:
  - `zai`: engine `anthropic`, key `ZHIPU_API_KEY`, base `${ZAI_BASE_URL}`
    (default `https://api.z.ai/api/anthropic`), models glm-4.5 to glm-5.3
    (`zai.json:1-44`).
  - `zai_coding_plan`: engine `openai`, base
    `https://api.z.ai/api/coding/paas/v4`, `ZAI_CODING_PLAN_API_KEY`
    (`zai_coding_plan.json:1-10`).
  - `zhipu`: engine `openai`, base `${ZHIPU_BASE_URL}` (default
    `https://open.bigmodel.cn/api/paas/v4`) (`zhipu.json:1-17`).
  - For the pay-as-you-go OpenAI-compatible endpoint, use
    `GOOSE_PROVIDER=zhipu ZHIPU_BASE_URL=https://api.z.ai/api/paas/v4 ZHIPU_API_KEY=...`.
    Observed: goose posts to `<ZHIPU_BASE_URL>/chat/completions` (tested on
    the fake server). Whether `api.z.ai/api/anthropic` (the `zai` default)
    bills pay-as-you-go balance or only the Coding Plan: UNVERIFIED.
- **Custom OpenAI-compatible endpoints**, two ways:
  - (a) The `openai` provider with `OPENAI_BASE_URL` (or the older
    `OPENAI_HOST` + `OPENAI_BASE_PATH`) and `OPENAI_API_KEY`. Precedence is in
    `goose/src/providers/openai_def.rs:60-91,262-290`. The key is optional for
    non-openai.com hosts: observed `Authorization` absent when unset.
  - (b) A declarative JSON file in `<config_dir>/custom_providers/<name>.json`
    (`goose/src/config/declarative_providers.rs:22-23`), with fields `name`,
    `engine` (openai|anthropic|ollama), `base_url`, `api_key_env`, `models`,
    `requires_auth`, `dynamic_models`, `headers`
    (`goose-providers/src/declarative.rs:150-200`). Observed working with
    `api_key_env: QWENHOST_API_KEY` and `--provider custom_qwenhost`. This is
    how to keep a hosted Qwen and a local mlx side by side.
- **Anthropic and OpenAI**: built in (`anthropic`, `openai`). There are also
  ACP-delegating providers: `claude-acp`, `codex-acp`, `pi-acp`, `copilot-acp`.
- **Arbitrary model ids: yes.** No catalog entry is needed.
  - Observed: `--model some-arbitrary-id` and
    `session/set_config_option model=totally-unlisted-model-x` were both sent
    verbatim as `"model"`.
  - The catalog only feeds the picker and context limits. An unknown model
    gets a default context of 128000 (observed in `usage_update.size`).
  - The model list for OpenAI-engine providers is fetched from `GET /v1/models`
    (observed).

**2. Per-invocation configuration (no global edits)**
- **Precedence**: env var (exact upper-case key) > config file (`config.yaml`).
  Secrets: env > keyring > `secrets.yaml` when the keyring is disabled
  (`goose/src/config/base.rs:83-91,765-767,905-918`). Every config key can
  be passed as env.
- **Variables:**
  - `GOOSE_PROVIDER` and `GOOSE_MODEL`.
  - `GOOSE_MODE` = `auto|approve|smart_approve|chat` (`base.rs:1263-1280`).
  - `GOOSE_THINKING_EFFORT` (`base.rs:1348`).
  - `GOOSE_DISABLE_KEYRING`.
  - `GOOSE_ADDITIONAL_CONFIG_FILES` (`base.rs:174`).
  - System config is read from `/etc/goose/config.yaml` (`base.rs:157-163`).
- **Config root override: `GOOSE_PATH_ROOT=<abs dir>`.** It moves
  config/data/state to `<root>/config|data|state`
  (`goose/src/config/paths.rs:8-17,40-46`; documented in
  `documentation/docs/guides/environment-variables.md:516`). This is the
  clean way to isolate per run: no user `config.yaml`, extensions or
  sessions leak in. Observed.
- **CLI**: `goose run --provider X --model Y` overrides the env
  (`goose run --help`). `--system <text>` adds instructions.
  `--no-profile` skips the default extensions.
- **Over ACP**, `session/new` returns `configOptions`, and
  `session/set_config_option` accepts four ids: `provider`, `mode`, `model`
  (category `model`) and `thinking_effort`
  (`goose/src/acp/server/dispatch.rs:150-195`). Observed:
  - Arbitrary model values are accepted and used.
  - `session/set_model` (the unstable method) returns -32601 Method not
    found.
  - `session/set_mode` is supported (`dispatch.rs:368`).
  - Endpoint and API key cannot be set over ACP in a portable way. They come
    from env or the config dir; goose has custom `_goose/...` provider/secret
    methods, but those write to the store (not used).
- **Reasoning level is weak for these models.**
  - On OpenAI-engine providers, `reasoning_effort` is sent only for
    o-series, gpt-5/6 and xAI models
    (`goose-provider-types/src/formats/openai.rs:1731-1768,1846-1857`).
  - So for DeepSeek, GLM via `zhipu`, or Qwen on OpenAI-compatible
    endpoints, `GOOSE_THINKING_EFFORT` and `thinking_effort` do nothing.
    Observed: the ACP `thinking_effort` option offers only `off` for an
    unknown model, and `set_config_option thinking_effort=high` returned OK
    but stayed `off`, silently.
  - With the Anthropic-engine `zai` provider, `GOOSE_THINKING_EFFORT=high`
    sent `thinking: {type: enabled, budget_tokens: 16000, clear_thinking: false}`
    (observed).
  - A generic `request_params` passthrough exists in `ModelConfig`
    (`openai.rs:1802-1810`). Whether a user can set it from env or a
    custom-provider JSON: UNVERIFIED (none found).

**3. Headless, cwd, TTY, stdin**
- `goose run -t "<prompt>"` or `-i <file>|-`; `-i -` reads the prompt from
  stdin (observed). With neither, it errors: "Must provide either
  --instructions (-i), --text (-t), or --recipe".
- Runs in the process cwd. No TTY is needed: observed with `</dev/null` and
  piped output.
- **Trap**: without `-q`, the ASCII banner (session id, cwd) goes to
  **stdout**, before the JSON lines. Always pass `-q` with `--output-format`.
- `goose acp` takes the cwd from `session/new.cwd`, which must be absolute
  (`goose/src/acp/server/new_session.rs:47`). Stdout carried only JSON-RPC
  (observed).
- `goose serve` is ACP over HTTP and WebSocket (`goose-cli/src/cli.rs:858`).
- `--with-builtin` adds builtin extensions (`cli.rs:833-847`).

**4. Output and success/failure signalling (observed unless noted)**
- **`goose run --output-format stream-json`** (`-q`) prints one JSON object
  per line:
  - `{"type":"message","message":{...}}`
  - `notification`
  - finally `{"type":"complete","total_tokens",...}` or
    `{"type":"error","error":"..."}`
  - (`goose-cli/src/session/mod.rs:145-170,1539-1560`)
  - There is no session id in the stream.
- **`--output-format json`** prints one object `{messages:[...],
  metadata:{..., status:"completed"|"error"}}`.
- **Exit codes:**

  | Case | Exit | Final event | Status |
  |---|---|---|---|
  | 200 OK | 0 | `complete` | – |
  | 401 | 1 | `error` (error content kind `authentication`) | – |
  | 400 (bad model) | **0** | **`complete`** | `completed` |
  | 429 | **0** | **`complete`** | `completed` |
  | Model answered empty / unparseable | **0** | `complete` | – |
  | `GOOSE_MODE=approve` + tool call | 1 | – | – |

  - For 400, the assistant text reads "Ran into this error: Request failed:
    Bad request (400): ... Please retry ...".
  - For 429, the text reads "Ran into this error: Rate limit exceeded ...".
    goose retried internally: 400 took about 8 s and 429 about 4 s, with
    several requests each.
  - The empty-response case is the text "The model returned an empty
    response. Please resend your message to continue." This was seen when
    the `zai` provider hit a non-Anthropic server.
  - The approve-mode message is "Tool approval required in non-interactive
    mode with GooseMode::approve ... Use GooseMode::Auto for headless
    sessions" (`goose-cli/src/session/mod.rs:1369`).
- **Why**: the agent loop turns any provider error other than
  auth/credits/context/refusal into a plain **assistant text** message
  (`goose/src/agents/agent.rs:3290-3300`). `headless_run_error` flags only a
  typed `MessageContent::Error` (`goose-cli/src/session/mod.rs:2611-2628`),
  and only auth, context-length and credits errors are typed
  (`goose-provider-types/src/conversation/message.rs:270-278`).
- **ACP, the same trap as codex-acp:**
  - 400 and 429 give `stopReason: "end_turn"`, with the error as an
    `agent_message_chunk` text.
  - 401 gives a JSON-RPC error `{"code":-32000,"message":"Authentication required"}`
    on `session/prompt`.
  - Credits exhausted gives -32603 with `data.reason`.
  - Stream errors give -32603 "Error in agent response stream".
  - Source: `goose/src/acp/server.rs:1655-1690,2147-2236`.
  - Stop reasons are only `end_turn`, `max_tokens` or `cancelled`
    (`server.rs:736-744`).
  - A weak tell: a successful turn's `PromptResponse` carried `usage`, while
    error turns had none (first turn in a session only; it may not hold in
    resumed sessions, UNVERIFIED).
- `usage_update` (used/size) is emitted per turn.

**5. Sessions**
- **Store**: SQLite at `<data_dir>/sessions/sessions.db`
  (`goose/src/session/session_manager.rs:29-30`). The default on Unix is
  `~/.local/share/goose/sessions/sessions.db`
  (`documentation/docs/guides/logs.md:13`); under `GOOSE_PATH_ROOT` it is
  `<root>/data/sessions/sessions.db` (observed).
- Full LLM request logs go to `<state>/logs/llm_request.N.jsonl` (observed).
  This matters for disk use and secrets hygiene.
- **IDs are server-chosen** (`YYYYMMDD_N`); the client cannot pick them.
  `session/load` of an unknown id gives -32002 "Resource not found"
  (observed).
- **ACP** advertises `loadSession: true` and `sessionCapabilities`
  {list, delete, close}. There is **no `resume`**: observed
  `session/resume` → -32601 (`goose/src/acp/server.rs:1825-1832`).
  - `session/list` works and reports `_meta.providerId` and `modelId`.
  - `session/load` in a fresh process replayed history
    (`user_message_chunk`, `tool_call`, ...) and the next prompt continued
    with cumulative tokens (observed).
  - The session keeps its stored mode: a session created under `approve`
    stayed `approve` when loaded with `GOOSE_MODE=auto` in env (observed).
  - Also supported: `session/fork` (unstable) and `session/delete`.
- **Native**:
  - `goose run -n <name>` lets the caller pick a **name**, and
    `goose run -n <name> --resume -t ...` continues it (observed).
  - Alternatively `--resume --session-id <id>`.
  - `--no-session` disables persistence.
  - `goose session list -f json`.

**6. Tools and permissions**
- **Built-in tools**: the `developer` extension provides `shell`, `write`,
  `edit`, `tree`, `read_image`, `analyze` (plus `load`, `load_skill`,
  `delegate`, extensionmanager and apps tools). 17 tools were sent to the
  model by default (observed from the request log).
- **Edit style**: exact unique find/replace, `edit{path, before, after}`;
  `write{path, content}` overwrites the whole file.
- **Shell** runs under `bash` (`GOOSE_SHELL` overrides).
- Over ACP, goose does its own fs and shell even when the client advertises
  no `fs` or `terminal` (observed: the file was written with
  `clientCapabilities: {}`).
- **Modes**: `auto` (no prompts), `approve`, `smart_approve`, `chat`. The
  default for new sessions comes from `GOOSE_MODE`, else config.
- **ACP + `approve`**: goose sends `session/request_permission` with
  `toolCall {kind:"other", title:"write · hello.txt", rawInput}` and options
  `allow_always`/`allow_once`/`reject_once`/`reject_always` (observed;
  `server.rs:1588-1626`). A failed permission request is treated as Cancel.
  In `auto`, no request is sent (observed).
- **Headless `goose run`** must use `auto`; `approve` and `smart_approve`
  fail with exit 1.
- MCP servers from `session/new.mcpServers` (stdio, http) are added as
  extensions (`server.rs:490-520`).

**7. License, maturity, install**
- Apache-2.0, about 55k stars, Rust (single static binary, about 260 MB
  unpacked).
- The repo moved from `block/goose` to `aaif-goose/goose`; the registry
  still links `block/goose`.
- Releases are roughly weekly: v1.53.0 (2026-10-02), v1.52.0 (09-23),
  v1.51.0 (09-17), v1.50.x (09-08/09-14).
- **Install**: GitHub release tarball (`goose-aarch64-apple-darwin.tar.gz|.bz2`),
  `download_cli.sh`, or Homebrew (UNVERIFIED for the brew formula name).
- ACP registry entry `goose/agent.json`, v1.53.0, launches `./goose acp`
  (registry `8ed458f`).
- The ACP server is large: about 11.8k lines in `goose/src/acp/*.rs`, plus
  many `_goose/*` custom methods. It is first-party, used by Goose Desktop.

**Local mlx_lm.server (OpenAI-compatible at http://127.0.0.1:8080/v1)**
- **Simplest** (observed against the fake server, same shape):
  ```
  GOOSE_PATH_ROOT=/abs/run-root GOOSE_DISABLE_KEYRING=1 GOOSE_MODE=auto \
  GOOSE_PROVIDER=openai OPENAI_BASE_URL=http://127.0.0.1:8080/v1 \
  GOOSE_MODEL=<model id as served, e.g. mlx-community/Qwen3.8-27B-4bit> \
  goose run -q --output-format stream-json -t "<prompt>"     # or: goose acp
  ```
  No `OPENAI_API_KEY` is needed for a non-openai.com host.
- **Or a custom provider** in `$GOOSE_PATH_ROOT/config/custom_providers/custom_mlx.json`:
  ```json
  {"name":"custom_mlx","engine":"openai","display_name":"mlx","api_key_env":"",
   "base_url":"http://127.0.0.1:8080/v1/chat/completions","models":[],
   "dynamic_models":true,"requires_auth":false,"supports_streaming":true}
  ```
  Shape copied from `omlx.json`/`lmstudio.json`; this exact file is
  UNVERIFIED, but the keyed variant was observed working.
- goose always streams (`stream: true`, `stream_options.include_usage`) and
  sends 17 tool schemas. Tool-call quality then depends on mlx_lm.server's
  tool-call parsing for Qwen: UNVERIFIED, not run against real mlx.
- There is a built-in `omlx` provider (`OMLX_HOST`, default
  `http://localhost:8000`) for oMLX; that is a different server from
  mlx_lm.server.

**Verdict notes for the Attractor**
- Strong:
  - Arbitrary model ids.
  - DeepSeek and GLM built in.
  - Isolation via `GOOSE_PATH_ROOT` and env.
  - ACP `model` / `provider` / `mode` config options.
  - `session/load` and `list`.
- Weak:
  - 400, 429 and empty responses end as success (exit 0 / `end_turn`) with
    error text. The Attractor must inspect the text or the absence of usage.
  - No reasoning control for DeepSeek or Qwen on OpenAI engines.
  - No `session/resume`.
  - Ids are server-chosen (use `-n name` natively).
  - Stdout banner without `-q`.

### C. Qwen Code

Checked 2026-10-05. Source: `QwenLM/qwen-code` at `dd82140` (main, 2026-10-05).
Binary tested: npm `@qwen-code/qwen-code@0.25.0`, installed under the
scratchpad. All runs used an isolated `HOME`/`QWEN_HOME`, a scratch git repo,
and a fake OpenAI-compatible server (Python) that returned 200 (streamed),
401, 400 or 429, or a `run_shell_command` tool call. "Tested" below means
observed in those runs. Paths are relative to the repo root.

**Maturity, license, install (Q7)**
- Apache-2.0. About 28.3k stars. Forked from Gemini CLI v0.8.2.
- Latest release v0.25.0 (2026-10-05), with nightlies every day. The ACP
  registry still pins 0.24.7: `npx @qwen-code/qwen-code@0.24.7 --acp
  --experimental-skills` (`registry/qwen-code/agent.json` at registry
  `8ed458f`).
- Runtime is Node >= 22 (`package.json` `engines`); the bin is `qwen`. It
  installs with `npm i @qwen-code/qwen-code`.
- The codebase is very large (`acpAgent.ts` alone is 16.7k lines), with many
  daemon/"channel" features. Expect churn.

**1. Providers and models**
- Auth types: `openai`, `openai-responses`, `anthropic`, `gemini`,
  `vertex-ai`, `qwen-oauth` (`qwen --help`, `--auth-type`). The free Qwen
  OAuth tier ended 2026-04-15.
- Env mapping per auth type (`packages/core/src/models/constants.ts:74-104`):
  - `openai`: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` or
    `QWEN_MODEL`.
  - `anthropic`: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`.
  - `gemini`: `GEMINI_API_KEY`, `GEMINI_MODEL`.
- **Arbitrary model ids are accepted (tested).** `OPENAI_MODEL=my-arbitrary-model`
  was sent verbatim; no catalog entry was needed.
- Provider adapters exist for DeepSeek and Z.ai. They are picked by hostname
  (`api.deepseek.com`; `z.ai`, `bigmodel.cn`), or by a `deepseek`/`glm-*`
  model name for the broader routing
  (`packages/core/src/core/openaiContentGenerator/provider/deepseek.ts:42-68`,
  `zai.ts:25-60`). Other adapters: dashscope, openrouter, mistral, minimax,
  fireworks, cerebras, modelscope, mimo.
- The docs give a DeepSeek example: `baseUrl https://api.deepseek.com/v1`,
  `envKey DEEPSEEK_API_KEY` (`docs/users/configuration/model-providers.md:848-856`).
- GLM on the Z.ai pay-as-you-go endpoint: a `modelProviders.openai` entry
  with `baseUrl https://api.z.ai/api/paas/v4`. The hostname gate matches
  `z.ai`. Not tested against the real endpoint (UNVERIFIED).
- Many models at once: `modelProviders` in `settings.json`. Each key is an
  auth type (or a custom id plus `providerProtocol`), holding a
  `ModelConfig[]` of `{id, envKey, baseUrl, generationConfig}`. Keys are read
  from `process.env[envKey]`, never stored (`model-providers.md:7`).

**2. Per-invocation configuration without touching global config**
- CLI flags: `-m/--model`, `--auth-type`, `--openai-api-key`,
  `--openai-base-url`, `--approval-mode`/`--yolo`, `--system-prompt`,
  `--append-system-prompt`, `--bare`, `--safe-mode`, `--fallback-model`.
  There is no CLI flag for reasoning effort.
- Env: `OPENAI_*` as above.
- `QWEN_HOME` relocates the whole `~/.qwen` (settings, sessions, usage)
  (`packages/core/src/config/storage.ts:193-203`).
  - `HOME` must exist, otherwise startup fails with ENOENT (tested).
  - `QWEN_HOME` without a `settings.json` only prints a warning.
- `QWEN_CODE_SYSTEM_SETTINGS_PATH` (and `QWEN_CODE_SYSTEM_DEFAULTS_PATH`)
  points at a settings file the orchestrator owns
  (`packages/cli/src/config/storage-paths-lite.ts:171-196`).
  - Merge order is System Defaults → User → Workspace → System, so system
    settings win (`packages/cli/src/config/settings.ts:1076`).
  - Tested: a system settings file with `modelProviders` + `model.name` +
    per-model `envKey` drove DeepSeek-, GLM- and local-style entries in one
    run.
- Caveat: the workspace `<cwd>/.qwen/settings.json` of the target project
  also merges, below System. `--bare` drops implicit discovery.
- Model resolution precedence: modelProvider selection > CLI > env >
  settings > defaults (`packages/core/src/models/modelConfigResolver.ts:13-18`).
- Reasoning: `generationConfig.reasoning: false | {effort, budget_tokens}`,
  ladder none/low/medium/high/xhigh/max
  (`packages/core/src/core/contentGenerator.ts:155-173`). It is mapped per
  host (`model-providers.md:871-883`):
  - DeepSeek host: flat `reasoning_effort`, and it sends
    `thinking:{type:disabled}` when reasoning is off.
  - Z.ai host with GLM-5.2+: flat `reasoning_effort`, `max` allowed.
  - Generic host: nested `reasoning:{effort}` capped at `xhigh`. Tested:
    `max` was sent as `{"reasoning":{"effort":"xhigh"}}` to a 127.0.0.1
    base URL.
  - Trap: setting `samplingParams` drops the injected reasoning field
    (`model-providers.md:893`).
  - `extra_body` passes raw keys, for example `chat_template_kwargs`.
- **Over ACP (tested):**
  - `session/new` returns `configOptions`:
    - `mode` (category `mode`): plan/default/auto-edit/auto/yolo.
    - `model` (category `model`).
    - `reasoning_effort` (category `thought_level`), only when the model
      has reasoning configured.
  - `session/set_config_option` handles `mode`, `model` and
    `reasoning_effort` (`packages/cli/src/acp-integration/acpAgent.ts:6780-6945`).
  - `unstable_setSessionModel` and `setSessionMode` also exist (`:6746-6778`).
  - **Model switching over ACP is limited to models the agent already knows**:
    the env model, or `modelProviders` entries.
    - `set_config_option model=another-model-xyz` gave
      `-32602 Model 'another-model-xyz' not found for authType 'openai'`.
    - `reasoning_effort` on a bare env model gave
      `-32602 Reasoning is not supported by the current model`.
    - With `modelProviders` in a system settings file, switching
      `deepseek-v4-pro(openai)` → `glm-5.3(openai)` mid-session worked, and
      each model used its own `envKey` and `baseUrl`. The session's reasoning
      selection carried over to the new model.
  - Model option ids look like `glm-5.3(openai)`, or
    `$runtime|openai|<id>(openai)` for an env-only model.
  - Practical recipe: one system settings file listing every model, then
    pick per node with `set_config_option`, or with `model.name` / `-m` at
    launch.

**3. Headless, cwd, TTY, stdin**
- Headless is `qwen "<prompt>" -o json|stream-json`; `-p` is deprecated in
  favour of the positional prompt.
- A prompt with json/stream-json output is non-interactive. With no prompt,
  it is interactive only if stdin is a TTY (`packages/cli/src/config/config.ts`,
  around the `interactive` block near 1944-1967).
- No TTY is needed.
- cwd is the process cwd. ACP `session/new` takes `cwd`.
- stdin: "Appended to input on stdin (if any)". Tested: an open, silent
  stdin pipe did not block; it exited in 1s. `--input-format stream-json`
  gives bidirectional stdin.
- Folder trust is off by default (`settingsSchema.ts:3520-3526`). If it is
  enabled and the folder is untrusted, the approval mode is forced to
  `default`.

**4. Output and success/failure**
- Headless stream-json (tested) emits:
  - `system/init` (session_id, tools, model, permission_mode)
  - `assistant` messages
  - a final `result` event with `subtype` `success` or
    `error_during_execution`, plus `is_error`, `num_turns`, `usage` and
    `error.message`.
- `-o json` prints one JSON array of the same events.
- Exit codes (tested): 0 on success; 1 on provider 401 or 400 (bad model).
- Fatal exit codes (`packages/core/src/utils/errors.ts:311-364`): 41 auth,
  42 input, 44 sandbox, 52 config, 53 turn limit, 54 tool execution, 55
  budget (`--max-wall-time`, `--max-tool-calls`), 130 cancel.
- Trap: on 401/400 the `assistant` message text is
  `[API Error: 401 Invalid API key]`. Use `result.is_error` and the exit
  code, not the text.
- **ACP errors do not end as `end_turn` (tested).** 401 and 400 come back as a
  JSON-RPC error on `session/prompt`:
  `{"code":-32603,"message":"Internal error","data":{"details":"401 Invalid API key"}}`.
  No `end_turn` trap. Success returns `stopReason:"end_turn"` plus
  `_meta.qwen.branchPoint`. Other stopReasons in code: `cancelled`,
  `max_tokens`, and a loop-detected path (`rejectOnLoopDetected`, exact value UNVERIFIED)
  (`packages/cli/src/acp-integration/session/Session.ts` ~6188-7193).
- **429 retries for a long time with no sign (tested).**
  - Headless printed `Retrying in 60s (attempt 1/10)` on stderr and was still
    retrying when killed at 120s (28 requests).
  - Over ACP there was no `session/update` and no response for over 150s
    (28 requests).
  - `generationConfig.maxRetries: 0` still took 82s and 7 requests before
    `error_during_execution` / exit 1. The default retry ladder is
    `maxAttempts: 7, initialDelayMs: 1500, maxDelayMs: 30000`
    (`packages/core/src/utils/retry.ts:99-102`), and a 10-attempt
    rate-limit loop sits on top.
  - Knobs: `retryInitialDelayMs`, `retryMaxDelayMs`, `retryErrorCodes`,
    `--fallback-model` (429/503/529). Exactly which knob fails a 429 fast is
    UNVERIFIED. The orchestrator needs its own timeout.
- `usage_update` is emitted on ACP (`used`, `size`).
- ACP vendor extensions seen on the wire:
  - notifications `qwen/notify/session/mode-update` and `model-update`;
  - a client-bound JSON-RPC request `craft/drainMidTurnQueue` (with an id).
    The test client ignored it and the turn still finished. A strict client
    should answer method-not-found.

**5. Sessions**
- Native:
  - Files are `$QWEN_HOME/projects/<cwd-with-dashes>/chats/<uuid>.jsonl`
    (tested; `packages/core/src/services/sessionService.ts:948-965`).
  - `--session-id <uuid>` picks the id; it must be a UUID, and an id that
    already exists errors with exit 1 (tested; `config.ts:815-817`, `:2382`).
  - `--resume <id>`, `-c/--continue` and `--fork-session` exist. Tested:
    `--resume <id> -o stream-json "second"` succeeded on the same session id.
  - `--chat-recording false` disables saving.
  - There is a `qwen sessions` subcommand.
- ACP:
  - `initialize` advertises `loadSession:true` and
    `sessionCapabilities:{list,resume}` (`acpAgent.ts:5427-5436`).
  - Tested `session/list` (filtered by cwd), `session/resume` (then prompting
    on the same id worked), and `session/load` (replays the history as
    `user_message_chunk`/`agent_message_chunk`).
  - The client picks the id with `session/new` `_meta:{"qwen-code/sessionId":"<uuid v1-5>"}`
    (tested; key in `packages/acp-bridge/src/bridgeTypes.ts:513`, check at
    `acpAgent.ts:5662-5680`).

**6. Tools and permissions**
- Built-in tools: `read_file`, `write_file`, `edit` (string-replace style,
  UNVERIFIED exact semantics), `run_shell_command`, `glob`, `grep_search`,
  `web_fetch`, `agent` (subagents), `notebook_edit`, `todo`/goal, `monitor`,
  `tool_search`, `skill`, MCP.
- **Headless default mode is `auto`, and it hides the mutating tools (tested).**
  - With no flag, init shows `permission_mode:"auto"`. The tools sent to the
    model lacked `write_file`, `edit` and `run_shell_command`. The same was
    true for `--approval-mode default`.
  - Only `--yolo` / `--approval-mode yolo` exposed them, which matches the
    docs (`docs/users/features/headless.md:306`).
  - For headless edits use `--yolo` or `--allowed-tools ...`.
- ACP default mode is also `auto`, but all tools are exposed (tested).
  - In `auto`, a harmless `echo hi > shell.txt` ran without a permission
    request.
  - In `default`, `session/request_permission` offered:
    `proceed_always_project` (allow_always), `proceed_always_user`
    (allow_always), `proceed_once` (allow_once), `cancel` (reject_once). The
    toolCall carried `kind:"execute"`, `rawInput.command` and
    `_meta.toolName`.
  - Picking an `always` option persists an allow rule to project or user
    settings (UNVERIFIED where exactly). An orchestrator should pick
    `proceed_once`, or set `mode=yolo` through `set_config_option` (tested).
- `--max-wall-time` and `--max-tool-calls` apply to `-p` only, not to ACP
  sessions (`headless.md:324`).

**Local mlx_lm.server**
- Env-only (headless or ACP):
  `OPENAI_BASE_URL=http://127.0.0.1:8080/v1 OPENAI_API_KEY=none
  OPENAI_MODEL=<model id as served> qwen --auth-type openai --yolo -o
  stream-json "<task>"`. The same shape worked against the fake server on
  127.0.0.1.
- Settings form, in the `QWEN_CODE_SYSTEM_SETTINGS_PATH` file:

  ```json
  {"security":{"auth":{"selectedType":"openai"}},
   "model":{"name":"mlx-community/Qwen3.8-27B-4bit"},
   "modelProviders":{"openai":[{"id":"mlx-community/Qwen3.8-27B-4bit",
     "envKey":"LOCAL_KEY","baseUrl":"http://127.0.0.1:8080/v1",
     "generationConfig":{"contextWindowSize":131072}}]}}
  ```

  With `LOCAL_KEY=none` in the env. This exact JSON shape was accepted
  (tested against the fake server, not against real mlx_lm.server).
- Whether mlx_lm.server tolerates the extra `stream_options`, `tools`,
  `max_tokens` and `reasoning` fields, and whether its tool-call parsing works
  with Qwen Code's tool schemas, is UNVERIFIED.
- Disabling thinking on a local Qwen needs `extra_body`/`samplingParams`
  (for example `chat_template_kwargs`); whether mlx_lm.server honours it is
  UNVERIFIED.
- Each request asked for `max_tokens`. The context window for unknown ids
  defaults to the reported `contextLimit` 200000 (ACP `_meta`). Set
  `contextWindowSize` for small local models.

**Corrections to acp.md**
- acp.md says ACP auth offers only "Use OpenAI API key". That is still true
  (`authMethods.ts:13-18`, method `openai` with `--auth-type=openai`).
- But "any OpenAI-compatible endpoint works" needs a caveat: over ACP,
  **model switching is limited to pre-declared models**, so declare them in
  `modelProviders`.
- The registry version is 0.24.7; the current release is 0.25.0.

### D. Other model-agnostic ACP agents (brief)

Registry at `8ed458f` has 48 agents. The registry quarantines `fast-agent`,
`crow-cli`, `vtcode`, `deepagents`, `qoder`, `minion-code` and
`agoragentic-acp` (`quarantine.json`). Only the entries relevant to running
DeepSeek, GLM and Qwen on keys or local endpoints:

- **Kimi Code CLI** (`MoonshotAI/kimi-code@21406fb`; MIT; about 7.8k stars;
  npm `@moonshot-ai/kimi-code` 2.1.1, 2026-09-24; Node).
  - **Not the registry entry**, which is the archived Python `kimi-cli`
    (Apache-2.0, 1.52.0).
  - `kimi acp` implements the whole v1 session surface: load, resume, list,
    fork, close, delete, `set_config_option` (model, thinking, mode) and
    `set_model` (`docs/en/reference/kimi-acp.md`).
  - Provider types: `kimi`, `anthropic`, `openai` (it names DeepSeek and
    Qwen as working, and handles `reasoning_content`), `openai_responses`,
    `google-genai` and `vertexai` (`docs/en/configuration/providers.md:9-14,86`).
  - Per-run config:
    - `KIMI_MODEL_NAME`, `_API_KEY`, `_PROVIDER_TYPE`, `_BASE_URL` and
      `_THINKING_EFFORT` build a temporary provider in memory;
    - `KIMI_CODE_HOME` relocates the config;
    - shell `*_API_KEY` vars are **not** read otherwise
      (`docs/en/configuration/env-vars.md:104-133`).
  - **Trap:** a failed turn maps to `stopReason: end_turn`; only auth errors
    become a JSON-RPC `auth_required` error
    (`packages/acp-server/src/events-map.ts:47-75`,
    `packages/acp-server/src/session.ts:908-918`).
  - Nothing was installed or run.
- **Cline CLI** (`cline/cline@68b24a9`; Apache-2.0; about 70k stars; npm
  `cline` 3.0.68; Node).
  - `cline --acp`. Root flags: `-P/--provider`, `-k/--key`, `-m/--model`,
    `--thinking <level>`, `--config <dir>`, `--data-dir`, `--auto-approve`,
    `--json`, `--id <session>` (`apps/cli/src/commands/program.ts`).
  - The base URL for `openai-compatible` is set with `cline auth -b`, which
    writes to the config dir, so point `--config` at a per-run dir.
  - Errors: a fatal session error is thrown as a JSON-RPC error
    (`toAcpPromptError`). Otherwise the finish reasons map as: completed →
    `end_turn`, aborted → `cancelled`, max_iterations →
    `max_turn_requests`, **mistake_limit → `end_turn`**
    (`apps/cli/src/acp/acpAgent.ts:354-399,944-957`).
  - It has `session-load` support (test file present). Resume/list:
    UNVERIFIED. Not run.
- **Kilo CLI** (`Kilo-Org/kilocode@a93088b`; MIT; about 27.5k stars; v7.8.3,
  2026-10-01). An OpenCode fork, launched as `kilo acp` (registry). The ACP
  layer matches OpenCode's file for file, with `kilocode_change` patches,
  and the env vars are renamed `KILO_CONFIG`, `KILO_CONFIG_DIR` and
  `KILO_CONFIG_CONTENT`. Expect OpenCode's behaviour, but it is UNVERIFIED
  whether error mapping and permissions are unchanged. No reason to pick it
  over upstream OpenCode.
- **Crush** (`charmbracelet/crush@8da3490`; FSL-1.1-MIT; v0.97.1). **No ACP.**
  Only a comment in `internal/backend/backend.go:3` anticipates an "ACP"
  layer. `crush run` takes `-m`, `--reasoning-effort` and `-s/--session`,
  and outputs text only (`internal/cmd/run.go:168-174`). Out.
- **mini-swe-agent** (MIT; v2.4.6, 2026-07-23). No ACP. It has only a bash
  tool and no edit tool; models go through litellm (README:30,42). It is a
  benchmark harness, not a node handler. Out.
- **DeepSeek Harness `dsh`** (covered in acp.md; MIT; alpha). It is
  model-agnostic too:
  - Built-in providers include `zai`, `moonshotai`, `openai` and
    `anthropic`.
  - Custom providers speak `openai-completions`, `openai-responses` or
    `anthropic-messages`, with any base URL and hand-entered model ids. They
    are configured in `$DSH_HOME/profiles/<profile>/cordis.patch.yml`
    (`docs/user/guide/providers.md:17-46`).
  - Over ACP, a failed turn is **rejected with a JSON-RPC internal error**
    ("turn failed: ..."), not `end_turn` (`packages/acp/acp/src/session.ts:490-513`).
    A hook-blocked turn maps to `end_turn` (`src/codec.ts:27-29`).
  - It is a credible candidate, but it is a prerelease that promises
    breaking changes, it is not in the registry, and its config is a
    per-profile YAML patch. Not run.
- **Others** in the registry that are multi-provider but niche, unproven or
  quarantined: `fast-agent` (Python, quarantined: initialize timeout),
  `vtcode` (Rust, about 870 stars), `crow-cli`, `dimcode`, `kimchi`,
  `sigit`, `harn`. `glm-acp-agent` is Coding Plan only (acp.md). Not
  evaluated further.

## Open questions

- **Real endpoints.** No tests used real keys. Still to check:
  - DeepSeek V4: does OpenCode's interleaved `reasoning_content` work, and
    does Qwen Code's flat `reasoning_effort` work?
  - Z.ai pay-as-you-go `api/paas/v4` with `glm-5.3`: OpenCode adds
    `thinking.clear_thinking`; Qwen Code uses its host adapter.
  - Goose: does the Anthropic-engine `zai` default
    (`api.z.ai/api/anthropic`) bill pay-as-you-go?
- **mlx_lm.server.** Does it parse Qwen3.8 tool calls into OpenAI
  `tool_calls`, and does it tolerate `stream_options`, `reasoning_effort` /
  nested `reasoning`, and 10 to 17 tool schemas? This decides whether any
  harness works locally. Run one smoke test per harness.
- **Bounding 429s.** Which setting makes a 429 fail fast:
  - Qwen Code: `retryErrorCodes`, `maxRetries` or another;
  - OpenCode: an uncapped `retry-after`.
  Or does the Attractor rely only on its own timeout plus `session/cancel`?
- **OpenCode catalog ids.** Can a `models` entry be merged into the built-in
  `deepseek` / `zai` providers to add an id missing from the bundled
  snapshot, or must the Attractor define custom providers for everything?
- **OpenCode `cancelled`.** Does `session/cancel` mid-turn give
  `stopReason: cancelled` (not tested), and does an aborted turn leave
  partial edits (Q29 says keep partial work)?
- **Qwen Code's vendor request.** Qwen Code sends `craft/drainMidTurnQueue`
  as a client-bound request. Should the Attractor's ACP client answer
  unknown requests with method-not-found? Recommended for every agent.
- **Kimi Code and dsh.** They were read but not run. Is either worth a spike
  if OpenCode fails on the real endpoints?
