<p align="center">
  <img src="assets/readme/hero.svg" width="100%" alt="A3S Form — an AI Native Form Designer with one versioned form contract for design and runtime rendering">
</p>

<p align="center">
  <img alt="Status: architecture incubation" src="https://img.shields.io/badge/status-architecture%20incubation-7137d8">
  <img alt="Target: JSON Schema 2020-12" src="https://img.shields.io/badge/target-JSON%20Schema%202020--12-2587f5">
  <img alt="Target: framework adapters" src="https://img.shields.io/badge/target-React%20%2F%20Vue%20%2F%20Web%20Component-3b53dc">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-101118"></a>
</p>

<p align="center">
  <strong>Design once. Render anywhere. Let AI propose changes without taking control.</strong><br>
  An embeddable, schema-driven form system for A3S Workflow, A3S Cloud, products, and coding agents.
</p>

<p align="center">
  <a href="#product-contract">Product contract</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#workflow-and-cloud-integration">Integration</a> ·
  <a href="#target-package-surface">Packages</a> ·
  <a href="#delivery-plan">Delivery plan</a>
</p>

> [!IMPORTANT]
> A3S Form is in **architecture incubation**. This README freezes the product
> contract and target package boundaries; no npm package or production Designer
> is published yet. Target capabilities are labeled explicitly below.

## Product contract

A form is more than a JSON Schema renderer. Product teams need layout,
conditional visibility, repeatable groups, data sources, actions, validation,
accessibility, localization, and an authoring experience that can be embedded
without surrendering data ownership to the component.

| Invariant | Product consequence |
| --- | --- |
| **One canonical document** | Schema, UI, rules, actions, metadata, revision, and digest travel together |
| **Designer and renderer share one compiler** | Preview and production rendering cannot silently interpret a form differently |
| **The host owns data** | A3S Form emits controlled changes; the host owns persistence, identity, authorization, submission, and side effects |
| **AI proposes typed patches** | Agents receive structured context and submit reviewable, revision-bound operations instead of scraping or driving the UI |
| **No arbitrary schema code** | Widgets, expressions, data sources, validators, and actions resolve through trusted host registries |
| **Every published form is immutable** | Revision plus canonical SHA-256 digest pins Workflow nodes, interactions, and audit history |

### Four product surfaces

| Surface | Responsibility | Status |
| --- | --- | --- |
| Form Designer | Canvas, field library, hierarchy, property inspector, responsive preview, undo/redo, diagnostics, and patch review | Architecture target |
| Form Renderer | Accessible edit/read-only rendering with controlled value, errors, locale, theme, and host callbacks | Architecture target |
| Form Compiler | Validate, normalize, resolve dependencies, detect cycles, and emit an immutable `FormPlan` | Architecture target |
| Agent interface | CLI and Skill for inspect, validate, compile, diff, and bounded patch operations | Architecture target |

The project follows the proven A3S Office composition model: a framework-free
core, thin React/Vue/Web Component adapters, one shared stylesheet, lazy heavy
surfaces, cancellable Worker computation, and host-owned persistence.

## Architecture

<p align="center">
  <img src="assets/readme/architecture.svg" width="100%" alt="A3S Form target architecture with a human and AI-assisted Designer, canonical Form Document, deterministic compiler, embeddable renderers, trusted registries, and host-owned data and actions">
</p>

The Designer and runtime Renderer never interpret raw documents independently.
Both call the same deterministic compiler and consume a versioned `FormPlan`.
Compilation can run in a cancellable Web Worker so large forms do not block the
host application.

```text
FormDocument
├── schema          JSON Schema 2020-12 data contract
├── ui              layout, widget keys, help, responsive presentation
├── rules           pure visibility, enablement, computed, and validation rules
├── dataSources     declarative host-resolved option and lookup requests
├── actions         declarative host-resolved submit and secondary actions
├── metadata        title, locale, tags, compatibility, and ownership hints
├── revision        monotonic optimistic version
└── digest          canonical SHA-256 over the publishable document
```

### Compiler pipeline

```text
parse -> structural validation -> semantic validation -> normalize
      -> dependency graph -> cycle detection -> capability check -> FormPlan
```

`FormPlan` contains only bounded rendering instructions: resolved field IDs,
layout slots, dependency order, registry keys, validation rules, and safe
expression bytecode. It contains no credentials and no executable JavaScript.

### AI-native change flow

```text
structured context -> typed FormPatch -> validate -> preview diff
                   -> human/host approval -> apply -> new revision + digest
```

Every patch carries the base revision and optional field preconditions. A
stale patch conflicts instead of overwriting a newer human edit. The same
bounded mutation contract is shared by the Designer, CLI, Skill, and future
Agent integrations.

## Workflow and Cloud integration

