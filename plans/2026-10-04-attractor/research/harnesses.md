# Coding-agent harnesses

All facts checked 2026-10-04 unless marked. Repo facts come from `gh api`
(license, `pushed_at`, latest release). "(unverified)" means I did not see it
in a primary source.

## Summary

- Claude Code and Codex CLI are the only harnesses where a subscription is
  clearly allowed, and each is tuned for its own vendor's models. Anthropic
  allows the Claude Pro/Max login only in its own apps, so Claude must run
  through the real `claude` binary. OpenAI also allows ChatGPT sign-in in
  16 partner tools (since DevDay, 2026-09-29; secondary sources only). Both CLIs have a headless JSON
  mode. Both need an adapter for ACP.
- For open-weight models, each vendor now ships or names its own harness:
  Qwen → Qwen Code, DeepSeek → DeepSeek Harness (`dsh`), Z.ai GLM → ZCode,
  Moonshot Kimi → Kimi Code CLI. All four vendors also document Claude Code
  and OpenCode as supported clients.
- "DeepSeek's harness/plugins" most likely means **DeepSeek Harness (`dsh`)**,
  released 2026-08-13 (MIT). Everything in it is a plugin. It ships subagent
  plugins that hand a task to a real Claude Code, a real Codex, or any ACP
  agent, and each plugin instance has its own fixed model. (Guess, but the
  match is strong.)
- Picking the harness by model is practical. On Terminal-Bench 2.1, across
  12 same-model pairs, the vendor's own CLI scores −8.1 to +29.2 points
  against the neutral Terminus 2 harness. It clearly helps for Claude and
  GPT (Claude Code and Codex win every pair, +2.8 to +29.2), is mixed for
  Gemini (−8.1 to +2.7), and there is no data for the open-weight models. The cost is one CLI per vendor
  to install, log in, configure and update, each with its own headless flags
  and event schema. ACP or a thin adapter per CLI can hide the schema
  differences.

## Facts

### Comparison table

"Sub" = can sign in with a subscription plan instead of an API key.
Release dates are from GitHub releases.

