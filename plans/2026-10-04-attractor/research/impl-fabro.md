# Fabro in depth (Q3)

Date checked: 2026-10-04. Clone at HEAD `7fc0edbf8` (2026-10-03), workspace version
`0.375.0-nightly.0` (`Cargo.toml:13`). Paths below are relative to the fabro clone
unless prefixed with a local clone folder name (`lithos-petri/`, `lithos-pebble/`,
`lithos-llm/`, `sandbox-driver/`). These are github.com/lithoscomputer/petri,
/pebble, /lithos-llm and /sandbox-driver, cloned at their `main` branches on
2026-10-04. petri, pebble and sandbox-driver are MIT; lithos-llm is Apache-2.0.

## Summary

Fabro is an MIT-licensed Rust "dark software factory" from Qlty Software Inc.
(Bryan Helmkamp). It runs as a server (`fabro server start`) with a CLI, a React
web UI, a REST/SSE API and an MCP server; self-hosted on a laptop, in Docker, or
via a Railway template. No hosted/paid tier is advertised. It began as an
implementation of StrongDM's Attractor (DOT graph pipelines, stylesheets, human
gates, checkpoints, conditions) and is now described by its own engine docs as
the Attractor "reference implementation" whose dialect the next spec revision is
being drafted to take in. Since Sep 2026 its core pieces live in separate
MIT/Apache repos under github.com/lithoscomputer (same author): **petri**
(workflow engine, with an Attractor frontend), **pebble** (coding-agent loop),
**lithos-llm** (unified LLM client + catalog) and **sandbox-driver** (Host/Docker/
Daytona).

