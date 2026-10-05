import { spawn } from "node:child_process";
import * as readline from "node:readline";
const cwd = process.argv[2];
const p = spawn("node_modules/.bin/claude-agent-acp", [], { stdio: ["pipe","pipe","inherit"], env: process.env });
let id = 0; const pending = new Map();
const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); p.stdin.write(JSON.stringify({jsonrpc:"2.0", id:i, method, params})+"\n"); });
readline.createInterface({ input: p.stdout }).on("line", l => {
  const m = JSON.parse(l);
  if (m.id && pending.has(m.id) && !m.method) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "session/request_permission") {
    const opt = m.params.options.find(o => o.kind.startsWith("allow"));
    console.log("PERMISSION", m.params.toolCall?.title, "->", opt.optionId);
    p.stdin.write(JSON.stringify({jsonrpc:"2.0", id:m.id, result:{ outcome:{ outcome:"selected", optionId: opt.optionId }}})+"\n"); return;
  }
  if (m.method === "session/update") { const u = m.params.update; const k = u.sessionUpdate;
    if (k === "agent_message_chunk") process.stdout.write(u.content?.text ?? ""); else if (k === "usage_update") console.log("\nUSAGE", JSON.stringify(u)); else if (k === "tool_call") console.log("\nTOOL_CALL", u.title); return; }
  if (m.method?.startsWith("fs/")) { console.log("FS", m.method); p.stdin.write(JSON.stringify({jsonrpc:"2.0", id:m.id, error:{code:-32601,message:"no fs"}})+"\n"); return; }
  if (m.method) console.log("OTHER", m.method);
});
const init = await send("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile:false, writeTextFile:false }, terminal:false } });
console.log("INIT authMethods", JSON.stringify(init.result?.authMethods), "agentInfo", JSON.stringify(init.result?.agentInfo));
let s = await send("session/new", { cwd, mcpServers: [] });
if (s.error) { console.log("SESSION_NEW error", JSON.stringify(s.error)); p.kill(); process.exit(0); }
const sid = s.result.sessionId;
console.log("SESSION", sid, "models", JSON.stringify(s.result.models?.availableModels?.map(m=>m.modelId)), "configOptions", JSON.stringify(s.result.configOptions?.map(o=>o.id)));
const mo = s.result.configOptions?.find(o=>o.id==="model");
if (mo) { const r = await send("session/set_config_option", { sessionId: sid, configId: "model", value: mo.options.find(o=>/haiku/i.test(o.value))?.value ?? mo.currentValue }); console.log("SET_MODEL", JSON.stringify(r.error ?? r.result?.configOptions?.find(o=>o.id==="model")?.currentValue)); }
else if (s.result.models) { const h = s.result.models.availableModels.find(m=>/haiku/i.test(m.modelId)); if (h) { const r = await send("session/set_model", { sessionId: sid, modelId: h.modelId }); console.log("SET_MODEL", h.modelId, JSON.stringify(r.error ?? "ok")); } }
const r = await send("session/prompt", { sessionId: sid, prompt: [{ type:"text", text:"Use the Write tool to create hello.txt containing exactly: hi. Then reply DONE." }] });
console.log("\nPROMPT_RESULT", JSON.stringify(r.result ?? r.error));
p.kill();
