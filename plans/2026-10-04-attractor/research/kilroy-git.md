# Kilroy's git handling (Q16, Q17)

## Summary

- Kilroy runs every pipeline in its own `git worktree` on its own run branch,
  created from the source repo's current `HEAD`. The worktree path is
  `{logs_root}/worktree`. You move it only by moving `logs_root` (the
  `--logs-root` flag). No run.yaml key or CLI flag sets the worktree path by
  itself.
- The default `logs_root` is `${XDG_STATE_HOME:-$HOME/.local/state}/kilroy/attractor/runs/<run_id>`,
  outside the project, so the worktree also lands outside the project by
  default.
- Run branch: `<git.run_branch_prefix>/<run_id>`. The default prefix is
  `attractor/run` and the run id is a ULID. Parallel branches live in a sibling
  namespace, `<prefix>/parallel/<run_id>/<fan_node>/passN/<child>`.
- After every node finishes, whether it succeeded or failed, Kilroy runs
  `git add -A` (with exclude globs) and then `git commit --allow-empty -m "attractor(<run_id>): <node> (<status>)"`.
  It writes `checkpoint.json` next to the commit, carrying the commit SHA.
  `commit_per_node` is forced on.
- The commit records code state, not completion. When GitOps is set
  (engine callers and tests), resume reads `{logs_root}/checkpoint.json` and
  the last node's `status.json`, then resets the run branch and worktree to
  `checkpoint.git_commit_sha`, discarding the in-flight node's partial edits.
- **CLI resume skips git** (confirmed by code reading, not run). Every CLI
  entry point passes empty overrides, so `kilroy attractor resume` reuses
  the leftover worktree folder as a plain directory, crashed node's edits
  included, and makes no more commits (§4). This is a third Kilroy resume
  bug alongside the gate and tmux ones (driver-and-assembly.md). A fork
  would have to fix it under Q16. Nothing parses
  commit messages or trailers. `--run-branch` resume only takes the basename as
  the run id to find the logs dir.
- If the agent commits during a node, nothing special happens. Kilroy stacks
  its checkpoint commit on top, which is often empty. HEAD before the node is
  recorded only to compute diff stats.
- Cleanup is minimal. No code path calls `git worktree remove` at run end or
  deletes a branch. `runs prune` does `rm -rf logs_root`, which deletes the
  worktree directory but leaves the git worktree registration and the branches
  behind.
- No merge-back. The run branch stays in the repo for the user. An optional
  `git.push_remote` pushes the run branch at loop restarts and at the end (best
  effort). Kilroy opens no PR and does no merge into the base branch.
- Parallel fan-out gives each branch its own worktree and branch. `parallel.fan_in`
  fast-forwards the run worktree to the winning branch with `merge --ff-only`.
  That normally succeeds; if it fails, the fan-in node is a routable
  `StatusFail`, not a crash.
  The default "manual box" join tells an LLM agent to run `git merge --no-ff`
  itself.
- PAS (harmonik-attractor) creates no worktrees and no commits. It runs in
  `--workdir` (default cwd), takes a lock at `<git-dir>/pas-run.lock`, and
  observes HEAD before and after each stage attempt to journal
  `CommitsCreated`.

## Facts

Sources:
- Kilroy: `danshapiro/kilroy` @ `b55fb0f` (main, 2026-04-27), any clone at
  `b55fb0f`. Fork branch: `mattleaverton/kilroy feat/v2-reframe`
  @ `e39e170` (2026-05-15), whose merge-base with main is `b55fb0f`.
- PAS: `harmonik-attractor` @ `50945da` (2026-09-29), at
  `/Users/gb/github/harmonik-attractor`.
- Date checked: 2026-10-04. All paths below are relative to each repo root.

### 1. Worktree creation (Kilroy)

- Git commands live in `internal/attractor/gitutil/git.go`:
  - `AddWorktree` runs `git worktree add <worktreeDir> <branch>` (git.go:85-88).
  - `CreateBranchAt` runs `git branch --force <branch> <baseSHA>` (git.go:79-83).
    `--force` silently resets a branch that already exists.
  - Every git call goes through `runGit`, which adds
    `-c maintenance.auto=0 -c gc.auto=0`. A comment says this avoids
    background helpers "during frequent checkpoint commits" (git.go:25-34).
