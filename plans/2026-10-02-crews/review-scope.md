# Review: crews plan (scope, requirements fit, ZFC)

Reviewer stance: skeptical, for the operator. Sources: requirements.md (truth),
docs/concepts/zero-framework-cognition.md, spec.md, README.md, tickets 01–09,
AGENTS.md, `harmonik-v3`, `scripts/compose-role`.

## Summary verdict

The plan meets the objective and stays clean on ZFC: hk3 launches, names,
lists, validates structure and stops; it never judges, routes by content or
detects completion. But it is about 30–40% bigger than the first
implementation needs (38 user stories, 11 subcommands, 9 tickets). It also
has one real correctness hole: environment leaking through the shared herdr
server. And tickets that hang on open operator questions are marked
ready-for-agent. Fix those, trim to about 7 tickets, and it is a good first
plan.

## Must fix

1. **Environment leak through the herdr server breaks launches across sessions and projects.** Spec decision 2 ("hk3 starts its server in the background when it is not running"; "Every herdr call names the session explicitly, so the same command works ... from an agent inside herdr"). Ticket 04.
   - **Problem:** the server is started by whichever hk3 call comes first. That may be a captain's Bash tool, which carries `CLAUDECODE` and the other Claude Code session variables, plus `HK3_AGENT_NAME`, `HK3_AGENT_ID`, `HK3_ROLE`, `HK3_TEAM`, any `HK3_PROJECT_DIR` and `KEEPER_*` overrides. Panes probably inherit the server's (or the caller's) environment. In `harmonik-v3`, shell env wins over config.env, and `PROJECT_DIR="${HK3_PROJECT_DIR:-...}"` wins over the pane's cwd. With one shared `hk3` session across projects (open question 4), a leaked `HK3_PROJECT_DIR` sends every new member into the wrong project. A leaked `CLAUDECODE` may make `claude` refuse to start as a nested session. A leaked `HK3_AGENT_ID` also makes an operator's shell pane look "inside a session" to `crew add/start/stop` (decision 4), so it silently picks the wrong team. That is exactly the wrong-team risk the operator named.
   - **Change:** in decision 2, state that hk3 starts the herdr server with a scrubbed environment (`env -u CLAUDECODE -u` each `HK3_*`/`KEEPER_*`/`CLAUDE_CODE_*` variable). State that the typed launch command passes everything it needs explicitly: `cd <project> && HK3_PROJECT_DIR=<project> hk3 new agent claude --team .. --name .. --role ..`, or `--env` on `tab create`. Add to ticket 01: "server started from inside a Claude session; does a new pane inherit the server's or the caller's env, and does `claude` start?" Add to ticket 04 a test: start the server from an environment with `HK3_PROJECT_DIR`, `HK3_AGENT_ID` and `CLAUDECODE` set, then check the member's pane has none of them except what hk3 set.
   - **Change:** define "inside an hk3 session" in decision 4 as one named variable (`HK3_AGENT_ID` set by the launcher). The current spec leaves it implicit.

2. **Tickets marked ready-for-agent depend on unanswered operator questions.** Tickets 02, 03, 05, 07, 09 vs. spec "Open questions" 1, 2, 3, 5 and decisions 1, 3, 8 ("Needs operator confirmation").
   - **Problem:** requirements.md marks the naming form and the same-role numbering form **open**. The spec surfaces them correctly, but ticket 03 hardcodes `oc-alpha--builder`, and tickets 05 and 07 hardcode `builder-2` and `builder-1`. Ticket 02 moves the keeper plugin, which is open question 2. Ticket 09 builds project-local roles, which is open question 3. An agent picking these up would decide the operator's open items silently.
   - **Change:** set tickets 02 (the keeper-move part), 03, 05, 07 and 09 to `Status: needs-operator-decision` and list the question number. Or get the answers first and edit the spec. Add a "Blocked by: operator answers to Q1/Q2/Q3/Q5" row to the README table.

3. **Same-role numbering is inconsistent within the spec.** Decision 3: with `count: 2` you get `builder-1, builder-2`, but `crew add builder` onto an existing `builder` gives `builder-2`. Tickets 05 and 07 encode both rules.
   - **Problem:** one team can end up with `builder`, `builder-1`, `builder-2`, or with `builder-1` and `builder-2` where the second is an add. Names stop being "stable and guessable" (user story 5), and two code paths have to agree.
   - **Change:** use one rule everywhere: the first of a role is bare and later ones are `-2`, `-3`, … (lowest free). Then `count: 2` gives `builder` and `builder-2`. Put this into open question 1 as the proposed default so the operator chooses one rule, not two.

4. **The captain-joins path records a role the captain does not have.** Decision 4 ("records the caller in the lead (first) slot"), ticket 07 last criterion, open question 5.
   - **Problem:** a solo `oc-alpha` running role `general` that starts the example crew is written into the roster as the `captain` slot. The roster then tells every member that `oc-alpha` is the captain with the captain's responsibility, but its loaded skills are `general`. The captain is not restarted (correct, per requirements), so the roster lies.
   - **Change:** record the caller with its actual `HK3_ROLE`, and take the lead slot's responsibility text only if the definition gives one. Mechanical, no judgment. Mention this in open question 5.

5. **A live solo agent can sit inside a new team's namespace without being on its roster.** Decision 3 (a solo label is the team label) plus ticket 07 ("refuses if the team already has a roster or any label is live").
   - **Problem:** if solo `oc-alpha` is running and the operator runs `crew start example --team alpha` from outside, the member labels (`oc-alpha--*`) do not collide, so the start goes ahead. Now `oc-alpha` looks by name like a member of team `alpha` but is not on the roster. Under decision 7's convention its messages are ignored, or members message it wrongly. This is the wrong-team confusion the naming was meant to prevent.
   - **Change:** in ticket 07, also refuse when the team label itself (`oc-alpha`) is a live tab, with a message telling the operator to run the start from inside `oc-alpha` (the join path) or pick another team name.

## Should fix

1. **The crew skill and decision 7 over-specify the protocol.** Spec decision 7 and ticket 06 require a mandatory `[<team>] <label>:` header, "do not start work for a sender not on your roster", and "after adding or stopping a member, message the team". User stories 30, 32, 33.
   - **Problem:** the operator said naming should handle the wrong-team risk and to "go little further than that", and that the operator's own skill defines process. A fixed header format is a rule that duplicates what the transport may already supply (ticket 01 checks whether the sender's name is included automatically).
   - **Change:** the skill says only: who you are (`hk3 crew roster`); teammates are the labels on the roster; your team is the part before `--`; treat messages from other teams with suspicion and tell the operator; and the commands to add and stop members. Make the header conditional: include it only if ticket 01 shows the receiver cannot see the sender. Cut story 30 (roster-change broadcast). A member that needs the roster runs `crew roster`.

