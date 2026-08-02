<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="A3S Form — an AI-native form designer that connects design, compilation, and runtime rendering through one versioned form contract">
</p>

<p align="center">
  <img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-7137d8">
  <img alt="Runtime Node 20+" src="https://img.shields.io/badge/runtime-Node%2020%2B-2587f5">
  <img alt="Coverage above 95 percent" src="https://img.shields.io/badge/coverage-%3E95%25-3b53dc">
  <a href="https://github.com/A3S-Lab/Form/actions/workflows/pages.yml"><img alt="GitHub Pages deployment" src="https://github.com/A3S-Lab/Form/actions/workflows/pages.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-101118"></a>
</p>

<p align="center">
  <strong>Define once, render everywhere. AI may propose changes, but it cannot bypass review.</strong><br>
  An embeddable AI-native form designer for A3S Workflow, A3S Cloud, product teams, and coding agents.
</p>

<p align="center">
  <a href="https://a3s-lab.github.io/Form/">Documentation</a> ·
  <a href="https://a3s-lab.github.io/Form/playground/">Live Playground</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#capabilities">Capabilities</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#embedding">Embedding</a> ·
  <a href="#agent">Coding Agent</a> ·
  <a href="#quality">Quality</a>
</p>

> [!NOTE]
> This repository contains the runnable **v0.1.0 source and workspace package**: the visual Designer, controlled Renderer, deterministic Compiler, React/Vue/Web Component adapters, Workflow and Cloud contracts, CLI, and the `$a3s-form` skill. Until the package is published to a registry, integrate it from source or as a workspace dependency.

<a id="quick-start"></a>

## Quick Start

The hosted documentation and Playground are available at:

