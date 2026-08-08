# Embedding A3S Form

A3S Form is a controlled engine, not a page framework. A host supplies the document, value, capabilities, errors, and action handlers. The engine compiles and renders the form but does not own storage, authentication, secrets, or network policy.

## Workflow node settings

A Dify-like workflow host stores a configuration-mode `FormRef` with each node instance. The reference pins the form URI, revision, and digest. The node value remains ordinary host state.

```tsx
import { useState } from 'react';
import {
  type FieldError,
  type FormDocument,
  type FormRef,
  type JsonObject,
  FORM_LOCALE_CATALOG_API_VERSION,
} from '@a3s-lab/form/core';
import { FormRenderer } from '@a3s-lab/form/react';
import {
  createWorkflowNodeConfiguration,
  type WorkflowNodeConfiguration,
  validateWorkflowNodeConfiguration,
  verifyPinnedForm,
} from '@a3s-lab/form/workflow';
import '@a3s-lab/form/styles.css';

function NodeSettings(props: {
  document: FormDocument;
  form: FormRef;
  nodeId: string;
  initialValue: JsonObject;
  onSave: (configuration: WorkflowNodeConfiguration) => Promise<void>;
}) {
  const [value, setValue] = useState(props.initialValue);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const pinned = verifyPinnedForm(props.document, props.form);

  if (!pinned.ok) return <p role="alert">This node references another form release.</p>;

  const save = async (_actionId: string, validatedValue: JsonObject) => {
    const descriptor = createWorkflowNodeConfiguration({
      nodeType: 'llm',
      nodeId: props.nodeId,
      form: props.form,
      value: validatedValue,
      locale: 'en-US',
    });
    const resolved = validateWorkflowNodeConfiguration(pinned.document, descriptor);
    if (!resolved.ok) {
      setErrors(resolved.errors);
      return;
    }
    setErrors([]);
    await props.onSave({ ...descriptor, value: resolved.value });
  };

  return (
    <FormRenderer
      plan={pinned.plan}
      value={value}
      errors={errors.length > 0 ? errors : undefined}
      locale="en-US"
      localeCatalog={{
        apiVersion: FORM_LOCALE_CATALOG_API_VERSION,
        messages: { selectPlaceholder: 'Choose a model' },
      }}
      onChange={(next) => {
        setErrors([]);
        setValue(next);
      }}
      onAction={save}
    />
  );
}
```

The repository includes a complete, type-checked version at [`examples/dify-like-workflow-node.tsx`](../examples/dify-like-workflow-node.tsx). Its regression test proves that the host remains the value owner, a stale digest never renders, and commit returns a pinned configuration descriptor.

## Host responsibilities

The embedding host owns:

- the current value and persistence transaction;
- authentication, authorization, tenant boundaries, and secrets;
- data-source, asynchronous validation, and action implementations through `FormHostAdapter`;
- publication policy and access to the pinned `FormDocument`;
- workflow node lifecycle, undo, audit, and deployment.

A3S Form owns compilation, synchronous validation, cancellation and stable mapping for host validation, field state, accessible rendering, adapter events, and the immutable plan derived from the pinned document. The host still owns the validation service, credentials, retry policy, and server-side commit check.

Every accepted plan identifies `a3s.dev/form-schema-profile/1`. A workflow host should treat a different `schemaProfile` as an unsupported contract instead of attempting to render it. See [Schema Profile 1](schema-profile-1.md) for the keyword and format boundary.

## Framework surfaces

React is the reference runtime. Vue and Web Components expose the same host-facing configuration where it applies: controlled values, actions, external errors, locale catalogs, read-only state, host adapters, widget registries, and custom-node registries. The Designer adapters also accept compiler capabilities.

The locale catalog is host state, not form data. Keep organization wording, product terminology, and temporary copy changes outside `FormDocument`. See [Runtime localization](localization.md).

Web Components are registered explicitly:

```ts
import { defineA3SFormElements } from '@a3s-lab/form/web-component';

defineA3SFormElements();

const renderer = document.querySelector('a3s-form-renderer');
renderer.plan = plan;
renderer.value = node.configuration;
renderer.errors = hostErrors;
renderer.hostAdapter = hostAdapter;
renderer.locale = organization.locale;
renderer.localeCatalog = organization.formLocaleCatalog;
renderer.readOnly = !permissions.canEditNode;
renderer.addEventListener('value-change', (event) => updateDraft(event.detail));
renderer.addEventListener('form-action', (event) => runHostAction(event.detail));
```

See [Host-owned asynchronous validation](async-validation.md) for the `validateValue` adapter contract and [Host-owned data sources](data-sources.md) for dependency-aware option loading, search, pagination, cache isolation, and cancellation.

The compiler records each field's value, rule, and data-source dependencies in `FormPlan.nodeSubscriptions`. The React runtime uses that index to skip unrelated field renders. Event handlers and pagination still read the latest whole controlled value, so skipped renders cannot overwrite another node setting.

## CSS boundary

Import only `@a3s-lab/form/styles.css`. Its selectors stay in the `a3s-form-*` namespace and component roots; it does not ship a global preflight. The build rejects global root, document, universal, form-control, and unscoped class selectors and enforces a 120 KB raw / 20 KB gzip budget.

Theme with host-level custom properties instead of overriding internal selectors:

```css
.workflow-node-panel {
  --a3s-blue: #4f46e5;
  --a3s-panel: #ffffff;
  --a3s-line: #e5e7eb;
  --a3s-radius: 12px;
}
```
