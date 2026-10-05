# Spike: Fabro hands-on

Captain's task (2026-10-04). Install Fabro, drive Claude Code and Codex on
their subscriptions over ACP, and run a 3-node pipeline. Record how a run is
started, observed, stopped, resumed and where outputs land. Host sandbox
only, cheap models, one short prompt per node.

## Summary

- **Claude via `claude-agent-acp` on the Max subscription: PASS.**
  - The adapter reported `_auth/status_update` with label "Claude Max",
    plan "max".
  - Model `claude-haiku-4-5-20251001`, chosen with `ANTHROPIC_MODEL=haiku`
    in `acp.config` env.
  - The node wrote `claude.txt`.
  - Petri accepted 0.85.1's extra notifications without trouble.
  - The vault was empty (`fabro secret list`: "No secrets found"). The
    server process's own environment had no `ANTHROPIC_*` or `OPENAI_*`
    variables (checked with `ps eww <pid>`; runs inherit the server's env).
  - **Metering:** usage counts against the Max plan windows. The events
    carry `_claude/rateLimit` with `five_hour` 0.07, `seven_day` 0.23 and
    `overageStatus: rejected` (`org_level_disabled`). This settles the POC's
    open ACP-metering question.
- **Codex via `codex-acp` 2.1.1 on the ChatGPT login: PASS, headless.**
  - It used `~/.codex/auth.json` (`auth_mode: chatgpt`) with
    `NO_BROWSER=1`, with no login step and no `OPENAI_API_KEY`.
  - The adapter reported label "ChatGPT Prolite".
  - The model was `gpt-6.1-sol`, Codex's default because
    `~/.codex/config.toml` sets no model. It ran at low effort, in Codex's
    own `workspace-write` sandbox, and wrote `codex.txt`.
- **3-node pipeline (Claude → Codex → a command node with conditional
  edges): PASS** in 19 seconds, on the success path only. Each node saw the
  previous node's files.
  - A failed check would not have failed the run: node outcomes and run
    status are separate.
  - `goal_gate=true` on the check is what fails the run. This was verified
    separately with a command-only workflow (§4).
- **Stop and resume**:
  - Cancel works through the REST API (`POST /api/v1/runs/{id}/cancel`);
    the CLI has no cancel command. A cancelled run is terminal, and
    `fabro resume` just shows the final state.
  - After a `kill -9` of the server mid-node, the restarted server
    relaunched the run's worker. The run finished, but the in-flight node
    ran again (at-least-once).
- **Outputs** land in a clone of the source repo under Fabro storage, on a
  branch `fabro/run/<id>` with one commit per node (start and exit
  included). Nothing comes back to
  the source repo (no push or PR without GitHub). Only committed `HEAD` is
  cloned.
- **Friction**, in order of pain:
  1. `fabro install` requires GitHub (a `gh` token or GitHub App). I skipped
     it by writing `settings.toml` by hand, which needs `SESSION_SECRET` and
     a `FABRO_DEV_TOKEN` of a specific format.
  2. An ACP-only workflow is rejected ("no LLM provider is ready"). The
     check counts ACP agent nodes as needing a model. The workaround is a
     keyless placeholder provider.
  3. The docs' `acp.config` example (`type`, `name` keys) is rejected by
     Petri.
  4. A failed node gives only a terse `Error: ?` in the CLI. The run still
     reports SUCCEEDED unless the node is a `goal_gate`. That is by design
     (`docs/public/execution/outcomes.mdx:110-116`), but easy to miss. #273
     was closed 2026-05-16, but the terse error remains.
  5. Every Claude node loads the operator's own `~/.claude`: settings,
     CLAUDE.md, skills, plugins, hooks and MCP servers. Codex nodes load
     `~/.codex` the same way. Hooks run real commands, so pipeline runs
     depend on the operator's personal setup.
- **Cost:** about 8 tiny prompts in total. The Claude node reported a $0.026
  list-price estimate; on the subscription it isn't charged.

## Facts

All runs 2026-10-04, macOS 26.4.1 (M1 Max), in a scratch dir outside this
repo: `<scratchpad>/spike/` (binary in `bin/`, adapters in `adapters/`,
repo in `proj/`, server state in `storage/`). That dir is session scratch
and won't survive the session.

Kept in this repo under [spike/](spike/):
- the four workflows as run (`spike/workflows/*`, adapter paths shown as
  `<adapters>`);
- the server `settings.toml` (no secrets; `SESSION_SECRET` and
  `FABRO_DEV_TOKEN` were in a separate env file that is not committed);
- `spike/evidence.txt`: the two `_auth/status_update` lines and the
  `_claude/rateLimit` line, with email and org redacted.

### Versions

| Component | Version |
|---|---|
| Fabro | `0.375.0-nightly.0 (7fc0edb 2026-10-03)`, release asset `fabro-aarch64-apple-darwin.tar.gz`, sha256 checked against the release `.sha256` |
| claude-agent-acp | `@agentclientprotocol/claude-agent-acp@0.85.1` (npm, local `node_modules`) |
| codex-acp | `@agentclientprotocol/codex-acp@2.1.1` |
| claude (PATH) | 2.1.280; the adapter bundles its own Claude Code build (poc-claude-subscription.md) |
| codex (PATH) | codex-cli 0.156.1 (codex-acp bundles its own) |
| node | v26.3.0 |

### 1. Install

```sh
gh release download v0.375.0-nightly.0 --repo fabro-sh/fabro -p 'fabro-aarch64-apple-darwin.tar.gz*'
shasum -a 256 -c fabro-aarch64-apple-darwin.tar.gz.sha256
tar xzf fabro-aarch64-apple-darwin.tar.gz -C bin
```

The README's other routes are `curl | claude`, `brew install
fabro-sh/tap/fabro-nightly` and `curl | bash`.

**Friction 1: `fabro install` needs GitHub.**
- `fabro install --non-interactive --skip-llm` fails with
  `non-interactive install requires --github-strategy`.
- `token` reads `gh auth token` and stores it; `app` sets up a GitHub App
  (`lib/apps/fabro-cli/src/commands/install.rs:609-626, 697-717`).
- Per the task rules I didn't give it a token. The web wizard
  (`fabro server start` with no config) wasn't tried; it's interactive.

**Workaround: a hand-written `settings.toml`**, server started with
`--config`:

```toml
_version = 1
[server.listen]
type = "tcp"
address = "127.0.0.1:32299"
[server.web]
enabled = false
[server.auth]
methods = ["dev-token"]
[server.sandbox.providers.local]
enabled = true
[server.storage]
root = "<scratchpad>/spike/storage"
[environments.host]          # auto-migrated into the server's SQLite on start
provider = "local"
[run.git.author]
name = "fabro-spike"
email = "spike@example.invalid"

# Friction 2 workaround (see §2):
[llm.providers.ollama]
enabled = true
[llm.providers.ollama.models."placeholder"]
display_name = "Placeholder (never called)"
api_model = "placeholder"
limits = { context_tokens = 8192, max_output_tokens = 1024 }
capabilities = { text = true, tools = true }
```

Each step that tripped:
- `SESSION_SECRET` must be set ("auth is configured but SESSION_SECRET is
  not set").
- `FABRO_DEV_TOKEN` must be `fabro_dev_` plus 64 hex characters
  (`lib/foundation/fabro-util/src/dev_token.rs:19,40`).
- A model block needs `display_name` and `api_model`. Each missing field
  fails startup, one at a time.
- `[environments.*]` in settings is migrated to SQLite with a deprecation
  note ("will be removed before v1.0").
- The run defaults to an environment named `default`; I passed
  `--environment local` (a built-in).

Then:

```sh
FABRO_DEV_TOKEN=... SESSION_SECRET=... fabro server start --foreground --config settings.toml
fabro auth login --server http://127.0.0.1:32299 --dev-token "$FABRO_DEV_TOKEN"
cd proj && fabro repo init      # writes .fabro/project.toml and a hello workflow; warns: no git remote
fabro secret list               # "No secrets found": the vault precondition holds
```

**Side effects outside the scratch dir:**
- `~/.fabro/` was created with `auth.json` (the CLI session),
  `settings.toml` (`[cli.target]` pointing at the spike server), `logs/` and
  `tmp/`.
- The ACP runs added Codex rollouts under `~/.codex/sessions/2026/10/04/`.
- Nothing was written to this repo. Cleanup: `rm -rf ~/.fabro` and the
  scratch dir. I left them in place for the Qwen step.

### 2. Claude via ACP

Workflow `.fabro/workflows/claude-acp/workflow.fabro`:

```dot
write [label="Claude writes", backend="acp",
       acp.config="{\"command\":\"<adapters>/node_modules/.bin/claude-agent-acp\",\"args\":[],\"env\":{\"ANTHROPIC_MODEL\":\"haiku\"}}",
       prompt="Use the Write tool to create claude.txt containing exactly: hi from claude. Then reply DONE."]
```

**Friction 2: an ACP-only workflow is refused.**
- `fabro run claude-acp` → `fabro.model.no_ready_provider: no default model
  is available: no LLM provider is ready, and the workflow has a node that
  runs a model`.
- Cause: `needs_model()` is true for any `attractor/agent` node, ACP
  included (`lib/components/fabro-petri/src/check.rs:155-160`). The server
  adds the error when no provider has credentials
  (`lib/apps/fabro-server/src/petri_check.rs:187-201`). This looks like a
  bug.
- Workaround: enable the keyless `ollama` provider (`auth.type = "none"`)
  with a placeholder model. It's never called. Settings were not
  live-reloaded for this; the server needed a restart.
- A real DeepSeek or GLM key in the vault would also satisfy the check.

**Friction 3: the docs' `acp.config` shape is rejected.**
- `docs/public/core-concepts/agents.mdx:49` shows
  `{"type":"stdio","name":...,"command":...}`.
- Petri fails the node: `invalid acp.config: unknown field type, expected
  one of command, args, env` (class `acp_unconfigured`).

**Friction 4: a failed node still reports success unless it's a goal gate.**
- That first run printed `✗ Claude writes / Error: ?` and then
  `Status: SUCCEEDED`, because the only edge led to `exit`.
- This is by design: "Node outcomes and workflow status are separate. …
  Mark a node with `goal_gate=true` when its failure must make the workflow
  fail" (`docs/public/execution/outcomes.mdx:110-116`). It matches
  attractor-spec.md's goal gates. Routing alone doesn't fail a run.
- #273 (terse error, SUCCEEDED after failure) was closed 2026-05-16 as
  completed. At `7fc0edb` the CLI error is still `Error: ?`; the real
  message is only in `fabro events`.
- A driver that keys on run status needs `goal_gate=true` on every node
  whose failure matters.

**Result after fixing the config** (run `01M450BRTX7XRM877PTZGY26KX`):
- `✓ Claude writes 9s`, output `DONE`, `Status: SUCCEEDED`.
- `fabro events` contains `_auth/status_update` with `authStatus.kind
  "account"`, label `"Claude Max"`, plan `"max"`. The model is
  `claude-haiku-4-5-20251001`. Cost is reported as
  `{"usd_micros":25967,"source":"provider"}`, a list-price estimate.
- `claude.txt` is in the run workspace (see §4).
- No errors about unknown notifications. Petri tolerated 0.85.1's
  `_auth/status_update`, `configOptions` and `usage_update`.

**Friction 5: operator config leaks in.**
- Mechanism: `claude-agent-acp` 0.85.1 hard-codes
  `settingSources: ["user", "project", "local"]`
  (`dist/acp-agent.js:6827`), and Petri doesn't override it. So every
  Claude node loads the operator's `~/.claude/settings.json`, user
  CLAUDE.md, skills, plugins, hooks and MCP servers. The events show a
  `workflow-authoring` skill from the operator's setup.
- Risk: hooks run real commands, and plugins and MCP servers change the
  agent's tools. Pipeline runs depend on the operator's personal setup and
  can't be reproduced on another machine.
- Lever: `CLAUDE_CONFIG_DIR` in `acp.config` env (the adapter reads it,
  `dist/paths.js:3-5`). Untested: whether the Max login (macOS Keychain)
  still resolves under a non-default config dir.
- `codex-acp` reads `~/.codex` (`config.toml`, `AGENTS.md`) the same way;
  `CODEX_HOME` is the equivalent lever.

### 3. Codex via ACP

```dot
write [label="Codex writes", backend="acp",
       acp.config="{\"command\":\"<adapters>/node_modules/.bin/codex-acp\",\"args\":[],\"env\":{\"NO_BROWSER\":\"1\",\"INITIAL_AGENT_MODE\":\"workspace-write\",\"CODEX_CONFIG\":\"{\\\"model_reasoning_effort\\\":\\\"low\\\"}\"}}",
       prompt="Create a file named codex.txt containing exactly: hi from codex. Then reply DONE."]
```

Run `01M450DABP130RKE7MHG5SBKQP`:
- `✓ Codex writes 14s`, `SUCCEEDED`, and `codex.txt` = `hi from codex.`
  (Codex added the trailing period).
- Auth: `_auth/status_update` label `"ChatGPT Prolite"`, plan `prolite`.
  `~/.codex/auth.json` has `auth_mode: chatgpt` and no API key. No browser
  and no login step were needed (the acp.md open question is answered:
  yes, headless).
- Codex's own session log (`~/.codex/sessions/.../rollout-...jsonl`):
  - `model "gpt-6.1-sol"` and `effort "low"`, so `CODEX_CONFIG` was applied;
  - `sandbox_policy workspace-write` with `network_access:false`;
  - `approval_policy on-request`. Petri auto-allows any permission request.

### 4. The 3-node pipeline

```dot
digraph Pipeline {
    start [shape=Mdiamond]  exit [shape=Msquare]
    plan  [backend="acp", acp.config=<claude, haiku>, prompt="... create word.txt containing exactly one lowercase word: banana ..."]
    build [backend="acp", acp.config=<codex, workspace-write>, prompt="Read word.txt and create upper.txt containing that word in uppercase ..."]
    check [script="test \"$(tr -d '[:space:]' < upper.txt)\" = BANANA && echo CHECK_OK"]
    fail  [script="echo CHECK_FAILED; cat upper.txt; exit 1"]
    start -> plan -> build -> check
    check -> exit [condition="outcome=succeeded"]
    check -> fail
    fail -> exit
}
```

- Validation requires an unconditional fallback edge
  (`attractor.all_conditional_edges`).
- Run `01M450FN0TEJVKM1RZ9RN4SD9M`: `✓ Claude plans 5s`,
  `✓ Codex builds 12s`, `✓ Check 128ms`, `SUCCEEDED` in 19 s.
- Only the success path ran. As written, `check -> fail -> exit` still
  reaches exit, so a failed check would also end SUCCEEDED. Add
  `goal_gate=true` to `check`.
- Goal gate test (no model calls): workflow `gate` has a check that always
  fails, with `goal_gate=true`. Run `01M450YWG1MNTT1RNWFWQQSXX5` printed
  `✗ Check`, ran `Report failure`, then
  `Status: FAILED / Failure: script exited with status 1`. Validation warns
  `attractor.goal_gate_without_target` (no retry target, so the run ends
  failed).

**Start**
- `fabro run <workflow> --environment local` runs in the foreground and
  streams node status.
- `--detach` prints the run ID.
- `fabro create` and `fabro start` split the two steps.
- REST: `POST /api/v1/runs` then `/start` (fabro-api.yaml), with the dev
  token as `Authorization: Bearer`.

**Observe**
- `fabro inspect <id>` (JSON: status, run spec).
- `fabro timeline <id>` (one row per node with its checkpoint commit and
  diff stats).
- `fabro events <id>` (NDJSON of Petri and platform events, about 60 lines
  for a 3-node run).
- `fabro logs <id>`, `fabro wait <id>`, `fabro attach <id>`, `fabro system
  events`.
- REST: `/api/v1/runs/{id}`, `/state`, `/events`, `/attach` (SSE),
  `/timeline`.

**Stop**
- No CLI command.
- `POST /api/v1/runs/{id}/cancel`: the response showed
  `pending_control: "cancel"`, then status `{"kind":"failed","reason":"cancelled"}`
  within 3 s. No adapter processes were left behind.
- The API also has `/pause`, `/unpause` and `/interrupt` (not tried), and
  `fabro steer <id> [--interrupt]`.

**Resume**
- After cancel: `fabro resume <id>` replays the stream and ends with
  `FAILED: the run was cancelled`. A cancelled run is terminal; use
  `fabro retry` (a new run) or `fabro fork`/`rewind` from a checkpoint
  (not tried).
- Run `01M450HV9N2ZH7CAD0P7ZQ9E70` was a first kill attempt. My polling of
  `fabro timeline` was wrong, the run finished (`SUCCEEDED`, all 5
  checkpoints) before the kill, and it tested nothing.
- After `kill -9` of the server during the Codex node (run
  `01M450M0SHJS4QRTF0BA3AZ46A`):
  - The run worker is a separate process (`fabro <id> running`) under
    sandbox-driver watchdog shells. It outlived the server briefly and was
    gone about 15 s later.
  - On restart the server logged "Petri run left in flight by the previous
    server; relaunching its worker" and finished the run (`SUCCEEDED`, 51 s
    wall).
  - Codex rollouts at 20:09:59 and 20:10:29 show the `build` node ran
    twice. An interrupted node re-runs from its last checkpoint, so nodes
    should be idempotent.

**Where outputs land**
- `storage/scratch/<date>-<run id>/petri/scopes/invocation-0-scope-0/work/`
  is a git clone of the source repo (`origin = file://.../proj`), depth 100.
- Branch `fabro/run/<id>` holds one commit per node, start and exit
  included, for example
  `e2f3d47 fabro(<id>): plan (success)`.
- The source repo gets nothing: no branch, no files. The workflow.toml
  warning says "the standalone runner performs no Git operations of its
  own", and `[run.pull_request]` is ignored without GitHub.
- To collect results: `git fetch <work dir> fabro/run/<id>`.
- Untracked files in the source repo (`.fabro/` here) weren't in the
  clone; only committed `HEAD` is used.

**Other observations**
- The server logs `Run title generation failed ... provider anthropic has no
  registered adapter`. Harmless: Fabro tries to title runs with an LLM.
- Server-started runs inherit the server's environment. The host sandbox
  drops names ending in `_token`, `_api_key` and the like
  (fabro-process-backend.md).

### 5. Not run

- **Qwen:** waiting for the endpoint. The likely config is a custom
  OpenAI-compatible provider (`[llm.providers.<id>] base_url = ...`, plus
  model blocks shaped like the placeholder above) for Fabro's own `api`
  loop. Or an ACP agent (Qwen Code, OpenCode) pointed at the endpoint, to
  get a Qwen-tuned harness.
- **DeepSeek** (built-in `deepseek` provider, `base_url
  https://api.deepseek.com`, default `deepseek-v4-flash`, bearer auth):
  `fabro secret set DEEPSEEK_API_KEY` or `fabro provider login`. It runs in
  Fabro's own loop with the generic `openai` profile (impl-fabro.md).
- **GLM** (built-in `zai`): same, with `ZAI_API_KEY`. Override `base_url`
  to the pay-as-you-go `https://api.z.ai/api/paas/v4`; the built-in default
  is the Coding Plan endpoint. The catalog default is `glm-5.2`, so declare
  GLM-5.3 yourself.
- Neither key is in Petri's ACP injection list (`ANTHROPIC_API_KEY`,
  `GEMINI_API_KEY`, `OPENAI_API_KEY`), so storing them doesn't put Claude
  or Codex on API billing.
