# ACP (Agent Client Protocol)

## Summary

In Fabro, "ACP" means the **Agent Client Protocol**: an open protocol, started
by Zed and now run jointly by Zed and JetBrains, through which a client
(an editor or an orchestrator) drives a coding agent. The agent runs as a
subprocess, and the two talk JSON-RPC 2.0 over stdio. The client calls
`initialize`, `session/new` and `session/prompt`. The agent streams
`session/update` notifications (text, thoughts, tool calls, plans, usage) and
asks the client for permission with `session/request_permission`. The stable
version is v1 (schema 1.24.1); v2 is a draft.

Most harnesses the operator cares about can be driven this way:

- Natively: OpenCode, Gemini CLI, Qwen Code, Goose, Kimi CLI, Cursor, Copilot
  CLI, Cline, Kilo and others.
- Through an adapter: Claude Code (`claude-agent-acp`, built on the Claude
  Agent SDK), Codex (`codex-acp`, built on the Codex App Server) and Pi
  (`pi-acp`, a third-party adapter).

An orchestrator can therefore start any of them the same way. In exchange it
gives up harness-specific flags, structured outputs, hooks it controls, and
exact cost reporting, and it depends on how far each adapter lags its harness.
Fabro today runs ACP through its engine Petri, which has its own small client.
That client sets the model only through the command line, and its live tests
pin a deprecated Claude adapter.

**Can an Attractor swap harnesses per model through ACP?** Yes for launch and
event shape. The model is chosen per command or env, or through the `model`
config option where the agent exposes it. Harness-specific config,
structured output and resume are not portable.

