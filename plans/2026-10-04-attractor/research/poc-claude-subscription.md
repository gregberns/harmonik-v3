# POC: Claude Agent SDK and claude-agent-acp on a subscription

## Summary

All three paths authenticated with the operator's **Claude Max** login and
no API key, and each completed a prompt with one tool use (Write a file):

- Claude Agent SDK `query()`: works, `apiKeySource: "none"`.
- `claude-agent-acp` over stdio: works with no `authenticate` call; the
  adapter reports `authStatus: {kind: "account", label: "Claude Max"}`.
- `claude -p --output-format stream-json`: works, `apiKeySource: "none"`, and
  emits `rate_limit_event` with the plan's five-hour and seven-day windows.

For Q3/Q4: an Attractor can drive Claude through the Agent SDK or ACP on the
subscription today, technically. Whether that is allowed for an orchestrator
is a policy question this POC cannot answer (see Open questions). Tested
2026-10-04 on macOS 26.4.1, model `claude-haiku-4-5-20251001`.

## Setup

- Scratch dir outside the repo (session scratchpad `poc/`, its own
  `git init`). No `ANTHROPIC_*` or `CLAUDE_CODE_OAUTH_TOKEN` variables in the
  environment (`env | grep`), and every run used `env -u ANTHROPIC_API_KEY`.
- The login is the existing `claude` login in the macOS Keychain. Nothing
  interactive was needed.
- Versions: `claude` 2.1.280 on PATH; `@anthropic-ai/claude-agent-sdk`
  0.3.289 (bundles its own Claude Code, which reported 2.1.289);
  `@agentclientprotocol/claude-agent-acp` 0.85.1 (uses the same SDK);
  Node v26.3.0.
- Scripts: [poc/sdk-test.mjs](poc/sdk-test.mjs) and
  [poc/acp-test.mjs](poc/acp-test.mjs). To re-run, in a scratch git repo:
  `npm i @anthropic-ai/claude-agent-sdk@0.3.289
  @agentclientprotocol/claude-agent-acp@0.85.1`, then
  `env -u ANTHROPIC_API_KEY node sdk-test.mjs "$PWD/ws"` (same for
  `acp-test.mjs`; `ws` must exist).
- Each test: one prompt, "Use the Write tool to create hello.txt containing
  exactly: hi. Then reply DONE.", model haiku. Each wrote `hello.txt`.

## 1. Agent SDK

```js
// sdk-test.mjs
import { query } from "@anthropic-ai/claude-agent-sdk";
for await (const m of query({ prompt: PROMPT, options: {
  cwd, model: "haiku", permissionMode: "acceptEdits",
  allowedTools: ["Write"], maxTurns: 4, settingSources: [] } })) { ... }
```

Run: `env -u ANTHROPIC_API_KEY node sdk-test.mjs <ws>`.

- init: `{"apiKeySource":"none","model":"claude-haiku-4-5-20251001","claude_code_version":"2.1.289"}`.
  `apiKeySource: "none"` means no API key; the OAuth login was used.
- `rate_limit_event` (second run, to capture the fields):
  `rateLimitType: "five_hour"`, `unifiedWindows` five_hour 5 % and
  seven_day 23 %, `overageStatus: "rejected"` (`org_level_disabled`).
  These are the same plan windows the CLI reports (section 3).
- result: `success`, `total_cost_usd` 0.036, `modelUsage[...].costBasis:
  "list"`, `provider: "firstParty"`. The cost is a list-price estimate, not
  a charge.
- No warnings.

## 2. claude-agent-acp

A 40-line Node client (`acp-test.mjs`) spawns
`node_modules/.bin/claude-agent-acp`, speaks JSON-RPC over stdio and sends
`initialize` (protocolVersion 1, fs and terminal false), `session/new`,
`session/set_config_option` (model = haiku), then `session/prompt`. It
answers `session/request_permission` with the first allow option.

- `initialize` returned `authMethods: []`. This client sends the same
  `initialize` as Petri (fs false, no terminal), so Petri would also get
  `authMethods: []`. The adapter lists terminal login
  methods only if the client declares `clientCapabilities.auth.terminal` (or
  `_meta["terminal-auth"]`); see `dist/acp-agent.js:1251-1300`.
- No `authenticate` was needed: `session/new` succeeded, and the adapter sent
  `_auth/status_update` with `{"kind":"account","label":"Claude Max",
  "account":{"plan":"max",...}}`.
