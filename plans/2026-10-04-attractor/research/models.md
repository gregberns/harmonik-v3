# Models: Qwen local, DeepSeek, GLM

All facts checked 2026-10-04 unless marked otherwise. "(unverified)" means
the fact comes from a secondary source or an inference, not a primary page.

## Summary

- **"Qwen 3.8" is real.** Qwen3.8 shipped in August 2026: Qwen3.8-27B
  (dense, Apache 2.0), Qwen3.8-Flash-Next (125B MoE, 6B active, community
  licence) and Qwen3.8-2.4T-A95B (the open Max). On this Mac (Apple M1 Max,
  64 GB) only **Qwen3.8-27B** fits: about 16 GB at Q4, 29 GB at Q8. The
  smallest Flash-Next quant is 72.5 GB.
- **Local serving:** Ollama, llama.cpp `llama-server` and LM Studio all
  serve OpenAI-compatible *and* Anthropic-compatible (`/v1/messages`)
  endpoints, so Claude Code, Pi, OpenCode and Qwen Code can all reach a
  local Qwen. mlx-lm's server is OpenAI-only. Tool calling works but is
  fragile: Ollama has open bugs in its `qwen3coder` XML parser and in how it
  maps reasoning effort for Qwen3.8.
- **DeepSeek:** current models are DeepSeek-V4.1-Flash (`deepseek-flash`)
  and DeepSeek-V4-Pro-0813 (`deepseek-v4-pro`), both with 1M context and MIT
  weights. OpenAI base `https://api.deepseek.com`, Anthropic base
  `https://api.deepseek.com/anthropic`, with a documented Claude Code setup.
  API only, no coding plan. DeepSeek has its own harness, DeepSeek Harness
  (`dsh`, MIT, developer preview), and also documents Claude Code, OpenCode
  and Copilot CLI.
- **GLM:** current models are GLM-5.3 and GLM-5.3-Flash (August 2026),
  with 1M context and open weights. The GLM Coding Plan (from $18 a month)
  is limited to a list of supported tools. That list includes Claude Code,
  **Pi**, OpenCode, Codex, Goose and Crush; any other use of the plan key
  breaks its terms. Claude Code is Z.ai's lead integration. Neither model
  fits locally; the older GLM-4.7-Flash (30B-A3B) does.
- **Nothing to install now.** All three are reachable through an
  Anthropic-compatible endpoint, so Claude Code with a different
  `ANTHROPIC_BASE_URL` covers all three. Pi and OpenCode also cover all
  three through OpenAI-compatible endpoints.

## Facts

### Operator's machine

- `sysctl -n machdep.cpu.brand_string` gives `Apple M1 Max`;
  `sysctl hw.memsize` gives 68719476736, so 64 GB of unified memory.
  Checked locally on 2026-10-04.
- By default macOS lets the GPU use about 75% of unified memory, roughly
  48 GB here; `iogpu.wired_limit_mb` can raise that (unverified, general
  knowledge). In practice, keep model plus KV cache under about 45 GB.
- Installed locally: `mlx_lm.server` (mlx-lm v0.31.3, via uv). Ollama,
  llama-server and LM Studio (`lms`) are not on PATH.

### Qwen

Releases, newest first (Hugging Face API
`https://huggingface.co/api/models?author=Qwen`):

| Model | Released (HF) | Type | Params | Context | License | Fits on 64 GB Mac? |
|---|---|---|---|---|---|---|
| Qwen3.8-Flash-Next | 2026-08-24 | MoE + n-gram embedding, vision | 125B total, 6B active (+51B n-gram embedding, 4B MTP); ~180B on disk | 262,144 native, up to 1M with YaRN | Qwen Community License 1.0 | No: smallest GGUF (UD-IQ1_S) is 72.5 GB |
| Qwen3.8-27B | 2026-08-14 | Dense, vision-language, thinking on by default | 27B | 262,144 native, up to 1M with YaRN | Apache 2.0 | **Yes**: Q4_K_M 16 GB, Q6_K 21 GB, Q8_0 29 GB |
| Qwen3.8-2.4T-A95B (open "Max") | 2026-08-12 | MoE | 2.4T total, 95B active | 262,144 native, up to 1,010,000 | `qwen3.8-max` (custom) | No |
| Qwen3.6-27B | 2026-04-21 | Dense | 27B | (not checked) | Apache 2.0 | Yes |
| Qwen3.6-35B-A3B | 2026-04-15 | MoE, agentic-coding focus | 35B total, 3B active | (not checked) | Apache 2.0 | Yes: Q4_K_M 22 GB, Q8_0 36 GB; faster than the dense 27B |
| Qwen3-Coder-Next | 2026-01-30 | MoE, coding-only | ~80B on disk (3B active, unverified) | (not checked) | Apache 2.0 | Only just, at Q4 (~45 GB, unverified) |

