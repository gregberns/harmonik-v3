---
name: review-report
description: Write review findings as a clear, prioritized report. Use after reviewing a change.
---

# Review report

Write findings most severe first:

```markdown
## Verdict: approve | request changes

### Must fix
- `path:line` — <problem>. <concrete failure scenario>. <suggested fix>.

### Should fix
- ...

### Nits
- ...
```

Keep each finding to what, why, and fix. Omit empty sections.
