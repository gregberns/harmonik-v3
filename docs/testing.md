# Testing

Run the checks that cover what you changed. Report anything you could not
run.

## Keeper plugin

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate plugins/claude-keeper --json
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test plugins/claude-keeper
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
handoff cycle. Watch for `[claude-keeper]` log lines.

`claude -p` is enough to check that flags, settings and skills load, e.g.
`hk3 new agent claude --role builder -- -p "List skills starting with keeper-role"`.
