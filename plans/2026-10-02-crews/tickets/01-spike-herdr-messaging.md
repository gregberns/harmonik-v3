# 01: Spike: hk3 agents in herdr can message each other

**What to build:** A throwaway, hand-driven experiment (no hk3 code changes)
that proves or disproves the assumptions the rest of the plan rests on, in a
scratch git repo with `.harmonik-v3/` and a throwaway herdr session. Record
the results as a new section in research-herdr.md and research-messaging.md,
and list any spec decision that must change (decisions 2 and 7 in
[spec.md](../spec.md)).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Two hk3 agents run in two tabs of one herdr workspace, started by typing `hk3 new agent claude --name ...` into each pane (`herdr pane run`), with tab labels set; recorded whether `herdr agent start --kind claude -- --name <label>` is a better launch (and whether it can run hk3 at all)
- [ ] A label containing `--` (e.g. `oc-alpha--builder`, set via `--name alpha--builder` for now) is accepted as the Claude session name and shows in the other agent's `ListAgents`
- [ ] Agent A sends Agent B a message with `SendMessage` by label; B receives it while busy (between tool calls) and while idle (B starts a new turn on its own)
- [ ] Default `crossSessionInbound` behavior recorded with `--dangerously-skip-permissions` on both sides (accept, hold or refuse); if not accept, confirmed that setting `crossSessionInbound: accept` through `--settings` makes delivery automatic
- [ ] Recorded what the receiver sees about the sender (is the sender's name included automatically?)
- [ ] A first prompt passed after `--` (`hk3 new agent claude --name x -- "<prompt>"`) is submitted as the first turn
- [ ] Sending `/exit` + Enter to a pane through herdr ends Claude cleanly (SessionEnd hooks run) while idle and while mid-turn; with the launch command followed by `; exit`, the tab closes on its own; time to close noted
- [ ] From inside an agent's pane, a herdr command naming the session explicitly creates a sibling tab and starts a third agent in it
- [ ] Findings appended to the two research files; any decision that changes is listed at the top of the spike notes
