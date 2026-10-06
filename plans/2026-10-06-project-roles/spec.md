# Spec: project roles

Source: [requirements.md](requirements.md); findings in [README.md](README.md).
Principle: [zero framework cognition](../../docs/concepts/zero-framework-cognition.md).

## Problem Statement

hk3 ships six fixed roles in its own `config/roles/`. A project that wants a
role hk3 doesn't have (a security reviewer, an integrator with its own
skills, a docs writer) can't add one: the project's `.harmonik-v3/config.yaml`
is a single overlay applied to every role, and every role lookup (role
composition, `hk3 list roles`, `hk3 build`, crew validation) reads only
hk3's folder. That makes hk3 decide which roles exist, which is judgment a
pipe shouldn't hold.

## Solution

A project may put role files in `<project>/.harmonik-v3/roles/<role>.yaml`.
Every role lookup checks that folder first, then hk3's `config/roles/`; a
project role with the same name replaces hk3's for that project. Role files
have the same keys as today (`description`, `skills`, `skills_remove`,
`settings`), and `config/base.yaml` and the project's `config.yaml` overlay
still apply to every role, project-defined or not. `hk3 list roles` lists
both sets and says where each role comes from.

## User Stories

1. As a project owner, I want to add `.harmonik-v3/roles/qa.yaml` and launch
   `hk3 new agent claude --role qa`, so that my project has a role hk3
   doesn't ship.
2. As a project owner, I want my `.harmonik-v3/roles/builder.yaml` to replace
   hk3's `builder` for my project only, so that I can change a default
   without touching hk3.
3. As a project owner, I want my project overlay (`config.yaml`) and hk3's
   base to apply to my own roles too, so that project-wide settings stay in
   one place.
4. As a captain, I want crew definitions and `hk3 crew add <role>` to accept
   project roles, so that my team can include them.
5. As an operator, I want `hk3 list roles` to show every role available in
   this project and where it comes from, so that I know which file to read
   or edit.
6. As an operator, I want an unknown role to fail before anything starts
   (from `hk3 build`, `hk3 new|resume agent` and crew commands), naming both
   folders, so that a typo is obvious. (`hk3 session start --role` keeps
   today's behaviour: the tab opens and the launcher fails inside it.)
7. As a new user, I want `hk3 init` to mention the roles folder, so that I
   know I can add roles.

## Implementation Decisions

1. **Lookup order.** `<project>/.harmonik-v3/roles/<role>.yaml`, then
   `<hk3>/config/roles/<role>.yaml`; the first found wins. No merging
   between the two files: a project role replaces hk3's whole role file.
   A project role file that is invalid YAML fails with yq's error; it never
   falls back to hk3's role of the same name.
   Role names must match `^[A-Za-z0-9_-]+$`. Today only crew checks this
   (`modules/crew/main:159`); the launcher and compose-role accept any
   string, so with a project roles folder `--role ../config` would resolve
   `.harmonik-v3/config.yaml` as a role. compose-role checks the name before
   any lookup, since every path goes through it.
2. **Composition.** `scripts/compose-role` gains `--roles-dir <dir>`
   (mirroring `--skills-dir`; its header and usage say so): the role file is
   looked up there first, then in `config/roles/`. compose-role is the only
   place that resolves a role name to a file. Merge order is unchanged: `config/base.yaml`, the
   role file (from whichever folder), then each overlay. An unknown role
   fails with a message naming both folders.
3. **Launcher.** `build_role` passes `--roles-dir <project>/.harmonik-v3/roles`.
   A names-only helper returns the union of role names in both folders,
   sorted; `hk3 build roles` loops over it. Only the `list roles` command
   adds each role's source: hk3, project, or project replacing hk3's
   (format: operator question 1), so the build loop never sees the source
   text. The launcher's help text
   for `list roles` stops saying `config/roles/` only.
4. **Crew module.** Crew stops resolving role files itself, so the lookup
   rule lives in one place ("modules talk through the hk3 CLI"): `check_role`
   runs `"$HK3" build role <role>`, which validates the name, finds the file
   in either folder, and fails naming both folders when it's unknown;
   `role_description` reads `description` from the built
   `build/roles/<role>/role.yaml`. Crew definitions, `crew add <role>` and
   roster descriptions then see project roles. (The build happens anyway at
   launch; doing it at validation moves it earlier.)
5. **Session module.** No change: it passes `--role` to the launcher, which
   resolves it.
6. **Init.** `setup/init-prompt.md` mentions that a project can add roles in
   `.harmonik-v3/roles/` and replace hk3's by name (whether `hk3 init` also
   creates the folder is operator question 2).
