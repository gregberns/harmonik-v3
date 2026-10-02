---
name: commit-hygiene
description: Prepare clean, focused commits. Use when work is ready to commit.
---

# Commit hygiene

1. Review `git status` and `git diff`; exclude unrelated or generated files
   and anything secret (e.g. `.env`).
2. One logical change per commit; split if needed.
3. Message: imperative subject under 72 chars, blank line, body saying why.
4. Commit only when asked; never push without being asked.
