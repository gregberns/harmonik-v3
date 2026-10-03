# 07: Project skills (slot for the operator's project-management skill)

**What to build:** Spec decision 8. Role composition also looks for skills
in the project's `.harmonik-v3/skills/`, project first, then the hk3 repo.
The project overlay can list a project skill, so the operator's
project-management skill loads into every role. hk3 ships no
project-management content.

**Blocked by:** 02 (router and shared library)

**Status:** ready-for-agent

- [ ] `hk3 build role <role>` in a scratch project includes a skill that exists only in the project's skills folder when the overlay lists it
- [ ] A project skill with the same name as a repo skill wins
- [ ] A listed skill missing from both places is still refused
- [ ] With a fake `claude`, the launched plugin folder contains the project skill
- [ ] docs/configuration.md (project skills, lookup order), README.md (one paragraph on adding your own project-management skill), `hk3 init` setup prompt (mentions the folder) updated
