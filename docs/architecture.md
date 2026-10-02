# Architecture

harmonik-v3 launches Claude Code agent sessions inside other projects. The
command is `harmonik-v3`, normally called `hk3` through a symlink on PATH.

## Components

| Path | Role |
|---|---|
| `harmonik-v3` | The CLI. Resolves the project, loads config, composes the role, runs `claude`. |
| `scripts/compose-role` | Merges YAML config into a role's `settings.json` and skills plugin. |
| `scripts/statusline` | Claude status line: `<name> · <role>`, then the project's own status line. |
| `config/base.yaml`, `config/roles/*.yaml` | Role definitions. |
| `skills/` | Skill library. Roles pick skills from it by name. |
| `plugins/claude-keeper/` | Keeper: hands off and restarts a session at a token threshold. |
| `setup/init-prompt.md` | Instructions given to Claude by `hk3 init`. |

## What a launch does

`hk3 new agent claude --name alpha --role builder`:

1. Finds the project: `$HK3_PROJECT_DIR`, else the git root of the current
   directory, else the current directory.
2. Loads settings (see [configuration.md](configuration.md)).
3. Composes the role into `<project>/.harmonik-v3/build/roles/<role>/`:
   `config/base.yaml`, then `config/roles/<role>.yaml`, then the project's
   `.harmonik-v3/config.yaml`.
4. Runs `claude` from the project root with:
   - `--plugin-dir plugins/claude-keeper` (keeper, loaded for this launch only)
   - `--settings <build>/settings.json` (the role's Claude settings)
   - `--plugin-dir <build>/plugin` (the role's skills, as plugin `keeper-role`)
   - `--name <name>` if the agent has a name
   - `--dangerously-skip-permissions` / `--remote-control` if enabled

   It also exports `KEEPER_ENABLED=1`, `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`,
   `HK3_ROLE`, `HK3_AGENT_NAME` and `HK3_STATUSLINE_INNER` for keeper and the
   status line, and `HARMONIK_AGENT=hk3-<name>` (see below).

`hk3 init` runs `claude` in the project with `setup/init-prompt.md` appended
to the system prompt and without keeper or a role. That session writes
`.harmonik-v3/` and ends by printing the `hk3 new agent claude ...` command.

## Design decisions

- **Claude runs from the project root.** Claude stores sessions per
  directory, so `resume` only finds a session if every launch uses the same
  directory.
- **Nothing is installed.** Keeper and role skills load via `--plugin-dir`
  and settings via `--settings`, so the project's own `.claude/` config and
  the user's global config are never edited.
- **Every launch has a role.** The default role is `general`, which is the
  base config with no extra skills. One code path, and the status line always
  has a role to show. What `general` should contain is still open.
- **The status line chains.** `--settings` replaces whatever status line the
  project or user had, so `scripts/statusline` prints the agent label and then
  runs the replaced command (found at launch) with the same input.
- **Two setting prefixes.** `HK3_*` settings belong to the launcher, `KEEPER_*`
  settings to the keeper plugin. Keeper reads its settings through `$.env.get`,
  which needs literal names, so the names are part of the plugin's validated
  manifest.
- **hk3 sessions are invisible to the older harmonik.** Its global hooks in
  `~/.claude/settings.json` name the agent from `HARMONIK_AGENT`, else the
  tmux session name. Its `PreCompact` hook blocks compaction for agents it
  manages, and old lane names such as `alpha` are still marked managed. hk3
  exports `HARMONIK_AGENT=hk3-<name>`, so those hooks treat the session as
  unmanaged. Remove this once the older harmonik is retired.
- **Keeper is inert unless hk3 launched it** (`KEEPER_ENABLED=1`), so loading
  the plugin any other way does nothing.