- These are wrapped by `GitHook.SetupRunWorkspace` in
  `internal/attractor/workflows/git_hook.go:40-47`, which does create-branch,
  then `worktree remove --force` (errors ignored, "e.g. re-run"), then
  `worktree add`. The engine uses this only through the `GitOps` interface
  (`internal/attractor/engine/git_ops.go:17-67`). When `GitOps` is nil, the
  engine runs in "no-git" mode in a plain directory.
- Git mode switches on automatically. `cmd/kilroy/main.go:57-67` registers
  `AutoDetectGitOps`, and `main.go:424-432` detects a git repo from
  `--workspace`, or from cwd when that flag is absent. The engine re-checks at
  `engine.go:484-489`.
- Call site in `Engine.run` (`internal/attractor/engine/engine.go`):
  - `ValidateRepo(RepoPath, RequireClean)`, then `baseSHA = HeadSHA(RepoPath)`
    (engine.go:491-504). The base is whatever `HEAD` the source checkout is on.
    There is no base-branch setting.
  - `SetupRunWorkspace(RepoPath, WorktreeDir, RunBranch, baseSHA)`
    (engine.go:524-533). It logs a `worktree.created` event.
  - `CopyIgnoredFiles(RepoPath, WorktreeDir)` copies gitignored files (`.env`,
    secrets) into the worktree (engine.go:534-538). The underlying command is
    `git ls-files --others --ignored --exclude-standard` (gitutil/ignored.go:12-14).
  - It then writes `.kilroy/` and appends `.kilroy/` to the worktree's tracked
    `.gitignore` (engine.go:551-559, `kilroy_files.go:164-183`), and runs
    `setup.commands` in the worktree (engine.go:602-605).
- Location formula:
  - `RunOptions.applyDefaults`: when `WorktreeDir` is empty,
    `WorktreeDir = filepath.Join(LogsRoot, "worktree")` (engine.go:155-157).
    When `LogsRoot` is empty, `LogsRoot = defaultLogsRoot(RunID)` (engine.go:152-154).
  - `defaultLogsRoot` returns `${XDG_STATE_HOME:-$HOME/.local/state}/kilroy/attractor/runs/<run_id>`
    and falls back to cwd when there is no HOME (engine.go:2267-2296).
  - `docs/runs-layout.md:35` shows `worktree/` inside the run dir.
- What is configurable:
  - CLI: `--logs-root` (main.go:280-286) moves the run dir and therefore the
    worktree. `--workspace` (main.go:301-307) picks the source repo
    (`RepoPath`), not the worktree. `--run-id` (main.go:273-279) changes the
    path segment and the branch name.
  - `RunWithConfig` honours an `overrides.WorktreeDir` (run_with_config.go:222-224),
    but the CLI never sets it. `main.go:653-664` passes only `LogsRoot` and
    `Workspace`. So no flag sets the worktree path directly.
  - run.yaml `git:` block (config.go:116-122): `require_clean`,
    `run_branch_prefix`, `commit_per_node`, `push_remote`, and the deprecated
    `checkpoint_exclude_globs`. `repo.path` is at config.go:84-85. There is no
    key for a logs or worktree path.
  - On resume the worktree path is hard-coded to `filepath.Join(logsRoot, "worktree")`
    (resume.go:224).
- `git.require_clean`:
  - Defaults to false. The comment says "kilroy creates its own worktree, so
    the parent repo's cleanliness is irrelevant" (config.go:225-230;
    engine.go:143-144; wired at run_with_config.go:251-255).
  - When true, `ValidateRepo` fails on any `git status --porcelain` output
    with "repo has uncommitted changes (require_clean=true)" (git_hook.go:20-34).
  - The check runs early in `RunWithConfig`, together with a check that HEAD
    exists (run_with_config.go:272-285), and again in `Engine.run`.
  - Gotcha: the `RunOptions` comment still says "If true (default), refuse to
    start" (engine.go:43-44), which is wrong against the code.
  - Gotcha: git-mode resume calls `ValidateRepo(m.RepoPath, true)`, so it
    requires a clean source repo whatever the config says (resume.go:290).
    CLI resume skips this, because it skips git entirely (§4).
  - A detached HEAD works: `HeadSHA` plus `branch --force` (git.go:79-83,
    engine.go:500-504).
  - Inferred, not tested: because the worktree branches from `HEAD`,
    uncommitted tracked changes in the source checkout do not reach the run.
    Only gitignored files are copied.

