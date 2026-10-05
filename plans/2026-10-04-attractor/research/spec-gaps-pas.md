# PAS against the Attractor spec (Q18)

Captain's task (2026-10-04, decisions.md Q16-24): list every significant
piece of the strongdm/attractor spec that the operator's fork
(harmonik-attractor, "PAS") lacks or does differently. For each, give its
status, where it lives, a rough effort and whether it blocks our use
(Q12-23). Read-only.

## Summary

- **Blocks our use** (needed for Q12-23):
  1. **Crash and timeout routing (Q22).** In the spec, a handler exception
     becomes `Outcome(FAIL)` after retries, and that outcome is routed like
     any other: a `outcome=fail` edge, then `retry_target`, then
     `fallback_retry_target`, then termination (spec §3.5 lines 497-505,
     §3.7 lines 564-571). In PAS a handler `Err` (crash, non-zero exit with
     no result, unparseable output, timeout) skips routing and fails the
     run (`engine.rs:635-640`). Effort: S-M.
  2. **Failure routing on FAIL outcomes.**
     - PAS uses `retry_target` and `fallback_retry_target` only for goal
       gates (`goal_gate.rs:46-49`).
     - If every outgoing edge is conditional and none matches, PAS doesn't
       return "no edge" as the spec does (lines 448-453). It falls back to
       the **first edge** with only a warning (`edge_selection.rs:65-75`).
       No lint rejects such graphs (grep). So a FAIL on a node whose only
       edge is `condition="outcome=success"` silently follows that edge and
       the run continues.
     - Only a node with **zero** outgoing edges turns a FAIL into a run
       error (`engine.rs:1151-1158`).
     - An exhausted RETRY outcome is not turned into FAIL (spec 510-515).
       It leaves the attempt loop still as Retry (`engine.rs:589, 627-634`),
       then either completes the run successfully (with no edge) or takes
       the first-edge fallback.
     - Effort: S.
  3. **The handler interface (Q13, Q14, Q19, Q23)** is closed: the
     `LlmProvider` enum and hard-coded CLI flags
     (impl-harmonik-attractor.md §2-4). The spec's `CodergenBackend` is
     open (§1.4, §4.5).
     - A config-loaded fake agent for testing (Q19) can't fit it without an
       open interface, or a `PATH` shim named `claude`.
     - The reasoning level (Q13) is rejected (`reasoning_effort`,
       `docs/execution-capabilities.md:22`).
     - Effort: M.
  4. **Worktrees and per-node commits (Q15-17)** are absent; see
     kilroy-git.md. Effort: M.
- **Missing but not blocking yet:**
  - Parallel fan-out and fan-in (§4.8-4.9) and the manager loop (§4.11)
    are rejected at compile time. Large effort.
  - Context fidelity and thread reuse (§5.4) are rejected.
  - Others: `allow_partial`, `auto_status`, `default_max_retries`, the shape selector in the stylesheet,
    retry-policy presets, `human.default_choice`, the Callback and Queue
    interviewers, the artifact store, HTTP server mode, and tool hooks.
- **Present and close to the spec:**
  - DOT subset with subgraphs, classes and default blocks;
  - shape-to-handler mapping;
  - 5-step edge selection, with divergences: a first-edge fallback, and
    steps 2-3 that also match conditional edges;
  - goal gates with the 4-level retry-target fallback;
  - per-node `max_retries` with exponential backoff;
  - the condition language (`=`, `!=`, `&&`);
  - stylesheet `*`, `#id`, `.class`;
  - checkpoint and resume;
  - `loop_restart`;
  - the tool handler;
  - human gates (AutoApprove, Console, Journal/file, Recording);
  - typed events and a journal;
  - validation and lint;
  - variable expansion.
  - PAS also adds things the spec lacks: budget and step guards, a
    per-worktree run lock, run-commit observation, and the Beads
    integration.

## Facts

Sources:
- strongdm/attractor `fb57a55`: `attractor-spec.md`. Line numbers are in
  that file; my summary is research/attractor-spec.md.
- harmonik-attractor `50945da` at `~/github/harmonik-attractor`, paths
  under `crates/`.
- `docs/execution-capabilities.md` is PAS's own support matrix.

Checked 2026-10-04.

Status key:
- **P**: present.
- **Pa**: partial or divergent.
- **M**: missing, or rejected at compile time.

