---
name: handoff
description: Write or update HANDOFF.md so the next session (or agent) can resume this work. Use before a restart, a context reset, or when asked for a handoff.
---

# Handoff

Write `HANDOFF.md` in the repo root, replacing any previous content. Keep it
short; the reader has no memory of this session.

```markdown
# Handoff
Role: <your role, if you have one>
Goal: <one line: what the overall task is>

## Done
- <completed items, with file paths>

## In progress
- <what was underway and its exact state>

## Next step
<the single next action, concrete enough to start immediately>

## Open questions
- <decisions needed from the user, or none>
```

Record facts, not narrative. Name files and commands exactly.