### 2. Run branch naming (Kilroy)

- `buildRunBranch(prefix, runID)` returns `trim(prefix,"/") + "/" + trim(runID,"/")`
  (`internal/attractor/engine/branch_names.go:8-19`). It is set in
  `newBaseEngine` (`engine_bootstrap.go:32`).
- Default prefix `attractor/run`: config.go:218-220 and engine.go:136-138.
  Override it with run.yaml `git.run_branch_prefix`. No CLI flag sets it.
  `overrides.RunBranchPrefix` exists at run_with_config.go:225-227 but the CLI
  does not set it.
- Run id: a ULID from `NewRunID` (`runid.go:10-18`), or `--run-id`.
- Parallel branch: `buildParallelBranch` produces
  `<prefix>/parallel/<runID>/<fanNode>/pass<N>/<child>` (branch_names.go:21-40).
  It must be a sibling namespace because git cannot create refs under an
  existing ref path (parallel_handlers.go:296-301). An empty prefix makes
  fan-out fail (parallel_handlers.go:280-294).
- Resume derives the prefix from the manifest or config (`deriveRunBranchPrefix`,
  resume.go:219, 501+) and fails if it cannot (resume.go:233-235).

### 3. Per-node commit (Kilroy)

- Where it happens:
  - `Engine.checkpoint(nodeID, out, completed, retries)` (engine.go:1823-1887).
  - It is called in the main loop after `executeWithRetry` returns (engine.go:786),
    after the CXDB/rundb stage-finished records (engine.go:790-793), after
    `completed` is appended and context updates are applied (engine.go:798-814),
    and after failure-cycle detection (engine.go:822-855). The call itself is
    engine.go:857-861.
  - The same call runs for the terminal exit node before the run completes
    (engine.go:731).
  - Parallel branch subgraphs call it per node in their own worktree
    (`subgraph.go:174`).
  - Retries inside `executeWithRetry` do not commit. There are only these
    three call sites.
- It runs for every outcome status. The status is in the message, so a
  `fail` node is committed too. Because `add -A` runs regardless of status,
  a failed node's checkpoint commit captures its partial edits
  (engine.go:1836-1848). That's the core of the Q16 open question below.
- Staging: `CommitAllowEmptyWithExcludes` runs
  `git add -A -- . :(glob,exclude)<glob>...` (git.go:118-146). Excludes come
  from `artifact_policy.checkpoint.exclude_globs` (engine.go:1889-1894). The
  defaults are `**/.cargo-target*/**`, `**/.cargo_target*/**`,
  `**/.wasm-pack/**` and `**/.tmpbuild/**` (artifact_policy.go:49-57).
  `git.checkpoint_exclude_globs` is rejected as deprecated
  (artifact_policy.go:89-91).
- Message template (engine.go:1836):
  ```go
  msg := fmt.Sprintf("attractor(%s): %s (%s)", e.Options.RunID, nodeID, out.Status)
  ```
  The same format is used for the pre-fan-out commit (parallel_handlers.go:204,
  parallel_policy.go:272).
- Empty commits: always `git commit --allow-empty -m <msg>` (git.go:148-149).
- Identity: the repo's configured identity. Only when git reports a missing
  identity ("Author identity unknown" and similar) does Kilroy retry once with
  `-c user.name=kilroy-attractor -c user.email=kilroy-attractor@local`, without
  changing the repo config (git.go:150-162). `ensureUserIdentity`
  (git.go:251-270) would write config, but nothing calls it at b55fb0f
  (inferred from grep; it is unexported and unused outside the file).