7. **Docs.** `docs/configuration.md` (project files table: add `roles/`;
   Roles section: the lookup order; crew `role` key: "a role in the
   project's `.harmonik-v3/roles/` or hk3's `config/roles/`"; the skills
   row: "used when `config.yaml` or a project role lists them"),
   `docs/architecture.md` (files table and the composition step),
   `docs/testing.md` (the new checks below, and the compose loop that
   covers only `config/roles/`), `config/base.yaml`'s header comment,
   compose-role's header, `setup/init-prompt.md`, and a short `README.md`
   line.
8. **Stale builds.** Removing a project-only role leaves
   `build/roles/<role>/` behind. That's harmless (a launch rebuilds, and an
   unknown role fails in compose-role), so no cleanup is added.

## Testing Decisions

Per [docs/testing.md](../../docs/testing.md), in a scratch git repo with a
`.harmonik-v3/`, never a real project:
- **Role composition:** with `.harmonik-v3/roles/qa.yaml` (its own
  `description`, one project skill and one hk3-only skill), `hk3 build role qa` writes
  `build/roles/qa/role.yaml` holding base + qa + the project overlay, and the
  skill in `plugin/skills/`. `hk3 build roles` also builds `qa` alongside
  hk3's six.
- **Override:** a project `builder.yaml` with a different `description`
  replaces hk3's in `build/roles/builder/role.yaml`; deleting it brings hk3's
  back.
- **Unknown or bad role:** `hk3 build role nope`, `hk3 new agent claude
  --role nope` (with the fake `claude`) and a crew definition naming `nope`
  each exit 1 before anything starts, naming both folders; `--role
  ../config` exits 1 on the name check; a project `builder.yaml` with
  invalid YAML fails with yq's error and does not fall back to hk3's.
- **One rule:** `hk3 list roles`, `hk3 build role` and a crew definition
  all accept the project role `qa` and all reject `nope`.
- **Launcher:** with the fake `claude`, `hk3 new agent claude --role qa` from
  a subdirectory passes the built `qa` settings and plugin dir.
- **List:** `hk3 list roles` shows the six hk3 roles, `qa` as project and
  `builder` as project replacing hk3's.
- **Crew:** a crew definition with a `qa` member passes validation, and the
  roster's responsibility defaults to `qa.yaml`'s description (live, in
  herdr, per the existing crew checks).
- **No change for projects without `roles/`:** the existing role
  composition, launcher and crew checks give the same output as before
  (diff, per docs/testing.md's launcher rule).

## Out of Scope

Role inheritance (`extends`) or merging a project role with hk3's role of
the same name; new role keys or a role schema; project-defined base
(`config/base.yaml` stays hk3's; the project overlay already covers it);
roles from anywhere but the two folders.

## Operator Questions

1. **`hk3 list roles` format.** Today it prints bare names, one per line.
   Proposed: `name<TAB>source`, source `hk3`, `project`, or `project
   (replaces hk3)`, sorted by name. Or keep bare names and add the source
   only with a flag (`--sources`), so anything parsing today's output keeps
   working? (hk3's own `build roles` loop uses a separate names-only
   helper either way, decision 3; nothing else parses the command's output
   today.)
2. **`hk3 init` and the folder.** Only mention `.harmonik-v3/roles/` in the
   init prompt (proposed), or have init create the folder? Git doesn't track
   an empty folder, so creating it means adding a `.gitkeep`.

## Risks

- A project role named like an hk3 role silently replaces it; `hk3 list
  roles` showing "replaces hk3" is the guard (low).
- Crew validation and composition must agree on the lookup; both read the
  same two folders in the same order, and the unknown-role check covers both
  (low).
