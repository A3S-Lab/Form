# A3S Form contract reference

## Canonical document

```json
{
  "kind": "a3s.form",
  "apiVersion": "a3s.dev/form/v1alpha1",
  "schema": { "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object" },
  "ui": { "root": "root", "nodes": [] },
  "rules": [],
  "dataSources": [],
  "actions": [],
  "metadata": { "title": "表单", "locale": "zh-CN" },
  "revision": 0,
  "digest": "sha256:..."
}
```

`digest` is canonical SHA-256 over the publishable document without the digest field. Never calculate or edit it manually.

## UI nodes

Supported kinds are `root`, `section`, `group`, `field`, `repeater`, and `content`. Layout nodes reference children by stable ID. Field and repeater nodes bind a JSON Schema property through a JSON Pointer such as `/properties/profile/properties/name`.

Built-in widget keys are `text`, `textarea`, `number`, `select`, `radio`, `checkbox`, `switch`, `date`, `email`, and `password`. Custom keys require a trusted host registry.

## Pure expressions

- Values: `{ "op": "literal", "value": ... }`, `{ "op": "field", "path": "profile.name" }`
- Unary: `not`, `exists`
- Collections: `all`, `any`, `coalesce`, `concat`
- Binary: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `in`, `add`, `subtract`, `multiply`, `divide`
- Branch: `if` with `condition`, `whenTrue`, and `whenFalse`

Rules use `visible`, `enabled`, `computed`, or `validate` and target a node ID. Computed rules target value-bearing nodes, run in compiler-defined dependency order, and fail closed by removing stale dependent outputs. Expressions cannot execute JavaScript or import modules.

## Typed patch

```json
{
  "apiVersion": "a3s.dev/form-patch/v1alpha1",
  "baseRevision": 3,
  "description": "Rename the contact field",
  "preconditions": [
    { "path": "/ui/nodes/1/label", "equals": "联系人" }
  ],
  "operations": [
    { "op": "set", "path": "/ui/nodes/1/label", "value": "主要联系人" }
  ]
}
```

Operations are:

- `set`: replace or add an object property at `path`.
- `remove`: remove an existing property or array member.
- `insert`: insert `value` at `index` into the array at `path`.
- `move`: remove the value at `from` and insert it into the array at `path`, optionally at `index`.

A revision mismatch, failed precondition, unsafe pointer, invalid reference, cycle, unsupported capability, or resource-limit violation rejects the entire patch atomically.

## Integration reference

Use a pinned reference only after validation:

```json
{
  "uri": "a3s://forms/customer-onboarding",
  "revision": 4,
  "digest": "sha256:...",
  "mode": "configuration"
}
```

Modes are `configuration`, `interaction`, and `read-only`. The host owns storage, identity, authorization, data sources, submission, and audit.

## Host validation

`FormHostAdapter.validateValue` receives a cloned value, the immutable plan, locale, trigger, and either a field or form scope. It returns `{ "issues": [{ "path": "field", "code": "stable_code", "message": "..." }] }`. Codes map to `async.<code>`. Do not put endpoints, credentials, or executable validation logic in `FormDocument`.

Field validation runs on blur. Form validation runs before a primary submit action. A controlled value change aborts pending work, and late responses must not update the current form. Protected business rules must run again inside the host's server-side commit transaction.

## Host data sources

Data-source definitions use a stable `id` and host-approved `registryKey`. Optional controls are `parameters`, declared `dependencies`, `trigger` (`mount` or `focus`), `searchable`, `debounceMs`, `pageSize`, and `cacheTtlMs`. A UI node references the definition through `dataSource`.

Do not put URLs, tokens, headers, or executable resolver logic in a document. The host resolver owns authorization and may return `UiOption[]` or `{ "options": [...], "nextCursor": "..." }`. Dependency paths must exist in the schema; unrelated value paths must not be added merely to force broad refreshes.