- `configOptions`: `mode`, `model`, `effort`, `fast`. Setting `model` to
  `haiku` worked (default was opus).
- The Write tool asked for permission (`allow-once` chosen); file written.
- `usage_update` reported context use and, at the end,
  `cost: {amount: 0.052, currency: "USD"}`. The prompt result carried
  token counts in `usage` and `_meta.quota`, with no plan windows.
- The adapter forwards the SDK's `rate_limit_event` as a `usage_update`
  with `_meta["_claude/rateLimit"]`, but only after an assistant message
  has set usage (`dist/acp-agent.js:4919-4931`). In this run the event came
  first, so no window was forwarded. The ACP path runs the same Agent SDK
  build as test 1 and reported the same Claude Max account.
- Auth methods advertised when the client declares terminal auth:
  - From this SSH session (`SSH_CONNECTION`/`SSH_CLIENT` set, which the
    adapter treats as remote): only `claude-login` ("Log in with Claude",
    runs the TUI `/login`). The remote check also triggers on `NO_BROWSER`,
    `SSH_TTY` and `CLAUDE_CODE_REMOTE` (`dist/acp-agent.js:1257-1261`).
  - With those variables unset: `claude-ai-login` ("Claude Subscription",
    `auth login --claudeai`) and `console-login` ("Anthropic Console").
  - Neither was run: a login already existed, and running one is
    interactive.

## 3. Baseline: claude -p

```sh
env -u ANTHROPIC_API_KEY claude -p "$PROMPT" --model haiku \
  --output-format stream-json --verbose --allowedTools Write \
  --permission-mode acceptEdits
```

- init: `apiKeySource: "none"`, `claude_code_version` 2.1.280.
- `rate_limit_event`: `rateLimitType: "five_hour"`, `unifiedWindows`
  five_hour 5 % and seven_day 23 % used, `overageStatus: "rejected"`
  (`org_level_disabled`). These are subscription plan windows, so usage
  counts against the Max plan.
- result: `success`, `total_cost_usd` 0.022 (list-price estimate).

## Billing evidence

- The SDK and the CLI both emit `rate_limit_event` with the same Max plan
  windows (five_hour 5 %, seven_day 23 %), so both count against the plan.
  ACP did not surface the windows in this run (see above); it wraps the
  same SDK and reported the Claude Max account, so it is metered the same
  way (inferred, not shown on the wire). Overage is
  disabled for the org, so these runs could not have been billed as extra
  usage.
- I did not check the usage page or `/status` interactively. The
  `total_cost_usd` and `cost` fields are list-price estimates, not charges.

## What it means for Q3/Q4

- Technically, Claude on the subscription works through all three
  interfaces: `claude -p`, the Agent SDK, and ACP via `claude-agent-acp`.
  An ACP-based Attractor (Fabro/Petri-style) could drive Claude without an
  API key, as long as the agent is already logged in. Inferred from the
  code path, not tested: Petri calls `authenticate` only on
  `auth_required`, which `session/new` did not return here. Petri was not
  run, and its live tests pin `@zed-industries/claude-code-acp@0.16.2`
  (deprecated); it would need that pin moved to `claude-agent-acp`.
- ACP gives model choice (`model` config option), permission prompts and
  usage/cost updates, all of which worked here.
- The SDK and adapter bundle their own Claude Code build (2.1.289 here),
  which differs from the `claude` on PATH (2.1.280). An Attractor using
  them updates Claude Code by updating the npm package. That build is
  Anthropic's own, which fits harnesses.md's "unmodified Claude Code
  binary" wording and supports treating SDK use like `claude -p`. I
  consider this open, not settled: Anthropic has not said so directly.
- Policy is unchanged by this POC. Zed reports (2026-06-16) that the
  billing split was postponed and ACP use continues to work with
  subscriptions; there is nothing primary from Anthropic, and SDK use is
  not mentioned. Anthropic's terms still restrict third-party products from
  offering claude.ai login, and limits assume "ordinary, individual usage".
  A personal Attractor reusing the operator's own login looks closest to
  `claude -p`.

## Open questions

- Will the postponed billing change land, and would it treat SDK/ACP use
  differently from `claude -p`? Re-test if Anthropic announces it.
- Does heavy parallel pipeline use stay within "ordinary, individual usage"?
  Only the seven-day window (23 % used before these runs) will show the
  real cost to the plan.
- Not tested: running the adapter's "Claude Subscription" login flow
  itself (interactive), and use inside a container with
  `CLAUDE_CODE_OAUTH_TOKEN`.
