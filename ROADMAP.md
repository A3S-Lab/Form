# A3S Form Product Roadmap

A3S Form is a governed form engine for AI-native products. People and agents edit the same versioned contract, the compiler remains the semantic authority, and production side effects stay behind host-owned capabilities.

This roadmap describes product outcomes and release gates. It does not assign calendar dates. A milestone is complete only when its acceptance criteria pass in code, tests, documentation, and the reference Playground.

## Product Scope

| Capability layer | A3S Form owns | Host platform owns |
| --- | --- | --- |
| **Form Core** | Schema profile, compilation, rules, validation, immutable plans, patches, revisions, and digests | Durable storage and distributed coordination |
| **Runtime** | Field state, rendering contracts, layouts, data-source and action ports, accessibility, and localization | Identity, authorization, secrets, network policy, and side effects |
| **Studio** | Visual design, preview, rule and integration configuration, diagnostics, and change review | Organization-specific catalogs and publishing policy |
| **Governance** | Draft/release contracts, diffs, provenance, approval hooks, and audit events | User directory, RBAC decisions, retention, and compliance storage |
| **Agent interface** | Inspect, propose, patch, simulate, validate, test, and publish request contracts | Model access, credentials, approval decisions, and execution policy |
| **Product services** | Stable integration contracts | Submissions, files, payments, email, webhooks, analytics, PDF generation, and connectors through A3S Cloud or A3S Workflow |

## Product Principles

1. **One semantic authority.** Designer, Renderer, CLI, Worker, and agents must use the same compiler and validation behavior.
2. **No silent support.** Every accepted schema keyword and rule kind must have defined runtime semantics. Unsupported input fails with an actionable diagnostic.
3. **No arbitrary code in documents.** Form definitions use bounded expressions and host-approved registry keys, never embedded JavaScript.
4. **Controlled data and side effects.** Values, persistence, credentials, authorization, and external actions remain host-owned.
5. **Reviewable agent changes.** Agents propose revision-bound patches. Simulation, policy checks, and approval precede publication.
6. **Complexity must be measurable.** Large-form performance, accessibility, browser parity, and migration compatibility are release gates.

## v0.1 — Contract Foundation (Current)

The current release proves the architecture and embedding model:

- versioned `FormDocument`, deterministic compiler, immutable `FormPlan`, canonical SHA-256 digest, and bounded input limits;
- visual Designer with a component catalog, structure tree, nested layouts, drag and drop, preview, undo/redo, and custom-node registration;
- controlled React Renderer with native fields, layouts, primitive repeaters, validation summaries, host-resolved option sources, and host actions;
- React, React-backed Vue, and Web Component adapters;
- A3S Cloud and A3S Workflow contracts with revision and digest pinning;
- revision-bound `FormPatch`, JSON CLI, compiler Worker, and the `$a3s-form` coding-agent skill;
- browser-local Playground workspace and import/export flow.

Known boundaries are intentional roadmap inputs, not completed capabilities:

- the accepted JSON Schema 2020-12 subset is not yet enforced as a closed profile, so some unsupported keywords can be accepted without runtime validation;
- `visible`, `enabled`, and `validate` rules run today; `computed` exists in the protocol but does not yet have runtime evaluation semantics;
- data sources resolve option arrays, but dependency triggers, cache TTL, pagination, and first-class loading/error state are not implemented;
- repeaters contain primitive values rather than nested field groups;
- the runtime does not yet provide field-level subscriptions or a large-form performance contract;
- locale metadata does not yet provide complete translated content and runtime messages;
- local Playground persistence is not a draft, release, collaboration, or offline-sync service.

## v0.2 — Runtime Integrity

**Outcome:** every accepted contract feature behaves consistently in the compiler, browser runtime, Worker, CLI, and server-side validation.

### Planned capabilities

- Publish **A3S Form Schema Profile 1** with an explicit keyword allowlist, canonical semantics, conformance fixtures, and diagnostics for every unsupported keyword.
- Complete the rule runtime for `visible`, `enabled`, `computed`, and `validate`, including deterministic dependency evaluation, cycle diagnostics, and an inspectable execution trace.
- Add cancellable field-level and form-level asynchronous validation with stable server-error mapping.
- Implement data-source dependencies and triggers, `cacheTtlMs`, request deduplication, debounce, cancellation, search, pagination, and loading/empty/error/retry states.
- Introduce field-level subscriptions and incremental rule evaluation so unrelated edits do not rerender or refetch unrelated nodes.
- Replace hard-coded runtime messages with versioned locale catalogs and host overrides.
- Publish repeatable compiler, validation, and render benchmarks for 100, 500, and 1,000-node documents.

### Exit criteria

- Every schema keyword accepted by the compiler has browser/server validation parity; every other keyword is rejected.
- Computed-rule chains and rule failures have deterministic integration coverage.
- Editing an unrelated field neither refetches an independent data source nor rerenders unaffected field components.
- Request cancellation, stale responses, async validation races, and host failures have regression coverage.
- The performance suite runs in CI with an explicit regression budget.