- Not tried: the web UI, pause/unpause, steer, `retry`/`fork`/`rewind`, and
  Docker.

## Settles

What this spike resolves elsewhere. The Anthropic-terms question is
unchanged.
- comparison.md:17, :66, :68 and :145: Claude through `claude-agent-acp`
  works in Fabro on the Max login (technically). codex-acp reuses the
  ChatGPT login headlessly.
- impl-fabro.md:34: the Claude-subscription row ("Partial / unverified")
  now works with `claude-agent-acp` 0.85.1 and an already logged-in host
  login in the local sandbox.
- fabro-process-backend.md: Rec 1 (the zero-code spike) passes, and the
  0.16.2-compatibility risk didn't materialize on the happy path.
- acp.md (planner): codex-acp headless reuse of `~/.codex` works.
- poc-claude-subscription.md (planner): ACP use is metered against the Max
  windows (`_claude/rateLimit`).
- driver-and-assembly.md:36-37 (planner): start, status and stop are
  confirmed over REST with a bearer token.

## Open questions

- Does the Max login survive `CLAUDE_CONFIG_DIR` pointed at a clean
  config dir? That's needed for reproducible runs.
- Is the ACP `needs_model` check a bug upstream would fix? It's a one-line
  change in `check.rs:155-160`, a good first contribution.
- Can the Claude adapter be isolated from the operator's `~/.claude` (for
  example `CLAUDE_CONFIG_DIR` in `acp.config` env) while keeping the Max
  login, which lives in the macOS Keychain?
- At-least-once node re-execution after a crash: does Fabro offer any
  idempotency key or "skip if done" for agent nodes?
- Collecting results without GitHub: is `git fetch` from the run workspace
  the intended path, or does a non-GitHub remote get a push step?
- The driver interface (decisions.md #8): start, status and stop all exist
  over REST with a bearer token. Cancel is REST-only.
