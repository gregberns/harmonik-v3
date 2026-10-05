# Sandboxes

Q6: what local sandbox options exist for running coding agents on a macOS
(Apple Silicon) host, and which Attractor implementations support them.
All facts checked 2026-10-04 unless marked otherwise.

## Summary

- There are three tiers. **Process policy** sandboxes are built into the
  harnesses: Claude Code (`/sandbox`, Bash only) and its standalone
  `sandbox-runtime` (`srt`, wraps a whole process), Codex sandbox modes, and
  Gemini CLI / Qwen Code Seatbelt profiles. They use macOS Seatbelt and cost
  almost nothing per run. **Containers** (Docker Desktop, OrbStack, Colima,
  Podman, devcontainers, Apple `container`) run Linux in one shared VM, or in
  one VM per container with Apple `container`. **Per-sandbox microVMs** that
  run locally on a Mac: Docker Sandboxes (`sbx`) and microsandbox. Firecracker
  stacks (E2B, Kata) need Linux with KVM, so on a Mac they run only in the
  cloud or inside a Linux VM.
- OpenCode and Pi have no OS sandbox of their own. Pi's docs say to run it in
  Docker, Docker Sandboxes, OpenShell or the Gondolin micro-VM extension.
- Subscription logins can get into a container. For Claude Code, pass
  `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`. For Codex, copy
  `~/.codex/auth.json`. Docker Sandboxes instead keeps credentials on the host
  and injects them through its proxy. A container reaches host Ollama at
  `host.docker.internal`.
- The Attractor spec abstracts this as `ExecutionEnvironment` in the
  coding-agent-loop spec. Only the local implementation is required; Docker,
  K8s, WASM and SSH are listed as extension points. The pipeline spec itself
  does not mention sandboxes.
- **Fabro** has real sandbox providers: `local`, `docker` (the default),
  `daytona` (cloud) and sandbox-driver plugins. **Kilroy** has none. It
  isolates runs with a git worktree and relies on each CLI's own flags.

## Facts

### Attractor spec

Source: https://github.com/strongdm/attractor, commit `fb57a55` (2026-03-17).

- `coding-agent-loop-spec.md` §4 defines an `ExecutionEnvironment` interface.
  Every tool operation goes through it ("Swap in a different implementation
  to run the same tools in Docker, on a Kubernetes pod, over SSH, or in
  WASM", line 726).
- §4.2 `LocalExecutionEnvironment` is the only required implementation. It
  runs commands in a new process group with a timeout (SIGTERM, then SIGKILL
  after 2 s). By default it filters out env vars matching `*_API_KEY`,
  `*_SECRET`, `*_TOKEN`, `*_PASSWORD` and `*_CREDENTIAL`.
- §4.3 lists non-required extension points: `DockerExecutionEnvironment`
  (`docker exec` / `docker cp`), Kubernetes, WASM and RemoteSSH. It also lists
  the wrappers `LoggingExecutionEnvironment` and `ReadOnlyExecutionEnvironment`.
- Line 1141: "OS-level sandboxing (macOS Seatbelt, Linux Landlock/Seccomp …)
  … a `SandboxedLocalExecutionEnvironment` could wrap the default
  environment. For stronger isolation, use `DockerExecutionEnvironment`."
- `attractor-spec.md` (the pipeline/DOT spec) has no mention of sandbox,
  Docker, container or worktree. A grep for those words returns nothing.
- This abstraction covers only the spec's own agent loop. When an
  implementation shells out to a CLI agent such as `claude` or `codex`, the
  CLI's tools run wherever the CLI process runs.

### Kilroy (danshapiro/kilroy)

Source: https://github.com/danshapiro/kilroy, commit `b55fb0f` (2026-04-27).

- There is no container or VM sandbox. The README says runs "Execute
  node-by-node with coding agents in an isolated git worktree" (README.md
  line 9). The run's `worktree/` is kept beside the run archive.
- `internal/agent/env.go` defines `ExecutionEnvironment`. The only
  implementation is `env_local*.go` (`LocalExecutionEnvironment`, with an
  env-strip policy). There is no Docker environment.
