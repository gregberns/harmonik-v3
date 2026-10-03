# Technical review: crews plan

Reviewed 2026-10-02 against `harmonik-v3`, `scripts/`, `config/`, `plugins/claude-keeper/`,
docs, herdr 0.9.3 (`herdr <group>`, `herdr --skill`, `herdr api schema --json`) and
Claude Code 2.1.288 (`claude --help`, strings in the binary). No herdr server or Claude
session was started.

## Summary verdict

The plan is buildable and well sliced. The herdr commands it relies on all exist.
Ticket order is sound, and it rightly keeps away from herdr's agent-state detection.
Three things must change before ticket 03/04 work starts:
- Team names don't reach keeper's `{name}` or `HARMONIK_AGENT`.
- Environment leaks from a Claude session into herdr panes. This can make every
  member a "child" Claude and put members on the wrong team.
- The spike has no go/no-go or fallback, and doesn't test two things that can break
  it: env inheritance, and whether the session name survives keeper's restart.

## Must fix

### M1. Team member names collide in keeper handoffs and `HARMONIK_AGENT` (spec §3, Further Notes; ticket 03)
- **Problem:** The spec says a label is "the keeper `{name}` source, so handoff
  files become `HANDOFF-alpha--builder.md`". In the code, `{name}` comes from
  `HK3_AGENT_NAME`, not the label. With `--team alpha --name builder`, the
  omatic setup (`KEEPER_STARTUP_PROMPT="/session-resume HANDOFF-{name}"`) gives
  `HANDOFF-builder.md`. That file is shared by `oc-alpha--builder`,
  `oc-bravo--builder` and a solo `oc-builder`, so one agent resumes from another's
  handoff. `HARMONIK_AGENT` is also built from the bare name, giving `oc-builder`,
  so the older harmonik's `.sid`/`.idle` markers collide the same way.
- **Evidence:**
  - `plugins/claude-keeper/hooks/index.js:143`: `name: await $.env.get("HK3_AGENT_NAME")`
  - `harmonik-v3:183`: `HARMONIK_AGENT="${HK3_PROJECT_PREFIX:-hk3}-${HK3_AGENT_NAME:-unnamed}"`
  - docs/configuration.md: "`{name}` is replaced by the agent name, without the
    project prefix".
- **Change:** Ticket 03 should state the rule: with `--team`, hk3 validates the
  user's `--name` and then exports `HK3_AGENT_NAME=<team>--<name>`. Keeper's
  `{name}` and the existing `{name}` launch check then work unchanged.
  `HARMONIK_AGENT` should become `${HK3_AGENT_ID}`, with `hk3-` added when there
  is no prefix. Add acceptance checks to ticket 03:
  - `KEEPER_STARTUP_PROMPT='/session-resume HANDOFF-{name}'` resolves to
    `HANDOFF-alpha--builder`.
  - `HARMONIK_AGENT=oc-alpha--builder`.
  - Solo `oc-alpha` is unchanged (`HANDOFF-alpha`, `HARMONIK_AGENT=oc-alpha`).

  Update docs/configuration.md to match ("without the project prefix" still holds).

### M2. Herdr panes inherit the caller's Claude and hk3 environment (spec §2; tickets 03, 04, 05)
- **Problem:** A captain runs `hk3 crew add`, which runs `hk3 session start`,
  which starts the herdr server from inside the captain's Bash tool. The server,
  and every pane it spawns, then inherits the captain's environment:
  - Claude's own variables: `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`,
    `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_MESSAGING_SOCKET` and
    `CLAUDE_CODE_MESSAGING_TOKEN`.
  - hk3's variables: `HK3_AGENT_NAME`, `HK3_AGENT_ID`, `HK3_TEAM`, `HK3_ROLE`,
    `KEEPER_ENABLED` and `HARMONIK_AGENT`.

  This has three effects:
  1. Each member Claude starts as a "child" session, and may also start on the
     captain's messaging socket. That is exactly the transport the plan depends on.
  2. `load_env` gives the shell environment top priority, and ticket 03 says
     "`HK3_TEAM` in the environment works like the flag". So any later solo
     `session start --name bravo` started in that server becomes
     `oc-alpha--bravo`. "Inside a session" detection (tickets 05 and 07) also
     fires in panes the operator opens.
  3. The reverse also breaks. Settings that exist only in the caller's shell
     (`HK3_PROJECT_PREFIX`, `HK3_PROJECT_DIR`, `KEEPER_RESTART_TOKEN_COUNT=500`)
     don't reach a member started in an already-running server.
