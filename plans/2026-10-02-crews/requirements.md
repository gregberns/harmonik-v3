# Crews: requirements from the operator

Source of truth for this plan. Captured from the operator's own words on
2026-10-02, organized but not reinterpreted. Where the operator left a choice
open, it is marked **open**.

## Objective

Allow a captain to start some crew, or an operator to start a team. The team
has a well-defined structure. The team can communicate. After that, be a
little cautious.

Keep it simple to start. Avoid scope creep and a massive implementation. Too
much complexity and too many rules get in the way of a good first
implementation.

## Guiding principle: zero framework cognition

Read `docs/concepts/zero-framework-cognition.md`. The framework is plumbing,
not brain. hk3 provides structure to work within; it does not dictate how the
work is executed. "We are providing constructs for agents to work within."

## Architecture direction

- **hk3 is a router.** It takes commands and forwards them to submodules.
- **Keeper is the first submodule** (handoff + restart at a token
  threshold). Keep the keeper code focused.
- **Session management is its own submodule**, built on **herdr** rather than
  tmux ("tmux isn't always optimal"; herdr reportedly has a really nice API).
  It lets agents start and stop crew/teammates, and lets the operator (the
  human) see where things are and manage what is needed.

## Use cases

- An operator says "Spin up a team, with this shape."
- An operator tells a captain (the primary agent in charge of a project):
  "please start up X agents with these roles, and start the project."
- A set of agents starts at once and all of them know about each other.
- The captain/manager/primary cleans up agents at the end of the project.
- A captain starts alone (e.g. `oc-alpha`). The project grows, so it turns
  itself into a team by adding crew (e.g. `oc-alpha--tester`).

## Crews / teams

- A crew definition (the shape of a team) is reusable, and teams can also be
  put together for a particular problem.
- Example shape: manager (or captain), planner, plan reviewer, builder,
  reviewer, tester.
- Each member has a specific responsibility.

## Addressing / naming

- Both individual agents and teams exist.
- It must be really obvious that an agent is part of a team. Agents need to
  know about the other agents and message the right teammates.
- Proposed form: `oc--alpha--builder`, `oc-alpha--builder`, or
  `oc--alpha-builder`, where `oc` is the project prefix, `alpha` the team,
  and `builder` the member. `--` signals team membership. **open**: which
  form.
- Multiple members with the same role, e.g. `builder1` or `builder-1`.
  **open**: which form.
- A team member knows what each role is responsible for on the team.

## Messaging

- Use Claude Code's cross-session messaging (SendMessage, addressing by
  session name). It is already well defined.
- We may add our own layer on top that further defines our protocols.

## Workflow / process

- Workflows are data, probably YAML.
- The captain should be able to find the workflow it wants or create one,
  then start its crew. Nuance: the captain already exists and is named, so it
  must be added to that crew rather than started as part of it.

## Explicitly not wanted (for now)

- **No work board** dictated by hk3. Users will manage projects differently.
  hk3 provides the infrastructure, not the path. The operator will supply a
  skill that defines how project management is done.
- **No enforcement.** Agents do not move work through an hk3 command that
  validates transitions. Enforcement can come from elsewhere; other tools do
  that.
- **Safety rails stay minimal.** The concern is one agent messaging the wrong
  team and starting work that should not happen. Naming should address that.
  Go little further than that.

## Process for this plan

- Plans live in `plans/<date>-<name>/`.
- Use the mattpocock-skills planning skills (`to-spec`, `to-tickets`).
- Subagents build the plan, then subagents review it.
