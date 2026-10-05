import { query } from "@anthropic-ai/claude-agent-sdk";
const cwd = process.argv[2];
for await (const m of query({ prompt: "Use the Write tool to create hello.txt containing exactly: hi. Then reply DONE.",
  options: { cwd, model: "haiku", permissionMode: "acceptEdits", allowedTools: ["Write"], maxTurns: 4,
             settingSources: [] } })) {
  if (m.type === "system" && m.subtype === "init") console.log("INIT", JSON.stringify({apiKeySource: m.apiKeySource, model: m.model, claude_code_version: m.claude_code_version, tools: m.tools?.length}));
  else if (m.type === "result") console.log("RESULT", JSON.stringify({subtype: m.subtype, is_error: m.is_error, result: m.result, total_cost_usd: m.total_cost_usd, usage: m.usage, modelUsage: m.modelUsage}));
  else if (m.type === "assistant") console.log("ASSISTANT", JSON.stringify(m.message.content.map(c=>c.type==="text"?c.text:c.type+":"+(c.name||""))));
  else if (m.type === "rate_limit_event") console.log("RATE", JSON.stringify(m.rate_limit_info)); else console.log(m.type, m.subtype||"");
}