- **Evidence:**
  - `env` in a Claude Bash tool shows the `CLAUDECODE` and `CLAUDE_CODE_*`
    variables listed above.
  - The 2.1.288 binary contains
    `function fWe(){if(a.CLAUDE_CODE_CHILD_SESSION)return!0;if(!a.CLAUDECODE)return!1;...}`.
  - `harmonik-v3:86-107` (shell env wins); `harmonik-v3:202`
    (`export HK3_AGENT_NAME`).
  - research-herdr.md only checked that `--env` values appear in panes.
- **Change:** Ticket 04 should do two things:
  - **(a)** Start the server with a clean environment, detached:
    `env -u CLAUDECODE -u CLAUDE_CODE_CHILD_SESSION ... nohup herdr --session "$S" server >log 2>&1 </dev/null &`,
    stripping all `CLAUDE_CODE_*`, `CLAUDECODE` and `HK3_*`/`KEEPER_*` agent
    variables. Then poll `herdr --session "$S" status server --json` until it is
    ready. macOS has no `setsid`; `nohup` plus redirects is enough.
  - **(b)** Type a launch command that resets the same variables and forwards
    only the resolved settings, e.g.
    `env -u CLAUDECODE -u CLAUDE_CODE_CHILD_SESSION ... HK3_PROJECT_DIR=… HK3_PROJECT_PREFIX=… [KEEPER_*=…] /abs/harmonik-v3 new agent claude --team … --name … --role …`,
    with each value quoted via `printf %q`.

  Add acceptance checks: the fake `claude` in a pane prints no `CLAUDE_CODE_*` or
  parent `HK3_AGENT_*`/`HK3_TEAM` values, even when the server was started from a
  shell that had them set. Add the same check to the spike (M3).

### M3. The spike has no pass/fail, no fallback, and misses two make-or-break checks (ticket 01, spec §9)
- **Problem:**
  - Ticket 01 lists observations but doesn't say what counts as a failure, or what
    happens to tickets 04–08 if messaging or inbound acceptance fails.
  - It doesn't test whether a member is still reachable by label after keeper's
    restart. Story 35 needs this. Clear mode starts a new session id, and nobody
    has checked that the `--name` survives `/clear` or compaction for
    `ListAgents`/`SendMessage`.
  - It doesn't test env inheritance when the herdr server is started from inside a
    Claude session (M2).
  - It spends effort on `herdr agent start`, which runs the `claude` binary
    directly. That skips hk3's role composition, keeper, status line and env, and
    its name regex `[a-z][a-z0-9_-]{0,31}` rejects labels hk3 allows (uppercase,
    over 32 characters).
- **Evidence:** ticket 01 checklist; `herdr agent` usage:
  `agent start <name> --kind KIND --pane ID [-- <agent-args...>]`; `herdr --skill`:
  "Names must match `[a-z][a-z0-9_-]{0,31}`"; keeper README (clear mode discards
  the conversation).