| Harness | Tuned for | Subscription login | Headless | ACP | Customisation | License | Latest release |
|---|---|---|---|---|---|---|---|
| Claude Code (`anthropics/claude-code`) | Claude. Also takes any Anthropic-compatible endpoint (DeepSeek, GLM, Kimi document this) | Claude Pro/Max/Team/Ent OAuth (allowed only in Claude Code and Anthropic apps) | `-p`, `--output-format text\|json\|stream-json`, `--json-schema`, `--bare` | adapter: `agentclientprotocol/claude-agent-acp` v0.85.1 (2026-10-02) | plugins, hooks, skills, subagents, MCP, CLAUDE.md, `--system-prompt`/`--append-system-prompt`, `--settings` | proprietary (no SPDX) | v2.1.289, 2026-10-03 |
| Codex CLI (`openai/codex`) | GPT. Has a separate system prompt for each GPT model (prompt files to GPT-5.2; newer models via `models.json`). Custom providers are configured in `config.toml` | ChatGPT plan sign-in (also device code) | `codex exec --json` (JSONL), `--output-schema`, `-o`, `exec resume` | adapter: `agentclientprotocol/codex-acp` v2.1.1 (2026-10-01). The old `zed-industries/codex-acp` is archived | AGENTS.md, MCP, skills/plugins (unverified detail), `config.toml` | Apache-2.0 | rust-v0.160.0, 2026-10-01 |
| OpenCode (`sst/opencode` → `anomalyco/opencode`) | Any model. Picks a system prompt by model id (anthropic, gpt, codex, gemini, kimi, meta, trinity, beast, gpt-astra, default; GLM, DeepSeek and Qwen fall to default) | ChatGPT Plus/Pro, GitHub Copilot, GitLab Duo, OpenCode Zen/Go, Z.ai Coding Plan. Claude Pro/Max removed in 1.3.0 | `opencode run --format json`, `--auto`. Also `opencode serve` (HTTP) | native: `opencode acp` | plugins, agents, AGENTS.md, MCP, custom prompts | MIT | v1.18.34, 2026-09-30 |
| Pi (`badlogic/pi-mono` → `earendil-works/pi`) | Any model. Short base prompt, "minimal, extensible" | OAuth for Anthropic (Claude Pro/Max), OpenAI ChatGPT/Codex, GitHub Copilot, Kimi Coding, xAI, OpenRouter, Meta, Radius. API-key plans: Z.ai Coding Plan, Qwen Token Plan, Kimi For Coding | `-p/--print`, `--mode json` (JSONL), `--mode rpc`, SDK | adapter: `svkozak/pi-acp` (community) | extensions (TypeScript), skills, prompt templates, packages, MCP, `--append-system-prompt` | MIT | v1.0.2, 2026-10-04 |
| Qwen Code (`QwenLM/qwen-code`) | Qwen ("optimized for Qwen models"). Forked from Gemini CLI v0.8.2 | Alibaba Cloud Coding Plan / Token Plan. The free Qwen OAuth tier ended 2026-04-15 | `-p`, `--output-format text\|json\|stream-json` | native (ACP list). `qwen serve` daemon is experimental | `--system-prompt`, `--append-system-prompt`, MCP, skills, subagents (unverified detail) | Apache-2.0 | v0.24.7, 2026-09-29 (nightlies daily) |
| Gemini CLI (`google-gemini/gemini-cli`) | Gemini | Sign in with Google for paid tiers. Unpaid and Google One users were moved to Antigravity CLI on 2026-06-18 | `-p`, `--output-format json\|stream-json` | native | extensions, GEMINI.md, MCP | Apache-2.0 | v0.62.0, 2026-09-29 |
| DeepSeek Harness `dsh` (`deepseek-ai/deepseek-harness`) | DeepSeek V4 (direct adapter). Other providers go through pi-ai (Pi's model library) | DeepSeek API key. Codex OAuth "not supported yet" in the UI (community plugin exists) | `dsh --profile headless "<task>" [--json]` (NDJSON) | native: `dsh --profile acp` (server), `subagent-acp` (client); not on the ACP agents page | everything is a plugin (Cordis), presets, personas, skills, hooks, MCP | MIT | dsh-v0.2.1-alpha.1, 2026-10-03 (developer preview) |
| ZCode (`zai-org/ZCode`) | GLM-5.3 | GLM Coding Plan, Z.ai/BigModel key | has an agent CLI (`apps/zcode-cli`). Headless flags unverified | not on the ACP agents page | plugins (`.zcode-plugin/plugin.json`), MCP, skills | Apache-2.0 | v3.14.3, 2026-09-24 |
| Kimi Code CLI (`MoonshotAI/kimi-code`) | Kimi | Kimi Code OAuth (Kimi membership, Plus tier and up) or Moonshot key | `-p`, `--output-format text\|stream-json` | native: `kimi acp` | plugins marketplace, skills, MCP, hooks, subagents | MIT | 2.1.1, 2026-09-24 |
| Crush (`charmbracelet/crush`) | Any (Catwalk catalog). Charm's own provider is "Hyper" (subscription) | Hyper subscription. Others by API key | `crush run` (text only, no JSON flag in `internal/cmd/run.go`) | not listed | CRUSH.md / AGENTS.md, skills, hooks (preliminary), MCP | FSL-1.1-MIT | v0.97.1, 2026-09-29 |
| Goose (`block/goose` → `aaif-goose/goose`) | Any | can delegate to Claude Code / Codex through ACP providers (`claude-acp`, `codex-acp`). The older CLI pass-through providers are deprecated | `goose run -t ... --output-format json\|stream-json` | native: `goose acp` | recipes, MCP extensions, subagents | Apache-2.0 | v1.53.0, 2026-10-02 |
| Cline CLI (`cline/cline`) | Any | Cline account / ClinePass, BYOK | headless when `--json` is used or stdin/stdout is redirected. `--auto-approve` | native | rules, MCP, `-m/-P` overrides | Apache-2.0 | cli-v3.0.68, 2026-10-02 |
| Kilo CLI (`Kilo-Org/kilocode`) | Any (500+ models) | Kilo account. Listed by Z.ai and Alibaba coding plans | `kilo run` (unverified, believed to be OpenCode-derived) | not on the ACP agents page | MCP, modes | MIT | v7.8.3, 2026-10-01 |
| Droid (Factory) | Any frontier model. BYOK through `custom:` models | Factory account (`FACTORY_API_KEY`) | `droid exec`, `--output-format text\|json\|stream-jsonrpc`, `--auto low\|medium\|high` | native | AGENTS.md, MCP, custom droids (unverified) | proprietary | not on GitHub releases |
| Amp (Sourcegraph/Amp) | Amp chooses the model by mode (smart/rush/deep), or the user picks | Amp account. ChatGPT Plus/Pro sign-in (DevDay partner), BYOK | `-x/--execute`, stream JSON | not on the ACP agents page | AGENTS.md, skills, plugins | proprietary | n/a |
| Aider (`Aider-AI/aider`) | Any (edit formats per model) | API keys | `--message`, `--yes` | no | conventions files | Apache-2.0 | v0.86.0, 2025-08-09 (no release in 14 months) |

Other names worth knowing: GitHub Copilot CLI, Cursor CLI, Antigravity CLI
(Google, replaced Gemini CLI for free users), Qoder CLI (Alibaba, native
Qwen3.8 support), OpenHands, mini-swe-agent and Terminus 2 (neutral benchmark
harnesses), OpenClaw and Hermes Agent (general agents that many coding plans
list), Oh My Pi (Pi fork), DeepSeek-TUI and Reasonix (community harnesses
built for DeepSeek).

### Per-harness notes and sources

**Claude Code.** The headless flags, `--bare`, `--json-schema` and
`--permission-prompts none` are documented at
https://code.claude.com/docs/en/headless. In bare mode the CLI does not read
the OAuth login. A subscription works only without `--bare`. On subscription
use, https://code.claude.com/docs/en/legal-and-compliance says three things:
- OAuth is "intended exclusively for purchasers of Claude ... plans and is
  designed to support ordinary use of Claude Code and other native Anthropic
  applications".
- Developers building products "should use API key authentication" and may
  not "route requests through Free, Pro, or Max plan credentials on behalf of
  their users".
- An end user may still sign in to "the unmodified Claude Code binary with
  their own Claude subscription", including on a platform that hosts it.

Usage limits "assume ordinary, individual usage of Claude Code and the Agent
SDK". Press timeline (secondary): Anthropic blocked third-party OAuth on
2026-01-09 and then reversed. It changed the ToS in February 2026 and blocked
Pro/Max in third-party agentic tools from 2026-04-04
(https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/,
https://dev.to/mcrolly/anthropic-kills-claude-subscription-access-for-third-party-tools-like-openclaw-what-it-means-for-3ipc).
OpenCode's provider docs say "Anthropic explicitly prohibits this" and that
OpenCode dropped the bundled plugins in 1.3.0
(https://opencode.ai/docs/providers/). Pi still ships a Claude Pro/Max OAuth
flow (`packages/ai/src/auth/oauth/anthropic.ts` in `earendil-works/pi`
`main`). Using it is against Anthropic's terms.

**Codex CLI.** For `codex exec`, the docs list `--json` (events
`thread.started`, `turn.completed`, `item.*`), `--output-schema`, `-o`,
`--sandbox`, `exec resume` and `CODEX_API_KEY` for CI
(https://learn.chatgpt.com/docs/non-interactive-mode, which
developers.openai.com/codex/noninteractive redirects to). Auth: ChatGPT
sign-in or API key, with device code for headless machines
(https://learn.chatgpt.com/docs/auth). There are prompt files per model
family in `codex-rs/core/` (`gpt_5_codex_prompt.md` up to
`gpt_5_2_prompt.md`); GPT-5.5/5.6/6 use `model_messages.instructions_template`
in `codex-rs/models-manager/models.json`. At DevDay (2026-09-29), "Sign in with ChatGPT" lets Plus/Pro
subscribers spend their plan allowance in third-party tools. Sixteen launch
partners; named ones include Devin, Amp, Warp, OpenCode, OpenClaw, Notion and
Vercel
(https://securitybrief.com.au/story/openai-launches-chatgpt-sign-in-for-16-partner-tools,
https://thenewstack.io/sign-in-with-chatgpt/). The openai.com recap returned
403, so this is secondary only. Whether a tool outside the partner list may
use it is unverified.

**OpenCode.** The repo moved to `anomalyco/opencode`; `sst/opencode`
redirects there. The CLI docs cover `run --format json`, `--auto`, `serve`
and `acp` (https://opencode.ai/docs/cli/). Per-model prompts are chosen in
`packages/opencode/src/session/system.ts` on branch `dev`. GLM, DeepSeek and
Qwen fall through to `default.txt`. DeepSeek's docs require OpenCode
>= 1.14.24 (https://api-docs.deepseek.com/guides/coding_agents/).

**Pi.** The repo moved to `earendil-works/pi`. The README calls Pi "a minimal,
extensible agent harness" with no built-in sub-agents or plan mode. Modes
`--print`, `--mode json` and `--mode rpc` are in
`packages/coding-agent/docs/cli.md`. MCP support is built in (`docs/mcp.md`),
and there is a `llama-cpp.md` doc for local models. The list of OAuth
providers comes from the file names in `packages/ai/src/auth/oauth/`. DSH uses
Pi's `pi-ai` library for its non-DeepSeek providers
(`packages/llm/llm-pi-ai`).

**Qwen Code.** Auth: https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/
(the OAuth free tier was "discontinued on 2026-04-15"). Headless:
https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/. The
README says it was "originally based on Google Gemini CLI v0.8.2". It also
links "Qwen Code Claw" (`openclaw/acpx`), which lets Claude or Codex hand
tasks to Qwen Code over ACP. The Qwen3.8 repo (https://github.com/QwenLM/Qwen3.8)
recommends Qwen Code and Qoder and says to serve with
`--tool-call-parser qwen3_coder` (vLLM/SGLang). Qwen3.8-27B (open weights,
created on HF 2026-08-05) is the realistic local model. Qwen3.8-2.4T-A95B is not.

**Gemini CLI.** Headless: https://geminicli.com/docs/cli/headless/. Auth page
(https://geminicli.com/docs/get-started/authentication/): "Unpaid tier and
Google One users: Gemini CLI was replaced by Antigravity CLI on June 18th,
2026". Google banned and then reinstated paid accounts that used Antigravity
OAuth in OpenClaw (Feb 2026,
https://winbuzzer.com/2026/02/23/google-bans-ai-subscribers-openclaw-no-refunds-xcxwbn/).
Goose deprecated its Gemini OAuth pass-through for the same reason
(`documentation/docs/guides/cli-providers.md`).

**DeepSeek Harness.** See the next section. Sources: repo README, commit
`5badb15`, files `docs/user/guide/providers.md`,
`packages/bundle/headless/README.md` and `packages/acp/acp/README.md`.

**ZCode.** The repo description is "Z.ai's coding agent harness". The README
(Chinese) says it is a desktop app, a browser UI and a terminal agent, with
the agent CLI in `apps/zcode-cli`. The Z.ai Coding Plan docs
(https://docs.z.ai/devpack/overview) run a promotion: unlimited
GLM-5.3-Flash in ZCode. The official tool list
(https://docs.z.ai/devpack/tool/others): ZCode, Claude Code, Claude for IDE,
Codex, OpenCode, Pi, Cursor, Cline, TRAE, Qoder, Droid, Kilo Code, Roo Code,
Crush, Goose, Eigent, AutoClaw, OpenClaw, Hermes Agent, SillyTavern. The plan
"is limited to use within the following officially supported tools and
product environments; users may not use their subscription benefits for
tools or scenarios outside of this scope". The FAQ
(https://docs.z.ai/devpack/faq) says "strictly limited … shall not use the
subscription benefits in any unsupported tools or scenarios".

**Kimi Code CLI.** The Python `MoonshotAI/kimi-cli` was archived on
2026-09-22 and replaced by `MoonshotAI/kimi-code`. Flags are in
`docs/en/reference/kimi-command.md`: `-p` runs with "auto" permission and
`--output-format stream-json`. The Kimi membership quota works in Claude
Code, Roo Code and OpenCode
(https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html).

**Crush.** License file `LICENSE.md` is FSL-1.1-MIT (source-available,
becomes MIT later).

**Goose.** The repo moved to `aaif-goose/goose`. `goose run --output-format`
and `goose acp` are in `documentation/docs/guides/goose-cli-commands.md`. In
`cli-providers.md`, the Claude Code, Codex and Gemini CLI pass-through
providers are "deprecated. Use the ACP providers (`claude-acp`, `codex-acp`)".

**Droid.** https://docs.factory.com/cli/droid-exec/overview.
**Amp.** https://ampcode.com/manual (WebFetch summary only).
**Cline CLI.** https://docs.cline.bot/cline-cli/overview.

**ACP support list:** https://agentclientprotocol.com/get-started/agents.
- Native: Cline, Droid, Gemini CLI, Goose, Kimi CLI, OpenCode, Qwen Code,
  Cursor, Copilot, OpenClaw, Hermes, and others.
- Through an adapter: Claude, Codex, Pi.

**Benchmarks (Terminal-Bench 2.1,** https://snorkel.ai/leaderboard/terminal-bench-2-1/,
WebFetch summary):

| Model | Vendor harness | Terminus 2 |
|---|---|---|
| Claude Fable 5 | Claude Code 83.8 | 80.4 |
| Claude Opus 4.7 | Claude Code 68.9 | 66.1 |
| GPT-5.5 | Codex CLI 83.1 | 78.0 |
| Gemini 3.1 Pro | Gemini CLI 65.8 | 65.6 |
| Gemini 3 Pro (2025-11-18) | Gemini CLI 65.8 | 73.9 |

Differences: +3.4, +2.8, +5.1, +0.2, −8.1.

The same page's second chart, "Average accuracy across 14 representative
agent–model pairs" (`data-model`/`data-agent`/`data-tb21`, curl, checked
2026-10-04), gives 7 more TB 2.1 pairs:

| Model | Vendor harness | Terminus 2 | Difference |
|---|---|---|---|
| GPT-5.3-Codex | Codex CLI 79.1 | 68.5 | +10.6 |
| GPT-5.4 | Codex CLI 77.3 | 54.8 | +22.5 |
| GPT-5.4 mini | Codex CLI 66.1 | 36.9 | +29.2 |
| Opus 4.6 | Claude Code 70.1 | 63.8 | +6.3 |
| Sonnet 4.6 | Claude Code 58.5 | 51.5 | +7.0 |
| Gemini 3 Flash | Gemini CLI 56.9 | 54.2 | +2.7 |
| Gemini 3.1 Pro | Gemini CLI 67.1 | 70.7 | −3.6 |

Gemini 3.1 Pro appears twice with different numbers (main board 65.8 vs
65.6; chart 67.1 vs 70.7), so these are separate runs. Across all 12 pairs:
Claude Code and Codex always beat Terminus 2; Gemini CLI is mixed. The Gemini 3 Pro pair was read
from the page's row attributes (`data-model`/`data-agent`/`data-score`,
curl, checked 2026-10-04). Also on the board: GLM-5.1 in Claude Code, 58.7.
The board has 18 rows; none is DeepSeek, Qwen or Kimi. Newer
single-harness rows (GPT-6 Astra on Codex 87.4, Opus 4.8 on Claude Code
78.9) have no Terminus 2 row to compare. DeepSeek reports V4-Pro-0813 at 87.9 on TB 2.1 "inside an agent
execution environment"
(https://venturebeat.com/technology/deepseek-harness-launches-as-open-source-rival-to-claude-code-alongside-v4-pro-on-api-with-higher-prices).
Which harness was used is unverified. Vals' Terminal-Bench 4.0 runs every
model in mini-swe-agent, so it says nothing about the harness effect
(https://www.vals.ai/benchmarks/terminal-bench-4).

## DeepSeek's harness/plugins: what the operator likely means

Candidates, most likely first:

1. **DeepSeek Harness (`dsh`)**, my guess. `deepseek-ai/deepseek-harness`:
   - MIT, created 2026-08-13, about 243k stars, developer preview, latest
     dsh-v0.2.1-alpha.1 (2026-10-03).
   - Tagline: "Everything is a Plugin", built on Cordis. The model adapter,
     tools, session log and agent loop are all plugins.
   - The subagent family delegates to a child that is "backed by ACP, Codex,
     Claude Code, or another Harness runtime" (`packages/subagent/README.md`):
     - `dsh-subagent-claude-code` runs "a genuine, unattended Claude Code
       session" through the official Agent SDK with a pinned CLI, under the
       host's own Claude settings and login.
     - `dsh-subagent-codex` runs a real Codex through the app-server protocol.
     - `dsh-subagent-acp` spawns any ACP agent.
   - Each provider instance has a fixed `model` and `permissionMode`, and
     "each delegation tool row names one provider". So you build one tool per
     harness+model, for example "Claude via Claude Code" and "GPT via Codex",
     and the main DSH agent (DeepSeek or another model through pi-ai) picks
     among them.
   - That fits "plugins that could select the harness per model". Strictly
     it is the configuration that binds a model to a harness, and the
     orchestrating model picks the tool. Nothing routes automatically by
     model.
   - DSH also exposes itself over ACP (`dsh --profile acp`), so an Attractor
     could drive it as one more backend.
   - Hook bridges that read Claude Code's `hooks.json`: verified in the repo
     (`packages/hooks/hooks-claude-code/`, design note
     `.agents/notes/archived/feature/2026-06-30-hook-bridges.md`, master).
2. **DeepSeek's Anthropic-compatible API used with Claude Code.**
   https://api-docs.deepseek.com/guides/coding_agents/ ("Integrate with AI
   Tools") covers Claude Code (`ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`),
   OpenCode and OpenClaw. It does not mention DSH. That is model-in-another-
   harness, not harness selection.
3. **`deepseek-ai/awesome-deepseek-agent`.** A list of about 24 guides for
   running DeepSeek V4 in Claude Code, Codex, Crush, Pi, OpenCode, Qwen Code,
   Kilo and others. It is documentation only.
4. A DeepSeek Claude Code plugin: none found.

## Pick the harness by model: practical?

Yes, if the harness count stays small. The evidence:

- **Vendor intent.** Every model vendor named here either ships a harness
  (Anthropic, OpenAI, Google, Qwen, DeepSeek, Z.ai, Moonshot) or tunes for
  one. Codex and OpenCode carry a separate prompt for each model family.
  Generic harnesses use a default prompt for GLM, DeepSeek and Qwen.
- **Benchmarks.** For the same model, the vendor CLI scores −8.1 to +29.2
  points against Terminus 2 on TB 2.1 (12 pairs, tables above). Claude Code
  and Codex win every pair (+2.8 to +29.2, largest for GPT); Gemini CLI is
  mixed (−8.1 to +2.7). There are no public same-model comparisons
  for the open-weight vendors.
- **Subscriptions force part of the answer.**
  - Claude subscription: only through the `claude` binary.
  - ChatGPT subscription: through Codex, and through partner tools since
    2026-09-29.
  - GLM, Kimi and Alibaba coding plans: API keys that work in many tools,
    including Claude Code. The GLM Coding Plan is limited to Z.ai's listed
    tools; the QwenCloud Token Plan allows any tool and also serves glm-5.2
    and deepseek-v4-pro (see models.md).

Defensible mapping:

| Model | Harness | Evidence | Fallback |
|---|---|---|---|
| Claude (Pro/Max) | Claude Code | ToS; TB 2.1 | none on subscription |
| GPT (ChatGPT plan) | Codex CLI | TB 2.1; OpenAI's own | OpenCode (DevDay partner, ChatGPT sign-in); Pi's ChatGPT sign-in unverified as allowed |
| Qwen3.8 local | Qwen Code | Qwen3.8 repo recommends it; Qwen-tuned | OpenCode or Pi (OpenAI-compatible endpoint). Caveat: works only as well as the server's tool parser (Ollama qwen3coder bugs, llama-server `--jinja`; see models.md) |
| DeepSeek V4 | DeepSeek Harness | vendor's own; 87.9 TB 2.1 claim (harness unverified) | Claude Code via `/anthropic` endpoint (first in DeepSeek's docs); OpenCode |
| GLM-5.3 | ZCode CLI (headless unverified) | vendor's own; promoted in the plan | Claude Code (Z.ai lists it; TB 2.1 GLM-5.1 = 58.7) |

What it costs:

- **Install, login and update per CLI.** Five harnesses means five
  release streams. Qwen Code publishes a nightly every day, Claude Code
  releases almost daily, and DSH is alpha with "compatibility-breaking
  changes" promised.
- **Different headless contracts.** Each CLI has its own:
  - flags: `-p` vs `exec` vs `run` vs `--profile headless`
  - event schema: stream-json, JSONL items, NDJSON, or text only (Crush)
  - permission model
  - exit codes
- **Normalising the output.** Either write one adapter per CLI or go through
  ACP. ACP is native for Qwen Code, Gemini CLI, OpenCode, Kimi, Goose, Cline
  and Droid. Claude Code and Codex need adapter processes.
- **Config and context files differ too:** CLAUDE.md, AGENTS.md, GEMINI.md,
  CRUSH.md, `.zcode-plugin`. Skills and MCP config are per tool.
- **Cheaper middle path:**
  - Claude Code for Claude.
  - Codex for GPT.
  - One multi-model harness (OpenCode or Pi) for all open-weight models,
    adding vendor harnesses only where a test shows a gain.

  That is three CLIs instead of five or more. DSH and Goose already
  implement the "orchestrator delegates to the real Claude Code or Codex"
  pattern, which shows it can be done.

## Risks

- **Subscription terms (high impact).** Claude Pro/Max only through the
  `claude` binary; heavy parallel pipeline use may exceed "ordinary,
  individual usage". Pi's Claude login breaks Anthropic's terms. A
  violation can cost the operator's account.
- **Churn (likely).** Claude Code and Qwen Code release almost daily; DSH
  is alpha; ACP adapters for Claude, Codex and Pi lag their CLIs. Each
  harness added multiplies breakage.
- **Unproven gain.** The vendor harness clearly helps for Claude and GPT,
  but not reliably for Gemini (−8.1 to +2.7). No same-model evidence at all for Qwen,
  DeepSeek or GLM. A small local eval would settle
  it before committing to five CLIs.
- **Unverified pieces.** ZCode headless flags and OpenAI's partner sign-in
  list were not read from primary sources.

## Open questions

For the operator:
1. Does "DeepSeek's harness/plugins" mean DeepSeek Harness (`dsh`) and its
   subagent plugins? Or DeepSeek's "Integrate with AI Tools" page (DeepSeek
   inside Claude Code or OpenCode)?
2. Is the Attractor meant to *be* the orchestrator, or would it use DSH or
   Goose as the orchestrator over Claude Code and Codex?
3. Is "Qwen 3.8" Qwen3.8-27B (open weights, runs locally)? On what server
   (Ollama, llama-server, LM Studio or mlx_lm.server; vLLM targets CUDA)
4. For GLM and DeepSeek: API keys, the GLM Coding Plan, or local weights?
5. How many CLIs are you willing to maintain? All vendor harnesses, or
   Claude Code + Codex + one generic harness?
6. Driving the `claude` binary headless with your own Pro/Max login looks
   allowed ("unmodified Claude Code binary"). Anthropic "does not permit
   third-party developers to offer Claude.ai login into their own
   applications, or to route requests through Free, Pro, or Max plan
   credentials on behalf of their users", and limits "assume ordinary,
   individual usage of Claude Code and the Agent SDK". DSH reuses the
   host's own login (subagent-claude-code README:60), which suggests
   personal use is tolerated. Heavy parallel automation may not be
   "ordinary, individual usage". Do you accept that risk, or use an
   API key for pipeline runs?

To research:
- Do ZCode CLI and Qwen Code have a stable headless JSON contract? I have not
  read the ZCode CLI flags.
- Does DSH's Claude Code subagent (Agent SDK, pinned CLI, user's
  subscription) fall under "developers ... should use API key
  authentication"?
- Which partners can use OpenAI's "Sign in with ChatGPT", and can a personal
  tool like the Attractor register? The primary openai.com page returned 403.
- Are there Terminal-Bench (or similar) results that put DeepSeek, GLM or
  Qwen in their own harness next to a neutral one?
