---
name: incremental-build
description: Implement work in small verified steps. Use when building a feature or fix.
---

# Incremental build

For each step:

1. Make the smallest change that moves toward the goal.
2. Run the relevant check (build, test, or the command itself).
3. If it fails, fix it before moving on; never stack changes on a red state.
4. Note what changed and what the check showed.

Match the surrounding code's style. Do not refactor unrelated code.