Effort key:
- **S**: up to a few hundred lines in one module.
- **M**: several modules or a new crate. The handler interface is M: the
  `LlmProvider` enum is threaded through compilation (`ResolvedNode`) and
  `CodergenHandler`.
- **L**: deep engine changes. Parallel is L: isolated branch contexts,
  concurrent node execution, fan-in merge, and with Q15 a worktree per
  branch plus a git merge.

"Blocks?" is against decisions Q12-23.

### Matrix

| Spec piece (section, lines) | PAS | Where in PAS | Effort | Blocks? |
|---|---|---|---|---|
| Crash/timeout → FAIL outcome → routed (§3.5 497-505, §3.2 352-399) | **Pa**: `Err` bypasses routing, fails the run | `attractor-pipeline/src/engine.rs:609-640`; `attractor-types/src/error.rs:100-110` | S-M | **Yes (Q22)** |
| Failure routing: fail edge → `retry_target` → `fallback_retry_target` → terminate (§3.7 564-571) | **Pa**: fail edges work through conditions; retry targets only at goal gates. With all-conditional, non-matching edges, the first edge is taken (see Edge selection). Only zero outgoing edges gives a run error | `edge_selection.rs:14-76`; `goal_gate.rs:46-49`; `engine.rs:1151-1158` | S | **Yes (Q22)** |
| `CodergenBackend` open interface (§1.4 54-62, §4.5 656-719) | **Pa**: closed `LlmProvider` enum, CLI-only | `execution_plan.rs:15-52`; `handlers/codergen_provider.rs:348-440` | M | **Yes (Q13, Q14, Q19 fake agent, Q23)** |
| Run directory and stage artifacts: `prompt.md`, `response.md`, `status.json` per stage (§4.5, §5.6 1222-1238, Appendix C) | **Pa**: per-run `events.jsonl`, `run.json`, `transcripts/<invocation>.jsonl`; no per-stage prompt/response/status files | `attractor-journal`; `codergen_handler.rs:313-322` | S | Partly (Q20: a readable, well-defined place; the journal may be enough) |
| Retry logic and `max_retries` (§3.5 480-523) | **Pa**: node `max_retries` works; an **exhausted RETRY stays Retry** instead of becoming FAIL (spec 510-515), so with no edge the run completes successfully | `execution_plan.rs:1061-1075`; `engine.rs:589, 627-634, 1151-1162` | S | **Yes (Q22)** |
| `default_max_retries` graph attribute (§2.5, §3.5 484-487) | **M** (only node `max_retries` is read) | grep: no `default_max_retr` | S | No |
| Retry policy: backoff config, presets, `should_retry` (§3.6 525-562) | **Pa**: fixed exponential 500 ms ×2, 30 s cap, no jitter, no presets; retryable = rate limit, `CommandTimeout`, retryable provider errors | `retry.rs:5-10`; `error.rs:100-110` | S | No |
| `allow_partial` (§3.5 516-517) and `auto_status` (spec lines 163, 2078) | **M** (both rejected as unsupported) | `docs/execution-capabilities.md` row "fidelity, reasoning_effort, auto_status, allow_partial, thread_id" | S | No |
| Goal gates (§3.4 461-478) | **P**, with a 4-level retry-target fallback; terminal targets rejected | `goal_gate.rs:13-60`; `engine.rs:900-915`; `validation.rs:305` | n/a | No |
| Edge selection, 5 steps (§3.3 406-459) | **Pa**: the 5 steps exist, but (a) with all-conditional, non-matching edges it returns the first edge with a warning, where the spec returns none (448-453); (b) steps 2-3 (preferred label, suggested id) also match conditional edges, where the spec limits them to unconditional edges (412-414, 432-446) | `edge_selection.rs:14-76`, `:45-63`, `:65-75` | S | **Yes (Q22)** |
| `loop_restart` (§2.7, §3.2 393-395) | **Pa**: clears `completed_nodes` and `node_outcomes` in-run. The spec "terminates the current run and re-launches with a fresh log directory" (line 177) | `graph.rs:43,148`; `engine.rs:1112-1116` | S | No |
| Condition language (§10 1661-) | **P**: `Clause ('&&' Clause)*`, `=` / `!=`, dotted keys; `outcome`, `preferred_label` and context resolved | `condition.rs:1-40`; `engine.rs:1082-1098` | n/a | No |
| Concurrency: parallel handler (§4.8 803-851) | **M**: multi-edge `component` rejected (`unsupported_execution_topology`) | `execution_plan.rs` `validate_supported_execution_topology`; README "True fork/join execution is not supported yet" | L | No today. Probably needed later for parallel work items (unverified need) |
| Fan-in handler (§4.9 853-892) | **M**: rejected | as above | L (with parallel) | No |
| Manager loop (§4.11 917-964) | **M**: rejected | `docs/execution-capabilities.md` "Manager loops" | M-L | No (decision Q8: something external drives the Attractor) |
| Context fidelity and `thread_id` (§5.4 1136-1175) | **M**: rejected; every codergen call is a fresh CLI process (`--no-session-persistence`, `--ephemeral`) | `codergen_provider.rs:376, 412`; capabilities doc | M | No (each node is a fresh agent, which fits per-node commits) |
| Context (§5.1 993-1070) | **Pa**: key-value context. Codergen writes `<node>.result` etc. and feeds every `*.result`/`*.output` key back into later prompts. No spec-style namespacing or `outcome` written into context | `codergen_handler.rs:240-256, 497-519`; `engine.rs:251-265` (updates applied; `outcome` is resolved for conditions at `:1082-1086`, not stored) | S | No |
| Outcome model (§5.2 1072-1094) | **P**: status, preferred_label, suggested_next_ids, context_updates, notes, failure_reason; statuses include Retry and PartialSuccess | `attractor-types`; `engine.rs:216-224` | n/a | No |
| Checkpoint and resume (§5.3 1096-1134) | **P**: saved after every node with completed nodes, outcomes, context, step count, cost, active-node attempts and an execution fingerprint. Resume by re-running the same command | `checkpoint.rs:16-80`; `engine.rs:1135-1148`; impl-harmonik-attractor.md §6 | n/a | No. Q16 wants commits as the proof, alongside it |
| Artifact store (§5.5 1177-1220) | **M** (no artifact API; the run dir holds the journal and transcripts) | grep | S-M | No |
| Human gates: `wait.human` and the Interviewer (§4.6 720-786, §6 1240-1369) | **Pa**: AutoApprove, Console, Journal (answers as files, terminal if TTY), Recording. No Callback or Queue as named types. No `human.default_choice` on timeout | `interviewer.rs:33-381`; `handlers/wait_human.rs:118` | S | No |
| Validation and lint (§7 1371-1443) | **P**: lint rules plus plan-level structural checks; unknown attributes fail closed | `validation.rs:172-330`; `execution_plan.rs` | n/a | No |
| Model stylesheet (§8 1445-1523) | **Pa**: selectors `*`, `#id`, `.class` but **no shape selector**; sets `llm_model` and `llm_provider`; `reasoning_effort` **rejected** | `stylesheet.rs:3, 32-49, 294-298`; `docs/execution-capabilities.md:22` | S | **Yes (Q13: reasoning level is agent config)**, tied to the handler interface |
| AST transforms (§9.1-9.3) | **P**: stylesheet application plus prompt variable expansion | `transforms.rs:1-60` | n/a | No |
| Pipeline composition (§9.4 1581-1587) | **Pa**: `pas run <dir>` runs `*.dot` files in sequence; no sub-pipeline node | `attractor-cli/src/main.rs:33-41` | M | No |
| HTTP server mode (§9.5 1589-1607) | **M** as specified. The Monitor is an HTML UI with CSRF-guarded POSTs, not a JSON API | `attractor-monitor/src/lib.rs:37-83`; impl-harmonik-attractor.md §6 | M | No (Q20: files are enough; monitor is low priority) |
| Observability and events (§9.6 1609-1648) | **P**: `PipelineEvent` (PipelineStarted/Completed/Failed, Stage*, EdgeSelected, GoalGateChecked, CheckpointSaved, ContextUpdated, CommitsCreated, LlmInvoked, HumanInput*), journaled to `events.jsonl` | `events.rs:15-140`; `attractor-journal` | n/a | No |
| Tool call hooks (§9.7 1650-1659) | **M** (agents are black-box CLIs) | grep: none | n/a (needs an API backend) | No |
| Tool handler (§4.10 894-915) | **P**: `type="tool"`, `tool_command` | `handlers/tool_handler.rs:86-108` | n/a | No |
| Custom handlers (§4.12 966-989) | **P**: `HandlerRegistry::register`, `HandlerIdentity::Custom` | `handler.rs:277, 407-419`; `execution_plan.rs:66-79` | n/a | No (this is the Q14 seam) |
| Coding Agent Loop and Unified LLM specs (optional) | **Pa**: library crates `attractor-agent` and `attractor-llm` exist but aren't wired into pipelines | impl-harmonik-attractor.md §2 | n/a | No (the operator prefers existing agents) |

