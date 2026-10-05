#!/usr/bin/env python3
"""Fake OpenAI-compatible server. Mode from first path segment: ok, tool, e400, e401, e429, e500.
Logs each request body (model, has tools, last role) to stderr."""
import json, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG = open(sys.argv[2] if len(sys.argv) > 2 else "/dev/stderr", "a")

def chunk(delta, finish=None, model="m"):
    return {"id": "c1", "object": "chat.completion.chunk", "created": int(time.time()), "model": model,
            "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        mode = self.path.strip("/").split("/")[0]
        if self.path.endswith("/models"):
            self._json(200, {"object": "list", "data": [{"id": "fake-model", "object": "model"}]})
        else:
            self._json(404, {"error": {"message": "nf"}})

    def _json(self, code, obj, headers=None):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        mode = self.path.strip("/").split("/")[0]
        n = int(self.headers.get("content-length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        msgs = body.get("messages", [])
        LOG.write(json.dumps({"mode": mode, "path": self.path, "model": body.get("model"),
                              "auth": self.headers.get("authorization"),
                              "tools": len(body.get("tools") or []), "last": msgs[-1]["role"] if msgs else None,
                              "effort": body.get("reasoning_effort"), "keys": sorted(k for k in body.keys() if k not in ("messages", "tools"))}) + "\n")
        LOG.flush()
        if mode == "e400":
            return self._json(400, {"error": {"message": "Model Not Exist", "type": "invalid_request_error", "code": "invalid_model"}})
        if mode == "e401":
            return self._json(401, {"error": {"message": "Authentication Fails, Your api key is invalid", "type": "authentication_error"}})
        if mode == "e429":
            return self._json(429, {"error": {"message": "Rate limit reached", "type": "rate_limit_error"}}, {"retry-after": "1"})
        if mode == "e500":
            return self._json(500, {"error": {"message": "boom"}})
        model = body.get("model", "m")
        events = []
        if mode == "tool" and msgs and msgs[-1]["role"] != "tool":
            events.append(chunk({"role": "assistant", "content": None, "tool_calls": [{"index": 0, "id": "call_1", "type": "function",
                    "function": {"name": "bash", "arguments": json.dumps({"command": "echo hi > out.txt", "description": "write file"})}}]}, model=model))
            events.append(chunk({}, "tool_calls", model))
        else:
            events.append(chunk({"role": "assistant", "content": "hello from fake"}, model=model))
            events.append(chunk({}, "stop", model))
        if not body.get("stream"):
            return self._json(200, {"id": "c1", "object": "chat.completion", "model": model, "choices": [{"index": 0,
                   "message": {"role": "assistant", "content": "hello from fake"}, "finish_reason": "stop"}],
                   "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        for e in events:
            self.wfile.write(b"data: " + json.dumps(e).encode() + b"\n\n")
        u = {"id": "c1", "object": "chat.completion.chunk", "model": model, "choices": [],
             "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}
        self.wfile.write(b"data: " + json.dumps(u).encode() + b"\n\n")
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
