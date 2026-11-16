# Clean restart of hk3 agents after a machine or herdr restart: findings

Date 2026-11-16. Investigation only. No code changed.

## Problem

After a restart, herdr restores every workspace and starts each agent again as plain
`claude --resume <id>`. The agent then has no hk3 flags and no hk3 environment: no keeper plugin, no
agent name, and the wrong role settings. On 2026-11-16 the conductor moved 14 lanes back to hk3 by
hand: `/exit` in each pane, then `hk3 resume agent claude <sid> --name <lane>`.

## Recommendation

1. `run_claude`, when `HERDR_ENV=1`, reports the pane through `modules/session/herdr.sh` before exec:
   `herdr pane report-agent "$HERDR_PANE_ID" --source hk3 --agent claude --state idle --seq <ns> -- hk3 resume agent claude --herdr-session --name <name> [--role R] [--team T]`.
2. Do not put the session id in that command. The `--herdr-session` mode reads
   `herdr pane get $HERDR_PANE_ID | .result.pane.agent_session.value`. herdr's Claude hook
   (`~/.claude/hooks/herdr-agent-state.sh`, integration v10, sends `pane.report_agent_session` on every
   SessionStart) keeps it current. If the id is missing, fail. Do not fall back to `--continue`,
   because all lanes share one folder.
3. Add `hk3 session adopt`. For each oc-* workspace: skip busy panes (`~/.claude/sessions/<pid>.json`
   status), read the session id, send `/exit`, open a new tab in the same workspace, launch hk3 there,
   and close the old tab. A new tab is necessary because herdr refuses another source's resume
   command on a pane where herdr's Claude hook has already reported a session.

Effort: about 40 lines for 1 and 2, about 80 lines for 3, plus docs and tests.

## Evidence (session hk3rst, herdr 0.9.3, fake `fakehk3` on PATH)

- A: hk3 report with argv. At restore herdr ran `fakehk3 resume agent claude sidA --name alpha`.
- C: hk3 report, then herdr:claude reports a new id (source clear). herdr saved both agent_session
  sidC2 and agent_resume(sidC). The restore ran the stale sidC, so the argv must not hold the id.
- D: herdr:claude only (today's behavior). The restore ran `claude --resume sidD`.
- B, E, F2, Q: herdr:claude reported first. The hk3 report then fails with `resume_not_accepted`.
  A state-only report is ignored with no error. `release-agent --source herdr:claude` and a different
  agent label did not help. agent_session stays after the process exits (checked after 15 s).
- R: the restored pane read herdr's newest id (sidR2). The re-report after restore failed, but
  agent_resume stayed saved and ran again on the next restart. It also stayed while real claude ran in
  that pane.
- X: hk3 reported idle while real claude sat at its trust prompt. herdr still showed `blocked`, so
  screen detection is not suppressed.
- T2: argv was still kept 10 s after the process exited to the shell prompt, the same as
  agent_session today.
- Live `default` session (read only): 18 panes, 18 with a herdr:claude agent_session, 0 with
  agent_resume.
- Docs (herdr v0.9.5, add-herdr-support and socket-api): resume_argv takes precedence over the
  built-in command. Limits: the first word is a plain PATH command, at most 64 args, at most 8 KiB, no
  apostrophes. Restore runs only after a client attaches.
- hk3 is on PATH as `~/.local/bin/hk3`. `scripts/compose-role` builds in a temp folder and moves it,
  so 17 panes that restore at once are safe.

## Alternatives considered

- Adopt only, run after every restart: plain agents start first and are then killed. Someone must run
  it, and busy lanes are skipped.
- A `claude` shim on PATH: hidden, affects every claude launch, needs a loop guard, and breaks hk3's
  "nothing installed" rule.
- Project settings that load keeper without `--plugin-dir`: keeper needs `KEEPER_ENABLED`,
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` and the agent name from the environment, so this cannot work.
- `resume_agents_on_restore=false` plus adopt: every pane comes back as a bare shell.
- Editing herdr's session.json while herdr is stopped: the format is not documented.

## Other state that a restart loses

- Keeper: its cycle state lives in the session. The HANDOFF files are durable. Keep compaction mode,
  because the security plugin skips `classic.SessionStart`.
- `sdlc serve` (omatic-system-plan): an orphan process (parent pid 1). It survives neither a reboot
  nor a herdr restore.
- The conductor loop (CronCreate or ScheduleWakeup) lives only in its session and must be started
  again. A first prompt in the restore command could start it (not verified).

## Not verified

- A real `/clear` that updates herdr's id (simulated with a report).
- A real reboot (tested with a herdr server stop and start only).
- Whether later herdr versions keep the rule that the first reporter holds the pane.

## Decisions for the operator

1. Build steps 1 to 3?
2. Adopt all lanes now, or let each lane move at its next restart?
3. Where should `sdlc serve` run so that it survives a reboot (launchd job or a herdr pane)?
