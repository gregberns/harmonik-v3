# claude -p session id and resume check

Captain, 2026-10-05, Claude Code 2.1.280 on the operator's Max login (no
ANTHROPIC_API_KEY), model haiku, `--output-format stream-json --verbose
--safe-mode`, in a scratch folder. Resolves the unknown flagged for ticket 08.

| Step | Command (abridged) | Result |
|---|---|---|
| New session | `claude -p "Remember the word PELICAN..."` | init and result `session_id` e4fc713f-…; result "OK" |
| Resume | `claude -p "What word...?" --resume e4fc713f-…` | init and result keep the SAME `session_id`; result "PELICAN" |
| Chosen id | `claude -p "Reply only OK." --session-id <uuidgen>` | result `session_id` equals the id passed |
| Missing session | `claude -p hi --resume 00000000-…` | stderr "No conversation found with session ID: …"; result line `subtype: error_during_execution`, `is_error: true`, `errors: [...]` |

Conclusions:
- `--session-id <uuid>` makes the engine's GUID the session id (Q25).
- `-p --resume <id>` continues that session and keeps its id (no fork
  without `--fork-session`), so Continue(id) works as designed (Q28).
- A missing session produces a result line with `is_error: true`, so the
  claude-p failure table reports it as `Failed(Reported)`, with the reason in
  `errors`; no fallback (Q50).
