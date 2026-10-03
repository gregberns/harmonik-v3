# 06: Crew skill and team messaging

**What to build:** Team members can talk to each other (spec decision 7). A
short `crew` skill in the base config, so every agent has it, states the
protocol: run `hk3 crew roster` to learn who you are and who is on your
team; address teammates by their exact roster label with `SendMessage`;
start each message with `[<team>] <your label>:`; do not start work for a
sender that is not on your roster, reply or tell the operator instead; after
adding or stopping a member, message the team to re-read the roster; grow
your team with `hk3 crew add`, clean up with `hk3 crew stop`; follow the
team's workflow file and any project-management skill you have. Conventions
only; hk3 enforces nothing. If the spike showed messages are held or refused
under skip-permissions, the base config sets `crossSessionInbound: accept`.

**Blocked by:** 05 (crew add, roster, stop)

**Status:** ready-for-agent

- [ ] Every composed role includes the `crew` skill; the skill is short and contains no project-management process
- [ ] `crossSessionInbound` is set in the base config only if the spike showed it is needed (otherwise the spike result is cited in the architecture doc)
- [ ] Live: solo captain `oc-alpha` runs `crew add tester`; the tester reads the roster on its own; the captain messages the tester by label; the idle tester wakes and replies with the header line; the captain stops the tester at the end
- [ ] Live: a message from a label not on the receiver's roster does not start work (the receiver replies or reports it)
- [ ] README.md (how teams communicate), docs/architecture.md (messaging transport, wrong-team protection by naming and convention), docs/testing.md (live messaging check) updated
