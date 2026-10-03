# Spike results: hk3 agents in herdr can message each other

Ticket: [tickets/01-spike-herdr-messaging.md](tickets/01-spike-herdr-messaging.md).
Run 2026-10-02 with herdr 0.9.3 and Claude Code 2.1.288 (Opus 5.5).

## Outcome: GO

Every check passed. Herdr is a go for ticket 03, messaging is a go for
ticket 05. Spec changes (decisions 2 and 7) are listed under
[Spec changes](#spec-changes); the most important are:

- **Input-clear key is `ctrl+c`.** Stop sends `ctrl+c`, `/exit`, `Enter`,
  then one more `Enter` if the tab is still open after about 2 s (it
  confirms Claude's "Background work is running" dialog).
- **`crossSessionInbound` does not need to be set.** With every agent in
  skip-permissions mode, messages were delivered at once, idle and busy.
- **No sender header is needed.** The receiver shows
  `Message from @sp-alpha: ...`.
- **The scrub list must be wider than the spec says,** and a leak is real:
  a leaked `CLAUDE_CODE_CHILD_SESSION` gives a child session that does not
  save its transcript and does not show in `ListAgents`.
- **Two launches of the same role at the same moment race** in
  `compose-role` and one fails. Crew start must start members one at a
  time, or role builds must become atomic.

## Setup

- hk3: a `git archive HEAD` copy of the repo at commit `604b630` in
  `$TMPDIR/hk3spike/hk3`, run by absolute path. Ticket 02 was being built
  in the live repo at the same time and had already moved the keeper
  plugin and changed `harmonik-v3`, so the live script was not stable. The
  copy is the "current" hk3 code, unchanged.
- Project: scratch git repo `$TMPDIR/hk3spike/proj`, with
  `.harmonik-v3/config.env` containing `HK3_PROJECT_PREFIX=sp`. Labels
  are `sp-<name>`.
- herdr session `hk3spike`. A wrapper `h` runs `herdr --session hk3spike "$@"`.
- Team names: hk3 has no `--team` yet, so it is emulated with
  `--name alpha--builder` (label `sp-alpha--builder`). The lead is
  `--name alpha` (`sp-alpha`). Workspace label `sp-alpha`, one tab per agent.
- Launch: always `herdr pane run <pane> "<hk3> new agent claude --name ... && exit"`.
  `herdr agent start` was not used.
- To see SessionEnd hooks, the scratch project got
  `.claude/settings.json` with a SessionEnd hook that appends
  `{t, agent: $HK3_AGENT_ID, reason}` to `sessionend.log`.
- Everything was removed at the end: `herdr session stop hk3spike`,
  `herdr session delete hk3spike`, `rm -rf $TMPDIR/hk3spike`. No files
  appeared under `~/.harmonik`, `~/.claude` or the live repo.

Paths below are shortened: `$HK` is the hk3 script, `$S` the scratch folder.

## Checks

### Launch: PASS

Two agents ran in two tabs of one workspace. Tab labels stayed set after
Claude set its terminal title.

```sh
h workspace create --cwd $S/proj --label sp-alpha --no-focus      # w2, w2:t1, w2:p1
h tab rename w2:t1 sp-alpha
h tab create --workspace w2 --cwd $S/proj --label sp-alpha--builder --no-focus   # w2:t2, w2:p2
h pane run w2:p1 "$HK new agent claude --name alpha -- 'Reply with exactly the word READY and nothing else.' && exit"
h pane run w2:p2 "$HK new agent claude --name alpha--builder && exit"
h tab list --workspace w2
```

```
{"tab_id":"w2:t1","label":"sp-alpha"}
{"tab_id":"w2:t2","label":"sp-alpha--builder"}
h pane get w2:p2 → "terminal_title":"✳ sp-alpha--builder", tab label unchanged
```

Labels were unchanged after many turns, a compaction and a `/clear`.

Notes for the adapter:

- **Folder trust prompt:** the first launch in the scratch folder showed
  "Quick safety check: Is this a project you created or one you trust?"
  with **`No, exit` selected by default**. Answered with
  `h pane send-keys w2:p1 down enter`. It appears once per folder. No
  bypass-permissions dialog appeared; the operator's account had already
  accepted it.
- IDs are never reused: after closing `w1`, the next workspace was `w2`.
  `tab create --workspace w1` then failed with `workspace_not_found`. Use
  the IDs from each create response.
- **A workspace closes on its own when its last tab closes.** This
  happened every time the last agent exited with `&& exit`.
- **herdr restores workspaces and tabs after `session stop` and a server
  restart,** with fresh shells. A workspace `envtest` came back after a
  restart. A tab labelled with an agent's label can therefore exist with
  no agent in it.
- `herdr pane run` submits a prompt into a running Claude (text plus
  Enter). All prompts in this spike were sent that way.

### Environment: PASS (with a wider scrub list)

**Server started from this Claude session's Bash tool, nothing removed.**
`HK3_AGENT_ID`, `HK3_TEAM`, `HK3_PROJECT_DIR`, `KEEPER_ENABLED` and
`HARMONIK_AGENT` were exported before the server started:

```sh
nohup herdr --session hk3spike server > $S/server1.log 2>&1 &
h workspace create --cwd $S/proj --label envtest --no-focus
h pane run w1:p1 "env | grep -E '^(CLAUDE|HK3_|KEEPER_|HARMONIK|HERDR)' | sort"
```

```
CLAUDE_CODE_ENTRYPOINT=cli
CLAUDE_CODE_EXECPATH=/Users/greg.berns/.local/share/claude/versions/2.1.287
CLAUDE_CODE_MESSAGING_SOCKET=<the parent session's socket>
CLAUDE_CODE_SESSION_ATTENDED=1
CLAUDE_EFFORT=medium
CLAUDE_PID=5687
HARMONIK_AGENT=leaked
HERDR_ENV=1  HERDR_PANE_ID=w1:p1  HERDR_SESSION=hk3spike  HERDR_SOCKET_PATH=...  HERDR_TAB_ID=w1:t1  HERDR_WORKSPACE_ID=w1
HK3_AGENT_ID=leaked-captain
HK3_PROJECT_DIR=/nowhere
HK3_TEAM=leakteam
KEEPER_ENABLED=1
```

- **herdr 0.9.3 strips a few Claude variables itself:** `CLAUDECODE`,
  `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_SESSION_ID` and
  `CLAUDE_CODE_MESSAGING_TOKEN` were in the parent shell and not in the
  pane. `strings $(which herdr)` lists exactly these names. It leaks the
  rest of `CLAUDE_CODE_*`, plus `CLAUDE_PID`, `CLAUDE_EFFORT`, and every
  `HK3_*`, `KEEPER_*` and `HARMONIK_AGENT`.
- The leaked `HK3_PROJECT_DIR` broke the launch:
  `harmonik-v3: line 39: cd: /nowhere: No such file or directory`.
- With `HK3_PROJECT_DIR` unset, the agent started. The captain's team
  reached it. The agent's Bash printed `TEAM=leakteam KE=1 HA=sp-leaky`.
- With only those residual variables leaked, Claude still started as a
  normal session: it listed in another agent's `ListAgents` and got its
  own messaging socket (`/tmp/cc-socks/35169.sock`, not the parent's
  `5687.sock`).

**A child-session marker that does leak makes a child session.** This was
checked by typing the launch with the variables herdr strips:

```sh
h pane run w2:p? "CLAUDECODE=1 CLAUDE_CODE_CHILD_SESSION=1 CLAUDE_CODE_SESSION_ID=1111...5555 \
  CLAUDE_CODE_MESSAGING_SOCKET=/tmp/cc-socks/fake.sock CLAUDE_CODE_MESSAGING_TOKEN=fake \
  $HK new agent claude --name alpha--child && exit"
```

```
⚠ Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker · restart with CLAUDE_CODE_FORCE_SESSION_PE…
```

`sp-alpha`'s `ListAgents` then showed only `sp-alpha--builder`.
`sp-alpha--child` was missing. That session could neither be messaged nor
resumed.

**Server started with the variables removed:** a pane had none of them.

```sh
# start-server: env -u <each of CLAUDECODE CLAUDE_CODE_* CLAUDE_PID CLAUDE_EFFORT HK3_* KEEPER_* HARMONIK_AGENT> \
#   nohup herdr --session hk3spike server &
h pane run w1:p1 "echo COUNT=\$(env | grep -cE '^(CLAUDE|HK3_|KEEPER_|HARMONIK)')"
```

```
COUNT=0
```

Agents launched from that server showed the normal "← 1 agent" messaging
indicator, listed in `ListAgents`, and saved transcripts.

**Typed launch with the variables removed:** in a pane where the leaked
values had been exported, `env -u CLAUDECODE -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_PID -u HK3_TEAM -u HK3_AGENT_ID -u HK3_PROJECT_DIR -u KEEPER_ENABLED -u HARMONIK_AGENT $HK new agent claude --name typed -- -p '...env > file...'`
launched. The agent had its own socket, no `HK3_TEAM`, and only the
`HK3_*` values hk3 set (`HK3_AGENT_ID=sp-typed`, `HK3_AGENT_NAME=typed`,
`HK3_PROJECT_PREFIX=sp`, `HK3_ROLE=general`, `HK3_STATUSLINE_INNER`).

A caveat for reading `env` inside an agent: Claude sets `CLAUDECODE=1`
and `CLAUDE_CODE_CHILD_SESSION=1` in its own Bash tool's environment. To
tell whether a launch leaked, check the pane's shell or the launch
warning, not the agent's Bash.

### Addressing: PASS

The `--` label is accepted as the session name and shows in the other
agent's `ListAgents`.

```
hk3: agent sp-alpha--builder ... --name sp-alpha--builder --dangerously-skip-permissions
status line / prompt border: sp-alpha--builder
sp-alpha's ListAgents: sp-alpha--builder, oc-alpha, omatic-system-plan-d4, ..., harmonik-v3-20
```

**`ListAgents` is machine-wide.** It lists every local Claude session,
including the operator's real sessions in other projects. One of them was
a live `oc-alpha`, the very name the spec uses as its example. Messages
must go only to labels on the roster.

### Delivery: PASS (no `crossSessionInbound` needed)

Both agents ran with `--dangerously-skip-permissions` (hk3's default).
Nothing was held, and no `--settings` override was needed.

**Idle:** A was asked to "Use SendMessage to send this exact text to
sp-alpha--builder: PING-1 please reply to whoever sent this with the text
PONG-1". Idle B started a turn on its own:

```
B: › Message from @sp-alpha: PING-1 please reply to whoever sent this with the text PONG-1
B:   ⎿  "Reply PONG-1 to sp-alpha" → uds:/tmp/cc-socks/41715.sock
A: › Message from @sp-alpha--builder: PONG-1
```

**Busy:** B ran a 30 s foreground tool call
(`python3 -c 'import time; time.sleep(30)'`; a plain `sleep 25` is
blocked by the operator's PreToolUse hook and went to the background).
`herdr agent list` showed B `working` when A sent `BUSY-PING2`. B got it
mid-turn, between its tool calls, and replied in the same turn:

```
B: › Message from @sp-alpha: BUSY-PING2 reply BUSY-PONG2 to the sender
B: ⏺ Bash(echo SECOND)  ⎿ SECOND
B:   ⎿  "Reply BUSY-PONG2 to sp-alpha" → uds:...
B: ⏺ ... While the Python command was running, sp-alpha sent another ping. I replied "BUSY-PONG2" afterwards
```

### Sender: PASS (the receiver sees the sender)

Every received message was shown as `Message from @<sender label>: <text>`,
with no header in the text. The receiver could reply to "the sender"
without being told its name. No sender header is needed.

### After keeper: PASS

**Compaction:** B was relaunched with
`KEEPER_RESTART_TOKEN_COUNT=500 $HK new agent claude --name alpha--builder -- 'Run the Bash command: echo hi. Then say done.'`.

```
[claude-keeper] handoff completed (found marker "HANDOFF_READY")
[claude-keeper] compaction completed (tokensBefore=40605 tokensAfter=3197)
[claude-keeper] startup submitted (prompt): Read HANDOFF.md and continue from its next step.
```

Afterwards A's `ListAgents` still showed `sp-alpha--builder`.
`AFTER-COMPACT-PING` was delivered and answered with `AFTER-COMPACT-PONG`.

**Clear mode:** B was relaunched with `KEEPER_RESTART_TOKEN_COUNT=500 KEEPER_RESTART_CLEAR_MODE=1`.
Before the cycle, A's `ListAgents` showed `sp-alpha--builder [33d9fb]`.

```
❯ /clear
[claude-keeper] clear confirmed via SessionStart source=clear
[claude-keeper] startup submitted (prompt): Read HANDOFF.md and continue from its next step.
sessionend.log: {"agent":"sp-alpha--builder","reason":"clear"}
```

After the cycle `ListAgents` still showed `sp-alpha--builder [33d9fb]`,
the same ref: the name and messaging endpoint survive `/clear`.
`AFTER-CLEAR-PING` was delivered and answered.

After a relaunch under the same label, the sender saw "Note: messaging a
new session for the first time under a previously used name (was it
restarted?)". This is informational, and delivery still worked.

### First prompt: PASS

`$HK new agent claude --name alpha -- 'Reply with exactly the word READY and nothing else.'`
was submitted as the first turn (after the trust prompt was answered):
`❯ Reply with exactly the word READY and nothing else.` then `⏺ READY`.

### Exit: PASS

The SessionEnd hook ran in every case, with `reason: prompt_input_exit`.
With `&& exit`, the tab closed on its own 1 to 2 s after `/exit` (polling
`tab list` every 0.5 s).

| Case | Keys sent | Result |
|---|---|---|
| Idle, empty input | `/exit`, Enter | Tab closed in under 1 s; SessionEnd ran |
| Idle, empty input | `ctrl+c`, `/exit`, Enter | `ctrl+c` shows "Press Ctrl-C again to exit"; `/exit` still worked; closed in about 2 s |
| Draft (multi-line) in input | `ctrl+c`, `/exit`, Enter | `ctrl+c` cleared the whole draft; closed in about 2 s |
| Mid-turn (30 to 40 s foreground tool) | `/exit`, Enter | Claude showed **"Background work is running ... 1. Exit and stop tasks / 2. Move to background and exit / 3. Stay"** and waited; one more Enter chose 1 and closed the tab in about 1 s |
| Mid-turn | `ctrl+c`, `/exit`, Enter | `ctrl+c` interrupted the turn; exited in about 1 s with no dialog; no stray `python3` left |
| Idle with a `run_in_background` shell running | `ctrl+c`, `/exit`, Enter | The same "Background work is running" dialog; one more Enter exited; the background process was stopped |

Which key clears the input:

- `ctrl+u` clears only the current line of a multi-line draft. Not enough.
- `escape` once does nothing. `escape escape` clears a draft, but on an
  **empty** input it opens the **Rewind** dialog, which would then
  swallow `/exit`. Unsafe.
- `ctrl+c` clears a draft of any length, interrupts a running turn, and
  on an empty input only arms "press again to exit". **Use `ctrl+c`.**

**Failed launch:** two tabs launched the same role at the same moment
(`exit2`, `exit3`, `exit4`). `exit3` failed, and its tab stayed open with
the error at a shell prompt:

```
.../scripts/compose-role: line 68: .../.harmonik-v3/build/roles/general/plugin/.claude-plugin/plugin.json: No such file or directory
➜  proj git:(main) ✗
```

The cause: `compose-role` does `rm -rf "$out"` and then rebuilds the
shared `build/roles/<role>/` folder, so parallel launches of one role race.
The same rebuild also deletes and rewrites the plugin folder of agents
that are already running that role.

### Siblings: PASS

A was asked to run, from its own Bash tool inside its pane:

```sh
env | grep -E '^HERDR_(SESSION|PANE_ID)'          # HERDR_SESSION=hk3spike, HERDR_PANE_ID=w2:p1
herdr --session hk3spike tab create --workspace w2 --cwd $S/proj --label sp-alpha--sib --no-focus   # tab w2:t7, pane w2:p7
herdr --session hk3spike pane run w2:p7 '$HK new agent claude --name alpha--sib && exit'
```

`tab list` showed `sp-alpha`, `sp-alpha--builder`, `sp-alpha--sib`.
`agent list` showed a Claude in `w2:p7` titled `sp-alpha--sib`, idle and
answering prompts. The sibling's shell came from the clean server, not
from A's environment, because only the command text crosses into the
pane.

## Spec changes

Decision 2 (session module):

1. **Stop sequence:** `ctrl+c`, `/exit`, Enter. If the tab still exists
   after about 2 s, send Enter once more (confirms "Exit and stop tasks").
   Then wait the grace period and close the tab. `ctrl+c` is the
   input-clear key: not `ctrl+u` (one line only), not Escape (Esc Esc on
   an empty input opens Rewind).
2. **Scrub list:** remove `CLAUDECODE`, every `CLAUDE_CODE_*`,
   `CLAUDE_PID`, `CLAUDE_EFFORT`, every `HK3_*` and `KEEPER_*`, and
   `HARMONIK_AGENT`, both when starting the server and in the typed
   command. Do not rely on herdr's own stripping: it covers only four
   names, and a leaked `CLAUDE_CODE_CHILD_SESSION` gives a session that
   cannot be messaged or resumed.
3. **No explicit workspace close is needed.** herdr closes a workspace
   when its last tab goes. Stop should treat "workspace already gone" as
   success.
4. **Stale tabs after a server restart:** herdr restores workspaces and
   tab labels (with fresh shells) after `session stop` or a restart. A
   label's tab can exist with no agent in it, and start then refuses it.
   Ticket 03 should state that the operator clears this with
   `hk3 session stop <label>` (stop on an agentless tab just closes it).
5. **Folder trust:** the first launch in a project waits on a trust
   prompt whose default is "No, exit". hk3 should not answer it. The
   README should tell the operator to run one `hk3 new agent claude` in
   the project, or attach and answer it, before the first team start.
6. Use the IDs returned by each create call. IDs are not reused.

Tickets 03, 04 and 06 (launch order):

7. **Do not start two members of the same role at the same moment.**
   `crew start` must start members one at a time, waiting until each
   launch has got past role composition: for example, poll the tab for
   the launch's `hk3: claude` line, or just pause briefly. A cleaner fix
   is an atomic role build in `compose-role` (build into a temp folder,
   then `mv`), which also stops a rebuild from pulling the plugin folder
   out from under running agents. That is a core change; the operator
   should pick which ticket (02 or 03) takes it.

Decision 7 (messaging):

8. `crossSessionInbound` is **not** needed for same-mode agents. Leave
   it out.
9. **No sender header.** The receiver sees `Message from @<label>`.
10. The `crew` skill should say to message only labels on the roster,
    because `ListAgents` lists every Claude session on the machine,
    including other projects' sessions that use the same naming.

Seen but out of scope for this spike:

- With the default keeper prompts, every member writes the same
  `HANDOFF.md` in the project root. Story 26 (a handoff file no other
  agent shares) needs a `{name}` handoff prompt, e.g.
  `KEEPER_HANDOFF_PROMPT`/`KEEPER_STARTUP_PROMPT` naming
  `HANDOFF-{name}.md`, set by default for team members or in the project
  config. Ticket 02 or 04 should own it.
- The operator's older harmonik global hooks write
  `.harmonik/keeper/<label>.ctx` into the project for every hk3 agent.
  This is harmless, but it is one more per-label file.
