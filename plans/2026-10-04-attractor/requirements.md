# Attractor: requirements

Source of truth for this plan. The operator's words, 2026-10-04, lightly
edited; the questions below are the captain's framing, agreed with the
operator before research starts.

## What the operator wants

- An Attractor (https://factory.strongdm.ai/products/attractor, spec at
  https://github.com/strongdm/attractor) that drives several models.
- Each model runs in "the right harness": the harness (prompts, tool
  instructions, agent loop) tuned for that model. A local Qwen 3.8 gets a
  Qwen-tuned harness; GLM and DeepSeek get theirs. Plugins (e.g. DeepSeek's)
  could select the harness per model.
- Must support Claude (Claude Code) and Codex, so subscriptions can be used.
- Should support a local Qwen 3.8, DeepSeek and GLM, through whichever
  harness fits (Pi, OpenCode, or other).
- Prefer an existing coding agent over building the spec's
  coding-agent-loop ourselves; there are many good ones now.
- Later, optionally per workflow: run agents in local sandboxes.

## Candidates named by the operator

- Kilroy (https://github.com/danshapiro/kilroy): excellent, but not
  touched in a while.
- Fabro (https://github.com/fabro-sh/fabro): interesting; check it supports
  every agent we need. It mentions "ACP", which the operator does not know.

## Questions research must answer

1. What does the Attractor spec define (pipeline, coding-agent-loop, unified
   LLM client, etc.), and which parts must an implementation provide?
2. Which Attractor implementations exist, how complete and alive is each,
   and in what language?
3. For each: can it drive Claude Code and Codex on a subscription (not API
   keys only)? Can it drive Qwen 3.8 local, DeepSeek, GLM, and through what?
4. What is ACP, who supports it (Claude Code, Codex, OpenCode, Pi, Gemini
   CLI, others), and does it let an Attractor swap harnesses per model?
5. Which harnesses are tuned for which models (DeepSeek's harness/plugins,
   Qwen Code, GLM's recommended agent, Pi, OpenCode)? Is "pick the harness
   by model" practical?
6. What sandboxing options exist (per implementation and standalone)?
7. Options for us: adopt, fork or extend an implementation, or build on the
   spec; with trade-offs and evidence.
