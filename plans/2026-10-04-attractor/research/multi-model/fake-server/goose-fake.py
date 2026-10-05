import json, sys, time, os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
D=os.path.dirname(os.path.abspath(__file__))
def mode(): 
    try: return open(D+'/mode').read().strip()
    except: return 'ok'
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def _j(self,code,obj,extra=None):
        b=json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(b)))
        for k,v in (extra or {}).items(): self.send_header(k,v)
        self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        with open(D+'/req.log','a') as f: f.write(f"GET {self.path} auth={self.headers.get('Authorization')}\n")
        self._j(200,{"object":"list","data":[{"id":"fake-model","object":"model"}]})
    def do_POST(self):
        n=int(self.headers.get('Content-Length',0)); body=json.loads(self.rfile.read(n) or b'{}')
        m=mode()
        with open(D+'/req.log','a') as f: f.write(f"POST {self.path} mode={m} auth={self.headers.get('Authorization')} body_keys={ {k:(v if k!='messages' and k!='tools' else '...') for k,v in body.items()} } ntools={len(body.get('tools',[]))}\n")
        if m=='401': return self._j(401,{"error":{"message":"Invalid API key","type":"invalid_request_error","code":"invalid_api_key"}})
        if m=='400': return self._j(400,{"error":{"message":"Model not found: bogus","type":"invalid_request_error","code":"model_not_found"}})
        if m=='429': return self._j(429,{"error":{"message":"Rate limit exceeded","type":"rate_limit_error"}},{"Retry-After":"1"})
        text="Hello from fake."
        msgs=body.get('messages',[])
        if m=='tool' and body.get('tools') and not any(x.get('role')=='tool' for x in msgs):
            tc={"index":0,"id":"call_1","type":"function","function":{"name":"write","arguments":json.dumps({"path":"hello.txt","content":"hi\n"})}}
            if body.get('stream'):
                self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.end_headers()
                base={"id":"c2","object":"chat.completion.chunk","created":int(time.time()),"model":body.get('model')}
                for o in [{**base,"choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[tc]},"finish_reason":None}]},{**base,"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}]:
                    self.wfile.write(b"data: "+json.dumps(o).encode()+b"\n\n")
                self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush(); return
            tc.pop('index'); return self._j(200,{"id":"c2","object":"chat.completion","created":int(time.time()),"model":body.get('model'),"choices":[{"index":0,"message":{"role":"assistant","content":None,"tool_calls":[tc]},"finish_reason":"tool_calls"}]})
        if body.get('stream'):
            self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.end_headers()
            def ev(o): self.wfile.write(b"data: "+json.dumps(o).encode()+b"\n\n"); self.wfile.flush()
            base={"id":"c1","object":"chat.completion.chunk","created":int(time.time()),"model":body.get('model')}
            ev({**base,"choices":[{"index":0,"delta":{"role":"assistant","content":text},"finish_reason":None}]})
            ev({**base,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]})
            ev({**base,"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}})
            self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
        else:
            self._j(200,{"id":"c1","object":"chat.completion","created":int(time.time()),"model":body.get('model'),"choices":[{"index":0,"message":{"role":"assistant","content":text},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}})
ThreadingHTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()
