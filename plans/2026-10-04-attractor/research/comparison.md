# Comparison and options (Q7)

## Summary

No existing implementation does everything the operator wants.

- **Kilroy** meets the hard requirement best. It runs the real `claude`
  binary on its CLI login, which is the subscription route Anthropic's terms
  allow, and `codex` on its login. On the default path Codex probably runs
  read-only, which is a small fix. It also covers most of the spec. But main has had
  no commits since 2026-04-27, it has no ACP, and it has no sandbox beyond a
  git worktree.
- **Fabro** is alive, polished and has real sandboxes (Docker by default).
  It reaches every non-Claude model. But Claude on a subscription works only
  through an ACP adapter that is policy-grey and untested. Fabro's Codex
  subscription uses its own login rather than the Codex CLI. It churns
  weekly and is controlled by one company.
- **Building on the spec** fits the operator's "existing agent per model"
  idea most directly. §1.4 explicitly allows CLI and tmux-pane backends,
  which hk3 already launches. But it means owning the engine: about a dozen
  DoD feature groups.

Recommendation: decide first whether Claude-through-an-ACP-adapter on a Max
subscription is acceptable (see risk assessment). If it isn't, Fabro is out
for Claude and the choice is between reviving Kilroy (option B) and a thin
engine of our own (option C). C reuses hk3 and the planner's harness map;
B gets a working engine sooner but leaves us maintaining a 900-commit Go
codebase written mostly by agents.

Other implementations (implementations.md): three live ones are worth a
spike before choosing, though we've read only their READMEs:
- **citadelgrad/pascals-discrete-attractor** (Rust, Apache-2.0): runs the
  real Claude Code, Codex and Gemini CLIs, so it's Kilroy's model but alive.
- **allouis/attractor** (Go, Apache-2.0): ACP-first, using
  `claude-agent-acp` and `codex-acp`.
- **2389-research/tracker** (Go, MIT, 9 contributors): `claude-code` and
  `acp` backends, but it has left DOT for its own DSL.