- **Change:**
  - Decide now on `pane run` of the hk3 command. Drop `agent start` from the spike
    and from spec §2's "left to the spike".
  - Add checks to the spike:
    1. After a keeper cycle with `KEEPER_RESTART_TOKEN_COUNT=500`, in both compact
       and clear mode, the label is still in the other agent's `ListAgents` and
       still receives messages.
    2. With the server started from inside a Claude Bash tool, a pane's `env` has
       no `CLAUDE_CODE_*`/`CLAUDECODE` (or the scrubbing in M2 fixes it).
  - Add a go/no-go block:
    - **Messaging go:** label-addressed delivery works, both idle and busy, with
      skip-permissions on both sides (with `crossSessionInbound: accept` in
      base.yaml if needed).
    - **Messaging no-go:** ticket 06 stops and the operator chooses a fallback,
      e.g. agents type into a teammate's pane with
      `herdr agent prompt <pane> "<text>"`. Tickets 04, 05 and 07 don't depend
      on messaging and continue.
    - **Herdr no-go:** sibling start or `/exit` doesn't work. Stop and report
      before ticket 04.

## Should fix

### S1. `workspace create` already makes a tab and pane (spec §2; ticket 04)
`herdr --skill`: "`workspace create` returns `.result.workspace`, `.result.tab`,
and `.result.root_pane`." If every start runs `tab create`, a new team keeps an
empty shell tab. Then "close the workspace when its last tab goes" never fires,
and `session list` shows a stray tab. **Change:** the first member uses the root
tab and renames it with `herdr tab rename <tab> <label>`. Later members use
`tab create --workspace W --cwd … --label … --no-focus`.

### S2. A failed launch closes its tab and hides the error (spec §2; ticket 04)
With `<launch>; exit`, any hk3 refusal (bad role, `{name}` check, missing `yq`)
closes the tab at once. `session start` still reports success, and
`crew add`/`crew start` writes a roster entry for a member that never ran.
**Change:** type `<launch> && exit`, so a failed launch leaves the shell and the
error visible. After `pane run`, wait a moment, check the tab still exists, and
fail otherwise.

### S3. Fake `claude` may not be the `claude` found in a herdr pane (Testing Decisions; tickets 04, 05, 07)
A pane runs the operator's login shell. `.zshrc` and `.zprofile` can rebuild
`PATH`, so the real `claude` may run instead of the fake, spending tokens against
the scratch repo. **Change:** in the test recipe, start the `hk3test` server with
the fake's directory first on `PATH`, and pass it with `--env PATH=…`. Check
`command -v claude` in a pane before the first launch. Add this to
docs/testing.md.

### S4. Quoting of the typed command and first prompt (spec §4; tickets 04, 05)
The first prompt and the responsibility text are typed into a shell by
`herdr pane run`. Spaces, quotes or `$` break the command, and a newline submits
it early. **Change:** build the command with `printf %q`, keep the first-prompt
template to one line, and refuse newlines in `--responsibility`.

### S5. Roster lifecycle and races (spec §6, Further Notes; tickets 05, 07)
- Whole-team `crew stop` doesn't say it deletes the roster. Ticket 07 refuses
  `crew start` "if the team already has a roster", so a team can never be started
  again after a stop or a crash. **Change:** whole-team stop deletes the roster
  file. `crew stop <member>` removes the member even when no tab is live, and
  `session stop` on a missing label exits 0 with a notice.
- Two agents running `crew add builder` at once can both pick `builder-2` before
  either tab exists. Then two Claude sessions share one name, which breaks
  messaging. Or the last roster write drops a live member, who is then ignored
  under the "not on my roster" convention. **Change:** wrap name choice, tab
  creation and the roster write in a `mkdir`-based lock in `.harmonik-v3/teams/`
  (a few lines; no new feature). If you'd rather keep last-write-wins, at least
  re-check the tab label just before `pane run`.

### S6. Teams folder gitignore depends on re-running `hk3 init` (ticket 05)
Existing projects, omatic among them, were initialized before this change, so
updating the init prompt doesn't reach them. **Change:** when hk3 creates
`.harmonik-v3/teams/`, it also writes `.harmonik-v3/teams/.gitignore` containing
`*`.

### S7. Define "inside an hk3 session" and how the team is read (spec §3, §4; tickets 03, 05, 07)
The spec says "The team is the part of the name before `--`; a solo agent's team
is its whole name". From the label `oc-alpha` that rule gives team `oc-alpha`, not
`alpha`. The prefix may also contain `-`. **Change:**
- "Inside a session" means `HK3_AGENT_ID` is set, and it is trustworthy only
  once M2 is fixed.