- CLI agents are launched with permission bypass:
  - Claude: `--bare --dangerously-skip-permissions --print` in
    `internal/attractor/agents/templates/claude.go:20`, and
    `-p --dangerously-skip-permissions` in `internal/providerspec/builtin.go:44`.
  - Codex: `exec --sandbox workspace-write --skip-git-repo-check --json`
    (`templates/codex.go:20`). This is Codex's own Seatbelt/bwrap sandbox.
  - Gemini: `--yolo` (`providerspec/builtin.go:63`).
  - OpenCode: `run --format json --pure` (`templates/opencode.go`), with no
    sandbox flag.
- `internal/attractor/engine/agent_router.go:1135-1149`: for "manual box
  fan-in" merge nodes, Kilroy removes Codex's `--sandbox` flag, because
  `git merge` writes `.git/` outside the worktree and `workspace-write`
  blocks that (Kilroy issue #49). Even the one built-in sandbox it uses is
  turned off for some nodes.
- `engine/rust_sandbox_preflight.go` is a Rust build preflight check. It is
  not an isolation feature.
- Agents can also run in tmux sessions (`agents/tmux_handler.go`). They still
  run on the host.
- Docker is used only for the optional CXDB service (`scripts/start-cxdb.sh`).
- A GitHub issue search for docker/sandbox/container in the repo returned no
  results.

### Fabro (fabro-sh/fabro)

Source: https://github.com/fabro-sh/fabro, commit `7fc0edb` (2026-10-03).

- `docs/public/administration/sandboxing.mdx`: "Fabro bundles three sandbox
  providers: `local` (no isolation), `docker` (container-level), and
  `daytona` (cloud VM)". Other providers plug in as
  [sandbox-driver](https://github.com/lithoscomputer/sandbox-driver) JSON-RPC
  plugins under `[server.sandbox.providers.<kind>]`.
- `docs/public/execution/environments.mdx`:
  - An **environment** is named, reusable config: provider, image, resources,
    network, lifecycle and env. A **sandbox** is the runtime instance created
    for a run.
  - A run selects one with `[run.environment] id = "…"` or
    `fabro run --environment <slug>`.
  - Install seeds `default` as `provider = "docker"` with image
    `buildpack-deps:noble`, 2 CPU, 4 GB and network `allow_all`.
- Network modes are `allow_all`, `block` and `cidr_allow_list`. Docker
  supports `block` (Docker `none` network) but errors on `cidr_allow_list`.
  Local errors on both. Only Daytona supports CIDR allow-lists. There is no
  domain allow-list in any provider.
- Docker and Daytona are clone-based: Fabro clones the repo into the sandbox
  (depth 100). Local runs in place, with "no filesystem or network
  isolation". The image must provide `/bin/bash`.
- Agent backends are `api` (Fabro's own agent loop, tools run in the sandbox)
  and `acp` (an external ACP stdio agent).
  - `docs/public/core-concepts/agents.mdx`: "ACP agents run inside the active
    Fabro sandbox"; "ACP is supported with local and Docker sandboxes;
    Daytona does not expose bidirectional stdio yet".
  - The ACP process owns its own auth, and Fabro does not install agents. The
    image must already contain e.g. Node and the ACP adapter.
- The old `cli` backend (`claude`/`codex`/`gemini` subprocess) was removed:
  changelog `docs/public/changelog/2026-05-18.mdx` says "Agent backends are
  now strictly `api` or `acp`".
  - `docs/public/agents/permissions.mdx:94-96` still describes CLI backends
    using `--dangerously-skip-permissions` / `--full-auto` / `--yolo`. That
    page looks stale.
- Secrets get into the sandbox env through `{{ secrets.NAME }}`
  interpolation, resolved "immediately before the sandbox starts"
  (environments.mdx). This is the likely path for a `CLAUDE_CODE_OAUTH_TOKEN`
  for an ACP Claude adapter (unverified, not tested).
- The packaged Docker deployment mounts `/var/run/docker.sock` and documents
  it as "host-root-equivalent access"
  (`docs/public/administration/self-host-docker.mdx:38-43`). The code reads
  `DOCKER_HOST` (`lib/foundation/fabro-static/src/env_vars.rs:72`). Whether it
  works with OrbStack, Colima or Podman sockets is unverified.
- sandbox-driver (https://github.com/lithoscomputer/sandbox-driver, commit
  `5663536`, 2026-10-02) has crates `sandbox-driver-host` (no isolation),
  `-docker` and `-daytona`, plus a conformance suite. No Seatbelt or microVM
  provider is listed.

### Other implementations

`gh search code "DockerExecutionEnvironment"` found the term in copies of
the spec (stencila, prime-radiant-inc/evener, strongdm/attractorbench)
but in no other Attractor implementation besides those above. Coverage of
other implementations belongs in `implementations.md`; this was not a full
survey.

### Built into harnesses

**Claude Code: sandboxed Bash tool.** Source:
https://code.claude.com/docs/en/sandboxing.
- It is off by default. Turn it on with `/sandbox` or `sandbox.enabled: true`,
  e.g. `claude --settings '{"sandbox": {"enabled": true, "allowUnsandboxedCommands": false}}'`.
- macOS uses Seatbelt. Linux and WSL2 use bubblewrap plus socat. It is built
  on `@anthropic-ai/sandbox-runtime`.
- Network goes through a host proxy with `network.allowedDomains` and
  `deniedDomains`. The allow list starts empty.
- It covers Bash, PowerShell and Monitor commands only. Read, Edit, WebFetch,
  MCP servers and hooks run outside it.
- Escape hatches: `excludedCommands`, and the `dangerouslyDisableSandbox`
  retry, which is disabled by `allowUnsandboxedCommands: false`.
  `failIfUnavailable` makes Claude Code exit if the sandbox can't start.
- Credential masking (`sandbox.credentials`, `mask`, `injectHosts`) needs
  `network.tlsTerminate`.

**Claude Code: sandbox-runtime (`srt`).** Sources:
https://github.com/anthropics/sandbox-runtime (latest release v0.0.78,
2026-09-30) and https://code.claude.com/docs/en/sandbox-environments.
- It wraps any process: `npx @anthropic-ai/sandbox-runtime claude`. That
  covers Claude's file tools, hooks and MCP too.
- Config is `~/.srt-settings.json` or `--settings`, with filesystem
  `denyRead`, `allowWrite` and `denyWrite` and network `allowedDomains`.
  Network is denied by default.
- macOS uses Seatbelt (`sandbox-exec`). Linux uses bwrap plus seccomp.
  Windows support is alpha.
- It is a "beta research preview". It is harness-agnostic, so it could wrap
  codex, opencode or pi (unverified for each).

**Claude Code: dev container.** Source:
https://code.claude.com/docs/en/devcontainer.
- The reference `.devcontainer/` in anthropics/claude-code has
  `devcontainer.json`, `Dockerfile` and `init-firewall.sh`.
- The firewall needs `NET_ADMIN` and `NET_RAW`.
- The docs say `--dangerously-skip-permissions` is OK inside it, as a
  non-root user. They warn it "do[es] not prevent a malicious project from
  exfiltrating anything accessible inside the container, including the
  Claude Code credentials".

**Codex.** Source: https://learn.chatgpt.com/docs/agent-approvals-security
(redirected from developers.openai.com/codex), codex `rust-v0.160.0`.
- Modes are `read-only`, `workspace-write` and `danger-full-access`.
- macOS uses Seatbelt (`sandbox-exec`). Linux uses `bwrap` plus `seccomp` by
  default.
- Network is off by default. It is enabled with
  `[sandbox_workspace_write] network_access = true`. There is no per-domain
  list in the CLI docs fetched (unverified).
- In Docker the sandbox "may fail if the host blocks namespace or seccomp".
  The docs give two fixes: use `--dangerously-bypass-approvals-and-sandbox`
  and let Docker be the boundary, or use the reference dev container.
- `--full-auto` is deprecated in favour of
  `codex exec --sandbox workspace-write`.

**Gemini CLI.** Source:
https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md
(main branch, latest release v0.62.0).
- Enable with `-s`/`--sandbox`,
  `GEMINI_SANDBOX=true|docker|podman|sandbox-exec|runsc|lxc`, or settings.
- macOS Seatbelt profiles are set with `SEATBELT_PROFILE`:
  `permissive-open` (the default), `permissive-proxied`, `restrictive-*` and
  `strict-*`.
- Docker or Podman mount the working dir at the same path. `runsc` (gVisor)
  and LXC are Linux only.

**Qwen Code** (a Gemini CLI fork). Source:
https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/sandbox.md
(main branch).
- Enable with `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`, `-s`, or
  `tools.sandbox`.
- Seatbelt profiles are `permissive-open` (default), `permissive-closed`,
  `permissive-proxied`, `restrictive-open`, `restrictive-closed` and
  `restrictive-proxied`.
- `QWEN_SANDBOX_PROXY_COMMAND` routes egress through a proxy on `:8877`.
  `QWEN_SANDBOX_IMAGE` overrides the container image.

**OpenCode.** Source: https://opencode.ai/docs/permissions/ (latest release
v1.18.34).
- It has permission rules only (`allow`/`ask`/`deny` per tool: `bash`,
  `edit`, `external_directory`, …). The docs mention no OS sandbox.

**Pi.** Source: https://github.com/earendil-works/pi (formerly
badlogic/pi-mono), commit `b2b5c42`,
`packages/coding-agent/docs/containerization.md`.
- The core has no permission prompts and no sandbox.
- The docs list four isolation methods: plain Docker (whole process),
  Docker Sandboxes (proxy keeps the provider key on the host), NVIDIA
  OpenShell, and the Gondolin extension (a local micro-VM for tools only,
  with Pi itself on the host).