2. **Story 24 (attach a workflow to my team) has no mechanism for a team the captain grew.** Decisions 5 and 6: a workflow reaches the roster only through `crew start` (from the definition or `--workflow`). A team built with `crew add` cannot get one.
   - **Change:** either narrow story 24 to "the captain tells the team the workflow file path" (simplest, ZFC-pure, no code), or give `crew add` a `--workflow` that sets the roster field. Prefer the first.

3. **The order of roster write and member start is unspecified for `crew add`, and partial start failure is unspecified for `crew start`.** Ticket 05 and ticket 07. Story 9 promises "never half a team" but only covers validation.
   - **Change:** state that the roster is written before the member starts, so its first prompt sees itself. On a `session start` failure partway through, stop and print which members started; the operator runs `crew stop --team`. No rollback logic.

4. **A stale roster blocks restarting a team.** Ticket 07 refuses when a roster exists, and Out of Scope has no team resume.
   - **Problem:** after a crash or a reboot, the roster file stays and `crew start --team alpha` refuses forever.
   - **Change:** ticket 05: `crew stop --team <t>` deletes the roster even when no member is live. Say so in the refusal message.

5. **Bare `crew stop` from inside a session stops the whole team.** Decision 6 and ticket 05 (`crew stop [<member>...]`).
   - **Problem:** an agent that runs `hk3 crew stop` meaning "stop me" kills every teammate. This one small rail is worth having.
   - **Change:** require member names or an explicit `--all`.

