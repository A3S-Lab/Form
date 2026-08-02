import { type ReactNode, useMemo, useState } from 'react';
import {
  applyFormPatch,
  type CompileOptions,
  compileForm,
  type FormDocument,
  type FormPatch,
  type JsonObject,
  type JsonSchema,
  schemaPointerToValuePath,
  type UiNode,
} from '../core';
import { type CanvasDropTarget, catalogDragType, DesignerCanvas } from './designer-canvas';
import {
  createDesignerCatalog,
  type DesignerCatalogItem,
  type DesignerCatalogSection,
  fieldWidgets,
  findCatalogItem,
} from './designer-catalog';
import type { FormNodeRegistry } from './node-registry';
import { FormRenderer, type FormRendererProps, type FormWidgetRegistry } from './renderer';
import { SelectControl } from './select-control';

export interface FormDesignerProps {
  document: FormDocument;
  onChange: (document: FormDocument) => void;
  widgetRegistry?: FormWidgetRegistry;
  nodeRegistry?: FormNodeRegistry;
  compileOptions?: CompileOptions;
  value?: JsonObject;
  onValueChange?: (value: JsonObject) => void;
  onAction?: FormRendererProps['onAction'];
  hostAdapter?: FormRendererProps['hostAdapter'];
  errors?: FormRendererProps['errors'];
  readOnly?: boolean;
  locale?: string;
  className?: string;
}

type LeftPanel = 'components' | 'outline';
type InspectorPanel = 'properties' | 'validation' | 'advanced';

function allocateId(existing: Set<string>, prefix: string): string {
  let index = 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  const id = `${prefix}-${index}`;
  existing.add(id);
  return id;
}

function nextId(document: FormDocument, prefix: string): string {
  return allocateId(new Set(document.ui.nodes.map((node) => node.id)), prefix);
}

function isContainer(node: UiNode | undefined): node is UiNode {
  return Boolean(node && !['field', 'repeater', 'content'].includes(node.kind));
}

function insertionContainer(document: FormDocument, selectedId: string): UiNode | undefined {
  const selected = document.ui.nodes.find((node) => node.id === selectedId);
  if (isContainer(selected)) {
    if (
      selected.layout === 'columns' ||
      selected.layout === 'tabs' ||
      selected.layout === 'collapse'
    ) {
      return document.ui.nodes.find((node) => node.id === selected.children?.[0]);
    }
    return selected;
  }
  return findParent(document, selectedId);
}

function compileMutation(
  document: FormDocument,
  mutate: (draft: FormDocument) => void,
  options?: CompileOptions,
): FormDocument | undefined {
  const draft = structuredClone(document);
  mutate(draft);
  draft.revision += 1;
  delete draft.digest;
  const result = compileForm(draft, options);
  return result.ok ? result.document : undefined;
}

function collectDescendants(
  document: FormDocument,
  id: string,
  output = new Set<string>(),
): Set<string> {
  if (output.has(id)) return output;
  output.add(id);
  for (const child of document.ui.nodes.find((node) => node.id === id)?.children ?? [])
    collectDescendants(document, child, output);
  return output;
}

function findParent(document: FormDocument, id: string): UiNode | undefined {
  return document.ui.nodes.find((node) => node.children?.includes(id));
}

function propertyFromNode(node: UiNode | undefined): string | undefined {
  return node?.schemaPath ? schemaPointerToValuePath(node.schemaPath)?.split('.')[0] : undefined;
}

