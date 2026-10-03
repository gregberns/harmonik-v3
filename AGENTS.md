# harmonik-v3: agent context

harmonik-v3 (`hk3`) launches Claude Code agent sessions inside other
projects: role-scoped settings and skills, agent names, a status line, and
keeper, a plugin that hands off and restarts a session at a token threshold.
It is early and evolving in small steps. Bash only; needs `claude`, `yq`
(mikefarah v4) and `jq`; `hk3 session` and `hk3 crew` also need herdr.

Documentation lives in `docs/`; start at [docs/README.md](docs/README.md).
`README.md` is the user-facing quick start.

## Rules for this file

This file is loaded into every agent session, so every line costs context.

Put here only:
- what the project is, in a few lines
- rules an agent must follow when working in this repo
- pointers to docs, one line each

Do not put here:
- explanations, designs or references: write a doc in `docs/` and link it
  from `docs/README.md`
- history or changelogs: git has them
- session state or next steps: `HANDOFF.md` (gitignored)
- anything the code states plainly: setting names, defaults, file lists

Keep it under 60 lines. When a section grows past a few lines, move it to
`docs/`. `CLAUDE.md` is a symlink to this file; edit `AGENTS.md`.

## Working rules

- Commit and push to `main` after each coherent change, with the docs it
  affects in the same commit.
- A behavior change updates the matching doc: settings go in
  `docs/configuration.md`, launch flow and design in `docs/architecture.md`,
  usage in `README.md`.
- Verify before committing; [docs/testing.md](docs/testing.md) lists the
  checks. Never point test launches at a real project: they write
  `.harmonik-v3/build/`. Use a scratch git repo.
- Scripts are bash with `set -euo pipefail`; config handling uses `yq`/`jq`.
- `HK3_*` settings are the launcher's and `KEEPER_*` settings are keeper's.
  A new keeper setting must be read with a literal `$.env.get("NAME")`.
- Build only what a ticket or the operator asks; no speculative options.
  One concern per module; modules talk through the `hk3` CLI; only the
  session module calls herdr.
- Nothing is installed into target projects or `~/.claude`. Everything loads
  per launch via `--plugin-dir` and `--settings`.

## Docs

- `plans/<date>-<name>/`: one folder per larger piece of work (requirements, spec, tickets, reviews)
- [docs/concepts/zero-framework-cognition.md](docs/concepts/zero-framework-cognition.md): hk3 provides structure, never judgment
- [docs/architecture.md](docs/architecture.md): components, launch flow, design decisions
- [docs/configuration.md](docs/configuration.md): settings, config files, role merging
- [docs/testing.md](docs/testing.md): how to verify changes
- [modules/keeper/plugin/README.md](modules/keeper/plugin/README.md): keeper internals
