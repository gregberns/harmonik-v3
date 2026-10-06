# Requirements: project roles

Source: the operator, 2026-10-06 (framing and code findings in
[README.md](README.md)).

1. A project can define its own roles, freely named, without changing hk3.
2. hk3's six roles (`builder`, `captain`, `general`, `planner`, `reviewer`,
   `tester`) remain, as defaults.
3. A project role with the same name as one of hk3's replaces it for that
   project.
4. Project roles work everywhere a role is named today: `hk3 new|resume
   agent claude --role`, `hk3 build role(s)`, `hk3 session start --role`,
   and crew definitions and `hk3 crew add <role>`.
5. `hk3 list roles` shows hk3's and the project's roles and where each
   comes from.
6. Same pattern as crews, workflows and skills: the project's
   `.harmonik-v3/` folder first, then hk3's, overriding by name.
7. Minimal (the operator's do-less rule): no inheritance between roles and
   no new role keys. hk3 passes roles through and only supplies defaults
   (zero framework cognition).