All three are small: 1 to 21 stars, and allouis has one author. They would
be bases to fork (option B'), not dependencies.

## Facts

Sources:
- impl-kilroy.md (kilroy `b55fb0f`)
- impl-fabro.md (fabro `7fc0edbf8`, petri `91d1b77b`)
- attractor-spec.md (attractor `fb57a55`)
- acp.md, harnesses.md, models.md and sandboxes.md (the planner), all checked
  2026-10-04

Per-file sources are in those files; this file adds no new primary facts.

### Support matrix

Legend:
- **Yes:** in code and documented.
- **Partial:** possible via configuration, not tested upstream.
- **Grey:** works technically, but policy is unclear.
- **No:** not supported.

| | Claude sub | Codex sub | Qwen local | DeepSeek | GLM | ACP | Sandbox | Harness per node |
|---|---|---|---|---|---|---|---|---|
| Kilroy | **Yes**: `claude -p` (real binary, OAuth; `ANTHROPIC_API_KEY` stripped). `--tmux` mode needs an API key | Partial: `codex exec --json` with copied `~/.codex/auth.json`, but with no `--sandbox` it likely runs read-only (Codex default) and can't edit; `codex app-server` (danger-full-access) is the working route. Needs a test | Partial: custom `openai_chat_completions` provider + base_url, own loop, generic `openai` profile | Partial: same route (adapter parses reasoning field) | Pay-as-you-go only: built-in `zai` defaults to the Coding Plan endpoint, which breaks Z.ai's terms for an unlisted tool | No | Worktree only. Agents run with permissions bypassed; codex `--sandbox` removed | Per provider (`backend: cli\|api`), node picks provider/model via stylesheet |
| Fabro | **Grey/unverified**: only ACP via claude-code-acp (pinned deprecated 0.16.2), never tested with a subscription. Petri authenticates only with API-key methods, so the agent must be pre-logged-in, which works only in the unisolated `local` sandbox | Grey: Fabro's own loop logs in with the Codex CLI's OAuth client id and calls the ChatGPT Codex backend; terms UNVERIFIED | Partial: Ollama or custom base_url, own loop with the generic `openai` profile. Or any ACP agent (Qwen Code, OpenCode) | Partial: built-in provider, "provisional", not live-tested, generic `openai` profile | Partial: built-in Z.ai defaults to the Coding Plan endpoint, which breaks Z.ai's terms for an unlisted tool; pay-as-you-go needs a `base_url` override | Yes (client): local and Docker only. No fs/terminal, no model switching, auto-allows permissions | Yes: local, docker (default), daytona, plugins; per run | Yes: stylesheet sets `backend` (api/acp) per node |
| citadelgrad/pascals-discrete-attractor (README only) | Yes: local `claude` CLI, "no separate API key" | Yes: Codex CLI | No built-in route found | No built-in route found | No built-in route found | No | Not found (UNVERIFIED) | `llm_provider` per node (claude/codex/gemini) |
| allouis/attractor (README only) | Grey: `claude-agent-acp` using the `claude` login (same policy question as Fabro) | Via `codex-acp` (ChatGPT login, headless reuse UNVERIFIED) | Via any ACP agent, or a native provider by stylesheet | Same | Same | Yes (default backend) | Not found (UNVERIFIED) | Stylesheet routes nodes to ACP or native providers |
| Spec-based (option C) | Yes by design: run `claude` (as hk3 already does) | Yes: `codex exec` / app-server | Via a Qwen-tuned harness (Qwen Code, OpenCode, Pi) on local Ollama/llama-server | Via dsh, Claude Code or OpenCode with a base URL | Via Claude Code / Pi / OpenCode on the GLM Coding Plan (plan only allows listed tools) | Ours to choose | Ours: `srt`, Docker, Docker Sandboxes (sandboxes.md) | Ours: a `harness` attribute or backend mapping (spec stylesheet lacks one) |

Spec coverage:
- Kilroy covers nearly all of the DoD, plus the manager loop, fidelity, HTTP
  serve (experimental), its own LLM client and its own agent loop.
- Fabro covers the DoD on petri, with its own IR extensions (AND-of-XOR
  routing, `backend` in the stylesheet). Its DOT dialect is drifting from
  the spec ("the specification is being drafted to take in" petri's format).

Health:

| | Language / license | Last commit | Activity | Control |
|---|---|---|---|---|
| Kilroy | Go / MIT | 2026-04-27 | 774 → 158 → 12 → 0 commits/month (Feb-May); 8 issues and 1 PR without replies | Individual (danshapiro); fork branch with v2 work unmerged |
| Fabro | Rust / MIT | 2026-10-03 | ~500 commits/month, near-daily nightlies, frequent breaking changes | Qlty Software; core in lithoscomputer repos on git `main` deps |

### What the operator's requirements imply

- **Paying for non-Claude models**: the QwenCloud Token Plan allows any
  tool and serves Qwen3.8, glm-5.2 and deepseek-v4-pro. It's the only plan an
  engine's own API backend may call directly. The GLM Coding Plan is limited
  to listed tools: Claude Code, Pi, OpenCode, Codex and a few others
  (models.md).
- **"Right harness per model"**:
  - Fabro provides it via ACP: every harness the planner lists except Codex
    and Claude speaks ACP natively, and Pi via a community adapter
    (acp.md).
  - Kilroy has only three CLI harnesses (claude, codex, gemini), plus
    OpenCode in tmux mode. Its open-weight models run in Kilroy's own loop,
    not in a model-tuned harness, which goes against the requirement.
- **Subscriptions**:
  - Anthropic's terms allow "the unmodified Claude Code binary with their
    own Claude subscription" and forbid third-party products offering
    claude.ai login (harnesses.md, acp.md).
  - Kilroy's `claude -p` sits on the allowed side. An ACP adapter built on
    the Agent SDK is the grey area. A June 2026 billing split for ACP,
    `claude -p` and the SDK was postponed; whether it has since taken effect
    is UNVERIFIED.
- **Sandboxes "later, per workflow"**:
  - Fabro has them now (per run).
  - Kilroy and option C would need to add them. Claude's `srt` or Docker
    with `CLAUDE_CODE_OAUTH_TOKEN` and a copied `~/.codex/auth.json` both
    work (sandboxes.md).

## Options

### A. Adopt Fabro as is

Use Fabro's engine, UI and sandboxes. Assign harnesses per node in the
stylesheet: ACP for Claude Code, Qwen Code, OpenCode and dsh; the api
backend for Codex.

- **Pros**:
  - Least to build.
  - Real sandboxes and a web UI.
  - Very active.
  - ACP gives per-node harness choice today.
- **Cons**:
  - The Claude subscription goes through an Agent SDK adapter: policy grey,
    and untested with the current `claude-agent-acp`.
  - Codex doesn't use the Codex CLI: Fabro reuses the Codex CLI's OAuth
    client id in its own loop (terms unverified).
  - On the api backend, Qwen, DeepSeek and GLM all get the generic `openai`
    profile, so "right harness" for them needs ACP, which is untested.
  - The built-in GLM provider defaults to the Coding Plan endpoint, which
    Fabro may not use under Z.ai's terms.
  - No ACP on Daytona.
  - The ACP client is minimal: no model switching and no resume, so the
    spec's `full` fidelity can't work.
  - Weekly breaking changes, and a dependency on one company's
    git-`main` crates.

### B. Fork and extend Kilroy

Fork danshapiro/kilroy, or mattleaverton's v2 branch. Add ACP as a new
`engine.Handler` so open-weight models run in their own harnesses, and add
an opt-in sandbox wrapper (srt or Docker) around CLI stages.

- **Pros**:
  - Subscriptions already work on the allowed route. Codex needs a
    sandbox-flag fix on the default path.
  - Broad spec coverage.
  - MIT.
  - Go is easy to ship as one binary.
- **Cons**:
  - We'd become the maintainers of a large, agent-written codebase that has
    gone dormant.
  - Add ACP, sandboxes and harness selection ourselves.
  - Permissions are bypassed everywhere today.
  - Upstream may revive or diverge.

### B'. Fork a smaller live implementation

Fork citadelgrad/pascals-discrete-attractor (CLI backends, Rust) or
allouis/attractor (ACP-first, Go), and add whatever is missing: ACP or CLI
backends, sandboxing, and harness selection.

- **Pros**:
  - Alive as of 2026-09/10.
  - Smaller than Kilroy, so cheaper to own.
  - Each already has half of what we need (citadelgrad the allowed Claude
    route, allouis ACP).
- **Cons**:
  - Spec coverage is known only from READMEs.
  - One or a few authors.
  - Still a fork we own.
  - Needs a spike before it can be compared fairly with B and C.

### C. Build a thin Attractor on the spec, driving agents hk3-style

Implement the pipeline spec only (no agent loop, no LLM client), as §1.4
and the README allow. The CodergenBackend runs CLI agents headless
(`claude -p`, `codex exec`) and ACP agents (Qwen Code, OpenCode, dsh,
pi-acp). A `harness` node attribute, or a stylesheet extension, picks one
per model. Sandboxing is a wrapper per workflow. hk3's existing launch
(role settings, plugins, herdr panes) could serve as the "tmux panes with a
manager" backend the spec names.

- **Pros**:
  - Exactly matches "existing agent per model" and subscription needs.
  - We control scope.
  - Fits hk3's design: structure only, judgment in the agents.
  - Can reuse the spec's DoD as the test checklist, and could port parts of
    Kilroy (MIT).
- **Cons**:
  - The most work: engine, validation, conditions, stylesheet,
    checkpoint/resume, human gates and parallel fan-in.
  - hk3 is bash, so a spec-grade engine probably needs another language: a
    new component.
  - Each harness's event schema needs an adapter unless it goes through ACP.

### D. Hybrid: Fabro for orchestration, Claude outside it (considered, not recommended)

Run Fabro for open-weight and Codex stages, and have Claude stages shell
out through a Fabro `command`/tool node that runs `claude -p`.

- Keeps subscriptions on the allowed route, but loses Fabro's agent
  integration for Claude: tool nodes see only stdout and exit status.
  UNVERIFIED whether Fabro's tool nodes run in the sandbox with the host
  Claude login available.

## Risk assessment

### Unknowns, with the cheapest check

1. **Is a personal Max subscription through `claude-agent-acp` in our own
   orchestrator within Anthropic's terms, and has the postponed billing
   split landed?** Ask the operator or Anthropic support; re-read
   code.claude.com legal-and-compliance and the Zed blog. Decides A and D.
2. **Does Fabro's ACP path work with the current `claude-agent-acp` and a
   CLI login?** About an hour: install Fabro nightly in a scratch repo and
   run a one-node ACP workflow with no `ANTHROPIC_API_KEY`.
3. **Does Kilroy still build and pass its tests at `b55fb0f`, and can a Codex
   stage edit files on the default path?** About 30 min: `go build ./... &&
   go test ./...`, then a one-node Codex pipeline in a scratch repo.
4. **Does local Qwen3.8-27B call tools reliably through Qwen Code, OpenCode
   or Pi on Ollama/llama-server?** A half-day bake-off. Ollama has open
   parser bugs (models.md). This affects every option equally.
5. **Does `codex-acp` reuse an existing `~/.codex` login headlessly?** A
   10-minute test. Matters if C uses ACP for Codex.
6. **Is Fabro's Codex device login allowed** under OpenAI's terms for a
   non-partner tool? Read OpenAI's terms.
7. **How complete are citadelgrad and allouis?** About an hour each: clone,
   build, run the spec's smoke pipeline, and check §11 coverage. Decides
   whether B' beats B.

### Assumptions

- The operator uses their own subscriptions for personal or internal
  pipelines, not for a product offered to others.
- "Right harness" means the vendor's own or a recommended CLI (Qwen Code,
  dsh, Claude Code with a base URL, Pi or OpenCode), not a loop we write.
- Sandboxing can wait. It isn't needed for the first workflow.
- One machine (the M1 Max, 64 GB) runs local Qwen: only the 27B model fits.

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Anthropic tightens subscription use for ACP/SDK/`claude -p` (the postponed split) | med | Keep Claude on the plain `claude` binary; design the backend so an API key can be swapped in per node |
| Fabro breaking changes or a pivot by Qlty | high (churn) / low (pivot) | Pin a version; keep workflows in plain DOT so they port to another engine |
| Kilroy fork becomes ours to maintain forever | high | Scope the fork to the backends and sandbox; budget it as owned code |
| Option C's engine takes longer than expected | med | Build the DoD subset first (engine, codergen, conditions, human gate, checkpoint); defer manager loop, HTTP and fidelity |
| Local Qwen tool calling is too unreliable to be useful | med | Treat local Qwen as optional; fall back to hosted Qwen via the Token Plan |
| GLM Coding Plan terms: the key used outside listed tools | med | Drive GLM only through Claude Code, Pi or OpenCode (all listed), never a raw API backend on the plan key |
| Permissions-bypassed agents damage the host (Kilroy today, C before sandboxing) | med | Worktree per run now; add srt or Docker before running unattended |

### Irreversible or outward-facing steps

- Opening issues or PRs upstream (Kilroy, Fabro) or contacting Anthropic or
  OpenAI: needs the operator's OK.
- Publishing a fork under the operator's account.
- Nothing in this research changes the repo beyond these files; the captain
  commits.

**Resolve first:** unknown 1, the Claude subscription policy for ACP/SDK
routes. It decides whether Fabro (A, D) is viable for Claude at all, and
whether C may use ACP for Claude or must use the plain binary.

## Open questions

- For the operator: is Fabro's churn and single-company control
  acceptable? Is maintaining a Kilroy fork, or a new engine, acceptable?
- For the operator: what language would a new engine be in, given hk3 is
  bash?
- Whether a spike on citadelgrad or allouis makes B' the best fork base.
