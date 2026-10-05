# Fabro's agent loop (pebble) and Omnigent

Research date 2026-10-05. Clones under `scratchpad/repos/`, pulled today:

| Repo | Commit | Commit date |
|---|---|---|
| lithoscomputer/pebble (`lithos-pebble/`) | `5ece45d1` | 2026-10-05 09:16 -0400 |
| lithoscomputer/lithos-llm (`lithos-lithos-llm/`) | `fd42e6b2` | 2026-10-05 08:49 -0400 |
| lithoscomputer/petri (`lithos-petri/`) | `c5062754` | 2026-10-05 08:17 -0400 |
| omnigent-ai/omnigent (`omnigent/`, new clone) | `3b913e8e` | 2026-10-05 13:36 +0000 |

Paths below are relative to those clone folders. `README.md:N` in Part 1 means
`lithos-pebble/README.md`.

## Summary

- **Pebble works on its own, as a library and as a CLI.** `pebble-coding-agent`
  is a Rust library (tokio): `CodingAgent::builder(client, Arc<dyn Environment>)
  .model(..).build().await`, then `agent.prompt(..).await` returns a
  `PromptReport`. It also ships a `pebble` binary whose `pebble exec` runs one
  prompt headless: JSON events on stderr, the answer on stdout, exit codes 0, 1
  and 130. Fabro and Petri are only users of it. The prior notes did not record
  the CLI.
- **DeepSeek, Z.ai and a custom OpenAI-compatible endpoint are all covered.**
  lithos-llm has built-in `deepseek` (`DEEPSEEK_API_KEY`) and `zai`
  (`ZAI_API_KEY`) providers. A custom provider for hosted Qwen is a TOML
  catalog layer: `models.toml` for the CLI, `CatalogBuilder::toml_layer` or
  `overlay_toml` for the library. Z.ai defaults to the Coding Plan endpoint, so
  pay-per-token use needs a `base_url` overlay. Both providers allow arbitrary
  model ids, but such a model gets unknown capabilities and limits. Neither
  provider has been live-tested.
- **All three models run on the generic `openai` profile.** It has 8 tools, and
  `edit_file` stands in for `apply_patch` on Chat Completions. No profile is
  tuned for Qwen, DeepSeek or GLM. The six harnesses mimic Claude Code, Codex,
  Gemini CLI and Kimi Code.
- **Sessions can be saved and resumed in the library.** `to_record()` gives a
  serde `SessionRecord` (format version 5) that `CodingAgent::resume` takes,
  with a choice of model (`ResumeMode`). An in-process warm export also exists.
  `pebble exec` has no resume. Only the interactive TUI saves and resumes
  sessions.
- **Maturity: young and fast-moving.** The first commit was about 2026-08-31.
  There are 243 commits, almost all by one author (Bryan Helmkamp, Qlty).
  Nothing is on crates.io (`publish = false`), and every lithoscomputer
  dependency is a git `branch = "main"` dependency. The tests are thorough
  (about 1,650 test functions). Licenses: pebble is MIT and lithos-llm is
  `MIT OR Apache-2.0`, both compatible with PAS.
- **Wrapping it for PAS**: an in-process handler (about 150-300 lines of Rust)
  is feasible because PAS is Rust and tokio. The cost is depending on four git
  repos with no versions. A thinner first step is spawning `pebble exec --json`
  per node, with the catalog and keys set per node through `PEBBLE_HOME`.
- **Omnigent is real and well known.** It is `omnigent-ai/omnigent`, a Python
  meta-harness from Databricks: Apache-2.0, about 10.6k stars, v0.16.0 on
  2026-09-29, alpha. It wraps other agents (Claude Code, Codex, Pi, OpenCode,
  Qwen Code, Kimi, Hermes, Goose, any ACP agent) behind a server with a web UI,
  sessions and policies. It is server-centric, needs Python 3.12, Node, pnpm
  and tmux, and has no one-shot headless CLI. A pipeline would drive it over
  its HTTP and SSE API. It fits poorly as a per-node handler for PAS.

## Facts

### 1. Pebble standalone: library, CLI, publication, license

**Library.**
- Pebble has four layers: lithos-llm, then `pebble-agent` (the generic loop),
  then `pebble-coding-agent` (profiles, file and shell tools, memory, skills,
  compaction, subagents), then the application (`README.md:15-41`). The
  libraries "never build a client or open a socket"; the application supplies
  the `Client`, the `Environment` and the event sink (`README.md:37-41,318-404`).