## v0.3 — Complex Forms and Complete Studio

**Outcome:** product teams can author mainstream operational forms without raw JSON or application-specific forks.

### Planned capabilities

- First-class nested objects, nested arrays, repeatable field groups, data grids, edit grids, matrices, stable row identity, and row reordering.
- Real multi-page forms and wizards with branching, progress, previous/next navigation, page validation, review steps, and resumable checkpoints.
- Expanded built-in field set: URL, phone, date-time, time, multi-select, tags, currency, rating, slider, hidden, and calculated display.
- Audited official extensions for file upload, signature, address lookup, rich text, and CAPTCHA where host services or security policy are required.
- Visual editors for conditions, calculations, validation rules, data sources, actions, and payload mappings.
- Rule dependency visualization, sample-data simulation, execution tracing, and compiler diagnostics linked back to the relevant Studio control.
- Reusable fragments, nested form references, templates, design tokens, and theme configuration.
- Localized labels, descriptions, options, and validation messages with RTL support.
- Framework adapter parity and documented bundle/runtime budgets for React, Vue, and Web Components.
- WCAG 2.2 AA interaction baseline with automated accessibility and keyboard regression coverage.

### Exit criteria

- Onboarding, approval, order-entry, inspection, and survey reference forms can be built without editing raw JSON.
- A branched wizard can be paused and resumed without losing page or validation state.
- Complex array rows retain identity and field state through insert, move, and delete operations.
- All first-party fields pass the localization, keyboard, screen-reader semantics, and validation matrix.
- Visual rule configuration round-trips through the canonical document without semantic loss.

## v0.4 — Lifecycle, Collaboration, and Governance

**Outcome:** teams can safely evolve forms across environments while preserving history, active submissions, and policy decisions.

### Planned capabilities

- Separate mutable `FormDraft` from immutable `FormRelease`, with explicit publication and compatibility metadata.
- Version history with actor, timestamp, change note, structured diff, restore, rollback, and digest-pinned submission rendering.
- Environment promotion and approval hooks for development, test, and production.
- Host-neutral collaboration contracts for presence, locks, patch rebasing, and explicit conflict review. Realtime transport remains host-owned.
- Autosave, durable resume tokens, offline queues, idempotent synchronization, and conflict handling.
- Audit-event and policy-decision contracts for design, review, publish, data access, and action execution.
- PII classification, redaction hints, retention metadata, signed release artifacts, and version-pinned component/data-source registries.
- Migration tooling for standard JSON Schema plus supported Form.io, SurveyJS, and Formily subsets.

### Exit criteria

- Concurrent edits are either merged without loss or presented as explicit, reviewable conflicts.
- Restore and rollback create new history and never mutate an existing release.
- A submission can always render against its original form digest after later releases.
- Offline changes synchronize idempotently and never overwrite a newer draft silently.
- Every publish and privileged host action emits a complete, attributable audit event.

## v1.0 — AI-Native Production Contract

**Outcome:** A3S Form becomes the stable form contract shared by people, coding agents, A3S Cloud, and A3S Workflow.

### Planned capabilities

- Stable v1 document, plan, patch, interaction, and release contracts with compatibility policy and migration tooling.
- Agent tools for `inspect`, `propose`, `diff`, `simulate`, `validate`, `test`, and policy-bound `publish` requests.
- Natural-language requests converted into bounded patches with a visual diff, rule explanation, risk report, generated fixtures, and regression tests.
- Change provenance covering actor, agent, model, reason, source revision, policy result, reviewer, and release digest.
- Reference A3S Cloud lifecycle integration for drafts, releases, permissions, audit, submissions, files, and analytics.
- Reference A3S Workflow integration for durable human tasks, approvals, timeouts, retries, and digest-pinned resumptions.
- Published conformance suite for third-party renderers, registries, host adapters, and migration tools.

### Exit criteria

- No v1 contract changes ship without a compatibility decision and migration path.
- An agent cannot publish or invoke privileged capabilities without an explicit host policy decision.
- Human and agent edits use the same compiler, simulation, test, review, and release path.
- The reference Cloud and Workflow integrations pass lifecycle, security, accessibility, performance, and recovery suites.

## Explicit Non-Goals

- A3S Form Core will not execute arbitrary JavaScript stored in a form document.
- A3S Form Core will not become a second identity, authorization, secrets, payment, submission, or analytics platform.
- The package will not claim full JSON Schema compatibility while unsupported keywords are ignored.
- Tabs will not be marketed as a replacement for a true multi-page or wizard runtime.
- Browser `localStorage` will not be presented as enterprise persistence, collaboration, or offline synchronization.

## Release Gates

Every milestone must include:

- focused unit and integration tests for modified behavior;
- browser and server conformance fixtures for shared semantics;
- A3S Test coverage for critical Designer-to-runtime workflows;
- accessibility, keyboard, performance, and failure-state checks appropriate to the milestone;
- security-boundary review for every new registry, data source, action, file, or agent capability;
- documentation, runnable examples, and migration notes before a capability is marked stable.