export function FormDesigner(props: FormDesignerProps) {
  const { document, onChange } = props;
  const compileOptions = useMemo<CompileOptions>(() => {
    const configuredWidgets = Array.from(props.compileOptions?.capabilities?.widgets ?? []);
    return {
      ...props.compileOptions,
      capabilities: {
        ...props.compileOptions?.capabilities,
        widgets: [
          ...configuredWidgets,
          ...Object.keys(props.widgetRegistry ?? {}),
          ...Object.keys(props.nodeRegistry ?? {}),
        ],
      },
    };
  }, [props.compileOptions, props.nodeRegistry, props.widgetRegistry]);
  const compiled = useMemo(() => compileForm(document, compileOptions), [compileOptions, document]);
  const catalog = useMemo(() => createDesignerCatalog(props.nodeRegistry), [props.nodeRegistry]);
  const availableFieldWidgets = useMemo(() => fieldWidgets(catalog), [catalog]);
  const [selectedId, setSelectedId] = useState(
    () =>
      (document.ui.nodes.some((node) => node.id === document.ui.root)
        ? document.ui.nodes.find((node) => node.kind === 'field')?.id
        : undefined) ?? document.ui.root,
  );
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('components');
  const [inspectorPanel, setInspectorPanel] = useState<InspectorPanel>('properties');
  const [value, setValue] = useState<JsonObject>({});
  const [undoStack, setUndoStack] = useState<FormDocument[]>([]);
  const [redoStack, setRedoStack] = useState<FormDocument[]>([]);
  const [patchText, setPatchText] = useState('');
  const [patchMessage, setPatchMessage] = useState('');
  const activeValue = props.value ?? value;
  const selected = document.ui.nodes.find((node) => node.id === selectedId);
  const selectedProperty = propertyFromNode(selected);
  const selectedSchema = selectedProperty
    ? document.schema.properties?.[selectedProperty]
    : undefined;
  const mutateDocument = (mutate: (draft: FormDocument) => void) =>
    compileMutation(document, mutate, compileOptions);

  const commit = (next: FormDocument | undefined, nextSelectedId?: string) => {
    if (!next) return;
    setUndoStack((items) => [...items.slice(-49), document]);
    setRedoStack([]);
    onChange(next);
    if (nextSelectedId) setSelectedId(nextSelectedId);
  };

  const addCatalogItem = (item: DesignerCatalogItem, target?: CanvasDropTarget) => {
    const existingIds = new Set(document.ui.nodes.map((node) => node.id));
    const prefix = item.extensionKey
      ? 'custom'
      : item.kind === 'field' || item.kind === 'repeater'
        ? 'field'
        : item.kind;
    const nodeId = allocateId(existingIds, prefix);
    const property = nodeId.replaceAll('-', '_');
    const next = mutateDocument((draft) => {
      const nodes: UiNode[] = [];
      if (item.extensionKey) {
        const defaults = structuredClone(item.defaults ?? {});
        const bindsValue = item.kind === 'field' || item.kind === 'repeater';
        if (bindsValue) {
          draft.schema.type = 'object';
          draft.schema.properties ??= {};
          draft.schema.properties[property] = {
            ...structuredClone(item.schema ?? {}),
            title: item.label,
          };
        }
        nodes.push({
          ...defaults,
          id: nodeId,
          kind: item.kind,
          label: item.label,
          schemaPath: bindsValue ? `/properties/${property}` : undefined,
          widget: item.extensionKey,
          children:
            item.kind === 'section' || item.kind === 'group'
              ? (defaults.children ?? [])
              : defaults.children,
          width: defaults.width ?? 12,
        });
      } else if (item.kind === 'field' || item.kind === 'repeater') {
        draft.schema.type = 'object';
        draft.schema.properties ??= {};
        draft.schema.properties[property] = {
          ...structuredClone(item.schema ?? {}),
          title: item.label,
        };
        nodes.push({
          id: nodeId,
          kind: item.kind,
          label: item.label,
          schemaPath: `/properties/${property}`,
          widget: item.widget,
          options: item.options ? structuredClone(item.options) : undefined,
          width: 12,
        });
      } else if (item.kind === 'content') {
        nodes.push({
          id: nodeId,
          kind: 'content',
          label: item.label,
          content: item.preset === 'divider' ? '' : '在这里添加说明文字。',
          presentation:
            item.preset === 'divider' || item.preset === 'spacer' ? item.preset : 'text',
          gap: item.preset === 'spacer' ? 24 : undefined,
          width: 12,
        });
      } else {
        const layout =
          item.preset === 'card'
            ? 'card'
            : item.preset === 'columns-2' || item.preset === 'columns-3'
              ? 'columns'
              : item.preset === 'tabs' || item.preset === 'collapse'
                ? item.preset
                : 'grid';
        nodes.push({
          id: nodeId,
          kind: item.kind,
          label: item.label,
          layout,
          columns: 12,
          gap: 16,
          children: [],
          width: 12,
        });
        const columnCount = item.preset === 'columns-2' ? 2 : item.preset === 'columns-3' ? 3 : 0;
        for (let index = 0; index < columnCount; index += 1) {
          const columnId = allocateId(existingIds, 'column');
          nodes.push({
            id: columnId,
            kind: 'group',
            label: `第 ${index + 1} 栏`,
            layout: 'flow',
            columns: 12,
            gap: 12,
            children: [],
            width: columnCount === 2 ? 6 : 4,
          });
          nodes[0].children?.push(columnId);
        }
        if (item.preset === 'tabs' || item.preset === 'collapse') {
          for (let index = 0; index < 2; index += 1) {
            const childId = allocateId(existingIds, item.preset === 'tabs' ? 'tab' : 'panel');
            nodes.push({
              id: childId,
              kind: 'group',
              label: `${item.preset === 'tabs' ? '标签页' : '面板'} ${index + 1}`,
              layout: item.preset === 'tabs' ? 'tab' : 'collapse-panel',
              columns: 12,
              gap: 12,
              children: [],
              width: 12,
            });
            nodes[0].children?.push(childId);
          }
        }
      }
      draft.ui.nodes.push(...nodes);

      const parent = target
        ? draft.ui.nodes.find((node) => node.id === target.containerId)
        : (insertionContainer(draft, selectedId) ??
          draft.ui.nodes.find((node) => node.id === draft.ui.root));
      if (!isContainer(parent)) return;
      parent.children ??= [];
      const selectedIndex = parent.children.indexOf(selectedId);
      const fallbackIndex = selectedIndex >= 0 ? selectedIndex + 1 : parent.children.length;
      const index = Math.max(0, Math.min(target?.index ?? fallbackIndex, parent.children.length));
      parent.children.splice(index, 0, nodeId);
    });
    commit(next, nodeId);
    setInspectorPanel('properties');
  };

  const updateSelected = (changes: Partial<UiNode>) => {
    commit(
      mutateDocument((draft) => {
        const index = draft.ui.nodes.findIndex((node) => node.id === selectedId);
        if (index >= 0) draft.ui.nodes[index] = { ...draft.ui.nodes[index], ...changes };
      }),
    );
  };

  const updateMetadata = (changes: Partial<FormDocument['metadata']>) => {
    commit(
      mutateDocument((draft) => {
        draft.metadata = { ...draft.metadata, ...changes };
      }),
    );
  };

  const updateSchema = (changes: Partial<JsonSchema>) => {
    if (!selectedProperty) return;
    commit(
      mutateDocument((draft) => {
        const properties = draft.schema.properties;
        const schema = properties?.[selectedProperty];
        if (properties && schema) properties[selectedProperty] = { ...schema, ...changes };
      }),
    );
  };

  const updateCustomNode = (changes: { node?: Partial<UiNode>; schema?: Partial<JsonSchema> }) => {
    if (!changes.node && !changes.schema) return;
    commit(
      mutateDocument((draft) => {
        if (changes.node) {
          const index = draft.ui.nodes.findIndex((node) => node.id === selectedId);
          if (index >= 0) draft.ui.nodes[index] = { ...draft.ui.nodes[index], ...changes.node };
        }
        if (changes.schema && selectedProperty) {
          const properties = draft.schema.properties;
          const schema = properties?.[selectedProperty];
          if (properties && schema) {
            properties[selectedProperty] = { ...schema, ...changes.schema };
          }
        }
      }),
    );
  };

  const setRequired = (required: boolean) => {
    if (!selectedProperty) return;
    commit(
      mutateDocument((draft) => {
        const requirements = new Set(draft.schema.required ?? []);
        if (required) requirements.add(selectedProperty);
        else requirements.delete(selectedProperty);
        draft.schema.required = [...requirements];
      }),
    );
  };

  const updateOptions = (text: string) => {
    const labels = text
      .split('\n')
      .map((label) => label.trim())
      .filter(Boolean);
    const options = labels.map((label, index) => ({ label, value: `option-${index + 1}` }));
    commit(
      mutateDocument((draft) => {
        const node = draft.ui.nodes.find((candidate) => candidate.id === selectedId);
        if (node) node.options = options;
        if (selectedProperty && draft.schema.properties?.[selectedProperty]) {
          draft.schema.properties[selectedProperty].enum = options.map((option) => option.value);
        }
      }),
    );
  };

  const removeSelected = () => {
    if (!selected || selected.id === document.ui.root) return;
    const currentParent = findParent(document, selected.id);
    if (
      (currentParent?.layout === 'tabs' || currentParent?.layout === 'collapse') &&
      (currentParent.children?.length ?? 0) <= 1
    )
      return;
    const parentId = currentParent?.id ?? document.ui.root;
    const removed = collectDescendants(document, selected.id);
    const next = mutateDocument((draft) => {
      draft.ui.nodes = draft.ui.nodes
        .filter((node) => !removed.has(node.id))
        .map((node) => ({ ...node, children: node.children?.filter((id) => !removed.has(id)) }));
      for (const id of removed) {
        const property = propertyFromNode(
          document.ui.nodes.find((candidate) => candidate.id === id),
        );
        if (property && draft.schema.properties) delete draft.schema.properties[property];
        if (property)
          draft.schema.required = draft.schema.required?.filter((item) => item !== property);
      }
      draft.rules = draft.rules?.filter((rule) => !removed.has(rule.target));
    });
    commit(next, parentId);
  };

  const duplicateSelected = () => {
    if (!selected || selected.id === document.ui.root) return;
    const sourceIds = [...collectDescendants(document, selected.id)];
    const existingIds = new Set(document.ui.nodes.map((node) => node.id));
    const idMap = new Map<string, string>();
    for (const id of sourceIds) {
      const source = document.ui.nodes.find((node) => node.id === id);
      const prefix =
        source?.kind === 'field' || source?.kind === 'repeater'
          ? 'field'
          : (source?.kind ?? 'node');
      idMap.set(id, allocateId(existingIds, prefix));
    }
    const nodeId = idMap.get(selected.id);
    if (!nodeId) return;
    const next = mutateDocument((draft) => {
      draft.schema.properties ??= {};
      const existingProperties = new Set(Object.keys(draft.schema.properties));
      const clones: UiNode[] = [];
      for (const sourceId of sourceIds) {
        const source = document.ui.nodes.find((node) => node.id === sourceId);
        const cloneId = idMap.get(sourceId);
        if (!source || !cloneId) continue;
        const clone: UiNode = {
          ...structuredClone(source),
          id: cloneId,
          label: sourceId === selected.id ? `${source.label ?? '节点'} 副本` : source.label,
          children: source.children?.map((child) => idMap.get(child) ?? child),
        };
        const sourceProperty = propertyFromNode(source);
        if (sourceProperty) {
          let property = `${sourceProperty}_copy`;
          let suffix = 2;
          while (existingProperties.has(property)) {
            property = `${sourceProperty}_copy_${suffix}`;
            suffix += 1;
          }
          existingProperties.add(property);
          const sourceSchema = document.schema.properties?.[sourceProperty];
          if (sourceSchema) draft.schema.properties[property] = structuredClone(sourceSchema);
          clone.schemaPath = `/properties/${property}`;
          if (document.schema.required?.includes(sourceProperty)) {
            draft.schema.required ??= [];
            draft.schema.required.push(property);
          }
        }
        clones.push(clone);
      }
      draft.ui.nodes.push(...clones);
      const parent = findParent(draft, selected.id);
      const childIndex = parent?.children?.indexOf(selected.id) ?? -1;
      parent?.children?.splice(childIndex + 1, 0, nodeId);
    });
    commit(next, nodeId);
  };

  const addLayoutItem = () => {
    if (!selected || (selected.layout !== 'tabs' && selected.layout !== 'collapse')) return;
    const prefix = selected.layout === 'tabs' ? 'tab' : 'panel';
    const nodeId = nextId(document, prefix);
    const itemNumber = (selected.children?.length ?? 0) + 1;
    const next = mutateDocument((draft) => {
      const container = draft.ui.nodes.find((node) => node.id === selected.id);
      if (!container) return;
      container.children ??= [];
      container.children.push(nodeId);
      draft.ui.nodes.push({
        id: nodeId,
        kind: 'group',
        label: `${selected.layout === 'tabs' ? '标签页' : '面板'} ${itemNumber}`,
        layout: selected.layout === 'tabs' ? 'tab' : 'collapse-panel',
        columns: 12,
        gap: 12,
        children: [],
        width: 12,
      });
    });
    commit(next, nodeId);
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selected) return;
    commit(
      mutateDocument((draft) => {
        const parent = findParent(draft, selected.id);
        const index = parent?.children?.indexOf(selected.id) ?? -1;
        const target = index + direction;
        if (!parent?.children || index < 0 || target < 0 || target >= parent.children.length)
          return;
        [parent.children[index], parent.children[target]] = [
          parent.children[target],
          parent.children[index],
        ];
      }),
    );
  };

  const moveNodeToContainer = (nodeId: string, target: CanvasDropTarget) => {
    if (nodeId === document.ui.root || nodeId === target.containerId) return;
    const descendants = collectDescendants(document, nodeId);
    if (descendants.has(target.containerId)) return;
    const sourceParent = findParent(document, nodeId);
    const sourceIndex = sourceParent?.children?.indexOf(nodeId) ?? -1;
    commit(
      mutateDocument((draft) => {
        const container = draft.ui.nodes.find((node) => node.id === target.containerId);
        if (!isContainer(container)) return;
        for (const node of draft.ui.nodes)
          node.children = node.children?.filter((child) => child !== nodeId);
        container.children ??= [];
        const adjustment = sourceParent?.id === container.id && sourceIndex < target.index ? -1 : 0;
        const index = Math.max(0, Math.min(target.index + adjustment, container.children.length));
        container.children.splice(index, 0, nodeId);
      }),
      nodeId,
    );
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items, document]);
    onChange(previous);
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items, document]);
    onChange(next);
  };

  const reviewPatch = () => {
    try {
      const patch = JSON.parse(patchText) as FormPatch;
      const result = applyFormPatch(document, patch, compileOptions);
      if (result.ok) {
        commit(result.document);
        setPatchMessage(
          `已应用 ${patch.operations.length} 项受控变更，新 revision 为 ${result.document.revision}。`,
        );
      } else setPatchMessage(result.conflicts.map((item) => item.message).join(' '));
    } catch {
      setPatchMessage('补丁不是有效 JSON，请检查后重试。');
    }
  };

  const updateValue = (next: JsonObject) => {
    setValue(next);
    props.onValueChange?.(next);
  };

  return (
    <div className={`a3s-form-designer ${props.className ?? ''}`} data-testid="form-designer">
      <DesignerToolbar
        mode={mode}
        viewport={viewport}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        compiled={compiled.ok}
        onModeChange={setMode}
        onViewportChange={setViewport}
        onUndo={undo}
        onRedo={redo}
      />
      <div className="a3s-form-designer-main">
        <PalettePanel
          document={document}
          catalog={catalog}
          selectedId={selectedId}
          panel={leftPanel}
          onPanelChange={setLeftPanel}
          onAdd={addCatalogItem}
          onSelect={(id) => {
            setSelectedId(id);
            setInspectorPanel('properties');
          }}
        />
        <main className="a3s-form-canvas" data-testid="designer-canvas">
          <div className="a3s-form-canvas-meta">
            <span className="a3s-form-canvas-context">
              <strong>{mode === 'design' ? '表单画布' : '交互预览'}</strong>
              <small>
                {mode === 'design' ? '点击组件编辑，拖拽调整位置' : '正在使用真实交互与校验规则'}
              </small>
            </span>
            <span
              className={`a3s-form-status-badge ${compiled.ok ? 'success is-ok' : 'danger is-error'}`}
              aria-live="polite"
            >
              {compiled.ok ? '● 编译通过' : `● ${compiled.diagnostics.length} 个问题`}
            </span>
          </div>
          {mode === 'preview' && compiled.plan ? (
            <div className={`a3s-form-preview-stage is-${viewport}`}>
              <FormRenderer
                plan={compiled.plan}
                value={activeValue}
                onChange={updateValue}
                onAction={props.onAction}
                hostAdapter={props.hostAdapter}
                errors={props.errors}
                readOnly={props.readOnly}
                locale={props.locale}
                widgetRegistry={props.widgetRegistry}
                nodeRegistry={props.nodeRegistry}
              />
            </div>
          ) : (
            <DesignerCanvas
              document={document}
              selectedId={selectedId}
              viewport={viewport}
              nodeRegistry={props.nodeRegistry}
              onSelect={(id) => {
                setSelectedId(id);
                setInspectorPanel('properties');
              }}
              onCatalogDrop={(catalogId, containerId) => {
                const item = findCatalogItem(catalogId, catalog);
                if (item) addCatalogItem(item, containerId);
              }}
              onNodeDrop={moveNodeToContainer}
              onMove={moveSelected}
              onDuplicate={duplicateSelected}
              onRemove={removeSelected}
            />
          )}
          {!compiled.ok && (
            <div className="a3s-form-diagnostics" role="alert">
              <strong>编译诊断</strong>
              {compiled.diagnostics.map((item) => (
                <p key={`${item.code}-${item.path}-${item.message}`}>
                  {item.path || '/'} · {item.message}
                </p>
              ))}
            </div>
          )}
        </main>
        <Inspector
          document={document}
          selected={selected}
          selectedProperty={selectedProperty}
          selectedSchema={selectedSchema}
          availableFieldWidgets={availableFieldWidgets}
          nodeRegistry={props.nodeRegistry}
          panel={inspectorPanel}
          patchText={patchText}
          patchMessage={patchMessage}
          onPanelChange={setInspectorPanel}
          onUpdateNode={updateSelected}
          onUpdateMetadata={updateMetadata}
          onUpdateSchema={updateSchema}
          onUpdateCustomNode={updateCustomNode}
          onSetRequired={setRequired}
          onUpdateOptions={updateOptions}
          onAddLayoutItem={addLayoutItem}
          onDuplicate={duplicateSelected}
          onRemove={removeSelected}
          onPatchTextChange={setPatchText}
          onReviewPatch={reviewPatch}
        />
      </div>
    </div>
  );
}

