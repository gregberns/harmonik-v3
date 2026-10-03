# Research: Claude Code agent communication

Gathered 2026-10-02 from official docs (Claude Code 2.1.288 installed).

## Cross-session messaging (chosen transport)
Docs: https://code.claude.com/docs/en/cross-session-messaging.md
- Any local session can message another; no agent teams needed.
- Sessions are addressed by their name (`claude --name <label>` or `/rename`). hk3 already passes the agent label as `--name`.
- Claude discovers targets with `ListAgents` (`/list-agents` shows what it can reach); `SendMessage` sends plain text; `@name` mentions work.
- An active session receives the message between tool calls; an idle session starts a new turn with it.
- Per-message cap ~1M chars; bursts are throttled at the sender.
- `crossSessionInbound` setting: `accept` | `hold` (notice + approval) | `refuse`. Default depends on sender/receiver permission modes. **Unverified**: behavior with `--dangerously-skip-permissions`.

## Agent teams (not chosen)
Docs: https://code.claude.com/docs/en/agent-teams.md
- Experimental (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Only the lead spawns teammates; an independently launched session cannot join. No resume for teammates; one team per session; in-process teammates inherit the lead's plugins. Shared task list + hooks (TeammateIdle, TaskCreated, TaskCompleted; shell hooks only).
- Rejected because hk3 wants each crew member to be an independently launched, resumable hk3 agent with its own role, keeper and status line.