- The team is `HK3_TEAM` if set, else `HK3_AGENT_NAME`.
- The team label is the part of `HK3_AGENT_ID` before `--`.
- Ticket 03's "read the team from a label" helper should work this way, not by
  parsing the prefix.

### S8. One herdr session for all projects lets workspace labels collide (spec §2, open question 4)
Two projects with no prefix both get workspace `alpha`. `session start` would
then add a tab to the other project's workspace, and `list`/`stop --team` would
mix the two. **Change:** require `HK3_PROJECT_PREFIX` for `session` and `crew`
commands, or match workspaces on label and cwd together.

### S9. `hk3 session attach` from inside herdr (ticket 04)
Research: herdr refuses to launch its TUI inside its own pane. An agent, or an
operator working in any herdr pane, will hit this. **Change:** if
`HERDR_ENV=1`, print `herdr session attach $HK3_HERDR_SESSION` for the operator to
run in a plain terminal, then exit non-zero. Add an acceptance check.

### S10. `/exit` with text already in the input box (spec §2; tickets 01, 04)
If the input box holds a draft or a queued prompt, typed `/exit` is appended to
it and isn't run. Mid-turn, it may be queued until the turn ends. **Change:**
the spike also tests stop with a draft present. `session stop` sends `escape`, or
whatever key the spike shows clears the input, before `/exit`, and keeps the
grace-period close as the backstop.

### S11. Ticket 02 acceptance contradicts the keeper move
"Every existing command produces the same arguments… as before" can't hold,
because `--plugin-dir` now points at the module folder. **Change:** same output
except the keeper plugin path. Also export `HK3_PROJECT_DIR` (resolved) and the
repo root to module entrypoints, and have modules call `"$ROOT/harmonik-v3"`
rather than relying on `hk3` being on PATH.

## Notes

- **Blocking edges.** The order is correct. Ticket 09 is marked unblocked, but it
  edits `compose-role` and `list_roles`, which ticket 02 moves into the shared
  library. Either run it after 02 or expect a merge. Tickets 05 and 07 should
  check "known role" with the same lookup that 09 extends, so project roles work
  in crews once 09 lands.
- **Ticket size.** Tickets 04 and 05 are the largest; each has four commands plus
  docs. They are still one-context tickets if M2, S1 and S2 are settled first.
  Ticket 05 could split `crew stop` into its own ticket if it runs long.
- **Herdr usage.** The commands are as documented: `tab create --workspace
  --cwd --label --env --no-focus`, `pane run`, `pane send-keys`, `tab close`,
  `workspace close`, `session stop`. `--session` is a global option and goes
  before the subcommand (`herdr --session hk3 tab list`). The schema keeps the tab
  `label` separate from `terminal_title`, so Claude setting the terminal title
  shouldn't overwrite the label. The spike should confirm this.
- **Resume.** Every member runs from the project root, so `claude --resume`
  finds their sessions (good). There is no `session start` path for resuming a
  member, so a crashed member is resumed by hand with
  `hk3 resume agent claude --team alpha --name builder <id>`. That is fine for
  v1, but the README should say so. Keeper still runs one cycle per load (keeper
  README), so a long-lived member gets one automatic handoff. That limit predates
  this plan, but it qualifies story 35.
- **Trust and bypass dialogs.** The first launch in a directory, and the first
  use of `--dangerously-skip-permissions`, can show a dialog that blocks the
  first prompt. Note this for the spike and for the live checks.
- **Lead slot.** A captain taking the lead slot in `crew start` is recorded with
  the definition's role (`captain`) even when its real `HK3_ROLE` is `general`.
  Record the real role, or say this is intended. `crew start` from a captain that
  already grew a team with `crew add` is refused by the "roster exists" rule.
  That is probably correct, but the skill should say to use `crew add` in that
  case.
