# 09: Project skills and roles (slot for the operator's project-management skill)

**What to build:** The slot for the operator's own project-management skill
(spec decision 8). Role composition also looks in the project: skills in
`.harmonik-v3/skills/` and roles in `.harmonik-v3/roles/`, project first,
then the hk3 repo. A project role or the project overlay can list a project
skill, and crew definitions can use project roles. hk3 ships no
project-management content.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `hk3 build role <role>` in a scratch project includes a skill that exists only in the project's skills folder when a role or the overlay lists it
- [ ] A role defined only in the project's roles folder can be launched (`--role`) and is listed by `hk3 list roles`; a project role with the same name as a repo role wins
- [ ] A listed skill missing from both places is still refused
- [ ] With a fake `claude`, the launched plugin folder contains the project skill
- [ ] docs/configuration.md (project skills and roles, lookup order), README.md (one paragraph on adding your own project-management skill), `hk3 init` setup prompt (mentions the folders) updated
