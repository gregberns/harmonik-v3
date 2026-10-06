# 01: Project-defined roles

**Repo:** harmonik-v3 (this repo).

**Verify:** the checks in [spec.md](../spec.md#testing-decisions), per
docs/testing.md, in a scratch git repo with a `.harmonik-v3/` (never a real
project). No live Claude needed except the optional crew check in herdr.

**What to build:** A project can define roles in
`<project>/.harmonik-v3/roles/<role>.yaml`, looked up before hk3's
`config/roles/`, a same-named project role replacing hk3's (spec decisions
1-8). `scripts/compose-role` gains `--roles-dir` and checks the role name;
it is the only place that resolves a role file. The launcher passes the
project folder, builds every role from a names-only union, and lists roles
with their source; the crew module validates and reads descriptions through
`hk3 build role`; the init prompt mentions the folder. Docs as spec
decision 7.

Note: `role_description` reads the built `role.yaml`, so each call needs a
build first. That holds where `check_role` runs first (crew definitions,
`crew add`); for the lead and the agent's own `HK3_ROLE` in the roster it
relies on the agent's launch having built its role, which is true today.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A project `qa.yaml` role (one project skill, one hk3-only skill) builds (`hk3 build role qa`) with base + qa + the project overlay and both skills, and `hk3 build roles` includes it
- [ ] A project `builder.yaml` replaces hk3's `builder` in the build; removing it restores hk3's
- [ ] `hk3 new agent claude --role qa` (fake `claude`, from a subdirectory) launches with the built `qa` settings and plugin dir
- [ ] An unknown role fails before anything starts, naming both folders, from `hk3 build role`, `hk3 new agent claude --role` and a crew definition; `--role ../config` fails the name check; a project role file with invalid YAML fails with yq's error and doesn't fall back to hk3's
- [ ] `hk3 list roles`, `hk3 build role` and a crew definition all accept `qa` and all reject `nope`
- [ ] `hk3 list roles` shows hk3's six, `qa` as project, and `builder` as replacing hk3's, in the format the operator chooses (spec question 1)
- [ ] A crew definition with a `qa` member passes validation, and its roster responsibility defaults to `qa.yaml`'s description
- [ ] A project without `roles/` gives the same output as before for the existing role, launcher and crew checks
- [ ] The docs in spec decision 7 (configuration.md, architecture.md, testing.md, config/base.yaml header, compose-role header, setup/init-prompt.md, README.md) updated in the same commit