**Subscriptions (Q3).** Claude via ACP can use a subscription technically
(the adapter's "Claude Subscription" method), but Anthropic's Agent SDK
policy restricts third parties offering claude.ai login (see Open
questions). codex-acp supports ChatGPT login. Fabro/Petri cannot run any
subscription login flow: it authenticates with API-key methods only.

The other protocols called "ACP" (IBM/BeeAI Agent Communication Protocol,
AGNTCY Agent Connect Protocol, OpenAI/Stripe Agentic Commerce Protocol) are
unrelated to coding-agent launch, and the first two are archived.

## Facts

All facts were checked on 2026-10-04 unless a line says otherwise.

### Which "ACP" Fabro means

- **Fabro's ACP is the Agent Client Protocol.** Changelog
  `docs/public/changelog/2026-05-11.mdx` says: "Fabro introduced Agent Client
  Protocol as a first-class backend". The original plan,
  `docs/plans/2026-05-11-add-acp-backend.md`, names the crates
  `agent-client-protocol = "0.11.1"` and `agent-client-protocol-tokio`.
  Source: https://github.com/fabro-sh/fabro at commit `7fc0edbf` (2026-10-03).
- **What a Fabro workflow sets today.** In
  `docs/public/core-concepts/agents.mdx`, an agent node takes
  `backend="api"|"acp"`, with either `acp.command="..."` (a shell string) or
  `acp.config='{"type":"stdio",...}'`.
  - The ACP process "owns its auth, tools, and model behavior". Fabro passes
    it no model or provider settings.
  - Fabro does not install agents.
  - ACP runs on local and Docker sandboxes, not on Daytona (no
    bidirectional stdio there).
  - Changelog `2026-05-18.mdx` removed `backend="cli"`. ACP nodes reject
    `model`, `provider`, `reasoning_effort` and `max_tokens`.
  - `lib/foundation/fabro-types/src/llm_backend.rs` has
    `enum AgentBackend { Api, Acp }`.
- **Where the client code is.** Fabro's own tree no longer contains an ACP
  crate, and `Cargo.lock` has no `agent-client-protocol`.
  - Agent execution moved to Petri:
    https://github.com/lithoscomputer/petri, pinned in Fabro's `Cargo.lock`
    at `91d1b77b`.
  - `crates/attractor/steps/src/acp/mod.rs` there is "a minimal Agent Client
    Protocol client", "written against the wire protocol rather than the
    `agent-client-protocol` crate".
  - It sends `initialize` with `protocolVersion: 1` and
    `clientCapabilities.fs` read and write both `false`, and offers no
    terminal capability.
  - It then calls `session/new` with `mcpServers: []`. If the agent answers
    `auth_required` (-32000), it calls `authenticate` and retries.
    `authenticate` picks only an API-key auth method
    (`api_key_method(&self.auth_methods)`, `crates/attractor/steps/src/acp/mod.rs`
    around 611-660 at `91d1b77`) and errors if the agent offers none. So a
    subscription works only if the agent is already logged in and never
    returns `auth_required`.
  - Turns use `session/prompt`, and `session/cancel` serves both steering
    and cancellation.
  - Permission requests are answered "always allow", or "once" when a
    `pre_tool_use` hook is configured; a blocking hook rejects the request.
  - Usage comes from `usage_update`.
  - It never calls `session/set_config_option`, `session/load` or
    `session/resume`.
  - `PRODUCT_CREDENTIALS` lists only `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
    and `OPENAI_API_KEY` (`acp/command.rs`).
- **What Fabro has tested.** Petri's `crates/petri/lib/tests/acp_products.rs`
  runs live tests (`#[ignore]`) against two products, both with API keys:
  - Claude Code through `@zed-industries/claude-code-acp@0.16.2`. That npm
    package is deprecated and renamed (see below). The file notes that "the
    `claude` binary itself has no ACP mode".
  - Gemini CLI as `gemini --acp`.

### Other protocols named "ACP"

- **Agent Communication Protocol** (IBM Research / BeeAI, March 2025). It is
  an agent-to-agent REST protocol and merged into A2A under the Linux
  Foundation in August 2025. The repo https://github.com/i-am-bee/acp is
  archived (last push 2025-08-25). Announcement:
  https://github.com/orgs/i-am-bee/discussions/5
- **Agent Connect Protocol** (AGNTCY/Cisco). It is an OpenAPI interface for
  invoking remote agents. The repo https://github.com/agntcy/acp-spec is
  archived (last push 2025-05-23), and AGNTCY moved to A2A (per web search,
  unverified).
- **Agentic Commerce Protocol** (OpenAI and Stripe) is for purchases:
  https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
- None of these is what Fabro uses.

### The protocol

- **Repo, site and licence.** The spec is at
  https://github.com/agentclientprotocol/agent-client-protocol;
  `zed-industries/agent-client-protocol` redirects there. It has about 4.4k
  stars, it was last pushed 2026-10-04, and its head at checking was
  `cae7aca7`. The site is https://agentclientprotocol.com. The licence is
  Apache-2.0 (gh api spdx_id).
- **Transport.** From `docs/protocol/v1/transports.mdx`:
  - JSON-RPC 2.0, UTF-8, one message per line over stdio.
  - The client launches the agent as a subprocess.
  - Anything on stdout must be a valid ACP message; stderr is for logs.
  - Streamable HTTP is a draft, and a Transports Working Group exists.
- **v1 methods** (`schema/v1/meta.json`):
  - Agent side: `initialize`, `authenticate`, `session/new`,
    `session/load`, `session/set_mode`, `session/set_config_option`,
    `session/prompt`, `session/cancel` (a notification), `session/list`,
    `session/delete`, `session/resume`, `session/close`, `logout`.
  - Client side: `session/request_permission`, `session/update`,
    `fs/read_text_file`, `fs/write_text_file`, `terminal/create`,
    `terminal/output`, `terminal/release`, `terminal/wait_for_exit`,
    `terminal/kill`, `elicitation/create`, `elicitation/complete`.
  - Protocol: `$/cancel_request`.
  - The unstable v1 schema adds `providers/list|set|disable`, `session/fork`,
    `mcp/message` (MCP over ACP) and `nes/*` (next-edit suggestions).
- **Capabilities.**
  - The client advertises `fs` and `terminal`. When it does, the agent may
    read and write files and run commands through the client (the editor
    buffer). An orchestrator can decline both; Petri does.
  - The agent advertises `loadSession`, prompt content types, MCP transports
    and `authMethods`.
- **Model selection.** Session config options (`session/set_config_option`)
  carry a `category`, and `category: "model"` is stabilized
  (`docs/protocol/v1/session-config-options.mdx`; announcement
  `docs/announcements/model-config-category-stabilized.mdx`). Each agent
  publishes its own model ids. Modes (`session/set_mode`) are a separate,
  older surface.
- **Usage.** `usage_update` carries the context size and cumulative cost and
  is stabilized (`docs/announcements/session-usage-stabilized.mdx`). The
  token usage returned at the end of a turn is a separate RFD
  (`docs/rfds/end-turn-token-usage.mdx`).
- **Versions.**
  - The wire `protocolVersion` is the integer `1`.
  - The latest schema release is `schema-v1.24.1` (2026-09-30), from
    `gh api .../releases/latest`.
  - v2 is a draft: `schema/v2` is at `2.0.0-alpha.7` (2026-09-30), and
    `docs/protocol/v2/migration.mdx` says to gate it behind feature flags.
  - In v2, `session/prompt` only acknowledges the prompt; completion comes in
    `state_update`. Updates become upserts.
  - v2 removes client `fs/*` and `terminal/*`, `session/load` (use
    `session/resume` with `replayFrom`) and `session/set_mode` (use config
    options).
- **SDKs** (org https://github.com/agentclientprotocol):
  | SDK | Latest release |
  |---|---|
  | TypeScript `@agentclientprotocol/sdk` | 1.7.0 (2026-10-02) |
  | Rust `agent-client-protocol` | 2.2.0 (2026-09-18) |
  | Python `agent-client-protocol` | 1.0.0rc2 on GitHub (2026-09-21); 0.12.1 on PyPI |
  | Kotlin | v0.32.0 |
  | Java | v0.18.0 |

  The Rust and TypeScript SDKs reached 1.0 per
  `docs/announcements/sdk-1-0-releases.mdx` (date not checked). There is a
  test kit, `agentclientprotocol/acp-tck`, created 2026-10.
- **Governance** (`docs/community/governance.mdx`). The text is an
  "interim governance model": ACP is "jointly governed by Zed and
  JetBrains", "working toward transitioning to an independent foundation".
  - Lead maintainers are Ben Brandt (Zed) and Sergey Ignatov (JetBrains),
    per `MAINTAINERS.md` dated 2026-06-01.
  - Changes go through RFDs (`docs/rfds/`).
- **Registry.** https://github.com/agentclientprotocol/registry (head
  `c1ff2a7d`, 2026-10-05) holds one `agent.json` per agent: an npx package or
  binary archive plus launch args. Zed and others install agents from it.
  The registry is stabilized per
  `docs/announcements/acp-agent-registry-stabilized.mdx`.
- **Maturity.** ACP is young but busy:
  - many schema minor releases in 2026, with frequent "unstable → stabilized"
    moves;
  - vendor extensions under `_meta`, for example JetBrains "AIR"
    (`_meta.jetbrains.air.*`) in both the Claude and Codex adapters;
  - v2 under way.
  - Expect churn.

### Agents: how each speaks ACP

- **Claude Code** (adapter). Repo
  https://github.com/agentclientprotocol/claude-agent-acp, v0.85.1
  (2026-10-02), head `a44c4860`. npm `@agentclientprotocol/claude-agent-acp`
  (maintainers: Zed staff).
  - It was renamed twice. Earlier names `@zed-industries/claude-code-acp`
    (last 0.16.2) and `@zed-industries/claude-agent-acp` (last 0.23.1) are
    deprecated on npm.
  - It depends on `@anthropic-ai/claude-agent-sdk` 0.3.287, which runs the
    real `claude` binary. `CLAUDE_CODE_EXECUTABLE` overrides which binary.
  - Claude Code itself has no native ACP mode: issue
    anthropics/claude-code#6686 was closed "not planned" on 2026-02-09.
  - The adapter loads settings with
    `settingSources: ["user","project","local"]`.
  - On `session/new`, a client may pass `_meta.claudeCode.options`, which
    forwards SDK `Options`, including `plugins`, `settings`, `extraArgs`,
    `env`, `model`, `hooks`, `allowedTools` and `systemPrompt`
    (`src/acp-agent.ts`, the `OPTION_REBUILDS_SESSION` table).
  - It implements `loadSession`, `resumeSession` and `listSessions`, and
    emits `usage_update`.
- **Claude subscription login through the adapter.**
  - The adapter offers a "Claude Subscription" terminal auth method, which
    runs `claude auth login --claudeai`, and an "Anthropic Console" method
    (`src/acp-agent.ts`, about lines 2610-2629 at `a44c486`).
  - It has a `--hide-claude-auth` flag for integrations that must never bill
    a subscription (`src/hide-claude-auth.ts`).
  - So it uses the logged-in `claude` credentials when no API key outranks
    them.
  - **Policy.** Anthropic's Agent SDK docs say: "Unless previously approved,
    Anthropic does not allow third party developers to offer claude.ai login
    or rate limits for their products"
    (https://code.claude.com/docs/en/agent-sdk/overview).
  - Zed's blog (2026-05-14) reported a planned split from 2026-06-15:
    "Agent SDK credits" for ACP, `claude -p` and SDK use. A 2026-06-16
    update says the change was postponed and that ACP usage "continue[s] to
    work with Claude subscriptions exactly as they did before"
    (https://zed.dev/blog/anthropic-subscription-changes).
  - Whether a personal orchestrator on your own subscription is fine is a
    policy question to check before relying on it. Whether the change has
    since taken effect: unverified.
- **Codex** (adapter). Repo https://github.com/agentclientprotocol/codex-acp,
  v2.1.1 (2026-10-01), npm `@agentclientprotocol/codex-acp`.
  - It is built on the Codex App Server and bundles `@openai/codex`;
    `CODEX_PATH` overrides the binary.
  - The old `zed-industries/codex-acp` is archived (v0.16.0, 2026-06-08).
  - Its README says it supports ChatGPT login (subscription), `CODEX_API_KEY`
    or `OPENAI_API_KEY`, and a custom gateway; `NO_BROWSER=1` hides the
    browser login.
  - Model, reasoning effort, approval and sandbox mode are config options.
    `CODEX_CONFIG` (JSON merged into the session config), `MODEL_PROVIDER`
    and `INITIAL_AGENT_MODE` are environment variables.
  - Slash commands: `/review`, `/compact`, `/skills` and others.
  - The old README said ChatGPT login "doesn't work in remote projects".
- **OpenCode** (native). The registry launches `opencode acp`; the repo is
  now `anomalyco/opencode`, v1.18.34 in the registry. It advertises an
  `opencode-login` terminal auth method
  (`packages/opencode/src/acp/service.ts`). Models come from OpenCode's own
  provider config, including local OpenAI-compatible endpoints.
- **Pi** (third-party adapter). https://github.com/svkozak/pi-acp, v0.0.34,
  about 713 stars, described as "MVP-style". Also in the ACP registry
  (`pi-acp/agent.json` at registry `c1ff2a7`).
  - It spawns `pi --mode rpc` and bridges to ACP; it needs pi v0.81.0+.
  - It supports `session/load` through a session map, and pi's slash commands
    and skills.
  - Code search found no native ACP in `earendil-works/pi` (pi-mono's new
    home, v1.0.2 on 2026-10-04); a native mode may exist without matching
    the search (unverified).
- **Gemini CLI** (native). The registry and Petri use `gemini --acp`; Fabro's
  May 2026 plan used the older `--experimental-acp`. Registry version 0.62.0.
  - Auth methods: Log in with Google, Gemini API key, Vertex AI, AI API
    Gateway (`packages/cli/src/acp/acpRpcDispatcher.ts`).
- **Qwen Code** (native). The registry launches
  `qwen --acp --experimental-skills` (`@qwen-code/qwen-code` 0.24.7).
  - Its ACP auth offers only "Use OpenAI API key"
    (`packages/cli/src/acp-integration/authMethods.ts`). Any
    OpenAI-compatible endpoint works, which suits a local Qwen; Qwen OAuth is
    not offered over ACP.
- **Goose** (native): `goose acp` (registry, v1.53.0).
- **Kimi CLI** (native): `kimi acp` (registry, v1.52.0).
- **GLM**: `glm-acp-agent` is a third-party npx package
  (https://github.com/stefandevo/glm-acp-agent, registry v1.14.0).
  Alternatively, run a GLM coding plan through Claude Code's Anthropic-
  compatible base URL (`ANTHROPIC_BASE_URL`) via the Claude adapter, or
  through OpenCode (unverified for ACP specifically).
- **DeepSeek**: no dedicated ACP agent in the registry. Reach it through a
  harness with an OpenAI- or Anthropic-compatible provider (OpenCode, Qwen
  Code, Pi, Goose); unverified end to end.
- **Others in the registry** (2026-10-05 head): Auggie (`auggie --acp`),
  Cursor (`cursor-agent acp`), GitHub Copilot CLI (`copilot --acp`), Cline,
  Kilo, Factory Droid, Junie, Mistral Vibe, Devin, Amp (adapter), Grok
  Build, Poolside, Qoder, MiniMax Code, and more.

### Clients

- **Editors.** Zed is the origin and first client. Also JetBrains AI
  Assistant (https://www.jetbrains.com/help/ai-assistant/acp.html); Neovim
  through CodeCompanion, avante.nvim and agentic.nvim; Emacs through
  agent-shell.el; Qt Creator; Sublime; and VS Code extensions. Source:
  https://agentclientprotocol.com/get-started/clients.
- **Headless and orchestrators.**
  - **acpx** (https://github.com/openclaw/acpx, v0.19.4 on 2026-10-01,
    about 3.3k stars) is a headless CLI with persistent named sessions and
    JSON output. Its built-in launch map (`agents/README.md`) includes:
    - `claude -> npx -y @agentclientprotocol/claude-agent-acp`
    - `codex -> npx -y @agentclientprotocol/codex-acp`
    - `pi -> npx pi-acp`
    - `opencode -> npx -y opencode-ai acp`
    - `gemini -> gemini --acp`
    - `qwen -> qwen --acp`
    - `kimi -> kimi acp`
  - Also: Toad, fast-agent, Mastra, LangChain Deep Agents, Koog, and Fabro
    and Petri.

### Swapping harnesses through ACP: what you get and what you lose

- **What you get.**
  - One launch shape: spawn a command, `initialize`, `session/new(cwd)`,
    `session/prompt`.
  - One event stream: `session/update` with message, thought, tool call,
    plan and usage.
  - One permission hook: `session/request_permission`, which a headless
    orchestrator can auto-answer.
  - One cancel: `session/cancel`.
  - Model choice: either a `session/set_config_option` on the `model`
    category, or the model baked into the command or env (Fabro's approach).
- **What you lose compared with driving each CLI directly.**
  - **Harness flags and config files.** Each needs an escape hatch. Claude
    takes `_meta.claudeCode.options`, Codex `CODEX_CONFIG`, and others use
    env or their own settings files. None of this is portable.
  - **Structured outputs.** There is no ACP equivalent of
    `claude -p --output-format json --json-schema` or
    `codex exec --output-schema`. Fabro aggregates the agent's text; any
    schema has to be enforced afterwards.
  - **Hooks.** The orchestrator sees only the permission requests the agent
    chooses to send and the tool-call updates it chooses to report. Petri
    calls its ACP tool hooks "best effort"
    (`crates/fabro/acceptance/decisions/acp-tool-hooks-best-effort.toml`). Native harness
    hooks still run inside the agent.
  - **Plugins, skills and settings loading.** These depend on the adapter.
    The Claude adapter loads user, project and local settings and can take
    `plugins` and `settings` through `_meta`; other adapters differ.
  - **Slash commands.** The agent advertises them through
    `available_commands_update` and they are sent as prompt text. Which ones
    work varies by adapter.
  - **Cost and tokens.** `usage_update` gives context size and cumulative
    cost when the agent sends it. Per-turn token usage is an RFD. pi-acp
    sends only context occupancy.
  - **Headless permissions.** Workable through auto-answering, but the
    agent's own mode (bypass, full-auto) still matters, and the knob differs
    per agent.
  - **Resume.** `session/load` and `session/resume` are optional in v1 and
    change in v2. Fabro and Petri do not use them; every stage is a fresh
    session.
  - **Adapter lag and churn.** Package renames: Claude twice, Codex once.
    Adapters wrap SDKs and CLIs that release weekly. Vendor `_meta`
    extensions. v2 on the way.
  - **Extra runtime.** Node/npx is needed for most adapters; Fabro does not
    install ACP agents, Node.js, npm or npx (`agents.mdx:53`).

### Relevance to harmonik-v3

- hk3 launches `claude` with `--plugin-dir` and `--settings`, and keeper
  hands off on a token threshold.
- Through ACP, the same could in principle be passed with
  `_meta.claudeCode.options.plugins` / `settings` / `extraArgs`, or with
  `CLAUDE_CODE_EXECUTABLE` pointing to a wrapper script. Neither is tested
  (unverified).
- The session would be headless: no TUI, no status line, no herdr pane. This
  is a different mode from hk3's interactive sessions, not a replacement.
- If Attractor stages run through ACP, hk3's role and plugin injection would
  need the `_meta` route or a wrapper, and keeper's restart logic would need
  checking under the SDK.

## Support table

Note: through Fabro/Petri, no row's subscription login can be triggered;
Petri authenticates with API keys only. A pre-logged-in agent may still
work.

| Agent | ACP support | How to launch | Subscription login works? | Source |
|---|---|---|---|---|
| Claude Code | adapter (Claude Agent SDK) | `npx -y @agentclientprotocol/claude-agent-acp` | Technically yes ("Claude Subscription" auth method, uses `claude` login); policy restricts third-party products offering it, and ACP billing changes were postponed on 2026-06-16 | github.com/agentclientprotocol/claude-agent-acp v0.85.1; zed.dev/blog/anthropic-subscription-changes |
| Codex | adapter (Codex App Server) | `npx -y @agentclientprotocol/codex-acp` | Yes, ChatGPT login per README (`NO_BROWSER=1` hides it) | github.com/agentclientprotocol/codex-acp v2.1.1 |
| OpenCode | native | `opencode acp` | Through OpenCode's own provider logins (`opencode-login`); per-provider details unverified | registry `opencode/agent.json` v1.18.34 |
| Pi | adapter (third-party) | `npx pi-acp` (needs `pi` on PATH) | Uses pi's own provider config; unverified | github.com/svkozak/pi-acp v0.0.34 |
| Gemini CLI | native | `gemini --acp` (formerly `--experimental-acp`) | Yes, "Log in with Google" auth method | gemini-cli `packages/cli/src/acp/acpRpcDispatcher.ts`; registry v0.62.0 |
| Qwen Code | native | `qwen --acp` | No; ACP auth offers only an OpenAI-compatible API key | qwen-code `packages/cli/src/acp-integration/authMethods.ts`; registry v0.24.7 |
| Goose | native | `goose acp` | Unverified | registry v1.53.0 |
| Kimi CLI | native | `kimi acp` | Unverified | registry v1.52.0 |
| GLM | third-party agent | `npx glm-acp-agent` | Unverified | registry v1.14.0 |
| DeepSeek | none dedicated | through OpenCode, Qwen Code, Pi or Goose | Not applicable (API key) | registry listing |
| Auggie | native | `auggie --acp` | Unverified | registry v0.36.0 |
| Copilot CLI | native | `copilot --acp` | Unverified | registry v1.0.91 |
| Cursor | native | `cursor-agent acp` | Unverified | registry 2026.10.01 |

## Open questions

- Is driving Claude Code through `claude-agent-acp` on a personal Max
  subscription inside our own orchestrator within Anthropic's terms? Has
  the postponed June 2026 billing split taken effect since?
- Does `_meta.claudeCode.options` with `plugins`, `settings` and `extraArgs`
  reproduce hk3's `--plugin-dir` / `--settings` launch, including keeper's
  hooks? This needs a scratch-repo test.
- Which harnesses expose a `model` config option over ACP, and with what ids?
  This matters for an orchestrator that picks the model per stage rather
  than per command.
- Fabro and Petri pin `@zed-industries/claude-code-acp@0.16.2`, which is
  deprecated. Does Fabro's ACP path work with the current
  `@agentclientprotocol/claude-agent-acp` and `codex-acp` 2.x? It has only
  been tested against Claude and Gemini with API keys.
- Does `codex-acp` pick up an existing `~/.codex` ChatGPT login headlessly,
  without the browser auth method?
- How does a local Qwen behave through Qwen Code over ACP compared with
  OpenCode or Pi?
- When will v2 stabilize, and will the adapters drop v1?
