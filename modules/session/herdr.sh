# modules/session/herdr.sh — the herdr adapter. The only file in hk3 that
# calls herdr. Callers name tabs and workspaces by label; herdr ids, JSON
# shapes and flags stay in this file. Replacing herdr means rewriting this
# file and nothing else.
#
# Every call names the herdr session ($HK3_HERDR_SESSION) explicitly, so the
# same command works from a plain terminal or from a pane inside herdr. ids
# are looked up by label on every call and never kept: herdr never reuses
# them.
#
# Operations:
#   ensure_server [<command prefix>...]   start the server if it is not running
#   tab_labels                            every tab label, one per line
#   tab_exists <label>
#   open_tab <workspace label> <label> <cwd>
#   type_line <label> <text>              type text, then Enter
#   send_keys <label> <key>...            keys such as ctrl+c, enter
#   wait_output <label> <regex> <seconds> print the first output line matching
#   close_tab <label>
#   view_hint                             how the operator views the tabs
#
# Requires herdr and jq.

_herdr() { herdr --session "$HK3_HERDR_SESSION" "$@"; }

# _herdr_call <args...>: run a herdr command and print its JSON result; on
# failure print herdr's error message and return 1.
_herdr_call() {
  local out msg
  if out="$(_herdr "$@" 2>&1)"; then
    printf '%s\n' "$out"
  else
    msg="$(jq -r '.error.message // empty' <<<"$out" 2>/dev/null || true)"
    echo "hk3: herdr $1 $2: ${msg:-$out}" >&2
    return 1
  fi
}

_herdr_running() {
  _herdr status server --json 2>/dev/null | jq -e '.running == true' >/dev/null 2>&1
}

# ensure_server [<command prefix>...]: start the session's server
# detached, unless it is running, and wait until it reports running. The
# prefix (e.g. env -u NAME ...) wraps the server command, so the caller
# decides the server's environment.
ensure_server() {
  command -v herdr >/dev/null || die "herdr not found on PATH"
  _herdr_running && return 0
  (cd "$HOME" && "$@" nohup herdr --session "$HK3_HERDR_SESSION" server </dev/null >/dev/null 2>&1 &)
  local i
  for i in $(seq 1 50); do
    _herdr_running && return 0
    sleep 0.2
  done
  die "herdr server for session $HK3_HERDR_SESSION did not start"
}

# _herdr_tab_id <label>: the id of the tab with this label, or nothing.
_herdr_tab_id() {
  _herdr tab list 2>/dev/null |
    jq -r --arg l "$1" 'first(.result.tabs[]? | select(.label == $l) | .tab_id) // empty' 2>/dev/null || true
}

# _herdr_pane_id <label>: the id of the first pane in the tab with this label.
_herdr_pane_id() {
  local tab
  tab="$(_herdr_tab_id "$1")"
  [[ -n "$tab" ]] || { echo "hk3: no herdr tab $1" >&2; return 1; }
  _herdr pane list 2>/dev/null |
    jq -er --arg t "$tab" 'first(.result.panes[] | select(.tab_id == $t) | .pane_id)'
}

tab_labels() {
  _herdr tab list 2>/dev/null | jq -r '.result.tabs[]?.label' 2>/dev/null || true
}

tab_exists() {
  [[ -n "$(_herdr_tab_id "$1")" ]]
}

# open_tab <workspace label> <label> <cwd>: a new tab labelled <label>
# in the workspace labelled <workspace label>. A new workspace is created
# without focus; its root tab becomes the tab, so it has no stray tab. If
# the workspace goes away between the lookup and the tab create (a stop
# closed its last tab), it is created again.
open_tab() {
  local ws out tab msg
  ws="$(_herdr workspace list 2>/dev/null |
    jq -r --arg l "$1" 'first(.result.workspaces[] | select(.label == $l) | .workspace_id) // empty')"
  if [[ -n "$ws" ]]; then
    out="$(_herdr tab create --workspace "$ws" --cwd "$3" --label "$2" --no-focus 2>&1)" && return 0
    if [[ "$(jq -r '.error.code // empty' <<<"$out" 2>/dev/null)" != workspace_not_found ]]; then
      msg="$(jq -r '.error.message // empty' <<<"$out" 2>/dev/null || true)"
      echo "hk3: herdr tab create: ${msg:-$out}" >&2
      return 1
    fi
  fi
  out="$(_herdr_call workspace create --cwd "$3" --label "$1" --no-focus)" || return 1
  tab="$(jq -r '.result.tab.tab_id' <<<"$out")"
  _herdr_call tab rename "$tab" "$2" >/dev/null
}

type_line() {
  local pane
  pane="$(_herdr_pane_id "$1")" || return 1
  _herdr_call pane run "$pane" "$2" >/dev/null
}

send_keys() {
  local pane
  pane="$(_herdr_pane_id "$1")" || return 1
  shift
  _herdr_call pane send-keys "$pane" "$@" >/dev/null
}

# wait_output <label> <regex> <seconds>: wait for a line of the tab's
# output to match the regex (^ and $ match at line ends) and print the line;
# return 1 on timeout.
wait_output() {
  local pane out
  pane="$(_herdr_pane_id "$1")" || return 1
  out="$(_herdr pane wait-output "$pane" --source recent-unwrapped --regex "(?m)$2" --timeout "$(($3 * 1000))" 2>/dev/null)" ||
    return 1
  jq -r '.result.matched_line' <<<"$out"
}

# close_tab <label>: close the tab; a tab or workspace already gone is
# success. herdr closes a workspace itself when its last tab goes.
close_tab() {
  local tab out
  tab="$(_herdr_tab_id "$1")"
  [[ -n "$tab" ]] || return 0
  out="$(_herdr tab close "$tab" 2>&1)" && return 0
  case "$(jq -r '.error.code // empty' <<<"$out" 2>/dev/null)" in
    tab_not_found|workspace_not_found) return 0 ;;
  esac
  echo "hk3: herdr tab close: $out" >&2
  return 1
}

view_hint() {
  echo "herdr session attach $HK3_HERDR_SESSION"
}
