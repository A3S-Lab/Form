# A3S Form Integration Guide

## React

```tsx
import {
  assertCompiled,
  FORM_LOCALE_CATALOG_API_VERSION,
} from '@a3s-lab/form/core';
import { FormDesigner, FormRenderer } from '@a3s-lab/form/react';
import '@a3s-lab/form/styles.css';

const plan = assertCompiled(document);

<FormDesigner
  document={document}
  value={previewValue}
  onChange={setDocument}
  onValueChange={setPreviewValue}
  onAction={handleAction}
/>

<FormRenderer
  plan={plan}
  value={value}
  errors={hostErrors}
  hostAdapter={hostAdapter}
  locale={locale}
  localeCatalog={{
    apiVersion: FORM_LOCALE_CATALOG_API_VERSION,
    messages: { selectPlaceholder: 'Choose a model' },
  }}
  readOnly={!canEdit}
  onChange={setValue}
  onAction={handleAction}
/>
```

Both components are controlled. Persist the next document or value in the host; internal component state is not a business source of truth.

## Scoped A3S UI contract

Import `@a3s-lab/form/styles.css` once. It contains the Form-specific implementation of the A3S UI 0.2.1 token contract, scoped to `.a3s-form-designer` and `.a3s-form-renderer`. It does not import Tailwind preflight, mutate `:root`, or reset host elements.

Use `--a3s-*` custom properties on a host container to theme an embedded form. Avoid overrides against internal class names.

## Dify-like workflow node configuration

The workflow host stores a controlled value and a configuration-mode `FormRef`. The form reference pins a published document by URI, revision, and digest.

```ts
import {
  createWorkflowNodeConfiguration,
  validateWorkflowNodeConfiguration,
} from '@a3s-lab/form/workflow';

const configuration = createWorkflowNodeConfiguration({
  nodeType: 'llm',
  nodeId: 'llm-7',
  form: configurationFormRef,
  value: node.configuration,
  locale: organization.locale,
  readOnly: !permissions.canEditNode,
});

const result = validateWorkflowNodeConfiguration(publishedDocument, configuration, {
  capabilities: { widgets: Object.keys(nodeRegistry) },
});

if (!result.ok) {
  showNodeErrors(result.errors);
} else {
  await workflowHost.updateNode(configuration.nodeId, {
    ...configuration,
    value: result.value,
  });
}
```

The contract has no A3S Cloud, A3S Workflow service, or Dify runtime dependency. See [Embedding A3S Form](embedding.md) and the tested [`DifyLikeWorkflowNode`](../examples/dify-like-workflow-node.tsx).

## Custom nodes

`FormNodeRegistry` keeps a business component's catalog entry, default schema, design view, inspector, and runtime view under one approved registry key. Documents store the key and JSON configuration; they never store executable JavaScript.

```tsx
import {
  defineFormNodeRegistry,
  type FormNodeDesignProps,
  type FormNodeInspectorProps,
  type FormNodeRenderProps,
} from '@a3s-lab/form/react';

const nodeRegistry = defineFormNodeRegistry({
  'company.rating': {
    kind: 'field',
    catalog: {
      section: 'business',
      sectionLabel: 'Business',
      label: 'Rating',
      description: 'Collect a score from one to five.',
      glyph: 'R',
    },
    schema: { type: 'number', minimum: 1, maximum: 5 },
    defaults: { width: 6, customProps: { maximum: 5 } },
    design: RatingDesign,
    inspector: RatingInspector,
    render: RatingNode,
  },
});

function RatingDesign({ node }: FormNodeDesignProps) {
  return <div>{node.label}: 0 / 5</div>;
}

function RatingInspector({ node, onUpdate }: FormNodeInspectorProps) {
  return (
    <input
      value={Number(node.customProps?.maximum ?? 5)}
      onChange={(event) => {
        const maximum = Number(event.target.value);
        onUpdate({ node: { customProps: { maximum } }, schema: { maximum } });
      }}
    />
  );
}

function RatingNode({ node, value, onChange }: FormNodeRenderProps) {
  return (
    <button type="button" onClick={() => onChange(5)}>
      {node.label}: {String(value ?? 0)} / 5
    </button>
  );
}
```

