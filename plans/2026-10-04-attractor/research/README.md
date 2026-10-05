# Attractor research

One file per topic. Each file: a summary first (answer in a few lines), then
facts with sources (URL, commit, file path, date checked), then open
questions. Mark anything not verified as unverified. The comparison file
pulls the topics together; the captain takes its options to the operator.

| File | Topic | Owner | Status |
|---|---|---|---|
| [attractor-spec.md](attractor-spec.md) | What the spec defines and requires (Q1) | researcher | done |
| [implementations.md](implementations.md) | Every implementation found: language, activity, completeness (Q2) | researcher | done |
| [impl-kilroy.md](impl-kilroy.md) | Kilroy in depth (Q3) | researcher | done |
| [impl-fabro.md](impl-fabro.md) | Fabro in depth (Q3) | researcher | done |
| [acp.md](acp.md) | Agent Client Protocol: what it is, who supports it (Q4) | planner | done |
| [harnesses.md](harnesses.md) | Coding agents and which models they are tuned for; subscriptions (Q3, Q5) | planner | done |
| [models.md](models.md) | Qwen 3.8 local, DeepSeek, GLM: how to serve and reach each (Q3, Q5) | planner | done |
| [sandboxes.md](sandboxes.md) | Sandboxing options (Q6) | planner | done |
| [poc-claude-subscription.md](poc-claude-subscription.md) | POC: Agent SDK and claude-agent-acp on a Claude subscription (Q4) | planner | done |
| [fabro-process-backend.md](fabro-process-backend.md) | Fabro: feasibility of a non-ACP process backend for Claude and Codex | researcher | done |
| [driver-and-assembly.md](driver-and-assembly.md) | Driving Kilroy vs Fabro from outside; assembly map of engine, backends, agent tools, models | planner | done |
| [spike-fabro.md](spike-fabro.md) | Hands-on Fabro spike: Claude and Codex over ACP, 3-node pipeline, run control | researcher | done |
| [impl-harmonik-attractor.md](impl-harmonik-attractor.md) | The operator's fork (PAS): layout, agent execution, seams, worktrees, driver API, build and run | researcher | done |
| [spec-gaps-pas.md](spec-gaps-pas.md) | PAS against the Attractor spec: missing and divergent pieces, crash/timeout path (Q18, Q22) | researcher | done |
| [kilroy-git.md](kilroy-git.md) | Kilroy's worktrees, run branches and per-node commits; PAS hook points (Q16, Q17) | researcher | done |
| [test-and-output-pas.md](test-and-output-pas.md) | PAS: fake-agent testing (Q19) and run output/transcripts (Q20, Q22) | planner | done |
| [comparison.md](comparison.md) | Support matrix and options with trade-offs (Q7) | researcher | done |
