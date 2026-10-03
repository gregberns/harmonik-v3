# Configuration

## Precedence

For every `HK3_*` and `KEEPER_*` setting, highest first:

1. The shell environment, e.g. `HK3_AGENT_NAME=alpha hk3 new agent claude`
2. `<project>/.harmonik-v3/config.env`
3. `<harmonik-v3 repo>/.env` (local to this machine, not committed)
4. The defaults: `HK3_*` in `lib/hk3.sh`, `KEEPER_*` in `modules/keeper/defaults.sh`

Command-line flags (`--name`, `--team`, `--role`) override all of these.
`hk3 config` prints the resolved values and which files were found.

The `.env` files are sourced by bash: one `KEY=value` per line, with quotes
around values that contain spaces.

## Project files: `<project>/.harmonik-v3/`

| File | Purpose |
|---|---|
| `config.env` | Settings for this project. |
| `config.yaml` | Role overlay, merged last over base + role. |
| `build/` | Generated role output. Gitignore it. |
| `crews/` | Optional, yours: crew definitions, `<name>.yaml`, for `hk3 crew start`. Override hk3's `crews/` by name. |
| `skills/` | Optional, yours: skills, `<name>/SKILL.md`, used when `config.yaml` lists them. Override hk3's `skills/` by name; see [Project skills](#project-skills). |
| `workflows/` | Optional, yours: workflows, `<name>.yaml`, named by crew definitions. Override hk3's `workflows/` by name. |
| `teams/` | Team rosters, `<team>.yaml`, written by `hk3 crew`. hk3 creates the folder with a `.gitignore` of `*`, so rosters stay out of git without re-running `hk3 init`. Lock folders `<team>.lock` exist only while a crew command runs. |

`hk3 init` writes `config.env` and `config.yaml`; hk3 writes `build/` and
`teams/`. You add `crews/`, `skills/` and `workflows/` when you want them.

## Crew definitions and workflows

`hk3 crew start <crew>` takes a crew name or a path. A name (letters,
digits, `-`, `_`) is looked up as `<project>/.harmonik-v3/crews/<name>.yaml`,
then `<harmonik-v3 repo>/crews/<name>.yaml`; the first found wins. An
argument containing `/` or ending in `.yaml`/`.yml` is a path to the file.

```yaml
description: Plan, build, review and test a feature.   # required
workflow: plan-build-review                             # optional, a workflow name
members:                                                # required, the first is the lead
  - role: captain
  - role: reviewer
    name: plan-reviewer
    responsibility: Reviews plans before building starts.
  - role: builder
    count: 2
```

| Member key | Meaning |
|---|---|
| `role` | Required. A role in `config/roles/`. |
| `name` | Member name; defaults to the role. Same rules as `--name`: letters, digits, `-`, `_`, no `--`, and may not start or end with `-`. |
| `count` | Whole number, at least 1; default 1. `count: 2` gives `builder` and `builder-2`. |
| `responsibility` | One line; defaults to the role's description. |

The lead (first member) takes the team label (`oc-alpha`), so it has no
`name`, and no `count` other than 1. Every other member is `<prefix>-<team>--<name>`. The
resulting names must be unique. hk3 checks only this structure, and the
workflow below, before it starts anything; it never reads other keys.
The file must hold exactly one YAML document.

A workflow is looked up by name as `<project>/.harmonik-v3/workflows/<name>.yaml`,
then `<harmonik-v3 repo>/workflows/<name>.yaml`. It must be a YAML mapping
with a non-empty `description`; every other key is free-form, for the
agents. `crew start` writes the workflow's name and absolute path into the
roster:

```yaml
team: alpha
label: oc-alpha
crew: feature
workflow:
  name: plan-build-review
  path: /Users/me/dev/harmonik-v3/workflows/plan-build-review.yaml
members:
  - label: oc-alpha
    role: captain
    responsibility: "Leads a team: ..."
```

## Launcher settings (`HK3_*`)