- Agent already committed during the node:
  - There is no detection, amend or skip. `checkpoint` stages and commits on
    top of whatever HEAD now is, so the agent's commits stay in history and the
    checkpoint commit is added after them, empty if nothing is left to stage.
  - HEAD before the node is captured (engine.go:762-766) only for
    `recordNodeDiff(beforeSHA, sha)` diff stats (engine.go:870-871,
    `run_db_hooks.go:305-314`).
  - One exception: if a handler returns `Meta["kilroy.git_checkpoint_sha"]`,
    Kilroy skips its own commit and verifies `HEAD == sha` instead, failing
    with "handler-provided checkpoint sha does not match HEAD" on a mismatch
    (engine.go:1837-1853, git_hook.go:57-66). Only the parallel fan-out handler
    sets this (parallel_handlers.go:172-174).
- After the commit, `checkpoint.json` is written to `{logs_root}` with
  `current_node`, `completed_nodes`, `node_retries`, the context snapshot and
  `git_commit_sha` (engine.go:1855-1885). Then come the `checkpoint.saved` run
  log event (engine.go:862-868) and the CXDB turns `GitCheckpoint` (with
  `git_commit_sha`) and `CheckpointSaved` (with `checkpoint_path`)
  (`cxdb_events.go:149-161`).
- `commit_per_node` is forced true. The comment says "metaspec v1 forces
  commit_per_node=true; explicit false is ignored" (config.go:221-224).
- Parallel fan-out (`parallel` / implicit fan-out):
  - `dispatchParallelBranches` first commits the source node (`CheckpointSimple`,
    no excludes) "so branch work is a descendant" (parallel_handlers.go:203-212).
  - Each branch gets `SetupBranchWorkspace`: worktree remove, `branch --force`,
    `worktree add`, then `reset --hard baseSHA` (git_hook.go:72-82).
  - The branch worktree path is
    `{logs_root}/parallel/<fanNode>/pass<N>/<NN>-<key>/worktree`
    (parallel_handlers.go:301-303).
  - Git setup is serialized with a mutex. Execution is concurrent
    (parallel_handlers.go:224-226, 378-400).
  - After input materialization, Kilroy runs `git worktree repair` because
    materialization had overwritten the `.git` file (parallel_handlers.go:488-490).
- Fan-in:
  - `parallel.fan_in` (`FanInHandler`) picks a heuristic winner and runs
    `git merge --ff-only <winner.HeadSHA>` in the run worktree
    (parallel_handlers.go:573-595, git.go:177-186). The losing branches are not
    merged.
  - The ff-only merge normally succeeds: branches fork from the pre-fan-out
    commit, and the run worktree doesn't move meanwhile. If it fails,
    `MergeBranch` errors and the fan-in node becomes `StatusFail` with a
    `FailureReason`. That's routable, not a crash (parallel_handlers.go:590-594).
  - Any other join shape is "manual box" (parallel_handlers.go:50-66). The
    agent prompt says "The engine does NOT auto-merge branch commits" and tells
    the agent to run `git merge --no-ff <head_sha>` for each branch
    (handlers.go:440-485).
- Concurrent regions (`concurrent.split` / `concurrent.join`) share one
  worktree. Per-node commits are suppressed while `concurrentDepth > 0`, and
  the join node makes one consolidated commit (engine.go:1824-1835,
  concurrent.go:87-90, 123-124).

### 4. Commits as proof of completion, and resume (Kilroy)

- Source of truth for resume (`Resume` doc comment, resume.go:49-54):
  `checkpoint.json` for execution state, the last node's `status.json` for
  routing, and the git SHA from the checkpoint for code state.
- `resumeFromLogsRoot` (resume.go:59+):
  - It loads `manifest.json` and takes run ownership (resume.go:96-104), then
    loads `checkpoint.json` and fails if `git_commit_sha` is empty
    (resume.go:105-115).
  - It restores the context, restart counters and `baseSHA = lastCheckpointSHA = cp.GitCommitSHA`
    (resume.go:274-279).
  - Git, only when `eng.GitOps != nil`: `ValidateRepo(repo, true)`, then
    `ResumeWorkspace` (resume.go:289-295). `ResumeWorkspace` does
    `worktree remove --force`, then `branch --force <runBranch>
    <checkpointSHA>`, then `worktree add`, then `reset --hard
    <checkpointSHA>` (git_hook.go:92-101). This:
    - discards the in-flight node's uncommitted edits and untracked files;
    - drops agent commits made after the checkpoint from the branch (they
      remain in the reflog).
    That matters for Q16 (what counts as done) and Q22 (what a crash leaves
    behind).
  - Otherwise (no GitOps), the else branch only does
    `MkdirAll(WorktreeDir)` (resume.go:296-300).
  - It re-runs setup commands because the recreated worktree lost untracked
    artifacts (resume.go:303-307).
  - The next node comes from re-routing out of `cp.CurrentNode` using
    `{logs_root}/<node>/status.json` (resume.go:312-325, 408+).
