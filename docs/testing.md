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

## Session module (herdr)

Use a throwaway herdr session, `HK3_HERDR_SESSION=hk3test`, never the
operator's `hk3`, and a scratch repo whose `.harmonik-v3/config.env` sets
`HK3_PROJECT_PREFIX=oc`. Only `modules/session/herdr.sh` may run `herdr`;
check with `grep -rnw herdr modules scripts lib harmonik-v3 | grep -v '^modules/session/herdr.sh:'`:
every line it prints must be a comment or message text, never a command.

**Fake claude.** It prints its working directory, arguments and
`CLAUDE*`/`HK3_*`/`KEEPER_*`/`HARMONIK*` environment (also into
`$FAKE_LOG/<label>.env`), then reads lines like Claude's input: `ctrl+c` is
ignored, `/exit` exits. A label containing `stuck` ignores `/exit`; one
containing `dialog` needs one more Enter after it (Claude's "Background work
is running" dialog). One containing `crash` prints an error and exits 1 at
once; one containing `quit` exits 0 at once.

```sh
cat > "$bin/claude" <<'EOF2'
#!/bin/bash
id="${HK3_AGENT_ID:-unnamed}"
{ echo "cwd=$PWD"; printf 'arg %s\n' "$@"; env | grep -E '^(CLAUDE|HK3_|KEEPER_|HARMONIK)' | sort; } > "$FAKE_LOG/$id.env"
cat "$FAKE_LOG/$id.env"
case "$id" in
  *crash*) echo "claude: error: crashed" >&2; exit 1 ;;
  *quit*) exit 0 ;;
esac
trap 'echo ctrl+c >> "$FAKE_LOG/$id.keys"' INT
while true; do
  IFS= read -r line; rc=$?
  [[ $rc -gt 128 ]] && continue; [[ $rc -ne 0 ]] && exit 0
  echo "$line" >> "$FAKE_LOG/$id.keys"
  [[ "$line" == /exit ]] || continue
  case "$id" in
    *stuck*) ;;
    *dialog*) read -r _; echo enter >> "$FAKE_LOG/$id.keys"; exit 0 ;;
    *) exit 0 ;;
  esac
done
EOF2
chmod +x "$bin/claude"
```

**Fake first on PATH in panes.** herdr panes run a login shell, which may
rebuild PATH (a `~/.zprofile` that prepends `~/.local/bin` puts the real
`claude` first). For zsh, start the server with a `ZDOTDIR` whose
`.zprofile` puts the fake first:

```sh
mkdir -p "$zdot"; printf 'export PATH=%q:$PATH\n' "$bin" > "$zdot/.zprofile"
export ZDOTDIR="$zdot" PATH="$bin:$PATH" FAKE_LOG="$log" HK3_HERDR_SESSION=hk3test
```

**Environment check (server).** From that shell, which inside Claude Code
already has `CLAUDECODE` and `CLAUDE_CODE_*`, also export `HK3_AGENT_ID`,
`HK3_TEAM`, `HK3_AGENT_NAME`, `HK3_ROLE`, `KEEPER_ENABLED`,
`HARMONIK_AGENT`, `HK3_PROJECT_DIR=<scratch repo>` and
`KEEPER_RESTART_TOKEN_COUNT=777`, then run the first
`hk3 session start --team alpha --name builder` (it starts the server). The
fake's output must show the project root as cwd, `HK3_TEAM=alpha`,
`HK3_AGENT_ID=oc-alpha--builder`, `KEEPER_RESTART_TOKEN_COUNT=777`, and no
other leaked value: no `CLAUDECODE`, no `CLAUDE_CODE_*` except
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, no `CLAUDE_PID`. Then, in a pane of
a scratch workspace, `command -v claude` must print the fake and
`env | grep -cE '^(CLAUDE|HK3_|KEEPER_|HARMONIK)'` must print 0.

**Environment check (typed launch).** Make the `.zprofile` also export the
scrub list (`CLAUDECODE=1 CLAUDE_CODE_CHILD_SESSION=1 CLAUDE_PID=4242
HK3_TEAM=leak HK3_AGENT_ID=leak KEEPER_ENABLED=leak
KEEPER_RESTART_TOKEN_COUNT=999 HARMONIK_AGENT=leak ...`), so every new tab's
shell has them. A start must reach the fake with none of them: with
`KEEPER_RESTART_TOKEN_COUNT=555` in the calling shell the member gets 555,
without it 200000, never 999.

**Behavior.**

- `start --team alpha --name builder`: workspace `oc-alpha` with one tab
  `oc-alpha--builder`; a second member adds a tab to it; solo `--name bravo`
  gets workspace `oc-bravo`; a repeated label is refused; `session tabs`
  lists the labels.
- `--role nosuchrole`: exit 1; the tab stays open showing the error.
- `--name crash` (claude fails right after the launcher's last line):
  start exits 1 with `launch failed`, the tab stays open. `--name quit`
  (claude exits 0 at once): start exits 1 with "its tab closed right after
  the launch".
- `session tabs` lists only labels with the prefix (not a tab made by hand
  with `herdr workspace create`); `stop` of a label without the prefix
  exits 1 and touches nothing.
- Stop the last member of a team in the background and 0.3 s later start
  another member of it: the start succeeds (it recreates the workspace).
- Without a prefix every `session` command is refused.
- `stop` on a normal, a `dialog` and a `stuck` member: `$FAKE_LOG/<label>.keys`
  shows `ctrl+c` and `/exit` (plus the extra Enter); the `stuck` one is
  closed after the grace period; a workspace whose last tab went is gone.
  An unknown label exits 0 with a notice.
- `herdr session stop hk3test`, then any start: the restored tabs have no
  agent and start refuses their labels; `stop <label>` closes one and a
  start of it then succeeds.
- Four starts of one role at once (`&` and `wait`), in one team, after
  deleting `.harmonik-v3/build` and again after changing
  `.harmonik-v3/config.yaml`: all launch, into one workspace.
- From a shell in a pane of `hk3test`,
  `HK3_HERDR_SESSION=hk3test hk3 session start --team alpha --name sib`
  adds tab `oc-alpha--sib` to workspace `oc-alpha`.

**Live.** Restart `hk3test` without the fake (and without `ZDOTDIR`), start
one real agent with `hk3 session start --name live`, answer the trust
prompt in the pane (`herdr --session hk3test pane send-keys <pane> down
enter`), check the badge `▶ oc-live` with `pane read`, type a draft, then
`hk3 session stop oc-live`: the tab closes within about 2 s, and a
SessionEnd hook in the scratch project's `.claude/settings.json` logs
`prompt_input_exit`.

Clean up: `herdr session stop hk3test`, `herdr session delete hk3test`,
remove the scratch folders.

## Crew module

Same setup as the session module: `hk3test`, the fake `claude` first on
PATH, a scratch repo with `HK3_PROJECT_PREFIX=oc` and no `teams/` folder
yet. To see what a member sees at its start, add after the fake's `cat`
line `[[ -n "${FAKE_ROSTER:-}" ]] && "$FAKE_ROSTER" crew roster > "$FAKE_LOG/$id.roster" 2>&1`
and export `FAKE_ROSTER=<repo>/harmonik-v3` in the `.zprofile`.

Act as a solo captain by prefixing commands with
`HK3_AGENT_ID=oc-alpha HK3_AGENT_NAME=alpha HK3_ROLE=general` (inside Claude
Code the shell already carries `CLAUDECODE` and `CLAUDE_CODE_*`):

- Refused, with `.harmonik-v3/` unchanged (`ls`, `git status`): `crew add nosuch`;
  `crew add tester` without the captain variables and without `--team`;
  `--responsibility $'a\nb'`; `--team bravo` from the captain; `--name a--b`.
- `crew add tester`: starts `oc-alpha--tester` in workspace `oc-alpha`;
  `teams/alpha.yaml` lists `oc-alpha` (general) then `oc-alpha--tester`
  (tester) with the roles' descriptions; `teams/.gitignore` is `*` and
  `git status --ignored` shows the folder ignored. The fake's arguments end
  with the first prompt (label, role, team, `hk3 crew roster`) and its
  environment has no leaked value (as in the session check).
- Two more `crew add builder` (one with a `--responsibility` holding `$`,
  quotes and `&`): `builder` and `builder-2`, the text stored verbatim;
  `$FAKE_LOG/oc-alpha--builder-2.roster` starts with
  `You are oc-alpha--builder-2.` and lists it as live, and `oc-alpha` (no
  tab) as not live. Two adds of one role at once (`&`, `wait`) give two
  names. `crew add builder --name builder` is refused (taken); the roster
  is unchanged.
- `crew roster` as the captain prints `You are oc-alpha.`; `--team alpha`
  from outside prints the same roster without it.
- `crew stop tester`: `ctrl+c` and `/exit` in its `.keys`, gone from the
  roster. Refused: bare `crew stop`, a name not on the roster, the caller's
  own label, `--all` with names. A member whose tab was closed with
  `session stop` is taken off with a note.
- `crew stop --all` as the captain: every tab stops, the roster keeps only
  `oc-alpha`. `crew stop --all --team alpha` from outside: stops the rest,
  notes `oc-alpha` has no tab, deletes the roster; with every tab already
  closed it still deletes it; with no roster it exits 0 with a notice.
  Race: `crew stop --all --team bravo &`, `sleep 0.3`, `crew add reviewer
  --team bravo`, `wait`: the stop exits 1 naming `oc-bravo--reviewer`, and
  the roster still lists it.
- As the captain with `HK3_PROJECT_PREFIX=xx` in the shell, `crew roster`
  is refused (team label `oc-alpha` from `HK3_AGENT_ID` against `xx-alpha`).
- `crew add tester --team bravo --name crash` from outside: exits 1, the
  member stays on the roster, the message points to `crew stop`.
- No herdr call outside the adapter (the grep in the session section).

**Live.** In a fresh `hk3test` without the fake, run
`HK3_AGENT_ID=oc-live HK3_AGENT_NAME=live HK3_ROLE=general hk3 crew add tester`,
answer the trust prompt (`herdr --session hk3test pane send-keys <pane> down enter`)
and read the pane: the tester runs `hk3 crew roster` on its own and names
itself and `oc-live`. Clean up with `hk3 crew stop --all --team live`.

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