### The crash and timeout path (Q22)

**What the spec says:**
- `execute_with_retry` catches handler exceptions. If `should_retry` holds
  and attempts remain, it backs off and retries. Otherwise it returns
  `Outcome(status=FAIL, failure_reason=str(exception))` (spec lines
  490-505).
- The core loop records that outcome, writes `outcome` into context,
  checkpoints, and calls `select_edge`. If no edge matches and the status
  is FAIL, the run returns that outcome (lines 371-389).
- §3.7 (lines 564-571) defines the order when a stage returns FAIL or
  exhausts its retries: a `condition="outcome=fail"` edge, then node
  `retry_target`, then `fallback_retry_target`, then termination.
- So in the spec, a crash or timeout is an ordinary FAIL that the workflow
  can route: to a fix-up node, a retry target or a human gate. The run
  ends only when nothing handles it.
- The node `timeout` attribute is "maximum execution time for this node"
  (line 159). The spec doesn't say more about timeouts, so a timeout is
  just one kind of exception.

**What PAS does:**
- In the attempt loop (`engine.rs:589-640`):
  - A retryable `Err` (`CommandTimeout`, `RateLimited`, retryable provider
    errors; `error.rs:100-110`) is retried if attempts remain
    (`:609-626`), with exponential delay (`:644`, `retry.rs`).
  - Any other `Err`, or a retryable one with no attempts left, emits
    `StageFailed` and is returned (`:635-640`). The run fails with no
    routing, no `outcome=fail` edge and no retry target.