- Minimal embedding (`README.md:45-83`):
  - Build `lithos_llm::Client::builder().catalog(Catalog::builder().with_builtin().build()?)`
    with `.credentials(ConventionalCredentials::new())` and
    `.middleware(RetryMiddleware::new(policy).observer(RetryEventObserver))`.
  - Then call `CodingAgent::builder(client, Arc::new(LocalEnvironment::new(dir))).model("..").build().await?`.
  - Run with `agent.subscribe()` and `agent.prompt("..").await`, read
    `report.result?`, and finish with `agent.shutdown(ShutdownReason::Completed)`.
- Builder knobs (`crates/pebble-coding-agent/src/coding_agent.rs:714-934`):
  `model`, `tools` (application tools), `replace_tool`, `permission_level`,
  `tool_middleware`, `tool_env`, `redactor`, `search_provider`, `options`,
  `context_policy`, `compaction_policy`, `event_sink`, `subagents`,
  `fallback_routes`, and `mcp_servers` behind the `mcp` feature.
- `CodingAgentOptions` (`crates/pebble-coding-agent/src/config.rs`):
  `with_reasoning_effort` (:290), `with_user_instructions` (:369),
  `with_wall_clock_timeout` (:445), `with_max_tool_rounds` (:472),
  `with_max_turns` (:494).
- Workspace: the `Environment` trait is the single seam for files, search and
  Bash. `LocalEnvironment` acts on the host. A `SandboxEnvironment` adapter
  sits behind the `sandbox-driver` feature (`README.md:366-395`).
- The generic `pebble_agent::Agent` takes your own tools and has no coding
  profile (`README.md:529-563`).
- Petri embeds it this way: `lithos-petri/crates/attractor/steps/src/pebble.rs`
  (831 lines) calls `CodingAgent::builder(..).model(..)` or
  `CodingAgent::resume_from_export` (:320-333), with
  `.with_reasoning_effort(reasoning)`.

**CLI.**
- The `pebble-cli` crate builds the `pebble` binary
  (`crates/pebble-cli/Cargo.toml`, `src/main.rs:17-48`). Its subcommands are
  the interactive TUI (the default), `exec` and `auth`.
- `pebble exec` (`crates/pebble-cli-core/src/exec.rs:29-78`):
  - The prompt comes from an argument or stdin.
  - Flags: `-m/--model`, `-C/--cwd` (created if missing), `--permission
    read-only|read-write|full` (`full` enables shell), `--timeout 10m`,
    `--instructions` (appended to the system prompt), `--json` (one event per
    line on stderr), `-q`, `--tool-results`, `--transcript`, `--verbose`,
    `--subagents`.
  - Exit codes: 0 when answered, 1 on error, 130 on interrupt or timeout
    (:26-27, :89-96; `README.md:275-287`).
  - `exec` has no approval path: tools outside the permission level are hidden
    from the model (`README.md:289-292`).
- Reasoning level in `exec`: there is no flag. It is read from
  `<git root>/.pebble/settings.json` `"reasoning"`, falling back to
  `$PEBBLE_HOME/settings.json` (`crates/pebble-cli-core/src/settings/project.rs:20-79`,
  `exec.rs:111-128`).
- `exec` builds the model as `--model`, then the saved default, then
  `claude-sonnet-5`, and never prompts for setup (`docs/models-and-credentials.md:55-57`).
- Configuration lives in `PEBBLE_HOME` (default `~/.pebble`): `settings.json`,
  `models.toml`, `auth.json`, `sessions/` (`docs/models-and-credentials.md:26-35`).
  Setting `PEBBLE_HOME` per node isolates each node's catalog and keys.
- `pebble-cli-core` is "the command line as a library": `session::run_prompt`,
  the renderer and approval. Fabro's `fabro exec` reuses it (`README.md:306-316`).

**Publication and license.**
- `publish = false` across the workspace (`lithos-pebble/Cargo.toml:666`).
  crates.io has no `pebble-agent`, `pebble-coding-agent`, `pebble-cli` or
  `lithos-llm` crate (checked by API on 2026-10-05).
- lithos-llm and sandbox-driver are git dependencies on
  `branch = "main"` (`Cargo.toml:669-674`; `README.md:628-634`).
