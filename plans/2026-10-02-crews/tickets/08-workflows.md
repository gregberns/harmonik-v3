# 08: Workflows as YAML the team reads

**What to build:** Workflows (spec decision 5). A workflow is a YAML file
with a `description`; every other key is free-form for agents. hk3 finds
them in the project's `.harmonik-v3/workflows/`, then the hk3 repo, checks
only that they parse and have a description, and never interprets them.
`hk3 crew defs` also lists workflows. A crew definition's `workflow`, or
`--workflow <name>` on `crew start`, must name an existing workflow and is
recorded in the roster by name and path, so every member can read it. The
`crew` skill tells a captain where to find workflows and where to write a new
one. Ship one example workflow and reference it from the example crew.

**Blocked by:** 07 (crew definitions)

**Status:** ready-for-agent

- [ ] `crew defs` lists the example workflow and flags one that is not YAML or lacks a description
- [ ] `crew start` with a definition naming a missing workflow is refused; a valid one appears in the roster with its path; `--workflow` overrides the definition's
- [ ] hk3 reads no workflow key other than `description`
- [ ] The `crew` skill names the workflow folders and says the agents follow the workflow with their own judgment
- [ ] README.md (workflows), docs/configuration.md (workflow lookup), docs/testing.md updated
