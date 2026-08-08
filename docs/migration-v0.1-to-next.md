# Migrating from v0.1 to the `next` Runtime

The `next` line tightens contracts that v0.1 treated permissively. Migrate and compile documents in a test environment before pinning a new digest in workflow nodes or durable interactions.

## Migration checklist

1. Compile every document against Schema Profile 1. Remove unsupported JSON Schema keywords instead of relying on them being ignored.
2. Review every `computed` rule. The runtime now evaluates it, removes stale outputs after dependency failures, and includes the derived value in validation and actions.
3. Move remote option loading behind `FormHostAdapter.resolveDataSource`. Declare dependencies, triggers, cache TTL, search, and pagination in the document; keep credentials in the host.
4. Move business validation behind `FormHostAdapter.validateValue` and return stable issue codes and concrete field paths.
5. Import only `@a3s-lab/form/styles.css`. Remove assumptions about global resets or document-level tokens.
6. Pass locale overrides as `a3s.dev/form-locale-catalog/v1` host state rather than serializing product copy into documents.
7. For object arrays, replace JSON widgets with [repeatable field groups](repeatable-field-groups.md) without changing the stored value shape.

## Repeater identity changes

Primitive repeaters remain compatible. Object repeaters use runtime-owned keys by default and do not add metadata to values. If an older custom renderer inserted `_id`, `rowId`, or a similar engine-only property, remove it from new workflow-node values unless it is a real business field.

Use `identifyRepeaterItem` to derive stable identity during controlled external replacements. Declare `UiNode.itemKey` only when the item schema already owns a required string identifier and persistence of that identifier is intentional.

## Compatibility and publication

Document digests change after normalization or contract edits. Publish a new form revision and update configuration-mode `FormRef` values explicitly. Existing workflow nodes and in-flight interactions remain pinned to their original revision and digest; never rewrite those references in place.

Run the complete package check before publication:

```bash
bun run check
```

The check covers formatting rules, type contracts, coverage, builds, runtime performance, embedding isolation, the CLI, Playground, and Rspress documentation.
