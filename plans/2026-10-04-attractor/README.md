# Attractor

Research which Attractor implementations exist and what they support, so we
can pick one (or a path) that drives Claude Code and Codex on subscriptions
plus Qwen 3.8 (local), DeepSeek and GLM, each in a harness tuned to it.

Status: READY for the dev team (2026-10-05). Research done; operator
decisions Q12-56 made; design, spec and tickets 01-12 reviewed and
approved. Code goes in the operator's fork `~/github/harmonik-attractor`
("PAS"), not in harmonik-v3. Build tickets in number order.

- [requirements.md](requirements.md): the operator's requirements and the questions research answers
- [research/](research/): findings, one file per topic; [research/README.md](research/README.md) is the index
- [decisions.md](decisions.md): questions for the operator and the answers
- [design.md](design.md): the design, with code references and reasoning
- [CONTEXT.md](CONTEXT.md): glossary
- [spec.md](spec.md): what to build, testing decisions, out of scope, risks

## Tickets

Tracer-bullet order. Every ticket is built in `~/github/harmonik-attractor`
and verified with `cargo test --workspace` and the shell-script fakes; no
real agent or subscription. Tickets 10-12 are low priority (Q55, Q56).

| # | Ticket | Blocked by | Status |
|---|---|---|---|
| 01 | [Fake-agent harness (digital twin of claude -p)](tickets/01-fake-agent-harness.md) | none | ready |
| 02a | [Agent handler interface, process runner and the claude-p handler](tickets/02a-handler-crates-claude-p.md) | 01 | ready |
| 02b | [Agent start events, live stderr and graceful kill](tickets/02b-agent-start-events-stderr-kill.md) | 02a | ready |
| 03 | [Agent profiles in config, test-only profiles and reasoning level](tickets/03-agent-profiles-config.md) | 02a | ready |
| 04 | [Codex and Gemini as handler crates; remove LlmProvider](tickets/04-port-codex-gemini.md) | 03 | ready |
| 05 | [Clear run-ending errors and the two failure-hiding fixes](tickets/05-failure-reporting-and-hidden-failures.md) | 02b | ready |
| 06 | [A worktree and branch per run](tickets/06-worktree-and-branch.md) | 01 | ready |
| 07 | [Attempt commits, interrupted attempts and the end-of-run report](tickets/07-attempt-commits-and-end-of-run.md) | 05, 06 | ready |
| 08 | [Continue a node's agent session on retry and loop-back](tickets/08-sessions-continue.md) | 04, 07 | ready |
| 09 | [The Pi handler for DeepSeek, GLM and the hosted Qwen](tickets/09-pi-handler.md) | 08 | ready |
| 10 | [(low) Rate-limit retry window in the claude-p handler](tickets/10-rate-limit-window.md) | 08, 09 | ready |
| 11 | [(low) Retry prompt names the previous failure](tickets/11-retry-prompt.md) | 08 | ready |
| 12 | [(low) Prompt file and run-folder documentation](tickets/12-prompt-file-and-run-folder-doc.md) | 07 | ready |

Parallel after 01: the 02a → 02b/03 chain and 06 can proceed side by side,
but 02a/02b, 05 and 06 all touch the engine and run preparation, so working
them in parallel means merge conflicts; building them in number order
avoids that.

