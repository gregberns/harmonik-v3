# Keeper's settings defaults. Sourced by the router (harmonik-v3,
# load_launch_settings) after the config files load, so the shell
# environment, config.env and .env all override them.
# Keeper reads its settings itself; see plugin/README.md.

# Context tokens at which keeper runs its handoff/restart cycle.
: "${KEEPER_DEFAULT_RESTART_TOKEN_COUNT:=200000}"
# 1 = /clear instead of native compaction.
: "${KEEPER_DEFAULT_RESTART_CLEAR_MODE:=0}"

: "${KEEPER_RESTART_TOKEN_COUNT:=$KEEPER_DEFAULT_RESTART_TOKEN_COUNT}"
: "${KEEPER_RESTART_CLEAR_MODE:=$KEEPER_DEFAULT_RESTART_CLEAR_MODE}"
export KEEPER_RESTART_TOKEN_COUNT KEEPER_RESTART_CLEAR_MODE

# keeper_auto_compact_window: the value hk3 exports as Claude's own
# CLAUDE_CODE_AUTO_COMPACT_WINDOW, a backstop for a keeper cycle that fails
# or never runs: KEEPER_AUTO_COMPACT_WINDOW, else the restart threshold +
# 100000 (at most 1000000). Empty for 0 (leave Claude's setting alone).
# Computed at launch rather than exported here: hk3 session types every
# KEEPER_* variable into the pane, and that line has a length limit.
keeper_auto_compact_window() {
  local window="${KEEPER_AUTO_COMPACT_WINDOW:-}" restart="$KEEPER_RESTART_TOKEN_COUNT"
  if [[ -z "$window" ]]; then
    # Keeper falls back to 200000 for a threshold it cannot parse; match it.
    [[ "$restart" =~ ^[1-9][0-9]*$ ]] || restart="$KEEPER_DEFAULT_RESTART_TOKEN_COUNT"
    window=$((restart + 100000))
    ((window <= 1000000)) || window=1000000
  fi
  [[ "$window" == 0 ]] && return 0
  [[ "$window" =~ ^[1-9][0-9]*$ ]] && ((window >= 100000 && window <= 1000000)) || {
    echo "hk3: KEEPER_AUTO_COMPACT_WINDOW must be 0 or a token count from 100000 to 1000000, not '$window'" >&2
    return 1
  }
  echo "$window"
}