6. **Liveness and stop for a captain that is not in herdr.** Decision 2 ("`hk3 new agent claude` keeps working without herdr") plus decisions 4 and 6.
   - **Problem:** a captain started in a plain terminal that runs `crew add` gets a herdr workspace without itself in it. `crew roster` shows it as not live, and `crew stop --team` from outside tries to stop a tab that does not exist.
   - **Change:** one line in decision 6: liveness covers herdr tabs only, and stopping a member with no tab removes it from the roster and prints a note. The operator closes that terminal by hand.

7. **Ticket 03 does not need to wait for ticket 02.** README table. Naming is a change to the existing `harmonik-v3` script. Unblock it, or merge it into 02 (see Could cut 7).

## Could cut/defer

1. **Keeper move and `hk3 keeper check`** (decision 1 and ticket 02). Nothing in the objective needs the keeper plugin to move, and moving it touches docs, paths and a live behavior check. Defer the move until the operator confirms (open question 2). `keeper check` is a new command no requirement asks for, so cut it. Ticket 02 becomes: forward an unknown first word to `modules/<word>/run`, plus a shared library.
2. **`hk3 --help` module listing parsed from entrypoints** (decision 1). Nice, not needed. Have the help text list modules by hand, or defer.
3. **`hk3 session attach` and `hk3 session list` as public commands** (decision 2 and ticket 04). `attach` is `herdr --session hk3`, so put that in the README. `list` duplicates the live column of `crew roster`. Keep `session start` and `stop` (plus an internal list helper). Story 13 is met by herdr itself.
4. **`hk3 crew defs`** (decision 5 and tickets 07–08). The skill can name the two folders and agents can `ls` them, and invalid files are already refused at `crew start`. Cut it, or defer with story 11.
5. **The `--workflow` override and the workflow-existence refusal** (ticket 08). Keep `workflow:` in the definition as a name resolved to a path and written into the roster. A parse-and-`description` check on start is fine. Drop the flag. **Merge ticket 08 into 07.**
6. **Project-local roles** (decision 8 and ticket 09, open question 3). The operator asked for a slot for their project-management *skill*. `compose-role` only looks in the repo's `skills/`, so project-local skills are needed and project-local roles are not. Defer roles; story 37 goes.
7. **User stories that add no behavior or duplicate others.** 3 (same as 2), 7 (lookup detail, keep only in the decisions), 15 (an implementation detail of 14), 16 and 18 (solo-in-herdr and plain-terminal members come for free from 03 and 04), 26 (merge into 25), 30 (see Should fix 1). Cutting these takes the list to about 30.
8. **Merge tickets 03 into 02**, or keep 03 standalone and unblocked. Both are small changes to the launcher.

**Smallest plan that meets the objective:** 01 spike (with the env check added); 02 router plus shared library plus `--team` naming (no keeper move); 04 session start/stop (scrubbed server env); 05 crew add/roster/stop; 06 a short crew skill; 07 crew start from a definition, with `workflow:` recorded in the roster (08 merged in); 09 project skills only. That is 7 tickets and about 6 public subcommands (`session start|stop`, `crew start|add|stop|roster`).

## Fine as is

- ZFC boundaries: Out of Scope rules out completion and idle detection, `agent wait`, hk3 messaging agents, enforcement and a work board. `session list` never reads herdr agent state. Workflows are checked only for structure. This matches the principle well.
- herdr kept inside one module (decision 2, Further Notes). The `/exit` before close handles herdr #4851.
- The spike runs first and has the right list of assumptions (decision 9 and ticket 01).
- The captain joins rather than restarts, and solo `oc-alpha` grows into team `alpha` with no rename (decision 3). This is the strongest argument for the recommended form.
- Testing through the CLI with a fake `claude` and a throwaway herdr session (Testing Decisions).
- Open questions are listed explicitly in the spec. Only the ticket statuses ignore them (Must fix 2).
