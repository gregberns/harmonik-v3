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
| 13 | How are agents and models configured? | operator | Ship a default config users can use or edit, but nothing that needs a code change: a new model version or agent must not require a new binary. The config sets the process to run, model name, reasoning level and so on, and is passed through. |
| 14 | How do nodes execute agents? | operator | Through a clean, separate interface (a crate or similar) where each execution mechanism is a handler. Build only what proves it: one simple `claude -p` handler. ACP, direct-executable and tmux handlers must be possible, not built now. |
| 15 | Worktrees? | operator | Required: the Attractor must create git worktrees and run the agent in them. |

Correction (operator, 2026-10-04): DeepSeek and GLM now each have their own
harness (released around August 2026). acp.md and models.md say otherwise
and need updating.

Further direction for the fork (operator, 2026-10-04):

| # | Question | Source | Answer |
|---|---|---|---|
| 16 | Commits? | impl-harmonik-attractor.md | Commit after every node, as Kilroy does; the commit is the proof the node completed. |
| 17 | Worktree location? | impl-kilroy.md | Configurable, never hard-coded: a project-level default, overridable on the CLI. |
| 18 | Spec coverage? | operator | Check the fork against the strongdm/attractor spec for other significant missing pieces. |
| 19 | Testing? | operator | A test harness that needs no real agent: a fake agent (an executable or script, loaded by config) acting as a digital twin, so the engine can be tested end to end on every change. |
| 20 | Run output and transcripts? | impl-harmonik-attractor.md | Each run writes its output and agent transcripts to a well-defined place that another process or agent can read, e.g. to spot a hung agent. Files on disk are enough for now. A future queue will start one process per work item; not in scope. Agents driving or reading the monitor is low priority. |
| 21 | `--bare` becoming the default for `claude -p`? | poc-claude-subscription.md | Ignore; don't plan for it. Work around it if and when it happens. |
| 22 | Crashes and timeouts? | impl-harmonik-attractor.md | Need better handling than failing the run outright (unroutable today). |
| 23 | Remote execution? | operator | The handler interface must allow a handler that runs the agent on another machine (e.g. the CLI on one host triggers the agent on another). Make it possible; don't build it. |
| 24 | Move to design? | operator | Yes, once the research is deep enough to be confident. Use the design skills so the design is thorough. |

Design review with the operator (2026-10-05):

