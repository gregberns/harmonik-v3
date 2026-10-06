# Project roles

A project can define its own roles; hk3's roles are defaults.

Status: requirements, spec and ticket written and approved (2026-10-06); two operator questions open (spec.md).

## Request (operator, 2026-10-06)

A user reported: "hk3 has only six fixed roles and a project can't add its
own." A project should be able to create roles freely. Fixed roles go
against Zero Framework Cognition
([docs/concepts/zero-framework-cognition.md](../../docs/concepts/zero-framework-cognition.md)):
hk3 is a pipe, so roles should pass through it, and hk3 only supplies
defaults.

## Findings (captain, from the code at 728eaa0)

Roles are looked up only in hk3's own `config/roles/`:
- `scripts/compose-role:30,48-49` (`ROLES_DIR="$ROOT/config/roles"`, "unknown role")
- `harmonik-v3:41,100-105` (`list roles`), `:108-113` (`build_role`)
- `modules/crew/main:155-164` (`role_file`, role validation and description)

A project's `.harmonik-v3/config.yaml` is one overlay applied to every role.
It can't add a role. Crews, workflows and skills already use the pattern
this needs: the project folder first, then hk3's, overriding by name
(docs/configuration.md).

Docs that name `config/roles`: docs/configuration.md, docs/architecture.md,
docs/testing.md, setup/init-prompt.md.

## Plan

- [requirements.md](requirements.md): what the operator asked for
- [spec.md](spec.md): what to build, tests, out of scope, operator questions
- [tickets/01-project-roles.md](tickets/01-project-roles.md): the one ticket (blocked by none)
