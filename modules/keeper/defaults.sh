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
