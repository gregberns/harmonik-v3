# Attractor spec (Q1)

## Summary

Attractor is three natural-language specs ("NLSpecs") that a coding agent
is meant to implement, not a program. Only one is required:

1. **Attractor spec** (required): a headless pipeline engine. Workflows are
   Graphviz DOT digraphs; nodes are stages (LLM task, human gate, branch,
   parallel fan-out/fan-in, shell tool, supervisor loop), edges carry
   conditions, labels and weights. The engine traverses the graph, retries,
   enforces goal gates, checkpoints after each node, resumes, and emits events.
2. **Coding Agent Loop spec** (optional): a coding agent as a library, with
   per-provider tool profiles and a swappable execution environment.
3. **Unified LLM Client spec** (optional): one client across OpenAI,
   Anthropic, Gemini and OpenAI-compatible endpoints.

The key point for us: the LLM stage (`codergen`) calls a one-method
`CodergenBackend` interface, and the spec explicitly allows a backend that
spawns CLI agents (Claude Code, Codex, Gemini CLI) in subprocesses. So an
implementation that drives existing coding agents is spec-conformant; the
agent loop and LLM client specs are recommended ("we highly recommend
controlling the stack"), not required. The spec's own "provider-aligned"
principle (each model gets its native harness's prompts and tools, byte for
byte) is the same idea as the operator's "right harness per model".

## Facts

Sources: https://github.com/strongdm/attractor at commit `fb57a55`
(2026-03-17), cloned and read 2026-10-04; https://factory.strongdm.ai/products/attractor
fetched 2026-10-04.

### The repo

- Contents: `attractor-spec.md` (2090 lines), `coding-agent-loop-spec.md`
  (1467), `unified-llm-spec.md` (2169), `README.md`, Apache-2.0 `LICENSE`.
  No code.
- Description: "nlspec of StrongDM's Attractor, a non-interactive Coding
  Agent sufficient for use in a Software Factory". 1324 stars, 196 forks
  (gh api, 2026-10-04).
- 15 commits, 2026-02-06 to 2026-03-17; the last change was "Fix spec
  inconsistencies and refresh model guidance". No activity for ~6.5 months:
  the spec is stable or dormant (unverified which).
- README: "bringing your own agentic loop and unified LLM SDK is not
  required to build your own Attractor, [but] we highly recommend
  controlling the stack". Build instruction: give a coding agent
  `Implement Attractor as described by https://github.com/strongdm/attractor`.
- The product page calls Attractor StrongDM's "non-interactive coding agent"
  that "composes models, prompts, and tools into a graph-structured
  pipeline", deterministic, observable, resumable and composable. It lists
  20+ community implementations (see implementations.md). It states no
  license or model support. StrongDM's own implementation is not public
  (unverified; none is linked).

### 1. Attractor spec (the required part)

Section numbers refer to `attractor-spec.md`.

- **DOT DSL** (§2): a strict subset of DOT (digraph only, typed attributes,
  no HTML labels). Graph attributes: `goal`, `label`, `model_stylesheet`,
  `default_max_retries`, `retry_target`, `fallback_retry_target`,
  `default_fidelity` (§2.5). Node attributes include `prompt`, `shape`,
  `type`, `max_retries`, `goal_gate`, `fidelity`, `thread_id`, `class`,
  `timeout`, `llm_model`, `llm_provider`, `reasoning_effort` (§2.6). Edge
  attributes: `label`, `condition`, `weight`, `fidelity`, `thread_id`,
  `loop_restart` (§2.7).
- **Handlers by shape** (§2.8, §4): `Mdiamond` start, `Msquare` exit,
  `box` codergen (LLM task, the default), `hexagon` wait.human, `diamond`
  conditional, `component` parallel, `tripleoctagon` fan-in,
  `parallelogram` tool (shell command / API call), `house`
  stack.manager_loop (supervises a child pipeline: observe, steer, wait;
  §4.11). Custom handlers register by type name (§4.12).
- **Execution engine** (§3): run lifecycle, core loop, deterministic edge
  selection (condition match, then preferred label, then weight, then
  lexical; §3.3), goal gates that block exit and jump to `retry_target`
  (§3.4), retries with backoff policy (§3.5-3.6), failure routing (§3.7),
  parallel branches (§3.8).
- **CodergenBackend** (§4.5): `run(node, prompt, context) -> String | Outcome`.
  "How you implement this interface is up to you." The handler writes
  `prompt.md`, `response.md` and `status.json` per stage; an external agent
  can write `status.json` itself to report its outcome (Appendix C).
- **Backends are open** (§1.4): "use the companion Coding Agent Loop and
  Unified LLM Client specs, spawn CLI agents (Claude Code, Codex, Gemini
  CLI) in subprocesses, run agents in tmux panes with a manager attaching to
  them, call an LLM API directly, or anything else. The pipeline definition
  (the DOT file) does not change regardless of backend choice."
- **State** (§5): key-value context passed between nodes, outcomes,
  checkpoint after every node, artifact store, run directory layout.
  **Context fidelity** (§5.4): how much history the next LLM stage gets:
  `full` (reuse the session/thread), `truncate`, `compact` (default),
  `summary:low|medium|high`. `full` assumes a resumable session, which a
  CLI backend must map to its own session resume (e.g. a session id).
- **Human-in-the-loop** (§6): an Interviewer interface with question and
  answer models, built-in AutoApprove, Console, Callback (for Slack/web/API),
  Queue and Recording interviewers, timeouts.
- **Validation and lint** (§7), **condition language** (§10: clauses
  `key = value` or `key != value` joined by `&&`, over `outcome`,
  `preferred_label`, `context.*`). Routing is deterministic. The product
  page says edges are "expressed in natural language and evaluated by the
  LLM"; in the spec the LLM only influences routing through its outcome
  and `preferred_label`.
- **Model stylesheet** (§8): CSS-like rules (`*`, shape, `.class`, `#id`)
  setting only `llm_model`, `llm_provider`, `reasoning_effort`. There is no
  property for choosing a harness or agent; per-model harness selection
  would be an extension (a custom attribute or handler type, or a backend
  that maps provider/model to a harness).
- **Extensibility** (§9): AST transforms, pipeline composition, optional
  HTTP server mode with SSE events and web-answerable human gates (§9.5),
  typed events (§9.6), `tool_hooks.pre/post` shell hooks around LLM tool
  calls (§9.7; only meaningful when the implementation sees tool calls,
  i.e. not with a black-box CLI backend).
- **Definition of done** (§11): checklists per feature, a 22-row
  cross-feature parity matrix, and an integration smoke test with a real
  LLM (plan -> implement -> review -> done).

What an implementation must provide: DOT parser and validator, the engine
(edge selection, retries, goal gates, checkpoint/resume), the handler set,
context and fidelity, the interviewer, condition language, stylesheet,
events, and at least one CodergenBackend. HTTP server mode is "may".

### 2. Coding Agent Loop spec (optional)

- A coding agent as a **library**, not a CLI (§1.2): the host can observe
  every event, steer mid-task, change model or reasoning between turns,
  swap where tools run, and spawn subagents. It argues that CLI agents run
  non-interactively are "a black box: text goes in, text comes out". This
  is the trade-off of using Claude Code / Codex as backends.
- **Provider-aligned toolsets** (§3.1): "The initial base for each provider
  should be a 1:1 copy of the provider's reference agent -- the exact same
  system prompt, the exact same tool definitions, byte for byte." Profiles
  are named for OpenAI (codex-rs), Anthropic (Claude Code), Gemini
  (gemini-cli). `ProviderProfile` interface (§3.2). No profiles are defined
  for Qwen, DeepSeek or GLM.
- **ExecutionEnvironment** interface (§4): file ops, `exec_command`, grep,
  glob, lifecycle; local by default, Docker/Kubernetes/SSH/WASM by swapping
  it. This is the spec's sandbox hook.
- Tool output truncation and context management (§5), system prompts and
  environment context (§6), subagents (§7).
- Out of scope (§8): MCP, skills, OS sandboxing, compaction,
  approval/permission system, read-before-write.

### 3. Unified LLM Client spec (optional)

- One client across providers; switch models by changing a string (§1).
  Native APIs per provider: OpenAI Responses, Anthropic Messages, Gemini
  (§2.7). Env config: `OPENAI_API_KEY`/`OPENAI_BASE_URL`,
  `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`, `GEMINI_API_KEY`/`GEMINI_BASE_URL`
  (§2.2).
- `OpenAICompatibleAdapter` for vLLM, Ollama, Together, Groq and similar,
  using Chat Completions with a `base_url` (§7.10). This is the spec's path
  to local Qwen, DeepSeek and GLM (both offer OpenAI-compatible APIs;
  harness-researcher's models.md has details).
- API keys only. Nothing in any of the three specs mentions subscription or
  CLI-login auth. Claude/Codex subscriptions are only reachable by driving
  the vendor CLIs as backends.
- References Vercel AI SDK, LiteLLM, and pi-ai (from Pi's pi-mono) as prior
  art (§1.3).

## Open questions

- Is StrongDM still developing Attractor internally, and will the spec
  change? The repo has been quiet since 2026-03-17.
- How should `full` fidelity and `thread_id` map onto CLI agents? Claude
  Code and Codex both resume sessions by id (unverified per CLI here; see
  harnesses.md), so it looks feasible but no spec text covers it.
- Per-model harness selection is not in the stylesheet. Each implementation
  will extend it its own way (impl-kilroy.md, impl-fabro.md compare them).
