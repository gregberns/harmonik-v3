# Fake-server failure tests (re-run 2026-10-05)

These are the harness error tests behind the runner-up and reject decisions
in [../../multi-model-handler.md](../../multi-model-handler.md). Everything
ran locally against a fake OpenAI-compatible server, with HOME, XDG and
config dirs isolated under the scratchpad. No real endpoint was called.

Files:
- `fakeoai.py`: path-mode fake server for OpenCode (`/ok`, `/tool`, `/e400`,
  `/e401`, `/e429`, `/e500`).
- `goose-fake.py`: file-mode fake server for Goose (the mode is read from a
  `mode` file).
- `acpclient.py`, `goose-acpc.py`: tiny ACP clients.
- `*-script.json`: the requests each client sent.
- `*-env.sh`: the isolated environment for each agent (`sk-test` keys are
  fake).

Results:

| Agent | Case | `session/prompt` response | File |
|---|---|---|---|
| OpenCode 1.18.34 (`opencode acp`) | ok | `result.stopReason: end_turn` | opencode-acp-run.txt (id 3) |
| | 400 | `error: -32603 "Internal error: Model Not Exist"` | id 5 |
| | 401 | `error: -32603 "Internal error: Authentication Fails, …"` | id 7 |
| | 429 | `error: -32603 "Internal error: Rate limit reached"` (after retries) | id 9 |
| | model not in catalog | `set_config_option` → `error: -32602 "model not found"` | id 10 |
| Goose 1.53.0 (`goose acp`) | ok | `result.stopReason: end_turn` | goose-acp-ok.txt |
| | 400 | **`result.stopReason: end_turn`**, with the reply text "Ran into this error: Request failed: Bad request (400): Model not found…" | goose-acp-400.txt |
| | 401 | `error: -32000 "Authentication required"` | goose-acp-401.txt |
| | 429 | **`result.stopReason: end_turn`**, with the reply text "Ran into this error: Rate limit exceeded…" | goose-acp-429.txt |

Qwen Code's results (JSON-RPC -32603 for 400 and 401; silent 429
retries) come from the subagent's original runs in
[../acp-harnesses.md](../acp-harnesses.md). They weren't re-run here.

Commands (scratch paths shown as `<scratchpad>`):

```bash
# OpenCode
python3 fakeoai.py 18731 req.log &
. opencode-env.sh && TRUNC=600 python3 acpclient.py opencode-script.json -- opencode acp

# Goose: run once per case
python3 goose-fake.py 18081 &
for m in ok 400 401 429; do echo $m > mode; . goose-env.sh; SCRIPT=goose-script.json python3 goose-acpc.py "$G" acp; done
```