Pass the same registry to compilation, Designer, and Renderer. Unknown keys fail compilation.

## Vue 3

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { A3SFormRenderer } from '@a3s-lab/form/vue';

const value = ref({});
</script>

<template>
  <A3SFormRenderer
    :plan="plan"
    v-model="value"
    :errors="hostErrors"
    :host-adapter="hostAdapter"
    :locale="locale"
    :locale-catalog="localeCatalog"
    :node-registry="nodeRegistry"
    :read-only="!canEdit"
    :widget-registry="widgetRegistry"
    @action="({ actionId, value }) => handleAction(actionId, value)"
  />
</template>
```

The Vue adapter unwraps reactive proxies before passing documents, plans, values, and registries into the runtime. The Designer adapter also accepts `compileOptions` and emits `action`.

## Web Components

```ts
import { defineA3SFormElements } from '@a3s-lab/form/web-component';

defineA3SFormElements();

const renderer = document.querySelector('a3s-form-renderer');
renderer.plan = plan;
renderer.value = value;
renderer.errors = hostErrors;
renderer.hostAdapter = hostAdapter;
renderer.locale = locale;
renderer.localeCatalog = localeCatalog;
renderer.nodeRegistry = nodeRegistry;
renderer.readOnly = !canEdit;
renderer.widgetRegistry = widgetRegistry;
renderer.addEventListener('value-change', (event) => updateValue(event.detail));
renderer.addEventListener('form-action', (event) => handleAction(event.detail));
```

Registration is idempotent. Events bubble and are composed. Setting `plan` or `document` to `undefined` clears the mounted React surface.

## A3S Cloud host adapter

```ts
import { createA3SCloudFormAdapter } from '@a3s-lab/form/cloud';

const hostAdapter = createA3SCloudFormAdapter({
  context: { organizationId, projectId, environmentId, locale },
  resolveDataSource: (context, request, signal) =>
    cloud.forms.resolveOptions(context, request, signal),
  invokeAction: (context, request, signal) =>
    cloud.forms.invokeAction(context, request, signal),
});
```

The adapter binds context only. Authorization, tenant isolation, rate limits, storage, secrets, and audit remain Cloud responsibilities.

## Dynamic option sources

`FormHostAdapter.resolveDataSource` accepts the source definition, the current controlled value, locale, optional search query and cursor, and a cancellation signal. It may return a legacy `UiOption[]` or a paginated `{ options, nextCursor? }` page.

Declare only the value paths that affect a source in `dependencies`. The Renderer then avoids refetching after unrelated edits, cancels work after dependency changes, and deduplicates matching requests within the current embedded instance. Search, focus triggers, TTL caching, pagination, and failure states use the same contract in React, Vue, and Web Components.

See [Host-owned data sources](data-sources.md) for the complete contract and security boundary.

## Durable workflow interactions

```ts
import {
  createInteractionRequest,
  validateInteractionSubmission,
} from '@a3s-lab/form/workflow';

const request = createInteractionRequest(runId, nodeId, interactionFormRef, {
  initialValue,
  expiresAt,
});

const result = validateInteractionSubmission(publishedDocument, submission);
```

An in-flight run is always validated against its original revision and digest, even after a newer form release is published.

## CLI and coding-agent skill

```bash
node dist/cli.js sample --output form.json --pretty
node dist/cli.js validate form.json --pretty
node dist/cli.js compile form.json --output plan.json --pretty
node dist/cli.js diff before.json after.json --output change.patch.json --pretty
node dist/cli.js patch form.json change.patch.json --output candidate.json --pretty
```

The `$a3s-form` skill uses the CLI for validation and revision-bound patches. It does not infer a document by scraping Designer DOM.

## Compiler Worker

```ts
import { FormCompilerClient } from '@a3s-lab/form';

const worker = new Worker(new URL('@a3s-lab/form/compiler.worker.js', import.meta.url), {
  type: 'module',
});
const compiler = new FormCompilerClient(worker);
const result = await compiler.compile(document, options, abortSignal);
compiler.dispose();
```

Each request has a unique ID. Cancellation and disposal reject the matching promise and ignore stale Worker responses.