- [Documentation](https://a3s-lab.github.io/Form/)
- [Live Playground](https://a3s-lab.github.io/Form/playground/)

For local development, install Git and Bun. On Windows, Bun can be installed with `winget install --id Oven-sh.Bun --exact`. The macOS/Linux installer downloads Bun when it is missing. The deployment scripts install locked dependencies, build the package and Playground, and start a local server at `http://127.0.0.1:4176`.

**Windows PowerShell**

```powershell
git clone https://github.com/A3S-Lab/Form.git
Set-Location Form
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
```

The Windows service starts as a hidden process. Stop it with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop.ps1
```

**macOS / Linux**

```bash
git clone https://github.com/A3S-Lab/Form.git
cd Form
./scripts/install.sh
```

Stop the service with:

```bash
./scripts/stop.sh
```

Use `-NoStart` on Windows or `--no-start` on macOS/Linux to install and build without starting the server. Use `-Port 4200` or `--port 4200` to choose another port. The local server is intended for evaluation and embedding development; production hosting should use the host product's existing static asset and authentication infrastructure.

<a id="capabilities"></a>

## One Form Contract, Four Product Surfaces

A basic schema renderer only draws inputs. A3S Form gives design, preview, runtime rendering, and agent-authored changes the same semantics while making ownership of business data and side effects explicit.

| Surface | Implemented capabilities |
| --- | --- |
| **Form Designer** | A3S Office component styling, field catalog, structure tree, grid/column/tab/collapse layouts, cross-container drag and drop, custom nodes, live preview, undo/redo, and compiler diagnostics |
| **Form Renderer** | Controlled values, field validation, visibility/enabled rules, data-source options, action callbacks, read-only and external-error states, custom nodes, and repeaters |
| **Form Compiler** | Input boundaries, semantic validation, dependency-cycle detection, capability checks, canonical SHA-256, immutable `FormPlan`, and a cancellable Worker |
| **Agent Interface** | JSON CLI, revision-bound `FormPatch`, `$a3s-form` skill, machine-readable diagnostics, and atomic changes |

Core invariants:

- `FormDocument` is the single source of truth for schema, UI, rules, references, revision, and digest.
- Designer and Renderer consume the same compiler-produced `FormPlan`.
- AI submits bounded patches; revision conflicts fail instead of overwriting newer human work.
- Components emit values and actions only. Persistence, identity, authorization, secrets, and side effects belong to the host.
- Documents never execute arbitrary JavaScript. Widget, data-source, and action keys resolve only through host-approved registries.

### Minimal React embedding

```tsx
import { assertCompiled } from '@a3s-lab/form/core';
import { FormDesigner, FormRenderer } from '@a3s-lab/form/react';
import '@a3s-lab/form/styles.css';

const plan = assertCompiled(document);

<FormDesigner document={document} onChange={setDocument} />

<FormRenderer
  plan={plan}
  value={value}
  onChange={setValue}
  onAction={handleAction}
/>
```

<a id="architecture"></a>

## Architecture

<p align="center">
  <img src="assets/readme/architecture.svg" width="100%" alt="A3S Form runtime architecture: people and agents edit a canonical FormDocument through governed changes; the deterministic compiler produces a FormPlan consumed by React, Vue, and Web Components while Workflow or Cloud owns data and actions">
</p>

```text
                 Human author                    Coding Agent
                    │                       CLI / $a3s-form skill
                    └────────────┬────────────────────┘
                                 │ reviewed + validated FormPatch
                                 ▼
                     ┌────────────────────────┐
          Designer ◄─┤ canonical FormDocument├─► revision + SHA-256
                     └────────────┬───────────┘
                                  │
                                  ▼
                     Deterministic Compiler / Worker
                                  │ immutable FormPlan
                   ┌──────────────┼──────────────┐
                   ▼              ▼              ▼
                React          Vue 3       Web Component
                   └──────────────┼──────────────┘
                                  │ controlled value / action
                   ┌──────────────┴──────────────────────────┐
                   ▼                                         ▼
        A3S Workflow (FormRef / durable run)      A3S Cloud (tenant / auth / data)
```

`FormDocument` contains:

```text
schema          supported JSON Schema 2020-12 subset
ui              nodes, layouts, widget keys, hints, and options
rules           pure visible / enabled / computed / validate expressions
dataSources     declarative data requests resolved by the host
actions         declarative actions resolved by the host
metadata        title, locale, ownership, and compatibility information
revision        optimistic version
digest          canonical SHA-256
```

See [Architecture](docs/architecture.md) and [Security Boundaries](docs/security.md) for the complete design.

<a id="embedding"></a>

## Embedding Boundaries for A3S Cloud and Workflow

| Integration | Contract |
| --- | --- |
| **A3S Cloud** | `createA3SCloudFormAdapter` injects organization/project/environment context, data sources, and actions. Cloud retains ownership of authorization, storage, secrets, and audit logs. |
| **Workflow node configuration** | A node pins only `FormRef { uri, revision, digest, mode: configuration }` and a validated configuration value. |
| **Durable human interaction** | A run emits an `interaction` FormRef and pauses. It resumes only after the submission matches the original revision/digest and passes schema validation. |
| **A3S Code agentic nodes** | An agent may request governed form interaction but receives no open browser, production credentials, or unbounded action channel. |

Form upgrades never mutate published workflows silently. An in-flight run is always validated against its originally pinned digest. The core compiler has no database or network dependency, so it can scale independently as a stateless task in a Worker, local process, or isolated host runtime.

Supported exports:

| Export | Purpose |
| --- | --- |
| `@a3s-lab/form/core` | Documents, compilation, validation, patches, templates, and headless state |
| `@a3s-lab/form/react` | React Designer and Renderer |
| `@a3s-lab/form/vue` | Vue 3 `v-model` adapter |
| `@a3s-lab/form/web-component` | `<a3s-form-designer>` and `<a3s-form-renderer>` |
| `@a3s-lab/form/cloud` | A3S Cloud host adapter |
| `@a3s-lab/form/workflow` | FormRef, interaction request, and submission validation |
| `@a3s-lab/form/compiler.worker.js` | Cancellable browser compiler Worker |
| `@a3s-lab/form/styles.css` | Shared A3S Office-aligned tokens, control density, and interaction states |

See the [Integration Guide](docs/integration.md) for custom node registration and React, Vue, Web Component, and host adapter examples.

<a id="agent"></a>

## Coding Agent CLI and Skill

After building the project, every `a3s-form` command emits JSON and can be composed by local coding agents such as Codex:

```bash
node dist/cli.js sample --output form.json --pretty
node dist/cli.js validate form.json --pretty
node dist/cli.js compile form.json --output plan.json --pretty
node dist/cli.js diff before.json after.json --output change.patch.json --pretty
node dist/cli.js patch form.json change.patch.json --output candidate.json --pretty
node dist/cli.js digest candidate.json
```

Recommended agent flow:

```text
validate current
  -> generate a FormPatch bound to baseRevision
  -> patch into a candidate
  -> validate the candidate
  -> provide a diff for human or host review
  -> replace the document and pin a new digest only after approval
```

The skill lives at [`skills/a3s-form`](skills/a3s-form/SKILL.md). It requires the agent to treat the CLI as the semantic authority, never infer a document by scraping the UI, and never fabricate revisions or digests.

<a id="quality"></a>

## Verifiable Quality Baseline

Current full runtime coverage:

| Metric | Coverage |
| --- | ---: |
| Statements | **99.22%** |
| Branches | **96.08%** |
| Functions | **99.01%** |
| Lines | **99.61%** |

- All 123 unit and cross-framework integration tests pass.
- The repository includes a local A3S Test flow covering Designer → Preview → validation → action.
- A3S Test is intended for local coding agents and does not upload screenshots, video, or evidence.
- CI installs locked dependencies and runs linting, type checks, coverage gates, package/CLI builds, documentation builds, and the Playground build.

```bash
bun run check
```

## GitHub Pages

Every push to `main` runs [the Pages workflow](.github/workflows/pages.yml), builds the versioned documentation and Playground, combines both static outputs, and deploys them through GitHub Actions.

- Site: <https://a3s-lab.github.io/Form/>
- Playground: <https://a3s-lab.github.io/Form/playground/>

## Repository Layout

```text
apps/playground/           runnable product workspace and form designer
apps/docs/                 versioned documentation site
src/core/                  documents, compiler, patches, expressions, state, and WASM
src/react/                 Designer, Renderer, control system, and custom node registry
src/adapters/              A3S Cloud host adapter
src/integrations/          A3S Workflow FormRef and interaction contracts
src/workers/               cancellable compiler Worker/client
skills/a3s-form/           coding agent skill
scripts/deploy.ps1         Windows build and hidden local deployment
scripts/install.sh         macOS/Linux build and local deployment
tests/                     unit, integration, and local A3S Test coverage
wasm/                      Rust source for the deterministic SHA-256 WASM module
docs/                      architecture, integration, and security references
```

## License

A3S Form is available under the [MIT License](LICENSE).
