# 01: Spike: hk3 agents in herdr can message each other

**What to build:** A hand-driven experiment, no hk3 code changes, in a
scratch git repo with `.harmonik-v3/` (prefix set) and a throwaway herdr
session. Launch agents only with `herdr pane run` of the hk3 command
(`herdr agent start` is not used). Use a label with `--` via
`--name alpha--builder` for now. Record each check as pass or fail in a new
section of research-herdr.md and research-messaging.md, and end with the
go/no-go below. The first launch in a directory may show a trust or bypass
dialog; answer it and note it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Checks (each pass/fail):

- [ ] **Launch:** two hk3 agents run in two tabs of one workspace; tab labels stay set after Claude changes the terminal title
- [ ] **Environment:** with the herdr server started from inside a Claude session's Bash tool, a new pane's `env` shows whether `CLAUDECODE`, `CLAUDE_CODE_*` and `HK3_*` were inherited; starting the server with those removed (and typing a launch with them removed) gives a pane with none of them, and `claude` starts as a normal, not child, session
- [ ] **Addressing:** the `--` label is accepted as the session name and shows in the other agent's `ListAgents`
- [ ] **Delivery:** A messages B by label; B receives it while busy and, while idle, starts a turn on its own. Both run with `--dangerously-skip-permissions` (same permission mode, so delivery should be automatic; if held, retry with `crossSessionInbound: accept` through `--settings`)
- [ ] **Sender:** recorded whether the receiver sees the sender's name without a header in the text
- [ ] **After keeper:** with `KEEPER_RESTART_TOKEN_COUNT=500`, after a compaction cycle and, separately, after a clear-mode cycle, B is still in A's `ListAgents` under its label and still receives messages
- [ ] **First prompt:** a one-line prompt passed after `--` is submitted as the first turn
- [ ] **Exit:** `/exit` sent through herdr ends Claude cleanly (SessionEnd hooks run) when idle, mid-turn, and with a draft in the input box; record which key clears the input first; with `&& exit` after the launch, the tab closes on its own (note the time); a failed launch leaves the tab open with the error
- [ ] **Siblings:** from inside an agent's pane, herdr commands naming the session explicitly create a sibling tab and start a third agent

Go/no-go (write the outcome at the top of the spike notes):

- [ ] **Herdr no-go** (launch, environment scrub, exit or siblings fail): stop and report to the operator before ticket 03. Fallback for the operator to choose: keep `hk3 new agent claude` in plain terminals and drop the session module for now.
- [ ] **Messaging no-go** (addressing, delivery or after-keeper fails): ticket 05 stops and the operator chooses a fallback, e.g. agents type into a teammate's pane with `herdr agent prompt`. Tickets 03, 04 and 06 do not depend on messaging and continue.
- [ ] **Go:** list any spec change (decisions 2 and 7): the input-clear key, whether `crossSessionInbound` must be set, whether a sender header is needed