- Kilroy never parses commit messages, uses trailers, or stores the checkpoint
  in the commit. No `git log` or `rev-list` is used for resume. The only
  `git log` in the tree is `internal/agent/git_snapshot.go:49`, an agent
  context snapshot.
- Three resume entry points (main.go:1009-1092):
  - `--logs-root` calls `Resume`.
  - `--cxdb --context-id` calls `ResumeFromCXDB`, which finds the newest
    `CheckpointSaved.checkpoint_path` or `RunStarted.logs_root` turn
    (resume_sources.go:16-72).
  - `--run-branch [--repo]` calls `ResumeFromBranch`, which takes
    `filepath.Base(runBranch)` as the run id, guesses `defaultLogsRoot(runID)`,
    then scans the default runs dir for a manifest whose `run_branch` matches
    (resume_sources.go:76-109). `repoPath` is ignored ("manifest is
    authoritative", resume_sources.go:77). This fails for runs started with a
    custom `--logs-root`.
- **Bug: CLI resume skips git.** Confirmed by code reading of all entry
  points (plan-reviewer verified the call sites too); not run.
  - Every CLI resume entry passes empty overrides: `Resume` →
    `ResumeOverrides{}` (resume.go:56); `ResumeFromCXDB` sets only CXDB
    fields (resume_sources.go:68); `ResumeFromBranch` (:87, :104).
  - So `opts.GitOps = ov.GitOps` is nil (resume.go:228), and
    `newBaseEngine` copies the nil (engine_bootstrap.go:30).
  - `AutoDetectGitOps` is called only in `Engine.run` (engine.go:485-486)
    and `RunWithConfig` (run_with_config.go:264-265). Resume calls
    `runLoop` directly.
  - So resume.go:289-300 takes the else branch: `MkdirAll(WorktreeDir)`,
    with no `ValidateRepo`, no `ResumeWorkspace` and no `reset --hard`.
  - `checkpoint()` commits only when `e.GitOps != nil`
    (engine.go:1843-1848). After a CLI resume no node commits, and
    `checkpoint.json` carries the stale SHA forward.
  - Effect: `kilroy attractor resume` reuses the leftover worktree folder as
    a plain directory, keeping the crashed node's partial edits, and stops
    committing.
  - Tests hide it because `TestMain` registers `AutoDetectGitOps` globally
    (`engine/main_test.go:10-19`).
  - The fork is the same (`kilroy-v2` resume.go:218, 268).
  - It's a third Kilroy resume bug, alongside the gate and tmux ones
    (driver-and-assembly.md).
- In short, the commit SHA is recorded proof of the code state at a node
  boundary. "Completed" comes from `checkpoint.json` and `status.json`. A
  commit exists even for failed nodes.

### 5. Cleanup (Kilroy)

- `GitOps.RemoveWorktree` / `gitutil.RemoveWorktree` runs
  `git worktree remove --force` (git.go:90-93). The engine never calls it.
  Grep finds it only inside `git_hook.go`, as the pre-step of
  setup/branch/resume (git_hook.go:45, 73, 93).
- At the end of a run (success or failure) Kilroy does no worktree removal, no
  branch deletion and no `worktree prune`. The main and parallel worktrees stay
  under `logs_root` (inferred from the absence of calls; see the Result fields
  at engine.go:751-759).
- Resume and re-run remove and re-add the worktree at the same path, and
  `branch --force` resets the branch (git_hook.go:92-101, 40-47).
- `kilroy attractor runs prune`: the filesystem fallback does
  `os.RemoveAll(r.LogsRoot)` (`cmd/kilroy/attractor_runs.go:477-479`), and the
  DB path only deletes rows (`rundb/read.go:128-160`). Neither touches git, so
  stale `.git/worktrees/*` entries and `attractor/run/*` branches remain.
  Inferred: `git worktree prune` would be needed to clear them.

### 6. Merge-back (Kilroy)

- Kilroy does not merge, rebase or open a PR into the base branch. The run
  branch is left in the repo. `Result` and the CLI print `run_branch=` and
  `final_commit=` (main.go:1083-1087, engine.go:751-759).
- Optional push: `git.push_remote` (config.go:120). `gitPushIfConfigured`
  runs `git push <remote> <runBranch>` from `RepoPath`. It is best effort:
  failures only warn (engine.go:2101-2140, git.go:170-175). It is called
  before each `loop_restart` iteration (engine.go:1149-1150) and after the
  terminal outcome is persisted (engine.go:2054-2055).
- The only in-run merges are the fan-in ones in section 3: ff-only to the
  winner, or an agent-run `git merge --no-ff`.

### 7. Gotchas (Kilroy)

- Codex sandbox and `.git` writes:
  - In a linked worktree, `git merge` and commits write to the main repo's
    `.git/worktrees/<name>/` and object store, which are outside the worktree
    root. Codex `--sandbox workspace-write` blocks these writes.
  - `f338c79` (2026-03-02, "Fixes #49") stripped `--sandbox` for manual-box
    fan-in nodes. The code is still at `agent_router.go:1136-1151` and
    `stripSandboxFlag` at agent_router.go:2220-2225.
  - `f23e0dc` (2026-03-03) removed `--sandbox workspace-write` from the codex
    provider template globally, saying the sandbox "blocks .git/ metadata
    writes needed for merge operations". Now at
    `internal/providerspec/builtin.go:15-19`.
  - But with no `--sandbox`, `codex exec` falls back to its read-only
    default (impl-kilroy.md:28, sandboxes.md). So the removal was meant to
    allow `.git` writes, yet on the default path Codex likely can't edit or
    commit at all. `f23e0dc` didn't fix `.git` writes there.
  - The tmux/agents path still passes `--sandbox workspace-write`
    (`internal/attractor/agents/templates/codex.go:20`). Inferred: that path
    keeps the problem if an agent there commits or merges.
- Overwritten `.git` file:
  - `90f21fd`: materializing input files into a branch worktree overwrote its
    `.git` pointer file. Branch commits then landed on the parent run branch,
    and the run failed with "handler-provided checkpoint sha does not match
    HEAD". The fix is `git worktree repair`.
  - `5f24e32`: skip `.git/**` and `.jj` during materialization because `.git`
    is a file in a worktree.
- Agents leaving the worktree: `78aeaf1` (#83) added a system-prompt preamble,
  "You are running inside an isolated Kilroy worktree at <path>. Do not cd
  elsewhere or pass -C to git with paths outside cwd". Without it, prompts that
  mention the user's source path pulled agents out and "clobber[ed] the real
  checkout" (handlers.go:501).
- Kilroy edits the tracked `.gitignore`: it appends `.kilroy/`
  (kilroy_files.go:164-183), so that change ends up in the first checkpoint
  commit. The fork changes this (below).
- Comment and code disagree on the `require_clean` default (engine.go:43-44),
  and git-mode resume forces a clean repo (resume.go:290); CLI resume skips
  git. See sections 1 and 4.
- `branch --force` on setup and resume silently overwrites a same-named branch
  (git.go:79-83).
- Fork `kilroy-v2` (feat/v2-reframe), only where it differs materially:
  - Commit `2501f12` "keep checkpoints hook-safe" adds `--no-verify` to the
    checkpoint commit, so user pre-commit hooks are skipped (kilroy-v2
    gitutil/git.go:149, 160). It also writes `.kilroy/` to the worktree's
    `git rev-parse --git-path info/exclude` instead of the tracked `.gitignore`.
  - Declared workflow outputs are added to the checkpoint excludes (kilroy-v2
    engine.go:1932-1943).
  - New `--in-place` flag: run in the workspace directly, with
    `DisableGitAutoDetect`, so there is no worktree, branch or commits. It is
    refused for workflows that declare `side_effects.mutates_git=true`
    (kilroy-v2 main.go:276-277, 392-394, 454-483; engine.go:102-105, 496).

### 8. PAS today: workdir, lock, commit observation

- `--workdir`/`-w`:
  - Defined at `crates/attractor-cli/src/main.rs:45-47` as "Working directory
    for tool execution". `--logs`/`-l` is next to it (main.rs:49-51,
    default `.pas/logs/<pipeline>-<hash>`).
  - The flag passes through `cmd_run` and `prepare_run` into
    `prepare_run_configuration` (`crates/attractor-cli/src/commands/run.rs:266-305`).
    That sets `ExecutionOptions.workdir`.
  - `RunConfiguration::prepare` resolves it: the caller's value, or else
    `std::env::current_dir()`, then `canonicalize()`. The source is recorded
    as caller or built-in (`crates/attractor-pipeline/src/run_configuration.rs:303-318, 357`).
  - `engine.rs:311` is `legacy_options` reading a `workdir` context key into
    `ExecutionOptions` for the context-based entry points
    (engine.rs:269-311). The CLI path uses the resolved configuration instead.
  - No project-level config sets workdir. A directory run (`cmd_run_dir`)
    passes the same workdir to each file (run.rs:995+, 1101-1104).
- Locks (run.rs:355-447):
  - `acquire_run_locks` takes a Pipeline lock at `<logs_dir>/run.lock`, then
    calls `git rev-parse --absolute-git-dir` on the workdir. Inside a git
    worktree it takes a Worktree lock at `<git-dir>/pas-run.lock`
    (`WORKTREE_LOCK`, `commands/run_lock.rs:11`).
  - The git-dir is per worktree, so separate linked worktrees of one repo get
    separate locks. `crates/attractor-cli/tests/run_locks.rs:465` creates a
    second worktree to test this.
  - When the lock is busy, the run is refused with `worktree_locked`, unless
    `--allow-shared-workdir` is given, which warns and continues with
    `shared = true`.
  - `prepare_run` calls it at run.rs:841-843, before the checkpoint is read.
    `shared_workdir` is recorded in `RunStarted` (run.rs:955-967).
    `RunMeta.git_worktree` (`rev-parse --show-toplevel`, run.rs:914) and
    `AttemptStarted.git_head` (`rev-parse HEAD`, run.rs:970-977) are recorded
    too.
- Commit observation (`crates/attractor-pipeline/src/run_commits.rs`):
  - The module doc says "PAS only observes commits; it never creates them"
    (run_commits.rs:1-9). `head()` runs `git rev-parse --verify --quiet HEAD`
    (:17-30). `commits_between()` runs
    `git log --format=%H%x00%s%x00%an%x00%cI before..after` (:32-56).
  - Engine call sites are in `PipelineExecutor::invoke_node`, once per attempt:
    `head_before = run_commits::head(workdir)` before `StageStarted`
    (engine.rs:543-545), then `emit_run_commits(...)` after the handler returns
    and before `StageCompleted`, `StageFailed` or `StageRetrying`
    (engine.rs:575-585).
  - `emit_run_commits` (engine.rs:653-693) emits `PipelineEvent::CommitsCreated { node_id, task_id, commits }`
    when HEAD moved. That is journalled as `EventData::CommitsCreated`
    (`events.rs:65-71, 204-212`; `attractor-journal/src/event.rs:85-93, 236-241`).
  - The beads close handler reads these events back and checks each SHA
    against upstream (`handlers/beads.rs:507-556`).

### 9. PAS seams for a git step (no design)

- Run start (create a worktree):
  - CLI: `prepare_run` (run.rs:781+). The workdir is fixed by
    `prepare_run_configuration` (run.rs:802-811), which calls
    `RunConfiguration::prepare` (run_configuration.rs:303-318). Then
    `workdir_abs` and `acquire_run_locks` run at run.rs:841-843, and the
    checkpoint is read at run.rs:845-856.
  - `run_id` is decided at run.rs:865-866. `RunMeta` (`workdir`,
    `git_worktree`) is written at run.rs:907-926, and `RunStarted` at
    run.rs:955-967.
  - Inferred constraint: a created worktree must exist before the workdir is
    canonicalized (run_configuration.rs:313) and before the Worktree lock.
    The run id that would name a branch is only known after the lock and
    checkpoint step.
  - On resume, the lock is keyed on the workdir's git-dir (run.rs:840-842),
    and the run id comes from the checkpoint read after the lock
    (run.rs:845-866). The workdir is canonicalized earlier
    (run_configuration.rs:313).
  - So a per-run worktree hook needs its path before it knows the run id.
    On resume it must find the existing worktree from something known
    before the checkpoint is read.
  - Kilroy's precedent is a worktree under `logs_root`, which is known up
    front (resume.go:224). That's a constraint only, not a design.
  - Engine: `run_inner` start (engine.rs:713+). `PipelineStarted` is at
    engine.rs:759-773, and the resume branch at engine.rs:808-842.
- Per node, after outcome and checkpoint:
  - Inside `invoke_node`, the post-handler point is engine.rs:575-585, where
    `emit_run_commits` runs per attempt, retries included.
  - In `run_inner`, a node's final outcome is recorded at engine.rs:1050-1051
    (`completed_nodes.push`, `node_outcomes.insert`), then
    `apply_handler_updates` (engine.rs:1071), then edge selection
    (engine.rs:1098). The checkpoint for the next node is saved at
    engine.rs:1133-1147.
  - The exit node is recorded at engine.rs:940-952 with no checkpoint save
    after it. On success the checkpoint is deleted (`clear_checkpoint`,
    engine.rs:1166-1169).
  - `CheckpointData::save` (engine.rs:81-106) is also called before every
    attempt (engine.rs:541).
- Resume:
  - `checkpoint.rs`: `load_checkpoint` (:180-195), `validate_checkpoint`
    (fingerprint and schema, :205-242), `save_checkpoint` (atomic rename,
    :159-174), `clear_checkpoint` (:245-251).
  - `PipelineCheckpoint` stores `current_node_id` as the node to run next, not
    the last one completed (engine.rs:1133 "the *next* node to execute"). It
    has no git SHA field (checkpoint.rs:16-80).
  - The engine resumes at engine.rs:808-842. The CLI loads the checkpoint for
    the banner and run id at run.rs:845-866.
  - The CLI entry is `cmd_run` (run.rs:606+), which calls
    `executor.run_configuration_with_checkpoint(&configured, ctx, &logs_dir)`
    (run.rs:713-725, engine.rs:469-476).

## Open questions

- Q16: Kilroy commits on failed nodes too, and treats `checkpoint.json` (not
  the commit) as the completion record. Should "the commit is the proof"
  cover failures, or only success?
- Q16: should a checkpoint commit be created when the agent already committed
  and nothing is left to stage (Kilroy: yes, empty)? And should the commit be
  linked to the agent's own commits (PAS already journals them as
  `CommitsCreated`)?
- Q16: identity and hooks. Kilroy uses the repo identity with a fallback, and
  on main it runs the user's commit hooks. The fork switched to `--no-verify`.
  Which should we follow?
- Q16: Kilroy resumes from a file and resets the branch to the SHA. If we
  resume "by reading git", what format carries the node id: message parsing,
  trailers, or a checkpoint file in the commit? Kilroy offers no precedent.
- Q17: Kilroy's only knob is the logs root, with the worktree derived from
  it. Do we want an independent worktree root, and is the project-level
  default inside or outside the repo? Kilroy is outside, under XDG state.
- Q17: cleanup and branch lifetime. Kilroy leaves worktrees and branches
  forever and its prune leaks worktree registrations. What removes ours, and
  when?
- Q17/PAS: the PAS Worktree lock keys on the git-dir. With a per-run worktree,
  each run gets its own lock, so does `--allow-shared-workdir` still matter?
- Kilroy CLI resume skipping git is confirmed by code reading (section 4)
  but not run. A scratch run plus resume would show it at runtime.
- Not checked: the text of GitHub issue #49. It is cited only through commit
  `f338c79` and the comment at agent_router.go:1138.