- They show `claude setup-token` for using a Claude Pro/Max token in Docker
  Sandboxes. Whether Anthropic's terms allow a subscription token in a
  third-party harness is a policy question, not checked here.

### Containers and VMs on macOS

- **Docker Desktop.** Linux containers run in one shared Linux VM.
  `host.docker.internal` "resolves to the internal IP address of your host"
  (https://docs.docker.com/desktop/features/networking/networking-how-tos/).
  It needs a paid licence for larger companies (unverified, not re-checked).
- **OrbStack** (https://docs.orbstack.dev/, https://orbstack.dev/pricing) is
  a Docker Desktop replacement plus Linux machines. It is "Always free for
  personal use"; Pro is $8/user/month for business use. The docs mention
  "isolated sandbox environments for executing untrusted code"; details are
  unverified.
- **Colima** (https://github.com/abiosoft/colima) is built on Lima. It runs
  Docker, containerd or Incus, with VM type `vz` or `qemu`. Intel and Apple
  Silicon are supported.
- **Lima** (https://lima-vm.io/docs/) runs Linux VMs with VZ (the macOS
  default) and virtiofs mounts. Its AI page
  (https://lima-vm.io/docs/examples/ai/) covers running Claude Code, Codex,
  Gemini, Copilot, OpenCode and Aider in a VM, mounting only the project
  dir. Lima v2.1+ adds `--sync` (bidirectional sync that you review before
  accepting). It is a CNCF Incubating project.
- **Apple `container`** (https://github.com/apple/container, release 1.5.0,
  2026-09-29) runs each Linux container in its own lightweight VM through
  Virtualization.framework. It uses OCI images, needs Apple Silicon and
  macOS 26 or later. This host is Darwin 25.4, i.e. macOS 26.
- **Podman** is a daemonless Docker alternative. On macOS it runs in a
  `podman machine` VM (unverified, not fetched). Gemini CLI and Qwen Code
  support it directly.
- **Docker Sandboxes (`sbx`).** Sources: https://docs.docker.com/ai/sandboxes/,
  `/architecture/`, `/agents/`, `/agents/codex/`, and
  https://learn.arm.com/install-guides/sbx/.
  - One microVM per sandbox, with its own kernel and its own Docker daemon.
    On Apple Silicon it uses Apple's virtualization framework (Arm Ubuntu
    microVMs).
  - Docker Desktop is not needed: `brew install docker/tap/sbx`. It needs a
    Docker account sign-in.
  - Required macOS version: Arm's guide says 14 or later; other secondary
    sources say 26 (unverified, conflicting).
  - Agents: claude, codex, copilot, cursor, devin, docker-agent, droid,
    gemini, kiro, opencode and shell.
  - Workspace is a filesystem-passthrough mount at the same path, or "clone
    mode" (read-only source plus a private clone).
  - All outbound TCP goes through a host proxy that substitutes sentinel
    credentials. Claude subscription `/login` and
    `sbx secret set openai --oauth` keep the tokens on the host.
  - Codex runs inside with `--dangerously-bypass-approvals-and-sandbox`.
  - Claude's docs call it "a free, standalone product". Paid tiers add
    central policy (unverified for pricing).
- **Devcontainers** are a spec plus `devcontainer` CLI over Docker. Both
  Claude Code and Codex document a reference one (above).

### MicroVMs and agent sandbox tools

| Tool | Local on macOS? | Notes | Source |
|---|---|---|---|
| microsandbox | Yes (Apple Silicon) | Local microVM runtime and library (`msb run …`). Network `allowed_hosts`/`allowed_ports`; secrets "never enter the VM". README says "still beta". Release v0.7.6 (2026-10-01) | https://github.com/superradcompany/microsandbox |
| E2B | No, cloud or Linux+KVM | Firecracker microVMs. "E2B Embed" runs the stack "on a single Linux host with KVM"; "The runtime needs Linux with KVM". On a Mac it would need a Linux VM with nested virtualization (unverified) | https://github.com/e2b-dev/infra commit `9219790` |
| Daytona | Cloud (in Fabro) | OSS repo archived. README: "As of June 2026, Daytona's core development has moved to a private codebase." Fabro uses the hosted service | https://github.com/daytonaio/daytona |
| container-use (Dagger) | Yes, via Dagger engine and a container runtime | MCP server. The agent stays on the host and its tool calls run in a container per git branch. Marked experimental; last release v0.4.2 (2025-08-19), repo pushed 2026-09-21 | https://github.com/dagger/container-use |
| VibeKit | Yes (Docker) | Runs Claude Code, Codex, Gemini, OpenCode and Grok in Docker with secret redaction. Last push 2026-01-13, so low recent activity | https://github.com/superagent-ai/vibekit |
| Sculptor (Imbue) | Desktop app (macOS Apple Silicon) | Parallel agents (Claude Code, Pi). Its Docker "Container Backend" is experimental. "Research preview" | https://github.com/imbue-ai/sculptor |
| gVisor (`runsc`) | No, Linux only | User-space kernel for containers. Usable via Gemini CLI on Linux | https://github.com/google/gvisor |
| Kata Containers | No, Linux with a hypervisor | Lightweight VMs as containers | https://github.com/kata-containers/kata-containers |

### Credentials and local models inside a container

- **Claude Code** (https://code.claude.com/docs/en/authentication):
  - `claude setup-token` prints a one-year OAuth token for a Pro, Max, Team
    or Enterprise subscription. Set it as `CLAUDE_CODE_OAUTH_TOKEN`. It "can
    only make model requests".
  - `--bare` does not read `CLAUDE_CODE_OAUTH_TOKEN`. This matters for
    Kilroy, whose Claude template uses `--bare` and so needs
    `ANTHROPIC_API_KEY`.
  - On macOS the normal login lives in the Keychain, which a container
    can't read. On Linux it lives in `~/.claude/.credentials.json`.
  - Precedence: `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` both outrank
    `CLAUDE_CODE_OAUTH_TOKEN`.
- **Codex** (https://learn.chatgpt.com/docs/auth):
  - Use `codex login --device-auth`, or copy `~/.codex/auth.json`, e.g. with
    `docker cp ~/.codex/auth.json C:"$CONTAINER_HOME/.codex/auth.json"`.
  - "Treat `~/.codex/auth.json` like a password." API keys are recommended
    for CI.
- **Docker Sandboxes** keeps OAuth and API keys on the host and injects them
  at the proxy (above).
- **Local models.** Ollama binds `127.0.0.1:11434` by default; change it
  with `OLLAMA_HOST` (https://docs.ollama.com/faq).
  - From Docker Desktop a container reaches the host as
    `host.docker.internal`. Whether a host service bound only to 127.0.0.1
    is reachable that way, or needs `OLLAMA_HOST=0.0.0.0`, depends on the
    runtime (unverified per runtime).
  - Docker Sandboxes blocks private CIDRs by default according to secondary
    sources (unverified). There is an open Ollama issue about sbx
    integration (https://github.com/ollama/ollama/issues/18425, not read).
  - A network-blocked sandbox (Fabro `block`, Codex default) also blocks the
    model endpoint, unless the agent process sits outside the sandbox.

### Comparison table

| Option | Isolation level | macOS (Apple Silicon) | Network control | Per-run setup cost | Harnesses | Source |
|---|---|---|---|---|---|---|
| Claude Code `/sandbox` | Process policy (Seatbelt), Bash only | Yes | Domain allow/deny via proxy | ~none | Claude Code | code.claude.com/docs/en/sandboxing |
| sandbox-runtime `srt` | Process policy (Seatbelt), whole process | Yes | Domain allow/deny via proxy; default deny | ~none | Any CLI (built for Claude Code) | github.com/anthropics/sandbox-runtime v0.0.78 |
| Codex sandbox modes | Process policy (Seatbelt / bwrap+seccomp) | Yes | On/off only (CLI docs) | ~none | Codex | learn.chatgpt.com/docs/agent-approvals-security |
| Gemini CLI / Qwen Code sandbox | Process policy (Seatbelt) or container | Yes | Seatbelt `*-proxied`/`-closed` profiles; proxy command | ~none (Seatbelt); image pull (container) | Gemini CLI, Qwen Code | gemini-cli and qwen-code docs (main) |
| OpenCode permissions | None (approval rules) | Yes | None | none | OpenCode | opencode.ai/docs/permissions |
| Pi | None in core; docs point to containers and Gondolin | Yes | Depends on method | depends | Pi | earendil-works/pi `containerization.md` |
| Docker / OrbStack / Colima / Podman | Container (shared Linux VM) | Yes | `none` network, iptables firewall (devcontainer), or your own proxy | Container start ~seconds; image build once | Any CLI installed in image | docs.docker.com, docs.orbstack.dev, abiosoft/colima |
| Devcontainer (Claude/Codex reference) | Container plus egress firewall | Yes | Default-deny allowlist (`init-firewall.sh`) | Image build once; start ~seconds | Claude Code, Codex, others | code.claude.com/docs/en/devcontainer |
| Apple `container` | VM per container | Yes, macOS 26+ | Per-container VM networking (details unverified) | Start ~seconds (unverified) | Any CLI in image | github.com/apple/container 1.5.0 |
| Lima VM | Full VM | Yes (VZ) | Your own (VM-level) | VM boot; reusable | Claude Code, Codex, Gemini, OpenCode, Aider documented | lima-vm.io/docs/examples/ai |
| Docker Sandboxes `sbx` | MicroVM per sandbox | Yes (macOS version unclear) | Domain allow/deny proxy; credential injection | Sandbox create per agent; private image cache | claude, codex, gemini, opencode, copilot, cursor, kiro, droid, … | docs.docker.com/ai/sandboxes |
| microsandbox | MicroVM | Yes | allowed hosts/ports | Sub-second boot (claimed) | Any (you install it); beta | superradcompany/microsandbox v0.7.6 |
| container-use | Container per branch (tools only) | Yes | Container network | Dagger engine plus container per env | MCP clients (Claude Code, Cursor, Goose) | dagger/container-use |
| VibeKit | Container | Yes | Unverified | Container per run | Claude Code, Codex, Gemini, OpenCode, Grok | superagent-ai/vibekit |
| E2B | MicroVM (Firecracker) | No (cloud or Linux KVM) | nftables plus SNI domain lists | Snapshot resume | Any | e2b-dev/infra |
| gVisor / Kata | Container with user-space kernel / VM | No (Linux) | Container network | low / medium | Any (Gemini CLI has `runsc`) | google/gvisor, kata-containers |
| Fabro `docker` provider | Container | Yes (needs a Docker daemon) | `allow_all` or `block` only | Clone repo (depth 100) plus container | Fabro API agent; ACP agents in image | fabro `environments.mdx` @7fc0edb |
| Fabro `daytona` provider | Cloud VM | n/a (cloud) | allow/block/CIDR list | Snapshot build once | Fabro API agent (ACP not supported) | same |
| Kilroy | Git worktree only, plus each CLI's flags | Yes | None of its own | Worktree create | claude (bypass), codex (workspace-write), gemini (yolo), opencode | kilroy @b55fb0f |

### Risk note

- **Escape risk.** Process-policy sandboxes share the host kernel and user.
  - They depend on Seatbelt profiles. `sandbox-exec` is marked deprecated by
    Apple (unverified, not checked here). The `srt` README lists its own
    bypasses: domain fronting, programs that ignore proxy env vars, broad
    write grants to `$PATH` or shell rc files, and Unix sockets such as
    `docker.sock`.
  - Containers on macOS add a VM boundary between the container and macOS.
    Containers inside the same Docker VM share that VM's kernel.
  - VM-per-sandbox (Apple `container`, `sbx`, microsandbox, Lima) has the
    smallest blast radius.
  - Mounting `docker.sock` into anything (Fabro's packaged deployment does
    this) gives the holder root-equivalent control of the Docker VM.
- **Credential exposure.** Any token placed inside the sandbox can be read
  and exfiltrated by the agent if egress is open: `CLAUDE_CODE_OAUTH_TOKEN`,
  a copied `auth.json`, or API keys. Claude's devcontainer docs say this
  directly.
  - Proxy injection keeps the real token outside the boundary: Docker
    Sandboxes, Claude's `sandbox.credentials` masking, and microsandbox
    secrets.
  - A one-year subscription token is long-lived.
  - Kilroy and Fabro both run agents with permission bypass. Without a real
    sandbox, the host user's files and keys are reachable.
- **Performance on macOS.** Bind mounts cross the VM boundary (virtiofs or
  similar). Heavy small-file I/O such as `node_modules`, `cargo` or `git
  status` on big repos is slower than native (not measured here).
  - Clone-into-sandbox designs avoid this but need a sync-back step: Fabro
    Docker, `sbx` clone mode, Lima `--sync`.
  - Per-sandbox private image caches (`sbx`) cost disk and first-run time.
  - Seatbelt has near-zero overhead.

## Open questions

- Does Fabro's Docker provider work against OrbStack, Colima, Podman or
  Apple `container` sockets via `DOCKER_HOST`? It is untested.
- To run Claude Code and Codex in a Fabro sandbox, we need ACP adapters
  baked into the image. Which adapters exist and work? See `acp.md`.
- How does a sandboxed agent reach a host-local model (Ollama or llama.cpp
  on the Mac)? This needs testing for each of Docker, `sbx` (private CIDRs
  blocked?) and Apple `container`.
- What exact macOS version does Docker Sandboxes require (14 vs 26)? What
  are its pricing and licence terms for personal use?
- Can `srt` wrap codex, opencode, pi or qwen-code cleanly? Each needs its own
  config dirs and model endpoints allow-listed.
- Is a Claude subscription token allowed in third-party harnesses (Pi, ACP
  adapters, `sbx`)? This is a policy question for `harnesses.md`.
- Did Kilroy's issue #49 lead to anything beyond removing the Codex sandbox
  on fan-in nodes? Is a container `ExecutionEnvironment` planned? There is
  no sign of one in the repo.
