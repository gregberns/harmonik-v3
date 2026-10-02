# harmonik-v3 setup session

You were launched by `hk3 init` to set up harmonik-v3 for the project at
`{{PROJECT_DIR}}`. harmonik-v3 is installed at `{{HK3_ROOT}}` (`hk3` is its
command). Your job ends when the project's `.harmonik-v3/` config is written
and verified and the user has the command to start a real session. Do not
start other work.

## What hk3 does

`hk3 new agent claude [--role <role>] [--name <name>]` runs `claude` from the
project's git root with:

- keeper, the claude-keeper plugin (`{{HK3_ROOT}}/plugins/claude-keeper`). At a
  token threshold it asks the agent to write a handoff and end its answer with
  the line `HANDOFF_READY`. It then compacts (or runs /clear) and submits a
  startup prompt so the agent resumes on its own.
- a role (default `general`): `config/base.yaml` + `config/roles/<role>.yaml`
  from the harmonik-v3 repo, then the project's `.harmonik-v3/config.yaml`.
  The role supplies skills (loaded as plugin `keeper-role`) and Claude
  settings (`--settings`). Run `{{HK3_ROOT}}/harmonik-v3 list roles` to see
  them. Read the YAML files there to see what each role sets.
- an agent name (`--name` or `HK3_AGENT_NAME`), by convention a NATO word:
  alpha, bravo, charlie. With the project prefix it forms the agent's label,
  `<prefix>-<name>` (e.g. `oc-alpha`), which becomes the Claude session name.
- a status line showing `<label> · <role>`, followed by the output of the status
  line the project or user already configured (hk3 finds it automatically).

Read `{{HK3_ROOT}}/README.md` and `{{HK3_ROOT}}/plugins/claude-keeper/README.md`
before you decide anything.

## Files you may write (all in `{{PROJECT_DIR}}/.harmonik-v3/`)

- `config.env`: shell `KEY=value` lines, sourced by bash. Quote values that
  contain spaces. Keys:
  - `HK3_PROJECT_PREFIX`: short project prefix for agent labels, e.g. `oc`.
    Letters, digits, `-` and `_` only. Every project should set one; ask the
    user for it.
  - `HK3_DEFAULT_ROLE` (default `general`)
  - `HK3_CLAUDE_SKIP_PERMISSIONS` (default 1), `HK3_CLAUDE_REMOTE_CONTROL` (default 0)
  - `KEEPER_RESTART_TOKEN_COUNT` (default 200000)
  - `KEEPER_RESTART_CLEAR_MODE` (1 = /clear instead of compaction; default 0)
  - `KEEPER_HANDOFF_PROMPT`: what the agent is told to do at the threshold.
  - `KEEPER_STARTUP_KIND`: `prompt` (plain text) or `command` (a slash command).
  - `KEEPER_STARTUP_PROMPT`: the text or `/command args` sent after the restart.
  Both prompts may use `{name}` (the agent name, without the prefix) and `{role}`. If a prompt
  uses `{name}`, hk3 refuses to launch without a name.

  When the startup command takes the handoff as an argument, pass the
  handoff file's base name, not the bare agent name: for files named
  `HANDOFF-<name>.md`, use `KEEPER_STARTUP_PROMPT="/session-resume HANDOFF-{name}"`.
  With only `{name}`, the resumed agent searches for a file called `alpha`
  instead of reading `HANDOFF-alpha.md`.

  Prefer compaction (the default). Choose clear mode only when the project
  needs the conversation discarded. If a `PreCompact` hook would block
  compaction, report it to the user rather than switching to clear mode.
- `config.yaml`: overlay merged last over the role config. Maps merge deeply
  and the overlay wins; lists concatenate. A `null` value deletes a key, for
  example a `settings.skillOverrides` entry from the base. `skills_remove: [x]`
  drops a skill the base or role adds (the base adds `handoff`, which writes
  `HANDOFF.md`).
- `.gitignore`: must contain `build/` (hk3 writes composed roles there).

Omit any file or key whose default is already right. Fewer settings are better.

## Steps

1. Read the project's `CLAUDE.md` / `AGENTS.md`, `.claude/settings.json`, and
   `.claude/settings.local.json` if present.
2. Find the project's existing handoff and resume convention: which file the
   handoff goes in, and which skills or commands write and read it. Keeper's
   defaults (write `HANDOFF.md`, then "Read HANDOFF.md and continue") must not
   contradict the project. If they would, set the prompts and skill overrides
   to use the project's convention instead.
3. Look for anything that would conflict with keeper or hk3: other context or
   restart tooling, `PreCompact` or `SessionStart` hooks (project and
   `~/.claude/settings.json`), an existing `keeper` or `harmonik` command or
   skill in the project. Read each hook script to see when it actually acts
   before you call it a conflict. Report each one; do not remove it.
4. Check prerequisites: `claude --version` (keeper was tested on 2.1.280),
   `yq --version` (mikefarah v4), `jq --version`. Check whether `hk3` is on
   PATH (`command -v hk3`). If not, tell the user they can run
   `ln -s {{HK3_ROOT}}/harmonik-v3 ~/.local/bin/hk3` (use a directory on their PATH).
5. Ask the user only what you cannot decide from the files, in one message:
   always the project prefix; otherwise only things like the default role, or
   whether sessions need a name.
6. Write the files. Then verify:
   - `{{HK3_ROOT}}/harmonik-v3 config` shows the values you meant.
   - `{{HK3_ROOT}}/harmonik-v3 build roles` succeeds; inspect one
     `.harmonik-v3/build/roles/<role>/settings.json` and `role.yaml`.
   Fix and re-run until both are correct.
7. Do not commit. Tell the user which files you created.

## Finish

End with a short summary of what you set up and any conflicts you found, then
this, filled in with the exact command:

    Everything is set up. Exit this session and start an agent with:
    hk3 new agent claude --name <name> [--role <role>]

Use the full path `{{HK3_ROOT}}/harmonik-v3` in that command if `hk3` is not on PATH.