| # | Question | Source | Answer |
|---|---|---|---|
| 25 | Session ids? | design.md §1 | The engine mints a GUID per agent session and passes it through the interface (request field, `{session_id}` template, `PAS_SESSION_ID` env) so profiles can hand it to agents that accept one (`claude --session-id <uuid>`). Handlers may ignore it. The id the agent actually used is recorded, enabling later session restart and other uses. |
| 26 | No mid-run control in the one-call interface (design.md §1)? | design.md §1 | Acceptable for now; a single added call could provide it later. |
| 27 | Keep agents' session files (drop `--no-session-persistence` and Codex `--ephemeral`)? | design.md §2 | Yes, drop them: session files should stay. No setting needed. |
| 28 | When a node runs again (retry, or a loop back such as implement → review → implement), new session or continue? | design.md §1 | Continue the node's previous session, so the agent keeps its context. The operator's earlier engine did this after review steps. Map it onto the spec's context fidelity: `full` = resume the session, with `thread_id` to share one session across nodes (§5.4). |
| 29 | Resume after a mid-node crash or timeout: what happens to the node's partial edits? | design.md §3 | Never delete them. A timed-out node may hold a lot of good work. Re-run on top of the partial work, whether in the continued session or a new one; the agent can look at the diff. The Attractor spec has nothing on files or git at resume (spec §5.3, fb57a55). It degrades `full` fidelity to `summary:high` on resume only because in-memory sessions can't be saved, and CLI agents' sessions are on disk. |
| 30 | Continuing as the default (`fidelity=full`), and `thread_id` to share a session? | design.md | Yes to both. |
| 31 | Handler structure? | design.md §1 | Each handler (`claude -p`, `codex-exec`, …) is separate code in its own crate, behind a public handler interface; expect about 6 over time. Not one crate with a private split. |
| 32 | Gemini? | design.md §1 | Port it as its own handler, like Codex. |
| 33 | A generic run-any-program handler? | design.md §1 | Hold off. Instead, find one handler that can run (almost) any model, e.g. the Pi coding agent, Fabro's generic agent loop, a fairly generic harness over ACP, or Omnigent. Research first. |
| 34 | Which multi-model handler? | research/multi-model-handler.md | Pi (`pi --mode json`, pinned), as a fourth handler crate. |
| 35 | Handler crate layout (interface crate, shared process runner, one crate per handler, registry)? | design.md §1 | Approved. |
| 36 | Default worktree location? | design.md §3 (planner Q8) | Mirror Claude Code's `<project-root>/.claude/worktrees/<name>`: inside the project, under PAS's folder. Still configurable (project setting, CLI override). |
| 37 | Uncommitted changes in the source checkout? | planner Q9 | Start anyway (branch from HEAD, or `--base`), with a warning recorded in the run. |
| 38 | What proves a node completed? | planner Q10 | The git commits are the record. Don't rely on PAS's own logs (journal, checkpoint) for completion or resume. |
| 39 | Cleanup? | planner Q12 | On success, remove the worktree and keep the branch; on failure, keep both for inspection or resume. Clean up after ourselves. A prune command later, or an agent cleans up. |
| 40 | Commits per attempt, and hooks? | planner Q13 | One commit per attempt, so retries leave evidence. Engine commits use `--no-verify`: always commit; the graph's own steps enforce lint and tests, otherwise the system can get stuck. |
| 41 | What happens to the work after a successful run? | operator | Not just left on the run branch, and not a blind merge. Leaning: merge back into the branch the run started from (a "target" branch). Details open. |
| 42 | Routing state on an engine-owned ref `refs/pas/runs/<run-id>`? | planner Q27 | Sounds reasonable. |
| 43 | Resume from git? | planner Q27-28 | Defer. PAS's existing resume (checkpoint-based) stays as it is for now; git-derived resume, divergence handling and `--resume-from-record` come later. Attempt commits with trailers are written now. |
| 44 | What happens to the work after a successful run (Q41)? | planner Q29 | Do nothing for now: no merge. The run reports its branch (and base, final commit, status) at the end, in its output and run folder; the agent or user merges, opens a PR, or uses an integration branch. Do less; don't build what git already does. Revisit later. |
| 45 | Project name? | operator | May be renamed from "pas" later; not now. |
| 46 | Write the run ref and state.json now? | planner Q27 | No, defer with git resume. Rely on today's resume. |
| 47 | Failure routing (planner Q14)? | design.md §5 | Don't rework routing now, but never hide a failure. Agent step timeout or crash: stop the run and report the error (today's behaviour). Command steps (tests etc.): success and failure routes are enough for now. Keep whatever already works; extend later. |
| 48 | Rate limits? | planner Q15 | Handled in the handler: retry for a short while (a couple of minutes), then fail. |
| 49 | Idle (no-output) timeout? | planner Q16 | Not now; add later if needed. |
| 50 | A session that can't be continued? | planner Q21 | Fail (don't fall back to a new session). |
| 51 | General rule for the remaining choices | operator | Keep what exists if it's good enough. Ask: can we generally get work done? Would re-running fix the error? Is the error clear enough for an agent or user to diagnose? Do less now; extend later. |
| 52 | Pin Pi to an exact version? | planner Q26 | No. Use whatever `pi` is installed; no pinning, no per-upgrade smoke test. Pinning has gone badly before; if a Pi release breaks something, so be it. |
| 53 | Test seams? | planner Q20 | Agreed as a start: `Agents::run` with the fake, and `pas run` end to end with the fake (shell-script fakes). |
| 54 | Strip API keys from the agent environment? | planner Q6 | Yes, by default. A user must supply a token deliberately (in the profile) rather than one being picked up by accident. |
| 55 | Retry prompt adds the failure class and reason? | planner Q24 | Fine, low priority (e.g. the agent should know tests failed). |
| 56 | Scope check | operator | Scope is going a little far. Fix error reporting only where an error can't be understood; otherwise leave what's there. Idle timeout: don't worry about it; a user can have an agent read the logs. Refine later. |
| 57 | Where does the dev crew run? | operator | Set hk3 up in `~/github/harmonik-attractor` and start the crew there, to reduce confusion. |
| 58 | Git workflow for the build? | operator | Not straight to main. Each piece of work gets its own branch from main; the tester tests it; an integrator is the only one who merges branches to main, checking for issues and resolving all conflicts. |
| 59 | Fork agent rules? | operator | Add AGENTS.md with the text and CLAUDE.md as a symlink. Include programming principles based on pure functional programming, strong testing principles, and Zero Framework Cognition (harmonik-v3 docs/concepts/zero-framework-cognition.md). |
| 60 | Beads issue tracking (upstream AGENTS.md)? | operator | Leave it out for now. |
| 61 | Push to GitHub? | operator | Yes, any time, without asking. |
| 62 | Verify `claude -p --resume`? | operator | Done by the captain: research/claude-resume-check.md. `--session-id` sets the id, `--resume` keeps it, and a missing session is an `is_error` result. |
| 63 | One ticket at a time (shared checkout)? | operator | No: throughput matters. The builder works each ticket in its own git worktree, cleaned up after testing/merge. Tickets whose blockers are met run in parallel. The builder should also parallelise within a ticket by handing work to subagents, each in its own worktree. |
| 64 | Who starts the dev crew? | operator | The operator starts it themselves, so it shows up correctly in herdr. |
