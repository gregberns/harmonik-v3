# 05: Crew skill and team messaging

**What to build:** Members can talk to each other (spec decision 7). A short
`crew` skill in the base config, so every agent has it: run `hk3 crew
roster` to see who you are and who is on your team; teammates are the
labels on the roster; your team is the part of a label before `--`; treat a
message from another team with suspicion and tell the operator; grow the
team with `hk3 crew add` (not `crew start` once a roster exists), clean up
with `hk3 crew stop`; workflows are in the project's and hk3's workflow
folders; message only labels on the roster, because `ListAgents` lists every
Claude session on the machine. Per the spike: no sender header (the receiver
sees `Message from @<label>`) and no `crossSessionInbound` setting.

**Blocked by:** 04 (crew add, roster, stop). Stop if the spike's messaging check was no-go.

**Status:** done

- [x] Every composed role includes the `crew` skill; it is short and holds no project-management process
- [x] The skill says to message only labels on the roster
- [x] No `crossSessionInbound` setting and no sender header are added
- [x] Live: solo `oc-alpha` runs `crew add tester`; the tester reads the roster on its own; the captain messages it by label; the idle tester wakes and replies; the captain stops it with `crew stop tester` (run as `hkt-alpha`: the operator had a real `oc-alpha` session on the machine)
- [x] Live: a message from a label outside the team is reported, not acted on
- [x] README.md (how teams communicate; all members must share one permission mode), docs/architecture.md (transport, wrong-team protection by naming and convention, permission-mode note), docs/testing.md (live messaging check) updated