- lithos-llm's `Cargo.toml` names `documentation = "https://docs.rs/lithos-llm"`,
  but it is not published.
- Licenses: pebble is MIT (`LICENSE`). lithos-llm is
  `license = "MIT OR Apache-2.0"` (`lithos-lithos-llm/Cargo.toml:7`, with both
  LICENSE files; GitHub's detector shows only Apache-2.0). Petri and
  sandbox-driver are MIT.
- **Correction to impl-fabro.md:8**: that note gives lithos-llm as
  Apache-2.0 only, but it is dual-licensed.
- All four repos are public per `gh repo view`. Pebble's README still says CI
  "runners have no key for the private `lithos-llm` repository"
  (`README.md:655-657`). That line is stale; it contradicts `README.md:633-634`.

### 2. Providers via lithos-llm

- **DeepSeek** (`src/catalog/builtin/deepseek.toml`):
  - `base_url = https://api.deepseek.com` (:14), bearer auth,
    `allow_passthrough = true` (:16), `profile = "openai"` (:23-24).
  - Models: `deepseek-v4-flash` (the default; aliases `deepseek`,
    `deepseek-v4`) and `deepseek-v4-pro`. Both have a 1M context and
    reasoning effort low/medium/high/xhigh/max, with medium and xhigh mapped to
    high (:6-7, :26-45).
  - Key: `DEEPSEEK_API_KEY` (`src/credentials.rs:344`).
  - Header: "No live tests have run" (:3-4). The live-test checklist entry is
    unchecked (`docs/provider-live-tests.md:61`).
- **Z.ai** (`src/catalog/builtin/zai.toml`):
  - `base_url = https://api.z.ai/api/coding/paas/v4`, the **Coding Plan**
    endpoint (:6-8, :15), with `base_url_is_api_root = true` (:20).
  - Default model `glm-5.2`; `glm-4.7` is also listed. glm-5.2 offers only the
    `high` and `max` efforts (:30-47).
  - Key: `ZAI_API_KEY` (`src/credentials.rs:347`).
  - Pay-per-token needs a `base_url = "https://api.z.ai/api/paas/v4"` overlay
    (:6-7; `docs/provider-live-tests.md:77-82`). Not live-tested.
  - GLM-5.3 is not in the catalog. Name it through passthrough or declare a
    model block.
- **Custom OpenAI-compatible endpoint (hosted Qwen)**
  (`lithos-pebble/docs/models-and-credentials.md:151-210`):
  - Declare `[providers.<id>]` with `base_url`, `auth = { type = "bearer" }`,
    `codecs` (the default is `["openai-chat"]`), `default_model`,
    `[providers.<id>.metadata.agent] profile = "openai"`, and
    `[providers.<id>.models.<m>]` with `api_model`, `capabilities` and
    `limits`.
  - Select it as `<id>/<m>`.
  - Keys: `auth.json` maps the provider to an env var
    (`{"type":"env","variable":"..."}`, :110-126) or to headers (:128-149).
  - `PEBBLE_<PROVIDER>_BASE_URL` repoints a built-in provider and also enables
    it (:169-175).
  - In the library: `CatalogBuilder::toml_layer(name, src)` and
    `overlay_toml(src)` (`lithos-lithos-llm/src/catalog/loader.rs:61-120`).
  - A credential provider for a custom id must be supplied by the application,
    or `ConventionalCredentials::with_lookup` used (`lithos-lithos-llm/README.md`).
    UNVERIFIED: exactly how a custom provider id gets its bearer key through
    `ConventionalCredentials` without pebble-cli's `auth.json` layer.
- **Anthropic and OpenAI** are built in (`anthropic.toml`, `openai.toml`,
  `openai-codex.toml`), with conventional env keys
  (`docs/models-and-credentials.md:76-85`).
- **Arbitrary model ids**: a provider with `allow_passthrough = true` resolves
  any non-empty selector to a passthrough model
  (`src/resolver.rs:289-302`, `src/catalog/model.rs:397-417`).
  - A passthrough model has unknown capabilities, no limits, no pricing and
    empty metadata.
  - Pebble then falls back to its default context window and no output limit
    (`crates/pebble-coding-agent/src/profile.rs:189-191`).
  - UNVERIFIED: whether the agent profile comes from provider metadata for a
    passthrough model. Model metadata overrides provider metadata "per field"
    (`docs/models-and-credentials.md:208`), and passthrough model metadata is
    empty, so it probably inherits `openai`.
  - For anything long-running, declare the model with its limits rather than
    relying on passthrough.
- **Reasoning control**:
  - Library: `CodingAgentOptions::with_reasoning_effort(Option<ReasoningEffort>)`.
  - Catalog: per-model `reasoning_effort` capability flags and
    `metadata.agent.reasoning_by_default` (`profile.rs:193-199`).
  - The Chat codec sends `reasoning_effort` as a body field and replays
    `reasoning_content` on assistant turns
    (`src/codecs/openai_chat/encode.rs:88-90,314`; `decode.rs:77`). That replay
    is what DeepSeek and GLM thinking-with-tools need.
  - UNVERIFIED: whether Z.ai honors `reasoning_effort` or needs its own
    `thinking` parameter. The live-test checklist leaves "GLM 5.2 high/max"
    open.

### 3. Tools and profiles

- The profile comes from the catalog entry's `metadata.agent.profile`. Pebble
  "never guesses", and a missing profile is a build error
  (`README.md:594-602`).
- Valid ids are `anthropic`, `claude-5`, `openai`, `gemini`, `kimi`, `gpt56`
  and `gpt6` (`docs/models-and-credentials.md:206-210`).
- A profile sets the system prompt template (`profiles/prompts/*.md.j2`), the
  starting tools, their names (the "vocabulary") and the memory filenames:
  `AGENTS.md` plus `CLAUDE.md`, `.codex/instructions.md` or `GEMINI.md`
  (`README.md:149-161`).
- Core tools for every harness: `read_file`, `write_file`, `shell`, `grep`,
  `glob` and `web_fetch`, plus `web_search` only when a search provider is set
  (`crates/pebble-coding-agent/src/profiles.rs:172-202`).
- **`openai` profile** (`profiles/openai.rs`):
  - "The harness OpenAI's coding models expect, and every model reached
    through an OpenAI-compatible gateway" (:1-2).
  - 8 tools: `apply_patch`, `glob`, `grep`, `read_file`, `shell`,
    `update_plan`, `web_fetch`, `write_file` (:136-147).
  - On Chat Completions `edit_file` replaces `apply_patch`, because the
    freeform patch grammar only travels over the OpenAI Responses codec
    (:17-24, :153-159). DeepSeek, Z.ai and an OpenAI-compatible Qwen endpoint
    therefore get `edit_file`.
- `kimi` is Kimi Code's harness, used for Moonshot, Modal and Kimi models on
  Fireworks and Bedrock. `gpt56` offers "only codex's three tools"
  (`profiles/gpt56.rs:150`).
- Every built-in DeepSeek and GLM entry uses `openai`: `deepseek.toml:24`,
  `zai.toml:28`, and on Bedrock `deepseek-v3.2` and `glm-5`
  (`bedrock.toml:115,137`). There is no Qwen-, DeepSeek- or GLM-specific
  harness; the generic `openai` profile is the only option.
- Other tools: subagents (`SubagentOptions`), MCP (`mcp` feature), a question
  tool only with a `HumanInputProvider`, and application tools via
  `RegisteredTool::function` (`README.md:461-470,565-592`).
- Permissions: `PermissionLevel::{ReadOnly, ReadWrite, Full}` via
  `PermissionMiddleware`. This is "an application policy, not an
  operating-system sandbox" (`README.md:271-273,426-459`).

### 4. Sessions: export, resume, persistence

- **Durable record**: `CodingAgent::to_record() -> SessionRecord`
  (`coding_agent.rs:2280-2288`). It is serde, format version 5, and public API
  (`record.rs:30-60`; `README.md:611-621`).
- **Resume**: `CodingAgent::resume(client, env, record, ResumeMode)` (:1765).
  `ResumeMode::RecordedModel` restores the exact route; `ResumeMode::UseModel(sel)`
  switches model and keeps the conversation (:425-441).
- `continue_prompt()` finishes a prompt that was cut off mid-tool without
  repeating tool effects (`README.md:105-111`; `coding_agent.rs:1863`).
- **Warm export** (in-process only, not serializable):
  `export()`, `export_for_reuse(reason)` and `resume_from_export` keep the
  system prompt and skills and skip re-initialization
  (`coding_agent.rs:443-475,1787-1800,2296-2321`). Petri uses it for threads
  kept across stages (`lithos-petri/crates/attractor/steps/src/pebble.rs:1-12,101-104,326-333`).
- **Persistence to disk** is the application's job; pebble has no store. An
  `EventSink` gives a lossless ordered event log, keyed by
  `(stream_id, seq)`, and `SessionRecord::resume_after(log_head)` /
  `advance_event_cursor` line the log up with the record (`README.md:189-193,406-424`).
- The CLI TUI saves to `$PEBBLE_HOME/sessions/` and supports `--continue` and
  `--resume <id>` (`README.md:248-262`). `pebble exec` neither saves nor
  resumes (`exec.rs` has no such flag), so per-node resume through the CLI
  would mean writing our own wrapper.

### 5. Success and failure signals, events

- `prompt()` returns a `PromptReport` (`coding_agent.rs:489-524`) with:
  - `result: Result<PromptOutput{text, final_message}, Error>`
  - `usage` (tokens, plus cost when priced) and `timing`
  - `files_touched` and `last_file_touched`
  - `route` (the `provider/model` it ended on) and `compactions`
- Error kinds (`error.rs`): `Llm`, `Compaction`, `Agent`, `FallbackRoute`,
  `SessionClosed`, `ToolExecution`, and
  `Interrupted(WallClockTimeout | Cancelled | TurnLimit)`. The report also
  carries `ToolRoundsExhausted` and `EventStream` (`README.md:339-354,418-421`).
- **The agent has no "outcome" notion**: no success or fail status the model
  declares. A pipeline must decide routing from the text, the files or its own
  tool, for example an application `RegisteredTool` named `report_outcome`.
- Event types (`CodingEvent`, `types.rs:1023+`):
  - session and processing: `SessionStarted`, `SessionEnded`, `ProcessingEnd`,
    `UserInput`
  - model output: `LlmRequestStarted`, `LlmFirstOutput`, `AssistantMessage`,
    `TextDelta`, `ReasoningDelta`
  - tools: `ToolCallStarted`, `ToolCallOutputDelta`, `ToolCallCompleted`,
    `ToolProcessCompleted`
  - problems: `Error`, `Warning`, `LoopDetected`, `ToolRoundsExhausted`
  - MCP: `McpServerReady`, `McpServerFailed`, `McpServerDisconnected`
  - routing: `RouteFailover`, `RouteFailoverStopped`
- The serialized form is public API and changes only by addition
  (`README.md:604-626`).
- `subscribe()` is a lossy broadcast; `EventSink` is lossless.
  `SessionProjection` folds the events into usage and files
  (`README.md:163-177`).
- CLI: `--json` writes each serialized `CodingAgentEvent` to stderr, one per
  line (`crates/pebble-cli-core/src/render/mod.rs:131-134`). The final answer
  goes to stdout and the exit code gives the outcome (`exec.rs:89-96`).

### 6. Maturity

**Activity.**

| Repo | First commit | Commits | Since 2026-09-05 | Main author |
|---|---|---|---|---|
| pebble | 2026-08-31 | 243 | 125 | Bryan Helmkamp (234 of 243) |
| lithos-llm | 2026-08-29 | 303 | 125 | Bryan Helmkamp (296) |
| petri | 2026-08-30 | 560 | 485 | Bryan Helmkamp (530) |

All three have 0-1 GitHub stars.

**Tests.**
- About 1,657 `#[test]` / `#[tokio::test]` functions in pebble and about 1,413
  in lithos-llm.
- Snapshot tests pin each harness's tool list
  (`runtime/loop_tests/profiles.rs:507`).
- `mise run test` needs no key and no network (`README.md:650`). An OpenAI twin
  (`lithoscomputer/twins`) serves as the test double.

**API stability.**
- Version 0.1.0, unpublished, with git `main` dependencies.
- Events and `SessionRecord` are declared stable public API. Record format
  versions are refused, not migrated: v4 records are rejected
  (`README.md:611-621`).
- The rustdoc and README are detailed. There are also `docs/interactive.md`
  and `docs/models-and-credentials.md`.

**Provider live tests.** None for DeepSeek or Z.ai yet
(`lithos-lithos-llm/docs/provider-live-tests.md:61,77`).

### 7. Wrapping pebble as a PAS handler

**Option A: in-process Rust library.**
- PAS is Rust and tokio, and pebble is tokio with an async API, so this fits
  directly.
- A handler would:
  1. Build one `Client` with the built-in catalog plus a TOML overlay holding
     the Z.ai `base_url` and a Qwen provider, a credential provider fed from
     the PAS config, and the retry middleware.
  2. For each node, build a `CodingAgent` on a `LocalEnvironment(worktree)`,
     with the model, `permission_level(Full)`, reasoning effort, a timeout and
     `max_turns`.
  3. Install an `EventSink` that writes JSONL into the run folder.
  4. Call `prompt(node_prompt)`, map the `PromptReport` to the node outcome,
     and store `to_record()` next to the run so a re-run can `resume`.
- Estimate: about 150-300 lines plus config. This is an estimate, not
  measured.
- Dependency weight:
  - lithos-llm with `runtime` pulls in reqwest 0.13 (rustls), tokio, uuid and
    toml.
  - pebble-coding-agent adds sha2, tokio-util and rustix, plus rmcp 1.7 if
    `mcp` is on.
  - Everything comes from three or four lithoscomputer git repos on `main`,
    with no semver. `Cargo.lock` pins them, and updating means
    `cargo update -p`.
  - UNVERIFIED: conflicts with PAS's own reqwest and tokio versions. The PAS
    fork's `Cargo.toml` was not checked here.
- License: MIT plus MIT/Apache, compatible with PAS's `MIT OR Apache-2.0`.

**Option B: thin CLI wrapper.**
- Per node, spawn `pebble exec --json --permission full -C <worktree> -m
  <provider/model> --timeout <t> [--instructions ..] "<prompt>"` with
  `PEBBLE_HOME=<run>/pebble-home`. That directory holds `models.toml` (the
  overlays) and `auth.json` (env-sourced keys), plus
  `.pebble/settings.json` in the worktree for reasoning.
- Parse stdout for the answer, the exit code for the outcome and the stderr
  JSONL for events.
- Cost: no Rust coupling, but no session resume and no per-call reasoning flag.
  The binary must be built from source:
  `cargo install --git https://github.com/lithoscomputer/pebble pebble-cli`
  (UNVERIFIED that this exact command builds).

## Part 2: Omnigent

**Most likely meant: `omnigent-ai/omnigent`.**
- Origin: Databricks. The PyPI author is "Databricks, Inc.", and Databricks
  blogs about it ("Contextual Policies in Omnigent").
- Size: about 10,581 stars, Apache-2.0, Python 3.12+.
- Releases: PyPI `omnigent` 0.16.0 (39 releases); v0.16.0 on 2026-09-29.
- Activity: 4,423 commits since 2026-06-13, 1,065 since 2026-09-05. Status
  badge: alpha.
- Website: omnigent.ai.

**What it is.**
- A "meta-harness" (`README.md:5-7`). It runs other agents and does not mainly
  have its own loop.
- Supported harnesses: Claude Code, Codex, Cursor, OpenCode, Hermes, Pi,
  Antigravity, Copilot, Devin and Grok (both over ACP), Kiro, Kimi Code, Qwen
  Code and Goose. Native wrappers are in `omnigent/harnesses/*_native`; any ACP
  server is reachable via `harness: acp:<slug>` (`docs/AGENT_YAML_SPEC.md:58,247-287`).
- It also has its own `openai-agents` harness (OpenAI Agents SDK) and custom
  YAML agents with tools, MCP and sub-agents (`README.md:582-626`).
- Main value: a server with a web, phone and desktop UI, shared sessions,
  fork and attach, policies (approval, spend caps), cloud sandboxes (Modal,
  Daytona, E2B and others) and automations (`README.md:24-59`).

**Providers.**
- Credential kinds: API key, subscription (via the official `claude` and
  `codex` CLIs), gateway (any OpenAI- or Anthropic-compatible `base_url` plus
  key) and Databricks (`README.md:427-455`).
- Its own Python LLM client (`omnigent/llms/`, replacing litellm) routes to
  `openai`, `anthropic`, `gemini`, `bedrock`, `vertex`, `databricks`, `groq`,
  `deepseek` (`https://api.deepseek.com/v1`), `xai`, `openrouter` and `ollama`
  (`omnigent/llms/routing.py:18-30`; `LLMCLIENT.md:205-218`).
- GLM appears only as Databricks-hosted (`glm-5.2` → `databricks-glm-5-2`) and
  in effort mapping (`omnigent/util/reasoning_effort.py:166-180`). There is no
  direct Z.ai provider; it would go through the gateway route.
  UNVERIFIED: end to end.
- DeepSeek reasoning handling exists for the Pi harness
  (`omnigent/models/pi_model_compatibility.py:73-76`).
- Which models reach a coding loop depends on the wrapped harness: Pi,
  OpenCode or Qwen Code each bring their own provider support.

**Headless, ACP and JSON.**
- `omnigent run [AGENT] -p/--prompt` only "send[s] this as the first message
  when the REPL starts" (`omnigent/cli.py:7296,8437`). There is no one-shot
  exec with an exit code.
- Programmatic use is the HTTP plus SSE server API (`openapi.json`:
  `/v1/sessions`, `/v1/sessions/{id}/items`, ...) through the
  `omnigent-client` Python SDK (`sdks/python-client/README.md`). The local
  server runs on `:6767`.
- It consumes ACP agents. UNVERIFIED and not found: Omnigent exposing itself
  as an ACP server.
- Several commands have `--json` for status output only.

**Sessions.** Persistent and server-stored: `--resume <conv_id>`,
`--continue`, `--fork <session_id>`, `session export` and `session import`
(`omnigent/cli.py:6937,7101,8439-8451`).

**Weight.**
- Python 3.12 and `uv`, Node 22 and pnpm, `tmux` for the native wrappers, and
  `bwrap` on Linux (`README.md:136-171`).
- Telemetry is on by default (`README.md`, "Telemetry").

**Fit for PAS.** Poor as a per-node handler. It is a server-plus-UI control
plane over other harnesses, and PAS would have to run a server and drive
sessions over HTTP and SSE. It could at most be an alternative orchestration
layer, not a "multi-model handler" called per node.

**Other candidates found (unlikely to be meant):**

| Candidate | What it is |
|---|---|
| `FrancescoStabile/omnigent` | "Universal autonomous agent framework with ReAct loop, multi-provider LLM routing". MIT, 34 stars, last push 2026-02-14. |
| npm `omnigent` 2.0.0 (maintainer paparusi, repo Paparusi/omniagent) | Agent marketplace, payments and USDC bot. Unrelated. |
| crates.io `omniagent` 0.0.1 (ielm/omniagent) | "Cognitive architecture primitives for building agents on Tokio". 13 downloads. |
| Ecosystem around omnigent-ai | `sei-protocol/omnigent-go-sdk`, `MoonLadderStudios/MoonMind`, community sandbox providers, many forks of omnigent-ai/omnigent. These confirm it is the prominent project. |

**Searched:** web search ("Omnigent coding agent", "omnigent AI agent
github"), `gh search repos omnigent` and `"omni-agent coding"`, npm registry
`omnigent`, PyPI `omnigent`, crates.io `omnigent`, `omni-agent` and
`omniagent`.

## Open questions

1. Does Z.ai's paas/v4 endpoint honor `reasoning_effort` as lithos-llm sends
   it? Do DeepSeek V4 and GLM tool calls round-trip through the
   `reasoning_content` replay? Neither is live-tested in lithos-llm; a spike
   with real keys is needed.
2. How well does the generic `openai` profile (Codex-style prompt plus
   `edit_file`) work for Qwen, DeepSeek and GLM compared with their own
   harnesses (Qwen Code, Kimi-style)? Only an evaluation can tell.
3. Do pebble's git-`main` dependency versions (reqwest 0.13, tokio 1.49, rmcp
   1.7) resolve cleanly next to PAS's existing dependencies? Check against the
   PAS fork's `Cargo.toml`.
4. A custom-provider credential in library mode: does
   `ConventionalCredentials::with_lookup` cover a custom provider id, or must
   PAS implement `CredentialProvider`? Not confirmed.
5. Does a passthrough model on the `zai` and `deepseek` providers inherit
   `metadata.agent.profile = "openai"`, or fail the build for lack of a
   profile? Test with `glm-5.3`.
6. Is a per-node CLI wrapper enough without `exec` resume (Q28: continue
   sessions on re-run)? If not, PAS needs the library path, or a small custom
   binary over `pebble-cli-core` that stores `to_record()`.
7. Churn risk: one main author and about 4 commits a day on pebble. Pin a
   commit and plan for breaking updates.
