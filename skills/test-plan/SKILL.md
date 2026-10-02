---
name: test-plan
description: Design tests for a change or feature, covering normal, edge, and failure cases. Use before writing or running tests.
---

# Test plan

For the behavior under test, list cases in three groups:

- **Normal** — the main paths users take.
- **Edge** — empty, maximum, boundary, and unusual-but-valid inputs.
- **Failure** — invalid input, missing dependencies, interrupted operations.

For each case: setup, action, expected result. Mark which cases are automated
and which need a manual or live check, and say why.
