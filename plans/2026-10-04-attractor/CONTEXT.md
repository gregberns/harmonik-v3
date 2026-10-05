# Attractor (PAS fork)

The pipeline engine hk3 drives: it runs a graph of nodes, each node an
agent task or a tool step, in a git worktree, and records everything in a
run folder.

## Language

**Pipeline**:
A graph (a `.dot` file) of nodes and edges that the engine walks.
_Avoid_: workflow, graph (for the whole thing)

**Run**:
One execution of a pipeline, with its own run id, worktree, branch and run
folder.
_Avoid_: job, execution

**Node**:
One step of a pipeline: an agent task, a tool step, a human gate, start or
exit.
_Avoid_: stage (PAS code uses it; keep it for events only), step

**Attempt**:
One try at a node; retries make more attempts of the same node.

**Agent**:
An external coding-agent program (Claude Code, Codex, a fake) that does a
node's work in the worktree. Called "agent tool" in
research/driver-and-assembly.md.
_Avoid_: provider, harness, model

**Agent profile**:
A named entry in the agent config that says which mechanism, command,
model, reasoning level and environment to use.
_Avoid_: provider, backend

**Mechanism**:
The way the engine drives an agent: `claude-p` and `codex-exec` (built),
and later `acp`, `exec`, `tmux`, `remote`. What decisions Q14 and Q23 call
a "handler".
_Avoid_: handler (that is PAS's node handler), backend

**Invocation**:
One start of an agent process for one attempt, with its own id, transcript
and stderr file.
_Avoid_: call, session

**Transcript**:
The agent's stdout for one invocation, written line by line as it arrives.

**Outcome**:
What a node attempt produced, as the engine routes it: success, fail, retry
or partial success, with a failure reason and failure class.
_Avoid_: status (alone). "Result" is kept for what an agent reports and for
result files.

**Failure class**:
Why an attempt failed: reported, timeout, crash, no result or launch.
A cancelled attempt is not a failure; it goes to the engine's stop path.

**Run folder**:
The directory that holds a run's journal, run metadata, transcripts and
node results; the place other processes read.
_Avoid_: logs dir, run dir (in prose)

**Journal**:
The run's append-only event file, `events.jsonl`.

**Worktree**:
The git worktree the engine creates for a run; every node's agent works in
it.
_Avoid_: workdir in prose (PAS's current term for a shared directory; kept
as a field name for the directory an agent runs in)

**Node commit**:
The commit the engine makes in the worktree after each node attempt.
_Avoid_: checkpoint commit

**Checkpoint**:
The engine's saved execution state (`checkpoint.json`) used to resume a run.

**Digital twin**:
A fake agent executable that speaks the same output format as a real agent
and follows a scripted scenario, used to test the engine.
_Avoid_: mock agent, stub