[A3S Workflow](https://github.com/A3S-Lab/Workflow) consumes A3S Form as an
independent component; neither repository imports the other's domain model.
Their seam is a small immutable reference:

```text
FormRef
├── uri       content-addressed document location
├── revision  published form revision
├── digest    canonical SHA-256
└── mode      configuration | interaction | read-only
```

| Integration | Contract |
| --- | --- |
| Workflow node configuration | `NodeDescriptor` points to a pinned `FormRef`; the Designer renders it and stores validated node configuration in the graph |
| Durable human interaction | A Runtime node emits a pinned interaction `FormRef`; A3S Flow suspends the run, and a validated submission resumes it |
| Agentic nodes | A3S Code can request a governed interaction, but the Agent session never receives an open browser or an unbounded form action channel |
| [A3S Cloud](https://github.com/A3S-Lab/Cloud) | Cloud embeds the Designer/Renderer, supplies tenant context and registries, and owns storage, authorization, secrets, data access, submission, and audit |

Published workflow versions keep their original form digest. Updating a form
does not mutate an already published graph; the author must review and publish
a new workflow version. Runtime submissions are validated against the exact
schema digest that opened the interaction.

The Cloud adapter is deliberately a host adapter, not a fork of the engine. It
binds organization/project/environment context, A3S Web theme tokens, typed API
clients, and Cloud actions while the Form core remains unaware of Cloud and
Workflow types.

## Target package surface

The package structure mirrors A3S Office so applications can pay only for the
surface they embed:

| Export | Target responsibility |
| --- | --- |
| `@a3s-lab/form/core` | Types, canonicalization, compiler, validation, patches, registries, and headless state |
| `@a3s-lab/form/react` | Controlled React Renderer, hooks, and lazy Designer entry point |
| `@a3s-lab/form/vue` | Vue 3 adapters with controlled `v-model` integration |
| `@a3s-lab/form/web-component` | Framework-neutral Custom Elements |
| `@a3s-lab/form/styles.css` | Shared A3S Web-aligned tokens and interaction styles |
| `a3s-form` CLI | Machine-readable validate, compile, digest, diff, and patch commands |
| `$a3s-form` Skill | Coding-agent workflow over the same bounded commands |

The intended React API is controlled by default. This is a **target API**, not
a currently published package:

```tsx
import { FormDesigner, FormRenderer } from '@a3s-lab/form/react';
import '@a3s-lab/form/styles.css';

<FormDesigner
  document={document}
  onChange={setDocument}
  widgetRegistry={widgets}
  dataSourceRegistry={dataSources}
/>

<FormRenderer
  plan={compiledPlan}
  value={value}
  onChange={setValue}
  onAction={handleAction}
/>
```

The component never performs persistence or submission implicitly. The host
decides when and where documents and values are saved.

## Security and reliability boundaries

- JSON Schema, UI definitions, and rules are treated as untrusted input.
- Expressions use a closed, pure instruction set with time and depth limits;
  `eval`, arbitrary imports, and remote component URLs are forbidden.
- Widgets, validators, data sources, and actions resolve by versioned registry
  key and advertised capability.
- Secrets remain opaque host references and are never serialized into a form
  document, plan, patch, preview, or submission.
- Compilation rejects duplicate IDs, invalid references, dependency cycles,
  unsupported vocabularies, and resource-limit violations.
- Renderer behavior is keyboard accessible, localization-aware, deterministic,
  and covered by schema fixtures, property tests, accessibility tests, and
  cross-framework contract tests.
- A3S Test drives local Designer-to-Renderer acceptance for coding agents; it
  does not require a CI evidence-upload workflow.

## Target repository map

```text
packages/form/            Public package and export map
src/core/                 Document, compiler, patches, registries, headless state
src/react/                Controlled React renderer and lazy Designer
src/vue/                  Vue adapters
src/web-component/        Custom Elements
src/designer/             Canvas, outline, inspector, preview, diagnostics
src/workers/              Cancellable compile and validation workers
apps/playground/          Chinese product playground and integration examples
cli/                      Machine-readable coding-agent CLI
skills/a3s-form/          Codex Skill and bounded authoring workflow
tests/contracts/          Cross-surface and cross-framework fixtures
docs/                     Architecture, schema, security, and integration guides
```

## Delivery plan

| Phase | Exit condition |
| --- | --- |
| **F0 — Contract** | Versioned `FormDocument`, canonical digest, compiler diagnostics, patch protocol, limits, and golden fixtures |
| **F1 — Runtime** | Accessible React Renderer, trusted widget registry, controlled value flow, Worker compilation, and host adapters |
| **F2 — Designer** | Chinese A3S Web-aligned Designer, hierarchy, inspector, preview, history, diagnostics, and reviewable AI patches |
| **F3 — Embedding** | Vue and Web Component adapters, Workflow `FormRef`, Cloud host adapter, CLI, Skill, and local A3S Test acceptance |
| **F4 — Ecosystem** | Versioned extension SDK, compatibility matrix, migrations, signed catalogs, and performance budgets |

No phase may introduce a second Workflow source of truth, a second Cloud
authorization model, or a hidden side-effect path inside the renderer.

## License

A3S Form is available under the [MIT License](LICENSE).