- Codergen errors that take this path (impl-harmonik-attractor.md §10):
  a non-zero exit with no result line (`codergen_handler.rs:416-433`),
  unparseable output, empty stdout, a missing binary, and a timeout.
- Only an `is_error` result becomes a routable `StageStatus::Fail`.
- A third class, from code reading and unverified by a run: a Claude
  error result with `is_error: false` is recorded as **Success**, because
  `codergen_provider.rs:707` checks `subtype == "error"` while Claude's
  subtypes are `error_*` (impl-harmonik-attractor.md §10 step 6).
- A routable FAIL then goes through edge selection:
  - With all-conditional, non-matching edges, PAS takes the first edge
    (`edge_selection.rs:65-75`) and continues.
  - Only with zero outgoing edges is it a run error
    (`engine.rs:1151-1158`).
  - `retry_target` isn't used outside goal gates.
- An exhausted RETRY isn't converted to FAIL (`engine.rs:589, 627-634`).

**Gap:**
- Matching the spec needs:
  - converting a handler `Err` into `Outcome { status: Fail,
    failure_reason }` after retries;
  - converting an exhausted RETRY into FAIL (or PARTIAL_SUCCESS with
    `allow_partial`);
  - removing the first-edge fallback (return none, as the spec does);
  - adding §3.7 steps 2-3 (`retry_target`, then `fallback_retry_target`)
    for FAIL.
- A distinct failure class (for example `failure_class=timeout|crash`) in
  context would let edges route on it. The spec doesn't define one; it's
  an extension (Fabro uses `failure_class`, spike-fabro.md).
- Effort: small to medium, in `engine.rs` around `:589-660`, the no-edge
  branch at `:1151`, and `edge_selection.rs:65-75`. Existing engine tests assert the current
  direct-failure behaviour (for example
  `executor_emits_exactly_one_pipeline_failure_for_runtime_errors`, in
  `docs/execution-capabilities.md`), so those would change.

## Open questions

- Is parallel fan-out needed for the first use? PAS rejects it by design
  ("not supported yet"). Adding it means isolated contexts and, with Q15,
  one worktree per branch and a merge step.
- Should crash and timeout get a `failure_class` in context (beyond the
  spec) so a workflow can tell "agent crashed" from "agent reported an
  error"?
- Does Q20 need spec-style per-stage `prompt.md`/`response.md`/`status.json`,
  or are PAS's `events.jsonl` and transcripts enough?
