# Testing

Run the checks that cover what you changed. Report anything you could not
run.

## Keeper plugin

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate modules/keeper/plugin --json
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test modules/keeper/plugin
```

The tests call the registered hook callbacks with fake host operations.
They check ordering and configuration, not real host scheduling. The
validate output lists every env var the plugin reads. A new
`$.env.get("...")` must appear there.

## Role composition

```sh
scripts/compose-role --overlay <file> <role> <out-dir>
```

Inspect `<out-dir>/role.yaml`, `settings.json` and `plugin/skills/`.

## Launcher, without starting Claude

Put a fake `claude` first on PATH that prints its arguments, working
directory and `HK3_*`/`KEEPER_*` environment. Then run `hk3` from a
subdirectory of a scratch git repo that has a `.harmonik-v3/`:

```sh
printf '#!/bin/bash\necho "cwd=$PWD"; printf "  %%s\\n" "$@"; env | grep -E "^(HK3|KEEPER)_"\n' > "$bin/claude"
chmod +x "$bin/claude"
PATH="$bin:$PATH" hk3 new agent claude --name alpha --role builder
```

Check the working directory (the project root), the flags, and the
environment. Use a scratch repo, never a real project: launches write
`.harmonik-v3/build/`.

For a change to the CLI or `lib/hk3.sh`, capture the output of every core
command (`new`/`resume agent claude` with and without `--name`, `--role`,
`--` args; `init`; `config`; `build`; `list`; `--help`), once with a project
prefix and `KEEPER_STARTUP_PROMPT="/session-resume HANDOFF-{name}"` in
`config.env` and once without, before and after the change, and diff them.

Team names: `--team alpha --name builder` must pass `--name oc-alpha--builder`
and export `HK3_AGENT_NAME=alpha--builder`, `HK3_TEAM=alpha`,
`HK3_AGENT_ID=oc-alpha--builder` and `HARMONIK_AGENT=oc-alpha--builder`;
without a prefix, `HARMONIK_AGENT=hk3-alpha--builder`. As a control, solo
`--name alpha` must give the same environment as before (`HK3_AGENT_ID` and
`HARMONIK_AGENT` `oc-alpha`, no `HK3_TEAM`). `--team` without `--name`,
`--name a--b`, and parts with other characters must exit 1 before `claude`
runs. Live, launch a member with `--team alpha --name builder`,
`KEEPER_RESTART_TOKEN_COUNT=500` and
`KEEPER_STARTUP_PROMPT="/session-resume HANDOFF-{name}"`: the badge shows
`oc-alpha--builder`, and after keeper's cycle the startup prompt names
`HANDOFF-alpha--builder`.

## Router

In a scratch copy of the repo, add `modules/echo/main` (executable) that
prints its arguments, `HK3_PROJECT_DIR` and `HK3_ROOT`. `hk3 echo a 'b c'`
must pass both arguments and export both variables; `hk3 bogus` and
`hk3 keeper` (no `main`) must print usage and exit 1.

## Live session

Some behavior shows only in an interactive session: the status line,
`--name`, and keeper's compaction (`-p` sessions reject native compaction).
Drive one in tmux:

```sh
tmux new-session -d -s hk3test -x 160 -y 40 "cd <scratch-project> && hk3 new agent claude --name charlie --role tester"
tmux capture-pane -pt hk3test
tmux kill-session -t hk3test
```

The first launch in a new directory shows a folder trust prompt; answer it
with `tmux send-keys`. To exercise keeper quickly, set
`KEEPER_RESTART_TOKEN_COUNT=500`: the first tool call then triggers the
handoff cycle. Watch for `[hk3-keeper]` log lines.

`claude -p` is enough to check that flags, settings and skills load, e.g.
`hk3 new agent claude --role builder -- -p "List skills starting with keeper-role"`.