Agent nodes have two backends: `api` (Fabro's own pebble loop over lithos-llm)
and `acp` (Fabro is the ACP *client*: it spawns a user-supplied ACP stdio agent
inside the run's sandbox and drives it over JSON-RPC). The old `backend="cli"`
(claude/codex/gemini subprocess) was removed on 2026-05-18.

Support matrix:

| Target | Supported? | How |
|---|---|---|
| Claude Code on subscription | Partial / unverified | Only via ACP: `acp.command="claude-code-acp"` (Zed adapter). Fabro's own tests use `ANTHROPIC_API_KEY`. Petri's ACP `authenticate` picks only API-key auth methods (`lithos-petri/crates/attractor/steps/src/acp/mod.rs` ~611-660), so the agent must already be logged in. Only the `local` sandbox (no isolation) keeps the host `HOME`; Docker has no host login, and the host sandbox strips `*_TOKEN`. **Subscription use and isolation pull against each other.** No Anthropic OAuth in the `api` backend. |
| Codex on ChatGPT subscription | Yes, by reusing the Codex CLI OAuth client (terms unverified) | `api` backend: `fabro provider login` runs the device-code OAuth using the Codex CLI's own client id (`CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"`, `lib/foundation/fabro-auth/src/strategy.rs:9`), stores `vault:OPENAI_CODEX`, lithos-llm provider `openai-codex` posts to `chatgpt.com/backend-api/codex`. Fabro's loop, not the codex CLI. codex-acp via ACP is also possible (not in the current live test tier). |
| Qwen local | Yes (config) | `api` backend: built-in `ollama` provider (disabled by default, models must be declared), or any OpenAI-compatible endpoint (vLLM/llama.cpp) as a custom `[llm.providers.<id>]` with `base_url`. Marked "no live tests" upstream. |
| DeepSeek | Yes | Built-in `deepseek` provider (`DEEPSEEK_API_KEY`), also via Venice/Fireworks/OpenRouter/Bedrock. Provisional, not live-tested in lithos-llm. |
| GLM (Z.ai) | Yes on pay-as-you-go; the Coding Plan route breaks Z.ai's terms | Built-in `zai` provider defaults to the **Coding Plan** endpoint (`lithos-llm/src/catalog/builtin/zai.toml:6,15`), but the plan is limited to listed tools and Fabro is not one (models.md). Override `base_url` to `/api/paas/v4` for pay-as-you-go. Catalog default model is `glm-5.2` (`zai.toml:21`); GLM-5.3 needs a model block you declare yourself. Not live-tested. |
| Harness tuned per model (Q5) | Only via ACP | On the `api` backend, Qwen (ollama), DeepSeek and GLM all get the generic `openai` agent profile (`zai.toml:28`, `deepseek.toml:24`, `ollama.toml:26`). Valid profiles are anthropic, claude-5, openai, gemini, kimi, gpt56 and gpt6 (`docs/public/core-concepts/models.mdx:142`). A model-specific harness for these three is reachable only over ACP (e.g. Qwen Code, OpenCode, dsh), which is untested upstream. |
| ACP | Yes, as client | `backend="acp"` + `acp.command` or `acp.config`; local and Docker sandboxes only (not Daytona per docs). Tested products: claude-code-acp 0.16.2, Gemini CLI `--acp`. |
| Sandbox | Yes | Per-run "environment": `local` (no isolation), `docker` (default), `daytona` (cloud VM), plus third-party sandbox-driver plugins. Parallel branches use git worktrees. |

## Facts with sources

### 1. Overview

- Description: "The open source dark software factory for expert engineers"
  (`README.md:5`). Features: DOT graphs, human gates, CSS-like model
  stylesheets, Daytona cloud sandboxes, git checkpointing, REST+SSE API, React web
  UI, "Single binary", MIT (`README.md:46-57`).
- License MIT, "Copyright Qlty Software Inc." (`LICENSE.md:1-3`); contact
  bryan@qlty.sh (`README.md:166`). Website footer "© 2025 Qlty Software Inc.";
  site advertises only "Open Source · MIT Licensed", no pricing or hosted tier
  (https://fabro.sh, fetched 2026-10-04).
- How it runs: "Fabro runs as a server" (`README.md:146`); `fabro server start`
  opens a web install wizard; `fabro repo init` per project; Docker compose files
  and a Railway one-click template (`README.md:120-158`). `fabro install` is a
  CLI-only wizard. Stdio MCP server (`fabro mcp init claude`) to manage runs from
  MCP clients (`docs/public/changelog/2026-05-11.mdx:12-18`).
- Business model: no open-core or paid offering found in repo or site
  (unverified beyond that; see open questions). The Railway link carries a
  referral code (`README.md:155`).
- Relationship to Attractor: "Fabro was inspired by Attractor ... its design
  deeply influenced Fabro's architecture"; Kilroy also referenced
  (`docs/public/reference/acknowledgements.mdx:6-10`). Petri's format doc:
  "Graphviz DOT files (`*.fabro`, `*.dot`) in the dialect the reference
  implementation, Fabro, accepts, which the next revision of the Attractor
  specification is being drafted to take in" (`lithos-petri/crates/attractor/FORMAT.md:3-6`).
  Diagnostics are namespaced `attractor.*` (e.g. `attractor.unbound_input`,
  `docs/public/workflows/variables.mdx:166`).
- Architecture today (Cargo.toml:79-113): `lithos-llm` ("Provider-neutral LLM
  catalog and client"), `pebble-agent`/`pebble-coding-agent` ("the coding agent
  loop fabro runs its agent stages ... on"), `petri_*` ("the workflow engine
  Fabro runs its workflows on", including `petri-frontend-attractor` and
  `petri-attractor-steps`), `sandbox-driver*`. Fabro's single adapter crate:
  `lib/components/fabro-petri/src/lib.rs:1-30`. Migration commits: `580bb85f5`
  (2026-09-09, depend on lithos-llm), `18a3c4741` (2026-09-11, agent stages on
  pebble), `7eb5ca502` (2026-09-17, add fabro-petri).

Attractor spec coverage (spec files: `attractor-spec.md`,
`coding-agent-loop-spec.md`, `unified-llm-spec.md`, attractor clone at `fb57a55`):

| Spec area | Fabro | Evidence |
|---|---|---|
| DOT pipeline / graph engine | Yes, on petri (token-flow IR, AND-of-XOR routing) | `lithos-petri/README.md`; `docs/public/reference/dot-language.mdx` |
| Node handlers by shape | Mdiamond start, Msquare exit, box agent, `tab` prompt (one-shot LLM), parallelogram command, hexagon human, diamond conditional, component parallel, tripleoctagon fan-in, house manager loop | `docs/public/reference/dot-language.mdx:157-188` |
| Conditions | Yes, extended: `&&`, `||`, `!`, `>`, `contains`, `matches`; outcome names `succeeded`/`partially_succeeded` | `dot-language.mdx:382-400` |
| Model stylesheet | Yes (`*`, shape, `.class`, `#id`), also can set `backend` | `lithos-petri/crates/attractor/FORMAT.md` "Run creation happens at load"; `docs/public/workflows/stylesheets.mdx:131` |
| Retry/goal gates/loop restart | `retry_target`, `fallback_retry_target`, `goal_gate`, `loop_restart`, `loop_restart_signature_limit` | `dot-language.mdx:81-87,205-207,331` |
| Fidelity / thread reuse | `fidelity` (compact, full, summary:*, truncate), `thread_id` | `dot-language.mdx:219,441` |
| Human-in-the-loop | Hexagon gates, interview steps, mid-turn steering, live "pair" sessions | `README.md:49`; changelog 2026-05-20 |
| Checkpoints/resume | Git commits per stage, run store in SQLite, resume | `README.md:53`; `docs/public/execution/checkpoints.mdx` |
| Coding agent loop | pebble (profiles per model: anthropic, claude-5, openai, gemini, kimi, gpt56, gpt6) | `lithos-pebble/README.md:1-40`; `docs/public/core-concepts/models.mdx:142-144` |
| Unified LLM client | lithos-llm: OpenAI Chat/Responses, Anthropic Messages, Gemini, Bedrock Converse codecs | `lithos-llm/README.md:9-17` |
| Additions beyond spec | ACP backend, MiniJinja templates + `@file` prompts, `import=` sub-workflows, output_schema validation, MCP tools, hooks, skills, sub-agents, server/web UI, environments/sandboxes, automations, GitHub PR publishing, Slack | docs/public/* |

### 2. Backends / agents

- Backend enum is only `Api | Acp`; test asserts `"cli"` is rejected
  (`lib/foundation/fabro-types/src/llm_backend.rs:21-43`).
- History: `backend="cli"` with `claude`, `codex` or `gemini` added 2026-02-27
  (`docs/public/changelog/2026-02-27.mdx:14-23`); ACP added 2026-05-11 (commit
  `234bd5663`, PR #237); CLI removed 2026-05-18, "This removes the old CLI
  runtime path" (commit `29b7cc0de`, PR #307; `docs/public/changelog/2026-05-18.mdx:6-33`).
- **API backend**: "Fabro manages the agent loop directly — it calls the LLM
  provider's API, executes built-in tools in the sandbox" (`docs/public/core-concepts/agents.mdx`
  "API backend"). Supports session caching, sub-agents, provider failover, MCP.
- **ACP backend, how it works**: Fabro (petri step) is the ACP client.
  `lithos-petri/crates/attractor/steps/src/acp/mod.rs:1-56`: "A minimal Agent
  Client Protocol client over a step's process handle ... speaking ACP 1 JSON-RPC
  over stdio, as Claude Code (through the `claude-code-acp` adapter) and Gemini
  CLI (`gemini --acp`) do: `initialize`, `session/new` (after `authenticate`
  when the agent asks for it), `session/prompt`", streams `session/update`,
  answers `session/request_permission` via run hooks, `session/cancel` for
  interrupts/steering. Written against the wire protocol, not the
  `agent-client-protocol` crate. Fabro's own repo at `7fc0edbf8` has no ACP
  crate and no `agent-client-protocol` dependency; ACP lives only in petri.
  - Client limits: advertises `fs.readTextFile/writeTextFile: false` and no
    terminal (`mod.rs:619`); never calls `session/set_config_option`,
    `session/load` or `session/resume` (grep, 2026-10-04), so no model switch
    over ACP and no session resume. Permission requests are auto-allowed
    ("allow_always" when no `pre_tool_use` hook is configured, otherwise
    "allow_once" unless the hook blocks; `mod.rs:25,372-415`, `hooks.rs:39`).
    Cross-checked with the planner's acp.md.
  - Config: `acp.command` (shell-quoted line) or `acp.config` (JSON
    `{command,args,env}`, env values may be `{"$secret": NAME}`)
    (`lithos-petri/crates/attractor/steps/src/acp/command.rs:45-120`).
  - Credentials injected automatically if in the vault: `ANTHROPIC_API_KEY`,
    `GEMINI_API_KEY`, `OPENAI_API_KEY` (`command.rs:17`).
  - "ACP stages do not use Fabro model/provider credentials. The ACP process owns
    its auth, tools, and model behavior"; Fabro does not install agents/npx;
    "ACP is supported with local and Docker sandboxes; Daytona does not expose
    bidirectional stdio yet" (`docs/public/core-concepts/agents.mdx`, same text
    on https://docs.fabro.sh/core-concepts/agents, fetched 2026-10-04).
  - ACP vs API: no sub-agents, no provider failover, file tracking by
    `git diff`, no thread reuse (`agents.mdx` comparison table;
    `lithos-petri/crates/attractor/steps/src/agent.rs:368-374`).
  - Products: "complete against what Claude Code and Gemini CLI speak ... Claude
    Code has no ACP mode of its own; it speaks the protocol through the
    `claude-code-acp` adapter (the `@zed-industries/claude-code-acp` package)"
    (`lithos-petri/crates/attractor/FORMAT.md:741-748`). Live test tier installs
    `@zed-industries/claude-code-acp@0.16.2 @google/gemini-cli@0.45.2`, `#[ignore]`,
    gated on API keys (`lithos-petri/crates/petri/lib/tests/acp_products.rs:4-7,52,435`).
    That package is deprecated and renamed `@agentclientprotocol/claude-agent-acp`
    (0.85.1 per acp.md), so the pinned test target is about 70 releases old.
  - Earlier Fabro plans mapped Anthropic → `claude-code-acp`, OpenAI/Kimi/Zai/
    MiniMax/OpenAI-compatible → `npx -y @zed-industries/codex-acp@latest`,
    Gemini → `gemini-cli --experimental-acp` (`docs/plans/2026-05-11-add-acp-backend.md:21-23`);
    a smoke QA plan covered Claude, Codex, Gemini ACP on local and Docker
    (`docs/plans/2026-05-11-daytona-real-agent-smoke-qa-plan.md:83-85`).
    That automatic mapping was dropped with the strict contract.
  - No mention of opencode, goose, Pi or Qwen Code as ACP agents anywhere
    (grep, 2026-10-04). Any ACP stdio agent should work in principle.
- **Claude Code subscription**: no Anthropic OAuth; `AuthMethod` is only
  `ApiKey | CodexDevice` (`lib/foundation/fabro-auth/src/strategy.rs:32-35`).
  Only route is ACP via claude-code-acp. Host sandbox clears env but keeps
  `HOME`, `PATH`, `USER` and strips inherited `*_TOKEN`/`*_API_KEY` vars
  (`sandbox-driver/crates/sandbox-driver-host/src/exec.rs:47-71,192-195`), so
  the adapter could plausibly find a host `claude` login; a `CLAUDE_CODE_OAUTH_TOKEN`
  would need to be passed explicitly via `acp.config` env `$secret`. Not tested
  by Fabro (UNVERIFIED). If `ANTHROPIC_API_KEY` is in the vault it is injected and
  would take precedence.
- **Codex subscription**: "if you have an OpenAI Codex or ChatGPT subscription,
  you can sign in with your OpenAI account ... routed through OpenAI's Codex
  backend API" (`docs/public/changelog/2026-03-17.mdx:6-8`). Device flow at
  `https://auth.openai.com/codex/device` (`lib/foundation/fabro-auth/src/strategies/codex_device.rs:18`),
  stored as `vault:OPENAI_CODEX` (`lib/apps/fabro-cli/src/commands/provider/login.rs:46-59`).
  lithos-llm `openai-codex` provider: "OpenAI's ChatGPT-subscription access path,
  verified live against `chatgpt.com/backend-api/codex` with a Codex CLI
  credential on 2026-08-30"; seat-billed; pro models rejected; `stands_in_for =
  "openai"` (`lithos-llm/src/catalog/builtin/openai-codex.toml:1-59`). Fabro
  runs its own Codex-like harness (`gpt56` profile: `shell_command`,
  `apply_patch`, `update_plan`; `docs/public/core-concepts/models.mdx:144`). It
  does its own login; it does not read `~/.codex/auth.json` (no match in code).
- **Local Qwen**: built-in `ollama` provider, `base_url = http://localhost:11434/v1`,
  `enabled = false`, auth none (`lithos-llm/src/catalog/builtin/ollama.toml`);
  "add explicit `[llm.providers.ollama.models."<model-id>"]` blocks"
  (`docs/public/core-concepts/models.mdx:196-205`). Generic OpenAI-compatible
  custom provider via `[llm.providers.proxy] base_url = ...`, key derived as
  `<ID>_API_KEY` (`models.mdx:81-113`); LiteLLM entry too (`models.mdx:115-130`).
  Hosted Qwen: `qwen3.8-max`, `qwen3.8-27b` via Venice (`models.mdx:72-73`),
  Fireworks, OpenRouter, Bedrock. lithos-llm: Ollama "No live tests have run"
  (`lithos-llm/docs/provider-live-tests.md`, Ollama TODO).
- **DeepSeek**: `deepseek-v4-flash`, `deepseek-v4-pro` (`models.mdx:63-64`; legacy IDs that still work, the first now serving V4.1-Flash, so the catalog is not current),
  `base_url = https://api.deepseek.com` (`lithos-llm/src/catalog/builtin/deepseek.toml:14`),
  live test TODO open.
- **GLM**: `glm-5.2` on `zai` (`models.mdx:68`); "This is the Coding Plan
  endpoint" `https://api.z.ai/api/coding/paas/v4` (`lithos-llm/src/catalog/builtin/zai.toml:6,15`);
  general accounts overlay `https://api.z.ai/api/paas/v4` (provider-live-tests.md, Z.ai TODO).
- Other built-in providers: anthropic, openai, openai-codex, gemini, bedrock(+openai),
  fireworks, inception, litellm, minimax, modal (Kimi K3), moonshot, openrouter,
  poolside, typesafe, venice, vercel (`lithos-llm/src/catalog/builtin/`).
- OpenCode / Pi / Goose: not supported natively; only via ACP if they ship an ACP
  stdio mode (UNVERIFIED, not mentioned). Gemini CLI: via ACP (tested).

### 3. Sandboxing

- Per-run "environment" (provider, image, resources, network, lifecycle, env);
  "sandbox" is the runtime instance (`docs/public/execution/environments.mdx:6-9`).
  Providers: `local` ("no filesystem or network isolation", runs in place),
  `docker` ("the built-in default provider", default image `buildpack-deps:noble`),
  `daytona` (cloud VM, snapshots, CIDR allow-lists) (`environments.mdx:180-290`).
  Server-managed environments in SQLite or `[environments.<slug>]` in TOML; run
  selects with `[run.environment]` (`environments.mdx:12,26`).
- Third-party providers as JSON-RPC stdio plugins (`sandbox-driver/README.md:1-30`;
  `environments.mdx:273`). No E2B/Modal sandbox found (the `modal` integration is
  an LLM provider).
- Clone-based workspaces for Docker/Daytona (depth 100) (`environments.mdx:273`).
  Local worktree mode removed 2026-05-09 (`docs/public/changelog/2026-05-09.mdx:15-19`);
  parallel branches use isolated git worktrees (changelog 2026-03-01).
- Granularity: per run, not per node (no node-level environment attribute in
  `dot-language.mdx`). Remote access: `fabro sandbox ssh`, `fabro sandbox preview`.
- From the planner's sandboxes.md (not re-checked here):
  - Docker network policy is only allow_all or block. IP allow-lists exist only on Daytona, and nothing filters by domain.
  - ACP adapters run inside the active sandbox and must already be in the image.
  - The packaged deployment mounts `docker.sock`, which Fabro's own docs call "host-root-equivalent".
  - Docker is reached via `DOCKER_HOST`. OrbStack, Colima and Podman are untested.
  - `docs/public/agents/permissions.mdx` still describes the removed cli backend.

### 4. Extensibility

- New LLM provider, no code: catalog overlay `[llm.providers.<id>]` with
  `base_url`, `codecs`, `auth`, models, `metadata.agent.profile` (`models.mdx:81-142`).
- New provider protocol: implement `ProviderAdapter` / `AdapterFactory`
  (`lithos-llm/src/adapter.rs:175,355`).
- New harness: (a) any ACP stdio agent via `acp.command`/`acp.config`, no code;
  (b) pebble agent profile per model (`metadata.agent.profile`, selected per model
  or provider, `models.mdx:142-144`); (c) a new petri step kind
  (`lithos-petri/crates/core/ir/src/step.rs:50` `StepKind`,
  `lithos-petri/crates/core/steps/src/ctx.rs:149` `StepRunner`).
- New sandbox: `SandboxProvider` trait (`sandbox-driver/crates/sandbox-driver/src/provider.rs:24`)
  or plugin protocol; pebble `Environment` trait (`lithos-pebble/crates/pebble-coding-agent/src/environment.rs:481`).
- Per node: `backend`, `acp.command`, `model`, `provider` are node attributes and
  settable from the stylesheet by class/id (`stylesheets.mdx:131`), so harness
  can be chosen per node/class. Not per model automatically (the old auto mapping
  was removed).

### 5. Project health

- Repo created 2026-03-13 (first commit 2026-02-19 `40be74094`); 1,677 stars,
  179 forks; pushed 2026-10-03 (`gh repo view`, 2026-10-04).
- Commits per month (fabro repo, by author date; by commit date the reviewer counted Apr 1435, May 678, Jun 76, Jul 619, Aug 390, Sep 521, same trend): Apr 1271, May 711, Jun 74, Jul 567, Aug 441,
  Sep 519, Oct (3 days) 20. June dip coincides with work moving into lithos repos.
- Contributors since 2026-04-04: Bryan Helmkamp 2522 + 343 (two emails), Scott
  Werner 401, bots ~260, everyone else single digits (33 total identities).
  Effectively one company/person. lithos repos (last 200 commits each) are
  almost all Helmkamp.
- Open issues 63 of 151 total; open PRs 32 (`gh api search`, 2026-10-04).
- Releases: nightly pre-releases almost daily (v0.375.0-nightly.0 2026-10-03,
  v0.374 2026-10-02, ...); latest non-prerelease v0.254.0 (2026-06-04).
  Homebrew formula is `fabro-nightly`. SLSA provenance attestations.
- Stability: no explicit stability statement found; frequent breaking changes
  announced in changelog `<Warning>` blocks (e.g. 2026-05-09, 2026-05-18);
  environments doc refers to "pre-v1.0 config files" auto-migrated
  (`environments.mdx:12`). Deps on lithos crates track git `main`, not crates.io
  (`Cargo.toml:76-82`).
- Docs: extensive Mintlify site (docs.fabro.sh), 145 dated changelog entries,
  internal plans. Some staleness: `stylesheets.mdx:131` and
  `tutorials/multi-model.mdx:91` still list the removed `cli` backend; dated
  changelog files stop at 2026-09-03.

## Open questions / unverified

1. Whether claude-code-acp (or the renamed claude-agent-acp) in a Fabro local
   sandbox picks up a Claude subscription login (macOS keychain / `~/.claude`)
   is not tested by Fabro. In Docker it would need credentials mounted or a
   token passed via `acp.config` env.
2. Whether OpenAI's terms allow Fabro's own loop to use the Codex CLI's OAuth client id against `chatgpt.com/backend-api/codex`; it could be blocked at any time.
2b. codex-acp with ChatGPT login under Fabro: only in May plan docs; not in the
   current petri live tier.
3. Whether ACP now works on Daytona via petri (petri claims "Host, Docker, and
   Daytona plugins"; Fabro docs say no). Not checked in code.
4. Ollama/DeepSeek/Z.ai/LiteLLM provider entries are explicitly "provisional ...
   None of these imports has been tested against a live provider through Lithos"
   (`lithos-llm/docs/provider-live-tests.md`). Tool-calling quality with local Qwen
   unknown.
5. Business model: no paid/hosted product found; Qlty's intentions unknown.
6. Contributor counts for lithos repos come from depth-200 clones (partial).
7. Did not build or run Fabro.
