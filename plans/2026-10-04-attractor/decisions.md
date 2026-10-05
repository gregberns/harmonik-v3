# Attractor: operator decisions

Questions raised by research, with the operator's answers once given. The
spec builds on the answers. Source files are in [research/](research/).

| # | Question | Source | Answer |
|---|---|---|---|
| 1 | Qwen 3.8: local 27B (fits the M1 Max 64 GB), or hosted Qwen3.8? | models.md | open |
| 2 | GLM: buy the Coding Plan (approved tools only: Claude Code, Pi, OpenCode, Codex, Goose, Crush), or use the QwenCloud Token Plan (any tool; Qwen, glm-5.2, deepseek-v4-pro)? | models.md | open |
| 3 | DeepSeek: is pay-per-token acceptable (no coding plan)? | models.md | open |
| 4 | Claude subscription through the ACP adapter (Agent SDK; terms restrict third-party claude.ai login), or only through the `claude` CLI? | acp.md, harnesses.md | open |
| 5 | Is heavy parallel use of a personal Claude Pro/Max login acceptable, or do pipeline runs use an API key? | harnesses.md | open |
| 6 | Fabro: is its churn (nightly breakage, git-main deps) and single-company control acceptable? | impl-fabro.md | open |
| 7 | Sandboxing: against mistakes (harness policy sandbox) or against hostile code (container or VM)? | sandboxes.md | open |
| 8 | Is the Attractor the orchestrator, or does something like dsh or Goose orchestrate Claude Code and Codex? | harnesses.md | open |
| 9 | How many agent CLIs to maintain: Claude Code + Codex + one multi-model harness (OpenCode or Pi), or each vendor's own harness? | harnesses.md | open |

Host facts (2026-10-04): docker is installed (likely Docker Desktop);
OrbStack, Colima, Podman, Apple `container` and sbx are not; macOS 26.4.1.
Local model serving: only `mlx_lm.server` (OpenAI-compatible only).

Added after comparison.md:

| # | Question | Source | Answer |
|---|---|---|---|
| 10 | Is owning a fork (Kilroy, or a smaller live one) or a new engine acceptable? | comparison.md | open |
| 11 | If we build an engine (option C), in what language, given hk3 is bash? | comparison.md | open |

Resolve first: question 4. A "no" rules out Fabro, allouis and option D
for Claude, leaving B (fork Kilroy), B' (fork a smaller live one) or C
(thin engine on the spec).
