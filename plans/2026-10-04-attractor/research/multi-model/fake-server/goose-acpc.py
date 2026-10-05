import json, subprocess, sys, os, threading, queue
# usage: acpc.py script.json  ; script: list of [method, params] ; "$SID" substituted
cmd=sys.argv[1:]  # goose acp
p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=open(os.environ.get('ERRLOG','/dev/null'),'w'),text=True,bufsize=1)
q=queue.Queue()
def rd():
    for line in p.stdout: q.put(line)
    q.put(None)
threading.Thread(target=rd,daemon=True).start()
nid=[0]; sid=[None]
VERB=os.environ.get('VERB','1')=='1'
def send(o): p.stdin.write(json.dumps(o)+"\n"); p.stdin.flush()
def call(method,params,timeout=120):
    nid[0]+=1; i=nid[0]; send({"jsonrpc":"2.0","id":i,"method":method,"params":params})
    while True:
        line=q.get(timeout=timeout)
        if line is None: print("EOF"); return None
        try: m=json.loads(line)
        except Exception: print("NONJSON:",line.rstrip()[:300]); continue
        if m.get('method')=='session/request_permission':
            opts=m['params']['options']; print("PERMREQ:",json.dumps(m['params'])[:600])
            pick=[o for o in opts if o['kind']=='allow_once'] or opts
            send({"jsonrpc":"2.0","id":m['id'],"result":{"outcome":{"outcome":"selected","optionId":pick[0]['optionId']}}}); continue
        if 'method' in m and 'id' in m:
            print("CLIENTREQ:",line.rstrip()[:400]); send({"jsonrpc":"2.0","id":m['id'],"error":{"code":-32601,"message":"nope"}}); continue
        if 'method' in m:
            if VERB: print("NOTIF:",line.rstrip()[:400])
            continue
        if m.get('id')==i:
            print(f"RESP {method}:",json.dumps(m)[:int(os.environ.get('RLEN','1500'))]); return m
script=json.load(open(os.environ['SCRIPT']))
for method,params in script:
    s=json.dumps(params).replace('"$SID"',json.dumps(sid[0]))
    params=json.loads(s)
    r=call(method,params)
    if r and isinstance(r.get('result'),dict) and r['result'].get('sessionId'): sid[0]=r['result']['sessionId']
p.stdin.close(); p.wait(timeout=20)