function DesignerToolbar({
  mode,
  viewport,
  canUndo,
  canRedo,
  compiled,
  onModeChange,
  onViewportChange,
  onUndo,
  onRedo,
}: {
  mode: 'design' | 'preview';
  viewport: 'desktop' | 'mobile';
  canUndo: boolean;
  canRedo: boolean;
  compiled: boolean;
  onModeChange: (mode: 'design' | 'preview') => void;
  onViewportChange: (viewport: 'desktop' | 'mobile') => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <header className="a3s-form-designer-toolbar">
      <div className="a3s-form-toolbar-title">
        <span className="a3s-form-toolbar-copy">
          <strong>表单内容</strong>
          <small>{compiled ? '结构与规则实时生效' : '处理问题后即可预览'}</small>
        </span>
      </div>
      <div className="a3s-form-toolbar-actions">
        <button
          type="button"
          className="a3s-form-icon-button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="撤销"
          title="撤销"
        >
          ↶
        </button>
        <button
          type="button"
          className="a3s-form-icon-button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="重做"
          title="重做"
        >
          ↷
        </button>
        <span className="a3s-form-toolbar-divider" />
        <fieldset className="a3s-form-segmented is-viewport" aria-label="画布尺寸">
          <button
            type="button"
            className={viewport === 'desktop' ? 'is-active' : ''}
            aria-pressed={viewport === 'desktop'}
            onClick={() => onViewportChange('desktop')}
          >
            <span className="is-desktop" aria-hidden="true" />
            桌面
          </button>
          <button
            type="button"
            className={viewport === 'mobile' ? 'is-active' : ''}
            aria-pressed={viewport === 'mobile'}
            onClick={() => onViewportChange('mobile')}
          >
            <span className="is-mobile" aria-hidden="true" />
            移动
          </button>
        </fieldset>
        <fieldset className="a3s-form-segmented" aria-label="设计器模式">
          <button
            type="button"
            className={mode === 'design' ? 'is-active' : ''}
            aria-pressed={mode === 'design'}
            onClick={() => onModeChange('design')}
          >
            <span className="is-design" aria-hidden="true" />
            设计
          </button>
          <button
            type="button"
            className={mode === 'preview' ? 'is-active' : ''}
            aria-pressed={mode === 'preview'}
            onClick={() => onModeChange('preview')}
          >
            <span className="is-preview" aria-hidden="true" />
            预览
          </button>
        </fieldset>
      </div>
    </header>
  );
}

