# Configuration

## Precedence

For every `HK3_*` and `KEEPER_*` setting, highest first:

1. The shell environment, e.g. `HK3_AGENT_NAME=alpha hk3 new agent claude`
2. `<project>/.harmonik-v3/config.env`
3. `<harmonik-v3 repo>/.env` (local to this machine, not committed)
4. The defaults at the top of `harmonik-v3`

Command-line flags (`--name`, `--role`) override all of these.
`hk3 config` prints the resolved values and which files were found.

The `.env` files are sourced by bash: one `KEY=value` per line, with quotes
around values that contain spaces.

## Project files: `<project>/.harmonik-v3/`

| File | Purpose |
|---|---|
| `config.env` | Settings for this project. |
| `config.yaml` | Role overlay, merged last over base + role. |
| `build/` | Generated role output. Gitignore it. |

`hk3 init` writes these for you.

## Launcher settings (`HK3_*`)

| Setting | Default | Meaning |
|---|---|---|
| `HK3_PROJECT_DIR` | git root of `$PWD` | Project to run in. Shell environment only. |
| `HK3_PROJECT_PREFIX` | none | Project prefix for agent labels, e.g. `oc`. Set it in `config.env`. |
| `HK3_AGENT_NAME` | none | Agent name (`--name`). Convention: NATO words, alpha, bravo, charlie. |
| `HK3_ROLE` | `HK3_DEFAULT_ROLE` | Role (`--role`). |
| `HK3_DEFAULT_ROLE` | `general` | Role when none is given. |
| `HK3_CLAUDE_SKIP_PERMISSIONS` | `1` | Pass `--dangerously-skip-permissions`. |
| `HK3_CLAUDE_REMOTE_CONTROL` | `0` | Pass `--remote-control`. |
| `HK3_STATUSLINE_INNER` | found at launch | Status line command shown after the agent label. |

An agent's label is `<prefix>-<name>` (`oc-alpha`), or just whichever part is
set. hk3 exports it as `HK3_AGENT_ID`. The label is the Claude session name and
appears in the status line. The prefix and name may contain only letters,
digits, `-` and `_`.

When `HK3_STATUSLINE_INNER` is unset, hk3 uses the first `statusLine.command`
in the project's `.claude/settings.local.json`, then its
`.claude/settings.json`, then `~/.claude/settings.json`.

## Keeper settings (`KEEPER_*`)

| Setting | Default | Meaning |
|---|---|---|
| `KEEPER_RESTART_TOKEN_COUNT` | `200000` | Context tokens that trigger the handoff/restart cycle. |
| `KEEPER_RESTART_CLEAR_MODE` | `0` | `1` = `/clear` instead of native compaction. |
| `KEEPER_HANDOFF_PROMPT` | plugin `CONFIG` | What the agent is told to do at the threshold. |
| `KEEPER_STARTUP_KIND` | `prompt` | `prompt` (plain text) or `command` (slash command). |
| `KEEPER_STARTUP_PROMPT` | plugin `CONFIG` | Text or `/command args` sent after the restart. |

In the two prompts, `{name}` is replaced by the agent name, without the
project prefix, and `{role}` by the role. If a prompt uses `{name}` and the agent has no name, hk3 refuses to
launch.

When the startup command takes the handoff as an argument, pass the file's
base name rather than the bare agent name. The argument is free text that the
resumed agent interprets: given `alpha`, it searches for a file called
`alpha`; given `HANDOFF-alpha`, it reads `HANDOFF-alpha.md`. For a project
with one handoff file per agent:

```sh
KEEPER_HANDOFF_PROMPT="Your context is nearly full. Run the session-handoff skill for lane {name} and write HANDOFF-{name}.md at the repository root."
KEEPER_STARTUP_KIND=command
KEEPER_STARTUP_PROMPT="/session-resume HANDOFF-{name}"
```

### Compaction or clear

Keeper first has the agent write its handoff. It then resets the context in
one of two ways:

- **Compaction** (default, `KEEPER_RESTART_CLEAR_MODE=0`): Claude's native
  `/compact`. The conversation is replaced by Claude's own summary, and the
  startup prompt runs on top of that summary.
- **Clear** (`KEEPER_RESTART_CLEAR_MODE=1`): runs `/clear`. The conversation
  is discarded, and the handoff file is the only state carried over. Keeper
  sends the startup prompt only after `SessionStart` reports `source=clear`.

Both were verified live (see the keeper README). A `PreCompact` hook that
blocks compaction stops the cycle: keeper logs `compaction skipped` and sends
no startup prompt.

hk3 sets `KEEPER_ENABLED=1` and `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` itself.
Other plugin defaults are in the `CONFIG` object in
`plugins/claude-keeper/hooks/index.js`.

## Roles

A role is composed by `scripts/compose-role` from, in order:

1. `config/base.yaml`
2. `config/roles/<role>.yaml`
3. `<project>/.harmonik-v3/config.yaml`

Merge rules:

- Maps merge deeply; the later file wins.
- Lists concatenate, duplicates removed.
- A `null` value deletes the key. Use it to undo something the base sets.
- `skills_remove: [name, ...]` drops skills that an earlier file added.

Keys:

| Key | Meaning |
|---|---|
| `skills` | Skill names from `skills/`. Loaded as plugin `keeper-role`, shown as `keeper-role:<name>`. |
| `settings` | Any Claude `settings.json` keys, passed via `--settings`. |
| `description` | Text for the generated plugin manifest. |

`settings.statusLine` defaults to `scripts/statusline`. Set it in the overlay
to use something else, or set it to `null` to remove it.

The base hides Claude's bundled skills and the user-level `session-handoff`
and `session-resume` skills, and adds the `handoff` skill, which writes
`HANDOFF.md`. A project with its own handoff convention should undo that in
its overlay, for example:

```yaml
skills_remove: [handoff]
settings:
  skillOverrides:
    session-handoff: null
    session-resume: null
```
