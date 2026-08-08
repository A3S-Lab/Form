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
