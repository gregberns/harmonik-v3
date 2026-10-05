# Attractor implementations (Q2)

Checked 2026-10-04. Spec: https://github.com/strongdm/attractor (1,324 stars,
196 forks, last push 2026-03-17). Product page with a community list:
https://factory.strongdm.ai/products/attractor.

## Summary

- There are dozens of implementations. Most were written in February and March
  2026, often by coding agents, and have had no commits since. About 15 are
  substantial and were still getting commits from July to October 2026.
- Beyond Kilroy and Fabro, the live implementations that can drive CLI agents
  (Claude Code or Codex) or ACP agents are:
  - **allouis/attractor** (Go, ACP-first)
  - **2389-research/tracker** (Go; native, `claude-code` and `acp` backends; is
    moving from DOT to its own DSL, Dippin; DOT still loads with a deprecation
    warning)
  - **citadelgrad/pascals-discrete-attractor** (Rust; Claude Code, Codex and
    Gemini CLIs)
  - **nnunley/strange-lettractor** (let-go/Clojure; all three specs; external
    `claude` and `codex` agents)
  - **TheFellow/fkyeah** (F#; all three specs plus an ACP runtime)
  - **jleechanorg/dark-factory** (claude, codex, ao and agy backends)
  - **lithoscomputer/petri** (Rust IR engine with Attractor and Fabro frontends,
    ACP)
  - **OilProducts/spark** (Rust; Codex CLI)
- **OpenAI-compatible endpoints (local Qwen)**: documented for tracker
  (`openai-compat` provider) and strange-lettractor (llama.cpp, Ollama,
  vLLM). For allouis, fkyeah and dark-factory, local models are possible
  only through an ACP or CLI agent that itself reaches the endpoint.
  pascals' README names only OpenAI, Anthropic and Gemini. spark's README
  lists provider keys (OpenAI, Anthropic, Gemini, OpenRouter) but no base
  URL. All README-level, 2026-10-04; none confirmed in code.
- Also live, but these run models through provider APIs or wrap an existing
  agent runtime instead of driving CLI agents: **microsoft/amplifier-bundle-attractor**
  with **amplifier-bundle-dot-runner** (Python, all three specs, Amplifier
  ecosystem) and the **stencila** `rust/attractor` crate (embedded in Stencila).
- No longer getting commits, but notable: coreydaley/attractor (Kotlin/JVM,
  CLI subprocesses plus OpenAI-compatible endpoints, last push June; archived
  2026-07-13) and
  tgoodwin/tractor (Elixir, ACP bridges, last push May).
- Two entries on the product page have gone stale: "Forge" (smartcomputer-ai/forge) now
  redirects to smartcomputer-ai/lightspeed, a Temporal agent harness. I found no
  Attractor code in its tree. "Dark Factory" (DeepCreative/dark-factory) returns
  404 (see open questions).
- Package registries are nearly empty: `@jhugman/attractor-pi` on npm (named in
  its README; I did not check the registry entry itself) and the
  `streamweave-attractor` crate. npm `attractor` and crates `attractor` are
  unrelated projects, and PyPI `attractor` does not exist.

Legend for the coverage column: **P** = pipeline engine (attractor-spec), **A** =
coding-agent-loop, **L** = unified LLM client. "?" = not verified. Source column:
**page** = listed on factory.strongdm.ai, **own** = found by my own search.
Commit counts come from the GitHub commits API. Fork counts include the 13
upstream spec commits. Contributor counts come from `/contributors`.

## Facts

### Live (pushed 2026-07 or later) and substantial

| Repo | Lang | License | Last push | Stars/forks | Commits/contrib | Cov | Agent / LLM backends | Src | Note |
|---|---|---|---|---|---|---|---|---|---|
| [fabro-sh/fabro](https://github.com/fabro-sh/fabro) | Rust | MIT | 2026-10-03 | 1677/179 | 5416/23 | P(+A,L) | ACP agents (claude-code-acp tested), Codex via its own OAuth API loop (not the CLI), API providers; the cli backend was removed 2026-05-18 | page | See impl-fabro.md |
| [allouis/attractor](https://github.com/allouis/attractor) | Go | Apache-2.0 | 2026-09-17 | 1/0 | 807/1 | P (+L via stylesheet) | **ACP** default (`claude-agent-acp`, `codex-acp`); native providers by model prefix; simulation | own | Nix install bundles the ACP adapters; web live view; releases up to v0.1.3 (2026-08-24) |
| [2389-research/tracker](https://github.com/2389-research/tracker) | Go | MIT | 2026-10-04 | 21/5 | 1918/9 | P A L | `--backend native\|claude-code\|acp`; anthropic, openai, gemini, openai-compat | own | Started from an Attractor design (docs/plans/2026-03-04-attractor-design.md). Now uses its own `.dip` DSL ("Dippin"), not DOT. TUI, Slack bot, cost caps, Homebrew |
| [citadelgrad/pascals-discrete-attractor](https://github.com/citadelgrad/pascals-discrete-attractor) | Rust | MIT OR Apache-2.0 | 2026-10-04 | 7/4 | 218/2 | P (A, L as unwired libraries) | `codergen` nodes run the **Claude Code, Codex or Gemini CLI** (`llm_provider` is required on each). The OpenAI/Anthropic/Gemini adapters and agent loop are library crates not used by pipelines | own | "PAS". Goal gates, budget guards, journal, monitor web UI. Sequential only: multi-edge fan-out/fan-in, manager loop, fidelity and reasoning_effort are rejected. Deep dive: impl-harmonik-attractor.md (the operator's fork) |
| [nnunley/strange-lettractor](https://github.com/nnunley/strange-lettractor) | let-go (Clojure) | Apache-2.0 | 2026-09-29 | 5/2 | 393/2 | P A L | native agent; external `claude` and `codex` agents (`--agent claude\|codex`); OpenAI, Anthropic, Gemini, openai-compat (llama.cpp, Ollama, vLLM) | own | Ships a conformance ledger against the upstream README. mparrett/strange-lettractor is a fork of it |
| [TheFellow/fkyeah](https://github.com/TheFellow/fkyeah) | F# | MIT | 2026-09-13 | 18/1 | 120/1 | P A L | Anthropic, OpenAI, Gemini, OpenRouter; **ACP runtime** (stdio, WebSocket, HTTP+SSE) with presets such as `acp_preset="codex"` | page | About 1,020 tests, including a 208-test conformance suite; single binary |
| [jleechanorg/dark-factory](https://github.com/jleechanorg/dark-factory) | Python per README (GitHub reports Rust) | none | 2026-10-04 | 8/2 | 916/3 | P (A,L?) | backends `ao` (default), `claude`, `codex`, `agy` (Antigravity), mock/echo | own | No LICENSE file (GitHub reports none) despite an MIT badge in README:4. Sealed holdout scenarios; mixes backends per node. Possibly what the page lists as DeepCreative/dark-factory (unverified) |
| [lithoscomputer/petri](https://github.com/lithoscomputer/petri) | Rust | MIT | 2026-10-02 | 1/2 | 736/2 | P A(native) | agent step over **ACP** (live tests with `claude-code-acp` and `gemini --acp`) or the native "Pebble" agent; Host, Docker and Daytona sandboxes | own | Token-flow IR engine; `crates/attractor/frontend` lowers DOT; it also has a Fabro frontend |
| [OilProducts/spark](https://github.com/OilProducts/spark) | Rust (+React) | none | 2026-10-04 | 0/0 | 1428/2 | P L | **Codex CLI** (sign-in from the UI); `unified-llm-adapter` crate | own | Workbench with `attractor-{core,dsl,execution,runtime,api}` crates and `spark-server` |
| [microsoft/amplifier-bundle-attractor](https://github.com/microsoft/amplifier-bundle-attractor) + [amplifier-bundle-dot-runner](https://github.com/microsoft/amplifier-bundle-dot-runner) | Python | MIT | 2026-09-18 / 2026-10-03 | 8/5, 2/2 | 617/6, 601/6 | P A L | Anthropic, OpenAI and Gemini profiles; github-copilot and openai-chatgpt subscription workers; agent profiles mimic Claude Code and codex-rs tool sets (API, not the CLIs) | own | "Faithful" to a byte-pinned vendored spec; needs Microsoft Amplifier. robotdad/pipelines is a pipeline library for it |
| [stencila/stencila](https://github.com/stencila/stencila) `rust/attractor` | Rust | Apache-2.0 | crate 2026-07-09 (repo 2026-10-02) | 903/58 (whole repo) | n/a | P (+extensions) | Stencila's own model crates (anthropic, openai, google, mistral, ollama) | own | Attractor engine embedded in Stencila workflows; not a standalone tool |
| [johnplanow/substrate](https://github.com/johnplanow/substrate) | TypeScript | MIT | 2026-07-10 | 6/1 | 933/1 | P? | Claude Code, Codex and Gemini CLIs (orchestrator) | own | Multi-agent daemon whose `packages/factory/src/graph` follows attractor-spec (docs/reference/attractor-spec.md). Partial and embedded |
| [gutelius/attractor](https://github.com/gutelius/attractor) (fork) | Python | Apache-2.0 | 2026-09-27 | 0/0 | 62/5 (47 ahead) | ? | ? | own | Fork with `packages/` and tests; README unchanged from upstream; not inspected |
| [jwest591/attractor](https://github.com/jwest591/attractor) (fork) | C++ | Apache-2.0 | 2026-08-05 | 0/0 | 208/5 (193 ahead) | ? | ? | own | CMake project in a fork; README unchanged; not inspected |
| [bp-enterprise/attractor](https://github.com/bp-enterprise/attractor) | TypeScript | Apache-2.0 | 2026-08-16 | 0/0 | 11/1 | P A L | pluggable `CodergenBackend` | own | Few commits, large size (24 MB) |
| [DrPep/attractor](https://github.com/DrPep/attractor) | Go | Apache-2.0 | 2026-08-02 | 1/0 | 33/1 | P? | ? | own | Minor; described as a "POC" |

### Older but substantial (no pushes since about June 2026)

| Repo | Lang | License | Last push | Stars/forks | Commits/contrib | Cov | Backends | Src | Note |
|---|---|---|---|---|---|---|---|---|---|
| [danshapiro/kilroy](https://github.com/danshapiro/kilroy) | Go | MIT | 2026-04-27 | 221/52 | 944/13 | P A L | Claude Code, Codex, API, OpenAI-compatible | page | See impl-kilroy.md. Quiet since April; the only later work is the unmerged mattleaverton/kilroy@feat/v2-reframe (234 commits, May 2026); the most recently pushed fork is x85446/kilroy (2026-07-09) |
| [coreydaley/attractor](https://github.com/coreydaley/attractor) (**archived** 2026-07-13) | Kotlin (page says Java) | NOASSERTION | 2026-06-02 | 0/0 | 153/1 | P L | **CLI subprocess** (`claude`, `codex`, `gemini`, `copilot`); Anthropic, OpenAI, Gemini, OpenAI-compatible (Ollama, LM Studio, vLLM) | page | Server with REST API (37 endpoints), web dashboard, SQLite/MySQL/Postgres, Docker |
| [tgoodwin/tractor](https://github.com/tgoodwin/tractor) | Elixir | MIT | 2026-05-18 | 1/0 | 149/1 | P | **ACP** bridges by default (`@zed-industries/claude-code-acp`, `codex-acp`, `gemini --acp`) | own | Observer web UI; `docs/spec-coverage.md` maps the spec |
| [Alezrik/attractor-phoenix](https://github.com/Alezrik/attractor-phoenix) | Elixir | none | 2026-05-16 | 0/0 | 285/1 | P L? | backend module; simulation by default | own | Phoenix web app |
| [eykd/hermes-attractor](https://github.com/eykd/hermes-attractor) | Python | none | 2026-06-07 | 0/1 | 100+/? | P? | Hermes Agent plugin | own | Hexagonal design, 100% coverage target |
| [samueljklee/attractor](https://github.com/samueljklee/attractor) | Python | none | 2026-03-05 | 27/4 | 146/2 | P A L | Anthropic, OpenAI, Gemini, OpenAI-compatible (Ollama, vLLM, LiteLLM); profiles in Claude Code and codex-rs style (API) | page | Claims 100% spec coverage; built with Amplifier |
| [brynary/attractor](https://github.com/brynary/attractor) (**archived**) | TypeScript (Bun) | Apache-2.0 | 2026-03-18 | 24/7 | 64/4 | P A L | Anthropic, OpenAI, Gemini | own | README: "no longer maintained", evolved into Fabro |
| [jhugman/attractor-pi-dev](https://github.com/jhugman/attractor-pi-dev) | TypeScript | Apache-2.0 | 2026-02-12 | 23/6 | 13/1 | P | pi-mono (pi-ai and pi-coding-agent) as the agent backend | page | npm `@jhugman/attractor-pi`; two spec features not yet wired |
| [jmccarthy/attractor-c](https://github.com/jmccarthy/attractor-c) | C11 | Apache-2.0 | 2026-02-17 | 11/4 | 1 (squashed)/1 | P A L | Anthropic (and others?); dry-run | page | Bootstrapped with a Ralph loop |
| [2389-research/mammoth](https://github.com/2389-research/mammoth) | Go | MIT | 2026-03-18 | 5/0 | 246/1 | P A L? | API providers | own | Graph editor, TUI, web; predecessor of tracker? |
| [2389-research/smasher](https://github.com/2389-research/smasher) | Rust | none | 2026-04-14 | 5/1 | 87/1 | P A L | API providers | own | "reimplemented from scratch in Rust" |
| [johnnyhchen/soulcaster](https://github.com/johnnyhchen/soulcaster) | C# | Apache-2.0 | 2026-04-30 | 2/0 | 38/1 | P A L | Anthropic, OpenAI, Gemini | page | Autoresume and crash tests |
| [jaytaylor/attractor-tcl](https://github.com/jaytaylor/attractor-tcl) | Tcl | Apache-2.0 | 2026-03-05 | 0/0 | 218/4 (204 ahead) | P A L | ? | page | Fork of the spec repo |
| [jaytaylor/attractor-php](https://github.com/jaytaylor/attractor-php) | PHP | Apache-2.0 | 2026-03-05 | 0/0 | 46/4 | P A L | Anthropic and others | page | |
| [EndlessCommerce/orchestra](https://github.com/EndlessCommerce/orchestra) | Python | none | 2026-02-20 | 0/0 | 172/1 | P A | backends `langgraph`, `direct`, `cli_agent`, `simulation` | own | |
| [point-labs-dev/arc](https://github.com/point-labs-dev/arc) | TypeScript | none | 2026-03-01 | 6/2 | 27/2 | P | ? | page | |
| [anishkny/attractor](https://github.com/anishkny/attractor) | Python | none | 2026-02-12 | 10/2 | 67/2 | P | ? | page | There is also anishkny/attractor-nodejs (15 commits) |
| [bencivjan/attractor-scala](https://github.com/bencivjan/attractor-scala) | Scala 3 | none | 2026-02-25 | 2/0 | 17/1 | P | Anthropic | page | Same author: bencivjan/attractor-go (74 commits) |
| [bborn/attractor-ruby](https://github.com/bborn/attractor-ruby) | Ruby | MIT | 2026-02-27 | 7/1 | 6/1 | P A L | Anthropic | page | |
| [aliciapaz/attractor-rb](https://github.com/aliciapaz/attractor-rb) | Ruby | MIT | 2026-02-24 | 3/0 | 4/1 | P | `claude` CLI backend, simulation | page | Also aliciapaz/nlspec-to-dot |
| [martinemde/attractor](https://github.com/martinemde/attractor) | Go | Apache-2.0 | 2026-03-23 | 2/0 | 44/4 | ? | ? | own | |
| [Industrial/streamweave-attractor](https://github.com/Industrial/streamweave-attractor) | Rust | NOASSERTION | 2026-04-27 | 0/0 | 128/2 | P | ? | own | Published to crates.io |
| [calebmchenry/nectar](https://github.com/calebmchenry/nectar) | TypeScript | MIT | 2026-03-31 | 0/0 | 25/1 | P | OpenAI-compatible | own | |
| [wcraigjones/attractor-factory](https://github.com/wcraigjones/attractor-factory) | TypeScript | Apache-2.0 | 2026-03-08 | 0/0 | 82/6 | ? | ? | own | |
| [arikWaisman/klaus](https://github.com/arikWaisman/klaus) | TypeScript | none | 2026-04-14 | 0/0 | 8/1 | P A L | Claude Code skills for planning; API providers | own | |
| [bkrabach/attractor](https://github.com/bkrabach/attractor) | Rust | MIT | 2026-03-20 | 1/1 | 29/1 | P | | own | Same author: coding-agent-loop (5 commits) and unified-llm-client-rust (33 commits) |
| [jawhnycooke/attractor](https://github.com/jawhnycooke/attractor) | Python | none | 2026-02-22 | 0/0 | 32/2 | P A L | Anthropic and others | own | |
| [csdavenport6/attractor](https://github.com/csdavenport6/attractor) | TypeScript | Apache-2.0 | 2026-02-20 | 0/0 | 112/5 | P A L | ? | own | Copy of the spec repo plus an implementation |
| Forks with code: [scarnecchia](https://github.com/scarnecchia/attractor) (TS, 131 ahead), [roowe](https://github.com/roowe/attractor) (Python, 3 packages, 9 ahead), [blakeai](https://github.com/blakeai/attractor) (Python, 19 ahead), [0x4D44](https://github.com/0x4D44/strongdm_attractor) (TS, 8 ahead), [mnesler](https://github.com/mnesler/attractor) (Go, 2 ahead / 88 files), [maxim-saplin](https://github.com/maxim-saplin/attractor) (Python, 2 ahead) | various | Apache-2.0 | 2026-02 to 2026-04 | 0 to 1 | | ? | ? | own | Last push February to April; not inspected |
| Smaller: amolstrongdm/attractor (Python, 1 commit, 7 stars, page), az9713/attractor-software-factory (Python, 1 commit, page), jessholbrook/attractor (12), dallumnz/software-factory (PHP, 8), mhingston/factorial (24), craigsoules/python-attractor (5), charltonaustin/attractor_implementation (13, empty README) | | | 2026-02 to 2026-03 | 0 to 7 | | | | | Agent-generated, one-shot attempts |

## Per-implementation notes (live, CLI- or ACP-capable)

All checked 2026-10-04 with `gh api repos/<r>` (pushed_at, stargazers_count),
`/commits` and `/contributors`, and by reading each README.

- **allouis/attractor**: https://github.com/allouis/attractor. Go, created
  2026-06-15, 807 commits by one author. Every agent node goes to an ACP adapter
  (`--backend acp --acp-cmd claude-agent-acp`; `codex-acp` is also supported). A
  CSS-like stylesheet can route nodes to native providers instead.
  `attractor validate` and `attractor render` are included, along with a
  pipeline library under `~/.attractor/pipelines` and a live web UI. It is the
  closest match to "Attractor engine + ACP agents".
- **2389-research/tracker**: https://github.com/2389-research/tracker. Go, nine
  contributors, very active, with a Homebrew tap. It has three layers (LLM
  client, agent session, pipeline engine), which match the three specs. The
  pipeline language is Dippin (`.dip`), not DOT. `--backend claude-code` and
  `--backend acp` hand nodes to external agents. It also has an LLM-judge
  "autopilot" for gates, cost limits, run capture, a Slack bot and a REPL.
  Related blog post: https://2389.ai/research/writing/the-dark-factory-is-a-dot-file/
- **citadelgrad/pascals-discrete-attractor**: https://github.com/citadelgrad/pascals-discrete-attractor.
  Rust workspace with `attractor-{dot,llm,tools,agent,pipeline,cli,journal,monitor}`
  crates. Each `codergen` node shells out to the Claude Code, Codex or Gemini
  CLI, so it can run on a Claude subscription without an API key. It adds
  six-layer verification (goal gates, budgets). Correction after the hands-on
  deep dive (impl-harmonik-attractor.md, 2026-10-04): the `attractor-llm`
  and `attractor-agent` crates aren't wired into pipeline execution, and
  parallel fan-out/fan-in is rejected at compile time.
- **nnunley/strange-lettractor**: https://github.com/nnunley/strange-lettractor.
  Written in let-go, a Clojure dialect on Go. It implements all three specs with
  its own agent loop and LLM SDK, and keeps a requirements and evidence ledger
  per spec. External agents: `claude` and `codex`. Local models through
  openai-compat. The language choice makes it niche.
- **TheFellow/fkyeah**: https://github.com/TheFellow/fkyeah. F#, all three specs
  plus `src/AcpRuntime` (Agent Client Protocol over stdio, WebSocket or
  HTTP+SSE). Execution nodes invoke coding agents through ACP presets. Strong
  test suite.
- **jleechanorg/dark-factory**: https://github.com/jleechanorg/dark-factory.
  "Attractor-pattern" DOT runner with holdout scenarios kept in a separate repo.
  Backends: `ao` (an agent orchestrator, for example Antigravity), `claude`,
  `codex`, `agy`. Benchmarks include an Airbnb clone and an Amazon clone.
- **lithoscomputer/petri**: https://github.com/lithoscomputer/petri. Rust,
  generalizes Attractor into a token-flow IR. Its Attractor frontend lowers DOT,
  and a Fabro frontend wraps it (it tests against Fabro's scenario matrix).
  Agents run over ACP or a native agent. Sandboxes: Host, Docker and Daytona.
- **OilProducts/spark**: https://github.com/OilProducts/spark. Rust workbench
  with `attractor-*` crates, a React UI and a server. Codex CLI is the
  agent backend. No license.
- **microsoft/amplifier-bundle-attractor** and **dot-runner**: https://github.com/microsoft/amplifier-bundle-attractor
  and https://github.com/microsoft/amplifier-bundle-dot-runner. They claim spec
  fidelity against a byte-pinned vendored copy of the spec. They talk to provider
  APIs, plus Copilot and ChatGPT subscription workers. They do not drive the
  Claude Code CLI, and they need the Amplifier runtime.
- **coreydaley/attractor** (from the page): https://github.com/coreydaley/attractor.
  Kotlin/JVM server. Its CLI-subprocess mode runs claude, codex, gemini or
  copilot; it also has API and OpenAI-compatible modes. Last push 2026-06-02.
- **tgoodwin/tractor**: https://github.com/tgoodwin/tractor. Elixir, ACP bridges
  for Claude, Codex and Gemini, and a spec-coverage map. Last push 2026-05-18.

## Excluded

- smartcomputer-ai/forge (page): now redirects to smartcomputer-ai/lightspeed
  (Temporal agent harness, 246 stars, alive). No Attractor code in its tree; only
  archived roadmap docs mention attractor.
- DeepCreative/dark-factory (page): 404 on 2026-10-04.
- About 180 forks of strongdm/attractor: spec only. 0 commits ahead, or size
  216-217 KB with no new files (for example mateusgm, toohamster/ai-skills-attractor,
  Tasmanian-Cloud/logosgraph).
- puck-bot/Crucible: empty (size 0). josephg29/launchpad: 1 commit, no README.
- mparrett/strange-lettractor: fork of nnunley/strange-lettractor.
- Not implementations: robotdad/pipelines and 2389-research/dotpowers (pipeline
  files only), strongdm/attractorbench (benchmark), thamwangjun/nlspec and other
  NLSpec meta-specs, aliciapaz/nlspec-to-dot (tool), feedback-loop-ai/brokkr
  (only has peer research on Attractor and Kilroy).
- Adjacent: they mention or vendor the specs but are not Attractor engines
  (unverified): prime-radiant-inc/evener (Go coding agent, 168 stars, vendors the
  original specs), prime-radiant-inc/sprout, virtengine/bosun,
  smartcomputer-ai/agent-os, rekursiv-ai/sagent, osabiohq/osabio,
  arbazkhan971/relayforge, whilp/ah, neolite/zaica.
- Unrelated "attractor" names: julianrubisch/attractor (Ruby complexity tool),
  entropy-cloud/attractor-guided-engineering-template, npm `attractor`, crates
  `attractor` (torrent search), and dynamical-systems repos.

## Search methods used

- `gh search repos` with: attractor; "strongdm attractor"; attractor nlspec;
  attractor pipeline dot; attractor software factory; "DOT-based pipeline
  runner"; attractor implementation; attractor go; nlspec; coding-agent-loop;
  unified-llm-spec.
- `gh search code` with: "strongdm/attractor", "attractor-spec.md",
  "coding-agent-loop-spec", "unified-llm-spec", "Attractor specification".
  Repos were grouped by hit count.
- `gh api repos/strongdm/attractor/forks --paginate` (196 forks), sorted by size.
  The top 10 were compared with `compare/main...owner:branch` to get commits
  ahead.
- Spec README: no implementation links, only the bootstrap prompt.
- factory.strongdm.ai/products/attractor (WebFetch): 19 community
  implementations, all covered above.
- WebSearch: GitHub implementations, HN threads (items 46924426, 46955602,
  46926133), "software factory" plus DOT pipeline, "dark factory".
- Registries: npm (`attractor`, `attractor-ai`, `attractor-pipeline`, a search
  for "attractor pipeline"), PyPI JSON for the same names, crates.io search
  for "attractor".
- Links in the Kilroy and Fabro clones (scratchpad/repos): the READMEs link
  only themselves, strongdm/attractor and strongdm/cxdb. Grepping the whole of
  both clones also finds anishkny/attractor, bborn/attractor-ruby,
  brynary/attractor, samueljklee/attractor and strongdm/attractorbench, all of
  which are covered above.
- Per-repo metadata came from `gh api repos/<r>`, `/commits` (Link header count)
  and `/contributors`. Backend keywords were found by grepping each README.

## Open questions

- Is jleechanorg/dark-factory the page's "DeepCreative/dark-factory" (renamed or
  transferred)? Both are described as Python Dark Factory. Unverified.
- Answered (plan-reviewer, 2026-10-04): tracker still loads `.dot` with a
  deprecation warning (cmd/tracker/loading.go:1,22-57, `emitDOTDeprecationWarning`).
  Its `claude-code` and `acp` backends are in code
  (pipeline/handlers/backend_acp.go, tracker_doctor_binaries.go).
- How spec-conformant are the live ones? Only strange-lettractor, fkyeah,
  tractor and amplifier publish conformance or coverage docs. attractorbench
  (strongdm/attractorbench) could serve as a common yardstick.
- gutelius (Python, Sept) and jwest591 (C++, Aug) forks are active but were not
  inspected; their READMEs are unchanged from upstream.
- I did not search X/Twitter or blogs in depth. The HN comments say there were
  "hundreds" of implementations within a month, so the long tail is larger than
  this list.
