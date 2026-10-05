# Attractor: operator decisions

Questions raised by research, with the operator's answers once given. The
spec builds on the answers. Source files are in [research/](research/).

| # | Question | Source | Answer |
|---|---|---|---|
| 1 | Qwen 3.8: local 27B (fits the M1 Max 64 GB), or hosted Qwen3.8? | models.md | Hosted: the operator has a Qwen instance on the network (endpoint TBD) (2026-10-04). |
| 2 | GLM: buy the Coding Plan (approved tools only: Claude Code, Pi, OpenCode, Codex, Goose, Crush), or use the QwenCloud Token Plan (any tool; Qwen, glm-5.2, deepseek-v4-pro)? | models.md | Neither plan: pay-per-token API (operator, 2026-10-04). |
| 3 | DeepSeek: is pay-per-token acceptable (no coding plan)? | models.md | Yes, API tokens (operator, 2026-10-04). |
| 4 | Claude subscription through the ACP adapter (Agent SDK; terms restrict third-party claude.ai login), or only through the `claude` CLI? | acp.md, harnesses.md | Pending a POC: Agent SDK on the subscription (Anthropic postponed the billing change on 2026-06-16) (operator, 2026-10-04). |
| 5 | Is heavy parallel use of a personal Claude Pro/Max login acceptable, or do pipeline runs use an API key? | harnesses.md | Subscription. No Opus API-rate spend; Claude and Codex are the two that need their own harness (operator, 2026-10-04). |
| 6 | Fabro: is its churn (nightly breakage, git-main deps) and single-company control acceptable? | impl-fabro.md | Worth investigating hands-on (2026-10-04). |
| 7 | Sandboxing: against mistakes (harness policy sandbox) or against hostile code (container or VM)? | sandboxes.md | Deferred: hold off on sandboxes (2026-10-04). |
| 8 | Is the Attractor the orchestrator, or does something like dsh or Goose orchestrate Claude Code and Codex? | harnesses.md | Something external drives the Attractor; out of scope. The Attractor needs an interface a driver can use (start, status, stop). Kilroy looked easy to drive; Fabro unknown (2026-10-04). |
| 9 | How many agent CLIs to maintain: Claude Code + Codex + one multi-model harness (OpenCode or Pi), or each vendor's own harness? | harnesses.md | Withdrawn as premature: the architecture is undecided. Operator's view: the hard part is that Claude Code and Codex differ fundamentally; Qwen/DeepSeek/GLM are easy (a simple loop or Pi) (2026-10-04). |

Host facts (2026-10-04): docker is installed (likely Docker Desktop);
OrbStack, Colima, Podman, Apple `container` and sbx are not; macOS 26.4.1.
Local model serving: only `mlx_lm.server` (OpenAI-compatible only).

Added after comparison.md:

| # | Question | Source | Answer |
|---|---|---|---|
| 10 | Is owning a fork (Kilroy, or a smaller live one) or a new engine acceptable? | comparison.md | Yes, a fork is fine (2026-10-04). |
| 11 | If we build an engine (option C), in what language, given hk3 is bash? | comparison.md | Not building our own engine if avoidable; the operator built one before and it grew too many features. Option C is a last resort (2026-10-04). |

Resolve first: question 4. A "no" rules out Fabro, allouis and option D
for Claude, leaving B (fork Kilroy), B' (fork a smaller live one) or C
(thin engine on the spec).

Direction for this iteration (operator, 2026-10-04):

| # | Question | Source | Answer |
|---|---|---|---|
| 12 | Which base to explore hands-on? | implementations.md, comparison.md | Fork citadelgrad/pascals-discrete-attractor as https://github.com/gregberns/harmonik-attractor: smaller is more appealing. Its code lives in its own repo, not in harmonik-v3; harmonik-v3 only knows how to invoke it. It is one modular component that runs jobs; other components build on it. |
| 13 | How are agents and models configured? | operator | Nothing hard-coded. The user configures each agent: the process to run, model name, reasoning level and so on, and the configuration is passed through. |
| 14 | How do nodes execute agents? | operator | Through a clean, separate interface (a crate or similar) with several handlers, one per execution mechanism: ACP, running an executable directly, tmux, and others later. |
| 15 | Worktrees? | operator | Required: the Attractor must create git worktrees and run the agent in them. |

Correction (operator, 2026-10-04): DeepSeek and GLM now each have their own
harness (released around August 2026). acp.md and models.md say otherwise
and need updating.
