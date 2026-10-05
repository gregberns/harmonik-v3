#!/usr/bin/env python3
"""Tiny ACP client. Usage: acpclient.py <script.json> -- <agent cmd...>
script: list of steps: {"m": method, "p": params} ; params may use "$SID" placeholder.
Auto-answers session/request_permission with env PERM (optionId, default first allow option).
Prints every message received (truncated) with direction markers."""
import json, os, subprocess, sys, threading, time

i = sys.argv.index("--")
script = json.load(open(sys.argv[1]))
cmd = sys.argv[i + 1:]
TRUNC = int(os.environ.get("TRUNC", "400"))
p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=open(os.environ.get("AGENT_ERR", "/dev/null"), "w"), text=True, bufsize=1)
pending = {}
lock = threading.Lock()
nid = [0]

def send(obj):
    s = json.dumps(obj)
    print(">>", s[:TRUNC], flush=True)
    p.stdin.write(s + "\n"); p.stdin.flush()

def reader():
    for line in p.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            print("!! non-json:", line[:200], flush=True); continue
        print("<<", line[:TRUNC], flush=True)
        if "method" in msg and "id" in msg:  # request from agent
            if msg["method"] == "session/request_permission":
                opts = msg["params"]["options"]
                want = os.environ.get("PERM")
                oid = want or next((o["optionId"] for o in opts if o["kind"].startswith("allow")), opts[0]["optionId"])
                send({"jsonrpc": "2.0", "id": msg["id"], "result": {"outcome": {"outcome": "selected", "optionId": oid}}})
            else:
                send({"jsonrpc": "2.0", "id": msg["id"], "error": {"code": -32601, "message": "not supported"}})
        elif "id" in msg:
            ev = pending.get(msg["id"])
            if ev:
                ev[1] = msg; ev[0].set()
    print("== agent stdout closed", flush=True)

threading.Thread(target=reader, daemon=True).start()
sid = None
for step in script:
    nid[0] += 1
    params = json.loads(json.dumps(step.get("p", {})).replace("$SID", sid or "").replace("$CWD", os.getcwd()))
    ev = [threading.Event(), None]
    pending[nid[0]] = ev
    t0 = time.time()
    send({"jsonrpc": "2.0", "id": nid[0], "method": step["m"], "params": params})
    if not ev[0].wait(float(os.environ.get("STEP_TIMEOUT", "120"))):
        print("== TIMEOUT on", step["m"], flush=True); break
    r = ev[1]
    print(f"== {step['m']} done in {time.time()-t0:.1f}s", flush=True)
    if step["m"] in ("session/new", "session/fork") and "result" in r:
        sid = r["result"]["sessionId"]
    if step.get("sid"):
        sid = step["sid"]
time.sleep(float(os.environ.get("TAIL", "0.5")))
p.stdin.close()
try:
    p.wait(timeout=10)
except Exception:
    p.kill()
print("== exit", p.returncode)
