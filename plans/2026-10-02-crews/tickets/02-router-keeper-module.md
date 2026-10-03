# 02: hk3 router, with keeper as the first module

**What to build:** `hk3 <module> ...` forwards to a module when the first
word is not a core command. Core commands (`init`, `new|resume agent claude`,
`config`, `build`, `list`) behave exactly as before. Shared helpers (die,
settings loading, project resolution, label building) move into one library
that the CLI and modules source. Keeper becomes the first module: its folder
holds the plugin and the `KEEPER_*` defaults, and `hk3 keeper check` runs the
plugin's validate and test commands. `hk3 --help` lists core commands and
then each module with a one-line summary. See spec decision 1.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] With a fake `claude` on PATH in a scratch repo, every existing command produces the same arguments, working directory and environment as before the change
- [ ] `hk3 keeper check` runs the plugin validation and tests and exits non-zero if either fails
- [ ] An unknown first word prints usage and exits non-zero; a module folder with an executable entrypoint is reached with its remaining arguments, the project resolved and settings loaded
- [ ] `hk3 --help` lists the keeper module and its summary
- [ ] A live interactive launch still shows the status line badge and keeper still runs its handoff cycle (`KEEPER_RESTART_TOKEN_COUNT=500`)
- [ ] docs/architecture.md (repo layout, router, modules), plugins keeper README paths, docs/testing.md (keeper check), README.md and AGENTS.md links updated for the new layout
