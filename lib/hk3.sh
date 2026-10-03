# lib/hk3.sh — shared helpers for the hk3 CLI and its modules: settings,
# project resolution and naming. Nothing else belongs here.
#
# Source it from bash running with `set -euo pipefail`. Sourcing resolves the
# project and sets ROOT (the harmonik-v3 repo), PROJECT_DIR and PROJECT_CONF.
# Settings load only when load_settings is called.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { echo "hk3: $*" >&2; exit 1; }

# --- Project -------------------------------------------------------------------
# $HK3_PROJECT_DIR (shell environment only), else the git root of the current
# directory, else the current directory.
PROJECT_DIR="${HK3_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
PROJECT_CONF="$PROJECT_DIR/.harmonik-v3"

# --- Settings ------------------------------------------------------------------
# Launcher defaults (override in .env or config.env). Keeper's are in
# modules/keeper/defaults.sh, which the router loads after load_settings.
# Role used when --role is not given.
: "${HK3_DEFAULT_ROLE:=general}"
# 1 = pass --dangerously-skip-permissions to claude.
: "${HK3_DEFAULT_CLAUDE_SKIP_PERMISSIONS:=1}"
# 1 = pass --remote-control to claude.
: "${HK3_DEFAULT_CLAUDE_REMOTE_CONTROL:=0}"

# load_settings: resolve every HK3_* setting and load KEEPER_* values from the
# config files. Precedence: shell environment > project config.env > repo .env
# > defaults.
load_settings() {
  local name names=() values=()
  for name in $(compgen -e | grep -E '^(HK3|KEEPER)_' || true); do
    names+=("$name"); values+=("${!name}")
  done
  local env_file
  for env_file in "$ROOT/.env" "$PROJECT_CONF/config.env"; do
    [[ -f "$env_file" ]] || continue
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  done
  local i
  for i in "${!names[@]}"; do export "${names[$i]}=${values[$i]}"; done
  : "${HK3_ROLE:=$HK3_DEFAULT_ROLE}"
  : "${HK3_CLAUDE_SKIP_PERMISSIONS:=$HK3_DEFAULT_CLAUDE_SKIP_PERMISSIONS}"
  : "${HK3_CLAUDE_REMOTE_CONTROL:=$HK3_DEFAULT_CLAUDE_REMOTE_CONTROL}"
  export HK3_ROLE
}

# --- Naming --------------------------------------------------------------------
#   solo agent   <prefix>-<name>               oc-alpha
#   team label   <prefix>-<team>               oc-alpha
#   member       <prefix>-<team>--<member>     oc-alpha--builder
# A member's agent name (HK3_AGENT_NAME) is <team>--<member>.

# check_part <what> <value>: die unless <value> is a valid label part: letters,
# digits, - and _, with no -- and no - at either end (either would blur the --
# between team and member).
check_part() {
  [[ "$2" =~ ^[A-Za-z0-9_-]*$ ]] || die "$1 may only contain letters, digits, - and _: $2"
  [[ "$2" != *--* ]] || die "$1 may not contain --: $2"
  [[ "$2" != -* && "$2" != *- ]] || die "$1 may not start or end with -: $2"
}

# agent_label <agent name>: <prefix>-<name>, or whichever part is set.
agent_label() {
  echo "${HK3_PROJECT_PREFIX:-}${HK3_PROJECT_PREFIX:+${1:+-}}$1"
}

# member_name <team> <member>: a team member's agent name, <team>--<member>.
member_name() {
  echo "$1--$2"
}

# caller_team: the calling agent's team: HK3_TEAM, else its agent name (a solo
# agent's name is the team it would lead). Only meaningful inside an hk3
# session: callers check HK3_AGENT_ID is set first, since HK3_AGENT_NAME can
# also come from the shell or a config file.
caller_team() {
  echo "${HK3_TEAM:-${HK3_AGENT_NAME:-}}"
}

# team_label: the calling agent's team label, the part of HK3_AGENT_ID before
# -- (oc-alpha--builder -> oc-alpha; a solo oc-alpha -> oc-alpha).
team_label() {
  local id="${HK3_AGENT_ID:-}"
  echo "${id%%--*}"
}

# next_free_name <base> [<taken name>...]: the lowest of <base>, <base>-2,
# <base>-3, ... that is not taken.
next_free_name() {
  local base="$1"; shift
  local taken=" $* " candidate="$base" n=1
  while [[ "$taken" == *" $candidate "* ]]; do
    n=$((n + 1)); candidate="$base-$n"
  done
  echo "$candidate"
}
