---
name: review-checklist
description: Systematically review a change for correctness, clarity, and fit. Use when reviewing a diff or a set of files.
---

# Review checklist

Read the whole change before commenting. Check, in order:

1. **Correctness** — does it do what it claims? Edge cases, error paths, off-by-one.
2. **Behavior changes** — anything existing callers or users will notice.
3. **Tests** — is the new behavior covered? Would a test fail if it broke?
4. **Fit** — does it match surrounding naming, structure, and idiom?
5. **Simplicity** — is there dead code, duplication, or needless abstraction?

Only report issues you can point at with a file and line.