- Sources: model cards at https://huggingface.co/Qwen/Qwen3.8-27B,
  https://huggingface.co/Qwen/Qwen3.8-Flash-Next and
  https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B (README, config.json,
  LICENSE); repo https://github.com/QwenLM/Qwen3.8; GGUF sizes from
  https://huggingface.co/unsloth/Qwen3.8-27B-GGUF,
  https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF and
  https://huggingface.co/unsloth/Qwen3.8-Flash-Next-GGUF.
- Hosted Qwen3.8-Max: previewed 2026-07-19, launched 2026-08-03 at $2 input
  / $6 output / $0.25 cached per 1M tokens (unverified, from
  https://www.marktechpost.com/2026/08/03/alibaba-qwen-releases-qwen3-8-max/).
- Coding focus: there is no Qwen3.8-Coder. The Qwen3.8 cards stress
  "coding, professional work ... long-horizon agentic tasks" and "broader
  support for popular harnesses". Qwen reports its coding benchmarks
  (SWE-bench Pro, NL2Repo, DeepSWE) **run in the Claude Code harness**, and
  SkillsBench in OpenCode (Qwen3.8-2.4T-A95B card footnotes). The latest
  dedicated coder is Qwen3-Coder-Next (2026-01).
- Thinking control: thinking is on by default. `reasoning_effort` takes
  `xhigh` (default), `medium` or `low`, and `preserve_thinking` keeps
  reasoning from earlier turns. Recommended thinking-mode sampling:
  `temperature=1.0, top_p=0.95, top_k=20` (Qwen3.8-27B card).
- Server-side tool-call parser: the Qwen3.8 repo's vLLM/SGLang commands use
  `--tool-call-parser qwen3_coder`, the XML-style `<function=...>`
  `<parameter=...>` format (https://github.com/QwenLM/Qwen3.8).
- Qwen's own subscription: the QwenCloud Token Plan. Personal tiers are
  $6 (Lite, limited time), $10, $18 and $68 a month; Team tiers are $20,
  $75 and $200 per seat. It is "compatible with the OpenAI and Anthropic
  API protocols. Any tool that supports a custom Base URL and API Key can be
  integrated." Anthropic base:
  `https://token-plan.maas.qwencloudapi.com/apps/anthropic`; pay-as-you-go:
  `https://maas.qwencloudapi.com/apps/anthropic`. Models include
  qwen3.8-max, qwen3.8-flash, glm-5.2 and deepseek-v4-pro.
  Sources: https://docs.qwencloud.com/coding-plan/faq and
  https://docs.qwencloud.com/developer-guides/clients-and-developer-tools/claude-code.
- Vendor harness: **Qwen Code** (github.com/QwenLM/qwen-code). Its
  `~/.qwen/settings.json` `modelProviders.openai` entries take any
  OpenAI-compatible `baseUrl`, for example Ollama at
  `http://localhost:11434/v1`
  (https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/).
  Qwen's own benchmarks use Claude Code, though.

#### Serving Qwen locally on this Mac

| Runtime | OpenAI-compat | Anthropic-compat `/v1/messages` | Qwen3.8 available | Tool calling notes | Source |
|---|---|---|---|---|---|
| **Ollama** | `http://localhost:11434/v1` | Yes, with tools and tool results. Claude Code: `ANTHROPIC_BASE_URL=http://localhost:11434`, `ANTHROPIC_AUTH_TOKEN=ollama` | `qwen3.8:27b` (18 GB) and `qwen3.8:27b-mlx`, 256K context, "vision tools thinking" | Open bugs: #18563 (2026-09-21), the `qwen3coder` parser rejects long file-write tool calls and returns the error as the answer; #17906, `/v1/messages` maps `xhigh` to `high`, which breaks the Qwen3.8 template; #18632 and #18766, `think` levels ignored for Qwen3.8 | https://docs.ollama.com/api/anthropic-compatibility, https://ollama.com/library/qwen3.8, github.com/ollama/ollama issues |
| **llama.cpp `llama-server`** | `/v1/chat/completions` | Yes: `/v1/messages` and `/v1/messages/count_tokens`, with streaming, tool use, vision and thinking. Claude Code: `ANTHROPIC_BASE_URL=http://127.0.0.1:8080` | GGUF from unsloth, ggml-org and lmstudio-community | Start with `--jinja` or tools will not work. Unsloth's GGUF ships template fixes ("parsing nested objects to make tool calling succeed more", developer-role support for Codex). Issue #20090: the Anthropic path drops thinking blocks | https://huggingface.co/blog/ggml-org/anthropic-messages-api-in-llamacpp, https://github.com/ggml-org/llama.cpp/issues/20090, https://huggingface.co/unsloth/Qwen3.8-27B-GGUF |
| **LM Studio** | Yes (`http://localhost:1234/v1`) | Yes. Claude Code: `ANTHROPIC_BASE_URL=http://localhost:1234`, `ANTHROPIC_AUTH_TOKEN=lmstudio` | MLX 4/5/6/8-bit and GGUF from lmstudio-community | Tool use documented on the OpenAI side; tool use through `/v1/messages` not stated explicitly | https://lmstudio.ai/docs/developer/anthropic-compat |
| **mlx-lm `mlx_lm.server`** | `/v1/chat/completions`, `/v1/completions`, `/v1/models` | **No** | MLX quants (e.g. lmstudio-community/Qwen3.8-27B-MLX-4bit); Qwen3.8-27B uses the Qwen3.5 architecture, which v0.31.3 should load (unverified) | Has a `qwen3_coder` tool parser (`mlx_lm/tool_parsers/qwen3_coder.py`). Latest release v0.31.3 (2026-04-22) predates Qwen3.8 | github.com/ml-explore/mlx-lm (source read via gh API) |
| **vLLM** | Yes | vLLM upstream: not checked | The Qwen3.8 recipe targets CUDA GPUs (`--tensor-parallel-size 4`) | `--tool-call-parser qwen3_coder` | https://github.com/QwenLM/Qwen3.8 |
| **vllm-metal** (Apple Silicon plugin) | Yes | Not checked | MLX-format models only; v0.28.0 adds MTP and hybrid models; on Homebrew | Community maintained; macOS 15+ | https://github.com/vllm-project/vllm-metal, https://vllm.ai/blog/2026-09-22-vllm-metal-v0-28-0 |

Third-party MLX servers that advertise Anthropic endpoints and tested tool
calling with Claude Code: Rapid-MLX, vllm-mlx and mlx-serve (not evaluated).

Tool-calling quality of local Qwen in agent harnesses: the model is trained
and benchmarked in Claude Code, so it is not the weak point. The serving
layer is: XML tool-call parsing, chat-template quirks and the
reasoning-effort mapping all have open bugs as of October 2026 (Ollama
issues above). One blog reports Qwen3.8-27B agents hanging on Ollama's `/v1`
path while `/api/chat` works (unverified,
https://www.betterclaw.io/blog/qwen-3-8-27b-tool-calling-fails-agents-fix).
Speed: a dense 27B at Q4 on an M1 Max (400 GB/s) should give roughly
10-15 tokens/s; the 3B-active Qwen3.6-35B-A3B would be several times faster
(estimate, unverified; not measured).

### DeepSeek

- Models (https://api-docs.deepseek.com/quick_start/pricing):
  - `deepseek-flash` is **DeepSeek-V4.1-Flash** (released 2026-09-10). It
    has 1M context, up to 384K output, vision, tool calls, JSON output, the
    Responses API and the Anthropic format. Weights: 552B MoE backbone, 8B
    active at prefill and 16B at decode, MIT
    (https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash,
    https://api-docs.deepseek.com/news/news260910).
  - `deepseek-v4-pro` is **DeepSeek-V4-Pro-0813**. It has 1M context and
    384K output but no vision. Weights are about 1.6T and MIT; 49B active
    (read from the V4.1-Flash comparison table, unverified).
  - The legacy IDs `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp`
    are now served by V4.1-Flash. V4 first released 2026-04-24
    (unverified, secondary).
- Pricing per 1M tokens, peak (off-peak is half):

  | Model | Input, cache hit | Input, cache miss | Output |
  |---|---|---|---|
  | flash | $0.006 | $0.30 | $1.20 |
  | v4-pro | $0.044 | $1.32 | $3.96 |

  Peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday.
  Concurrency limits: Flash 2500, Pro 500.
- Endpoints: OpenAI-compatible `https://api.deepseek.com`
  (https://api-docs.deepseek.com/). Anthropic-compatible
  `https://api.deepseek.com/anthropic`
  (https://api-docs.deepseek.com/guides/anthropic_api). It supports tools,
  thinking, streaming and images, and ignores MCP, document blocks and
  top_k. Unknown model names map to `deepseek-flash`; `claude-opus*` maps to
  `deepseek-v4-pro`; `claude-sonnet*` and `claude-haiku*` map to
  `deepseek-flash`.
- Claude Code setup is documented at
  https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/:
  `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
  `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`,
  `CLAUDE_CODE_SUBAGENT_MODEL` and `CLAUDE_CODE_EFFORT_LEVEL`. The docs also
  cover GitHub Copilot CLI, OpenCode, OpenClaw, Hermes and "Deep Code"
  (https://api-docs.deepseek.com/guides/coding_agents/).
- Vendor harness: **DeepSeek Harness** (`dsh`), developer preview, MIT,
  https://github.com/deepseek-ai/deepseek-harness (created 2026-08-13). It
  is a plugin architecture on the Cordis framework, run as
  `npx @deepseek-ai/dsh web` (web UI on :3080). It warns: "THERE WILL BE
  COMPATIBILITY-BREAKING CHANGES." DeepSeek runs its own code-agent
  benchmarks in dsh's Minimal mode, plus Claude Code and mini-SWE-agent for
  some (V4.1-Flash card).
- Coding plan: **none**. DeepSeek is metered API only; third-party
  aggregators bundle it (unverified, secondary:
  https://www.layer3labs.io/guides/deepseek-pricing). It also appears in the
  QwenCloud Token Plan model list (see Qwen above).
- Local: not feasible on this Mac (552B and 1.6T weights).

### GLM (Zhipu / Z.ai)

- Releases (https://docs.z.ai/release-notes/new-released): GLM-5
  (2026-02-12), GLM-5.1 (2026-04-07), GLM-5.2 (2026-06-16, 1M context),
  **GLM-5.3** (2026-08-18) and **GLM-5.3-Flash** (2026-08-26, native
  vision).
- GLM-5.3 (https://docs.z.ai/guides/llm/glm-5.3) has 1M context and 128K
  output. Thinking is mandatory, with `reasoning_effort` of low, high or max
  (default max). It supports function calling, context caching and JSON
  output.
- Open weights on https://huggingface.co/zai-org (2026-08-25):
  - GLM-5.3: about 750B on disk; custom "GLM-5.3 License", permissive, with
    a security review only for model-as-a-service providers with more than
    $10B revenue.
  - GLM-5.3-Flash: 320B total, 18B active, MIT.
  - Neither fits on 64 GB. **GLM-4.7-Flash** (30B-A3B, MIT, 2026-01-19)
    does fit.
- API pricing per 1M tokens, input / cached input / output
  (https://docs.z.ai/guides/overview/pricing):
  - GLM-5.3: $1.40 / $0.26 / $4.40
  - GLM-5.3-Flash: $0.15 / $0.03 / $0.50
  - GLM-5.3-FlashX: $0.37 / $0.075 / $1.25
- Endpoints:
  - Z.ai general OpenAI-compatible: `https://api.z.ai/api/paas/v4/`
  - Coding OpenAI-compatible: `https://api.z.ai/api/coding/paas/v4`
  - OpenAI Responses: `https://api.z.ai/api/v1`
  - Anthropic-compatible: `https://api.z.ai/api/anthropic`
  - China (bigmodel.cn) Anthropic: `https://open.bigmodel.cn/api/anthropic`.
    The China OpenAI path was not checked; it is probably
    `https://open.bigmodel.cn/api/paas/v4` (unverified).
- **GLM Coding Plan** (https://docs.z.ai/devpack/overview,
  https://docs.z.ai/devpack/faq, https://docs.z.ai/devpack/tool/others):
  - Tiers and quotas:

    | Tier | Price a month | Credits per 5 hours | Credits per week |
    |---|---|---|---|
    | Lite | $18 | 2,000 | 10,000 |
    | Pro | $80 (unverified) | 12,000 | 60,000 |
    | Max | $168 (unverified) | 28,000 | 140,000 |

    The docs say only "starting at 18 USD per month"; the Pro and Max
    prices come from https://www.layer3labs.io/guides/glm-coding-plan-explained.
  - Models: GLM-5.3 and GLM-5.3-Flash. Older model names route to these.
  - Supported tools (the official list): ZCode, Claude Code, Claude for
    IDE, Codex, OpenCode, **Pi**, Cursor, Cline, TRAE, Qoder, Droid, Kilo
    Code, Roo Code, Crush, Goose, Eigent, AutoClaw, OpenClaw, Hermes Agent
    and SillyTavern.
  - Restriction: "strictly limited to use within officially supported tools
    and products. The subscriber shall not use the subscription benefits in
    any unsupported tools or scenarios." Plain API calls are pay-as-you-go.
  - Claude Code and Goose use `https://api.z.ai/api/anthropic`; the other
    tools use `https://api.z.ai/api/coding/paas/v4`.
- Recommended harness: Claude Code is Z.ai's lead integration
  (https://docs.z.ai/devpack/tool/claude). It sets `ANTHROPIC_AUTH_TOKEN`,
  `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic` and
  `API_TIMEOUT_MS=3000000`, and maps opus and sonnet to `glm-5.3[1m]` and
  haiku to `glm-5.3-flash[1m]`. The page's default-mapping text says all
  three map to GLM-5.3-Flash, which contradicts its own example. Z.ai also
  has its own tool, ZCode, which uses 1.5 times the plan usage.

### Others (optional)

- Kimi K3 (Moonshot): open weights, about 2.8T parameters, 1M context,
  released 2026-07-16, $3 / $15 per 1M tokens (unverified, secondary:
  https://artificialanalysis.ai/models/comparisons/kimi-k3-vs-minimax-m3).
- MiniMax M3: 428B total, 23B active, 1M context, released 2026-06-01,
  $0.30 / $1.20 per 1M tokens (unverified, same source). mlx-lm ships
  `kimi_k3` and `minimax_m2` tool parsers.

### Comparison table

| Model | Latest version | Local on this Mac? | OpenAI-compat endpoint | Anthropic-compat endpoint | Plan / subscription | Vendor-recommended harness | Source |
|---|---|---|---|---|---|---|---|
| Qwen (local) | Qwen3.8-27B (2026-08-14); Flash-Next 2026-08-24 | Yes, 27B at Q4-Q8 (16-29 GB); Flash-Next and Max no | Ollama `:11434/v1`, llama-server `:8080/v1`, LM Studio `:1234/v1`, mlx_lm.server | Ollama `:11434`, llama-server `:8080`, LM Studio `:1234` (all `/v1/messages`) | n/a | Qwen Code; Qwen benchmarks in Claude Code | huggingface.co/Qwen/Qwen3.8-27B, docs.ollama.com, llama.cpp HF blog |
| Qwen (hosted) | Qwen3.8-Max (2026-08-03) | n/a | QwenCloud (path not checked) | `https://maas.qwencloudapi.com/apps/anthropic`; Token Plan `https://token-plan.maas.qwencloudapi.com/apps/anthropic` | Token Plan $6-$68 a month (personal), any tool allowed | Qwen Code, Claude Code | docs.qwencloud.com |
| DeepSeek | V4.1-Flash (2026-09-10), V4-Pro-0813 | No | `https://api.deepseek.com` | `https://api.deepseek.com/anthropic` | None, API only, off-peak half price | DeepSeek Harness (dsh, preview); Claude Code documented | api-docs.deepseek.com |
| GLM | GLM-5.3 (2026-08-18), GLM-5.3-Flash (2026-08-26) | No; GLM-4.7-Flash 30B-A3B yes | `https://api.z.ai/api/paas/v4` (coding: `.../api/coding/paas/v4`) | `https://api.z.ai/api/anthropic` | GLM Coding Plan $18 / $80 / $168 a month, listed tools only (includes Pi, OpenCode, Claude Code) | Claude Code (lead); ZCode is Z.ai's own | docs.z.ai |

## Open questions

- **Operator:** by "Qwen 3.8" do you mean Qwen3.8-27B run locally (the only
  Qwen3.8 that fits in 64 GB), or hosted Qwen3.8-Max or Flash through
  QwenCloud? Would a faster MoE such as Qwen3.6-35B-A3B be acceptable for
  local runs?
- **Operator:** do you have, or will you buy, a GLM Coding Plan? Its terms
  allow only listed tools. Pi, OpenCode and Claude Code are listed, but an
  Attractor backend calling the API directly is not. That pushes GLM
  through one of those harnesses, or onto pay-as-you-go.
- **Operator:** DeepSeek has no plan. Is pay-as-you-go acceptable? Rates
  are low ($0.30 / $1.20 per 1M for Flash at peak).
- Which local runtime? Ollama is easiest but has open Qwen3.8 tool-call and
  effort bugs. llama-server with `--jinja` and unsloth GGUF has a
  documented Anthropic endpoint. A short test on a scratch repo (Claude Code
  plus Pi against each) would settle it. Not done here.
- Real tokens/s for Qwen3.8-27B on an M1 Max, and whether a 27B dense model
  is fast enough for agent loops. Not measured.
- Whether mlx-lm v0.31.3 loads Qwen3.8-27B. Not tested.
- The Z.ai Claude Code page contradicts itself on the default model mapping
  (all Flash, or opus and sonnet on GLM-5.3).
- The QwenCloud OpenAI-compatible base path and the China (bigmodel.cn)
  OpenAI path were not checked.