function PalettePanel({
  document,
  catalog,
  selectedId,
  panel,
  onPanelChange,
  onAdd,
  onSelect,
}: {
  document: FormDocument;
  catalog: readonly DesignerCatalogSection[];
  selectedId: string;
  panel: LeftPanel;
  onPanelChange: (panel: LeftPanel) => void;
  onAdd: (item: DesignerCatalogItem) => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const visibleCatalog = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    if (!normalized) return catalog;
    return catalog
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${item.label} ${item.description}`.toLocaleLowerCase('zh-CN').includes(normalized),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [catalog, query]);

  return (
    <aside className="a3s-form-palette" aria-label="组件与表单结构">
      <fieldset className="a3s-form-panel-tabs" aria-label="左侧面板">
        <button
          type="button"
          className={panel === 'components' ? 'is-active' : ''}
          onClick={() => onPanelChange('components')}
        >
          组件
        </button>
        <button
          type="button"
          className={panel === 'outline' ? 'is-active' : ''}
          onClick={() => onPanelChange('outline')}
        >
          结构
        </button>
      </fieldset>
      {panel === 'components' ? (
        <div className="a3s-form-palette-content">
          <label className="a3s-form-catalog-search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="搜索组件"
              placeholder="搜索字段或布局"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" aria-label="清空组件搜索" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </label>
          <div className="a3s-form-catalog">
            {visibleCatalog.map((section) => (
              <section key={section.id}>
                <h2>
                  {section.label}
                  <span aria-hidden="true">{section.items.length}</span>
                </h2>
                <div className="a3s-form-palette-grid">
                  {section.items.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      title={item.description}
                      aria-label={`添加${item.label}${item.kind === 'field' || item.kind === 'repeater' ? '字段' : ''}`}
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData(catalogDragType, item.id)}
                      onClick={() => onAdd(item)}
                    >
                      <span className="a3s-form-palette-icon" aria-hidden="true">
                        {item.glyph}
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {visibleCatalog.length === 0 && (
              <div className="a3s-form-catalog-empty">
                <span aria-hidden="true">⌕</span>
                <strong>没有匹配的组件</strong>
                <small>试试“文本”“日期”或“布局”</small>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="a3s-form-outline-panel">
          <div className="a3s-form-outline-summary">
            <span>页面结构</span>
            <strong>{document.ui.nodes.length} 个节点</strong>
          </div>
          <div className="a3s-form-outline" role="tree">
            {document.ui.nodes.map((node) => (
              <button
                type="button"
                role="treeitem"
                aria-label={`选择${node.label ?? node.id}`}
                aria-selected={selectedId === node.id}
                data-node-id={node.id}
                className={selectedId === node.id ? 'is-selected' : ''}
                style={{ paddingLeft: `${12 + nodeDepth(document, node.id) * 13}px` }}
                key={node.id}
                onClick={() => onSelect(node.id)}
              >
                <span aria-hidden="true">
                  {node.kind === 'field' || node.kind === 'repeater' ? '◇' : '▣'}
                </span>
                <span>{node.label ?? node.id}</span>
                <small>{node.kind}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function Inspector(props: {
  document: FormDocument;
  selected: UiNode | undefined;
  selectedProperty: string | undefined;
  selectedSchema: JsonSchema | undefined;
  availableFieldWidgets: readonly { label: string; value: string }[];
  nodeRegistry?: FormNodeRegistry;
  panel: InspectorPanel;
  patchText: string;
  patchMessage: string;
  onPanelChange: (panel: InspectorPanel) => void;
  onUpdateNode: (changes: Partial<UiNode>) => void;
  onUpdateMetadata: (changes: Partial<FormDocument['metadata']>) => void;
  onUpdateSchema: (changes: Partial<JsonSchema>) => void;
  onUpdateCustomNode: (changes: { node?: Partial<UiNode>; schema?: Partial<JsonSchema> }) => void;
  onSetRequired: (required: boolean) => void;
  onUpdateOptions: (text: string) => void;
  onAddLayoutItem: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onPatchTextChange: (text: string) => void;
  onReviewPatch: () => void;
}) {
  const { selected } = props;
  return (
    <aside className="a3s-form-inspector" aria-label="属性面板">
      <fieldset className="a3s-form-panel-tabs is-inspector" aria-label="属性面板标签">
        <button
          type="button"
          className={props.panel === 'properties' ? 'is-active' : ''}
          onClick={() => props.onPanelChange('properties')}
        >
          属性
        </button>
        <button
          type="button"
          className={props.panel === 'validation' ? 'is-active' : ''}
          onClick={() => props.onPanelChange('validation')}
        >
          校验
        </button>
        <button
          type="button"
          className={props.panel === 'advanced' ? 'is-active' : ''}
          onClick={() => props.onPanelChange('advanced')}
        >
          高级
        </button>
      </fieldset>
      <div className="a3s-form-inspector-body">
        {props.panel === 'advanced' ? (
          <PatchPanel
            document={props.document}
            patchText={props.patchText}
            patchMessage={props.patchMessage}
            onTextChange={props.onPatchTextChange}
            onReview={props.onReviewPatch}
          />
        ) : selected ? (
          <>
            <div className="a3s-form-inspector-heading">
              <span>{selected.kind === 'root' ? '表单设置' : '当前节点'}</span>
              <strong>{selected.label ?? selected.id}</strong>
            </div>
            {props.panel === 'properties' ? (
              <PropertiesPanel {...props} selected={selected} />
            ) : (
              <ValidationPanel {...props} selected={selected} />
            )}
          </>
        ) : (
          <p className="a3s-form-empty">选择一个节点以编辑属性。</p>
        )}
      </div>
    </aside>
  );
}

function PropertiesPanel(props: Parameters<typeof Inspector>[0] & { selected: UiNode }) {
  const { selected } = props;
  const CustomInspector = selected.widget
    ? props.nodeRegistry?.[selected.widget]?.inspector
    : undefined;
  if (selected.kind === 'root') {
    return (
      <div className="a3s-form-inspector-fields">
        <Control label="表单标题">
          <input
            aria-label="表单标题"
            value={props.document.metadata.title}
            onChange={(event) => props.onUpdateMetadata({ title: event.target.value })}
          />
        </Control>
        <Control label="表单说明">
          <textarea
            aria-label="表单说明"
            value={props.document.metadata.description ?? ''}
            onChange={(event) => props.onUpdateMetadata({ description: event.target.value })}
          />
        </Control>
        <Control label="画布栏数">
          <SelectControl
            aria-label="画布栏数"
            value={selected.columns ?? 12}
            onChange={(event) =>
              props.onUpdateNode({ columns: Number(event.target.value) as UiNode['columns'] })
            }
          >
            {[1, 2, 3, 4, 6, 12].map((columns) => (
              <option key={columns} value={columns}>
                {columns} 栏
              </option>
            ))}
          </SelectControl>
        </Control>
        <Control label="字段间距">
          <SelectControl
            aria-label="画布间距"
            value={selected.gap ?? 16}
            onChange={(event) =>
              props.onUpdateNode({ gap: Number(event.target.value) as UiNode['gap'] })
            }
          >
            {[0, 8, 12, 16, 24, 32].map((gap) => (
              <option key={gap} value={gap}>
                {gap}px
              </option>
            ))}
          </SelectControl>
        </Control>
      </div>
    );
  }
  return (
    <div className="a3s-form-inspector-fields">
      <Control label="标题">
        <input
          aria-label="字段标题"
          value={selected.label ?? ''}
          onChange={(event) => props.onUpdateNode({ label: event.target.value })}
        />
      </Control>
      {selected.kind === 'field' && (
        <Control label="组件">
          <SelectControl
            aria-label="字段组件"
            value={selected.widget ?? 'text'}
            onChange={(event) => props.onUpdateNode({ widget: event.target.value })}
          >
            {props.availableFieldWidgets.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </SelectControl>
        </Control>
      )}
      {(selected.kind === 'field' || selected.kind === 'repeater') && (
        <Control label="字段标识" hint="由系统生成">
          <input aria-label="字段标识" value={props.selectedProperty ?? ''} readOnly />
        </Control>
      )}
      <Control label="说明">
        <textarea
          aria-label="字段说明"
          value={selected.description ?? ''}
          onChange={(event) => props.onUpdateNode({ description: event.target.value })}
        />
      </Control>
      {selected.kind === 'content' && selected.presentation !== 'spacer' && (
        <Control label="文字内容">
          <textarea
            aria-label={selected.presentation === 'divider' ? '分隔线标题' : '说明文字内容'}
            value={selected.content ?? ''}
            onChange={(event) => props.onUpdateNode({ content: event.target.value })}
          />
        </Control>
      )}
      {selected.kind === 'field' && (
        <Control label="占位提示">
          <input
            aria-label="占位提示"
            value={selected.placeholder ?? ''}
            onChange={(event) => props.onUpdateNode({ placeholder: event.target.value })}
          />
        </Control>
      )}
      <Control label="栅格宽度">
        <SelectControl
          aria-label="栅格宽度"
          value={selected.width ?? 12}
          onChange={(event) =>
            props.onUpdateNode({ width: Number(event.target.value) as UiNode['width'] })
          }
        >
          {[1, 2, 3, 4, 6, 12].map((width) => (
            <option key={width} value={width}>
              {width} / 12
            </option>
          ))}
        </SelectControl>
      </Control>
      {(selected.kind === 'section' || selected.kind === 'group') && (
        <>
          <Control label="内部栏数">
            <SelectControl
              aria-label="内部栏数"
              value={selected.columns ?? 12}
              onChange={(event) =>
                props.onUpdateNode({ columns: Number(event.target.value) as UiNode['columns'] })
              }
            >
              {[1, 2, 3, 4, 6, 12].map((columns) => (
                <option key={columns} value={columns}>
                  {columns} 栏
                </option>
              ))}
            </SelectControl>
          </Control>
          <Control label="内部间距">
            <SelectControl
              aria-label="内部间距"
              value={selected.gap ?? 16}
              onChange={(event) =>
                props.onUpdateNode({ gap: Number(event.target.value) as UiNode['gap'] })
              }
            >
              {[0, 8, 12, 16, 24, 32].map((gap) => (
                <option key={gap} value={gap}>
                  {gap}px
                </option>
              ))}
            </SelectControl>
          </Control>
        </>
      )}
      {selected.kind === 'content' && selected.presentation === 'spacer' && (
        <Control label="间距高度">
          <SelectControl
            aria-label="间距高度"
            value={selected.gap ?? 24}
            onChange={(event) =>
              props.onUpdateNode({ gap: Number(event.target.value) as UiNode['gap'] })
            }
          >
            {[8, 12, 16, 24, 32].map((gap) => (
              <option key={gap} value={gap}>
                {gap}px
              </option>
            ))}
          </SelectControl>
        </Control>
      )}
      {(selected.layout === 'tabs' || selected.layout === 'collapse') && (
        <button type="button" className="a3s-form-secondary-action" onClick={props.onAddLayoutItem}>
          {selected.layout === 'tabs' ? '添加标签页' : '添加折叠面板'}
        </button>
      )}
      {(selected.widget === 'select' || selected.widget === 'radio') && (
        <Control label="选项" hint="每行一个选项">
          <textarea
            aria-label="字段选项"
            value={(selected.options ?? []).map((option) => option.label).join('\n')}
            onChange={(event) => props.onUpdateOptions(event.target.value)}
          />
        </Control>
      )}
      {CustomInspector && (
        <section className="a3s-form-custom-inspector" aria-label="自定义节点设置">
          <CustomInspector
            node={selected}
            schema={props.selectedSchema}
            onUpdate={props.onUpdateCustomNode}
            onUpdateNode={props.onUpdateNode}
            onUpdateSchema={props.onUpdateSchema}
          />
        </section>
      )}
      <div className="a3s-form-inspector-actions">
        <button type="button" className="a3s-form-secondary-action" onClick={props.onDuplicate}>
          复制节点
        </button>
        <button type="button" className="a3s-form-danger" onClick={props.onRemove}>
          {selected.kind === 'field' || selected.kind === 'repeater' ? '删除字段' : '删除节点'}
        </button>
      </div>
    </div>
  );
}

function ValidationPanel(props: Parameters<typeof Inspector>[0] & { selected: UiNode }) {
  const { selected, selectedSchema } = props;
  if (selected.kind !== 'field' && selected.kind !== 'repeater')
    return <p className="a3s-form-empty">当前节点没有字段校验设置。</p>;
  const required = Boolean(
    props.selectedProperty && props.document.schema.required?.includes(props.selectedProperty),
  );
  const stringField = selectedSchema?.type === 'string';
  const numberField = selectedSchema?.type === 'number' || selectedSchema?.type === 'integer';
  return (
    <div className="a3s-form-inspector-fields">
      <Toggle label="必填字段" checked={required} onChange={props.onSetRequired} />
      <Toggle
        label="只读字段"
        checked={Boolean(selected.readOnly)}
        onChange={(readOnly) => props.onUpdateNode({ readOnly })}
      />
      <Toggle
        label="默认隐藏"
        checked={Boolean(selected.hidden)}
        onChange={(hidden) => props.onUpdateNode({ hidden })}
      />
      {stringField && (
        <div className="a3s-form-inline-controls">
          <Control label="最少字符">
            <input
              aria-label="最小字符数"
              type="number"
              min="0"
              value={selectedSchema?.minLength ?? ''}
              onChange={(event) =>
                props.onUpdateSchema({ minLength: numberOrUndefined(event.target.value) })
              }
            />
          </Control>
          <Control label="最多字符">
            <input
              aria-label="最大字符数"
              type="number"
              min="0"
              value={selectedSchema?.maxLength ?? ''}
              onChange={(event) =>
                props.onUpdateSchema({ maxLength: numberOrUndefined(event.target.value) })
              }
            />
          </Control>
        </div>
      )}
      {numberField && (
        <div className="a3s-form-inline-controls">
          <Control label="最小值">
            <input
              aria-label="最小值"
              type="number"
              value={selectedSchema?.minimum ?? ''}
              onChange={(event) =>
                props.onUpdateSchema({ minimum: numberOrUndefined(event.target.value) })
              }
            />
          </Control>
          <Control label="最大值">
            <input
              aria-label="最大值"
              type="number"
              value={selectedSchema?.maximum ?? ''}
              onChange={(event) =>
                props.onUpdateSchema({ maximum: numberOrUndefined(event.target.value) })
              }
            />
          </Control>
        </div>
      )}
      <div className="a3s-form-rule-summary">
        <span>条件逻辑</span>
        <strong>
          {props.document.rules?.filter((rule) => rule.target === selected.id).length ?? 0} 条规则
        </strong>
        <p>复杂条件由宿主或结构化补丁维护，运行时始终经过编译器校验。</p>
      </div>
    </div>
  );
}

function PatchPanel({
  document,
  patchText,
  patchMessage,
  onTextChange,
  onReview,
}: {
  document: FormDocument;
  patchText: string;
  patchMessage: string;
  onTextChange: (text: string) => void;
  onReview: () => void;
}) {
  return (
    <section className="a3s-form-patch-review">
      <div className="a3s-form-inspector-heading">
        <span>开发者工具</span>
        <strong>结构化补丁</strong>
      </div>
      <p>仅接受绑定当前 revision 的类型化 FormPatch，应用前会完整编译。</p>
      <textarea
        aria-label="FormPatch JSON"
        value={patchText}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={`{"apiVersion":"a3s.dev/form-patch/v1alpha1","baseRevision":${document.revision},"operations":[]}`}
      />
      <button type="button" className="a3s-form-primary-action" onClick={onReview}>
        校验并应用
      </button>
      {patchMessage && (
        <div className="a3s-form-patch-message" role="status">
          {patchMessage}
        </div>
      )}
    </section>
  );
}

function Control({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="a3s-form-control">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="a3s-form-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function numberOrUndefined(value: string): number | undefined {
  return value === '' ? undefined : Number(value);
}

function nodeDepth(
  document: FormDocument,
  id: string,
  depth = 0,
  seen = new Set<string>(),
): number {
  if (seen.has(id)) return depth;
  seen.add(id);
  const parent = findParent(document, id);
  return parent ? nodeDepth(document, parent.id, depth + 1, seen) : depth;
}