| Setting | Default | Meaning |
|---|---|---|
| `HK3_PROJECT_DIR` | git root of `$PWD` | Project to run in. Shell environment only. |
| `HK3_PROJECT_PREFIX` | none | Project prefix for agent labels, e.g. `oc`. Set it in `config.env`. |
| `HK3_AGENT_NAME` | none | Agent name (`--name`). Convention: NATO words, alpha, bravo, charlie. A team member's is `<team>--<member>`, set by hk3. |
| `HK3_TEAM` | none | Set by hk3, not by you: the team (`--team`) of a team member; cleared for solo agents. |
| `HK3_ROLE` | `HK3_DEFAULT_ROLE` | Role (`--role`). |
| `HK3_DEFAULT_ROLE` | `general` | Role when none is given. |
| `HK3_CLAUDE_SKIP_PERMISSIONS` | `1` | Pass `--dangerously-skip-permissions`. |
| `HK3_CLAUDE_REMOTE_CONTROL` | `0` | Pass `--remote-control`. |
| `HK3_STATUSLINE_INNER` | found at launch | Status line command shown after the agent label. |
| `HK3_HERDR_SESSION` | `hk3` | herdr session that `hk3 session` runs every agent in. |

`hk3 session` and `hk3 crew` commands refuse to run without `HK3_PROJECT_PREFIX`, so
workspace and tab labels from different projects in the one herdr session
never collide.

### Agent names and labels

An agent's label is `<prefix>-<name>` (`oc-alpha`), or just whichever part is
set. hk3 exports it as `HK3_AGENT_ID`. The label is the Claude session name and
appears in the status line. `--team <team> --name <member>` makes the agent a
team member:

```
solo agent   <prefix>-<name>               oc-alpha
team label   <prefix>-<team>               oc-alpha
member       <prefix>-<team>--<member>     oc-alpha--builder
same role    first bare, then -2, -3 ...   oc-alpha--builder, oc-alpha--builder-2
```

For a member hk3 sets `HK3_AGENT_NAME=<team>--<member>` (`alpha--builder`) and
`HK3_TEAM=<team>`. A team's lead is the solo agent named after the team
(`oc-alpha`), whose label is the team label, so a solo agent grows into a team
without a rename.

Each part (prefix, team, name) may contain only letters, digits, `-` and `_`,
may not contain `--`, and may not start or end with `-`. hk3 refuses a bad
part, `--team` without `--name`, and a `--` in `--name` (use `--team`) before
it builds or launches anything.

`HARMONIK_AGENT` is the full label, with `hk3-` in front when there is no
prefix (`hk3-alpha--builder`).

Modules read an agent's identity mechanically: inside an hk3 session
`HK3_AGENT_ID` is set; the caller's team is `HK3_TEAM`, else `HK3_AGENT_NAME`;
the team label is the part of `HK3_AGENT_ID` before `--`.

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
project prefix (`alpha`; for a team member `alpha--builder`), and `{role}` by
the role. If a prompt uses `{name}` and the agent has no name, hk3 refuses to
launch.

When the startup command takes the handoff as an argument, pass the file's
base name rather than the bare agent name. The argument is free text that the
resumed agent interprets: given `alpha`, it searches for a file called
`alpha`; given `HANDOFF-alpha`, it reads `HANDOFF-alpha.md`. For a project
with one handoff file per agent (member `oc-alpha--builder` gets
`HANDOFF-alpha--builder.md`, its lead `oc-alpha` keeps `HANDOFF-alpha.md`):

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
`modules/keeper/plugin/hooks/index.js`.

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
| `skills` | Skill names, from the project's skills folder or hk3's `skills/` (see [Project skills](#project-skills)). Loaded as plugin `keeper-role`, shown as `keeper-role:<name>`. |
| `settings` | Any Claude `settings.json` keys, passed via `--settings`. |
| `description` | Text for the generated plugin manifest. |

`settings.statusLine` defaults to `scripts/statusline`. Set it in the overlay
to use something else, or set it to `null` to remove it.

The base hides Claude's bundled skills and the user-level `session-handoff`
and `session-resume` skills, and adds two skills: `handoff`, which writes
`HANDOFF.md`, and `crew`, which tells an agent how to find its team
(`hk3 crew roster`), whom it may message, and how to grow or shrink the team.
A project with its own handoff convention should undo the handoff part in
its overlay (keep `crew`, which team messaging needs), for example:

```yaml
skills_remove: [handoff]
settings:
  skillOverrides:
    session-handoff: null
    session-resume: null
```

### Project skills

A project can keep its own skills in `<project>/.harmonik-v3/skills/<name>/SKILL.md`
and list them under `skills` in its `config.yaml`. Each listed skill is
looked up in the project's `.harmonik-v3/skills/` first, then in hk3's
`skills/`, so a project skill with the same name as an hk3 skill replaces
it. A listed skill found in neither folder stops the build. hk3 ships no
project-management skill; this is where a project puts its own, so that
every role loads it:

```yaml
skills: [project-management]
```
