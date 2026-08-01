import { useMemo, useState } from 'react';
import {
  applyFormPatch,
  compileForm,
  type FormDocument,
  type FormPatch,
  type JsonObject,
  type JsonSchema,
  schemaPointerToValuePath,
  type UiNode,
} from '../core';
import { FormRenderer, type FormRendererProps, type FormWidgetRegistry } from './renderer';

export interface FormDesignerProps {
  document: FormDocument;
  onChange: (document: FormDocument) => void;
  widgetRegistry?: FormWidgetRegistry;
  value?: JsonObject;
  onValueChange?: (value: JsonObject) => void;
  onAction?: FormRendererProps['onAction'];
  hostAdapter?: FormRendererProps['hostAdapter'];
  errors?: FormRendererProps['errors'];
  readOnly?: boolean;
  locale?: string;
  className?: string;
}

type PaletteItem = { label: string; widget: string; schema: JsonSchema };

const PALETTE: PaletteItem[] = [
  { label: '单行文本', widget: 'text', schema: { type: 'string' } },
  { label: '多行文本', widget: 'textarea', schema: { type: 'string' } },
  { label: '数字', widget: 'number', schema: { type: 'number' } },
  { label: '下拉选择', widget: 'select', schema: { type: 'string' } },
  { label: '复选框', widget: 'checkbox', schema: { type: 'boolean' } },
  { label: '日期', widget: 'date', schema: { type: 'string', format: 'date' } },
];

function nextId(document: FormDocument, prefix: string): string {
  const existing = new Set(document.ui.nodes.map((node) => node.id));
  let index = 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function compileMutation(
  document: FormDocument,
  mutate: (draft: FormDocument) => void,
): FormDocument | undefined {
  const draft = structuredClone(document);
  mutate(draft);
  draft.revision += 1;
  delete draft.digest;
  const result = compileForm(draft);
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

export function FormDesigner({
  document,
  onChange,
  widgetRegistry,
  value: controlledValue,
  onValueChange,
  onAction,
  hostAdapter,
  errors,
  readOnly,
  locale,
  className,
}: FormDesignerProps) {
  const compiled = useMemo(() => compileForm(document), [document]);
  const [selectedId, setSelectedId] = useState(
    () => document.ui.nodes.find((node) => node.kind === 'field')?.id ?? document.ui.root,
  );
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [value, setValue] = useState<JsonObject>({});
  const [undoStack, setUndoStack] = useState<FormDocument[]>([]);
  const [redoStack, setRedoStack] = useState<FormDocument[]>([]);
  const [patchText, setPatchText] = useState('');
  const [patchMessage, setPatchMessage] = useState('');
  const activeValue = controlledValue ?? value;
  const selected = document.ui.nodes.find((node) => node.id === selectedId);
  const selectedValuePath = selected?.schemaPath
    ? schemaPointerToValuePath(selected.schemaPath)
    : undefined;

  const commit = (next: FormDocument | undefined) => {
    if (!next) return;
    setUndoStack((items) => [...items.slice(-49), document]);
    setRedoStack([]);
    onChange(next);
  };
  const addField = (item: PaletteItem) => {
    const fieldId = nextId(document, 'field');
    const property = fieldId.replaceAll('-', '_');
    const next = compileMutation(document, (draft) => {
      draft.schema.type = 'object';
      draft.schema.properties ??= {};
      draft.schema.properties[property] = { ...item.schema, title: item.label };
      const node: UiNode = {
        id: fieldId,
        kind: 'field',
        label: item.label,
        schemaPath: `/properties/${property}`,
        widget: item.widget,
        width: 12,
      };
      draft.ui.nodes.push(node);
      const selectedContainer = draft.ui.nodes.find(
        (candidate) =>
          candidate.id === selectedId && candidate.kind !== 'field' && candidate.kind !== 'content',
      );
      const parent =
        selectedContainer ?? draft.ui.nodes.find((candidate) => candidate.id === draft.ui.root);
      parent?.children?.push(fieldId);
    });
    commit(next);
    setSelectedId(fieldId);
  };
  const updateSelected = (changes: Partial<UiNode>) => {
    commit(
      compileMutation(document, (draft) => {
        const index = draft.ui.nodes.findIndex((node) => node.id === selectedId);
        if (index >= 0) draft.ui.nodes[index] = { ...draft.ui.nodes[index], ...changes };
      }),
    );
  };
  const setRequired = (required: boolean) => {
    if (!selectedValuePath) return;
    const rootProperty = selectedValuePath.split('.')[0];
    commit(
      compileMutation(document, (draft) => {
        const requirements = new Set(draft.schema.required ?? []);
        if (required) requirements.add(rootProperty);
        else requirements.delete(rootProperty);
        draft.schema.required = [...requirements];
      }),
    );
  };
  const removeSelected = () => {
    if (!selected || selected.id === document.ui.root) return;
    const removed = collectDescendants(document, selected.id);
    const next = compileMutation(document, (draft) => {
      draft.ui.nodes = draft.ui.nodes
        .filter((node) => !removed.has(node.id))
        .map((node) => ({ ...node, children: node.children?.filter((id) => !removed.has(id)) }));
      for (const id of removed) {
        const node = document.ui.nodes.find((candidate) => candidate.id === id);
        const property = node?.schemaPath
          ? schemaPointerToValuePath(node.schemaPath)?.split('.')[0]
          : undefined;
        if (property && draft.schema.properties) delete draft.schema.properties[property];
        if (property)
          draft.schema.required = draft.schema.required?.filter((item) => item !== property);
      }
      draft.rules = draft.rules?.filter((rule) => !removed.has(rule.target));
    });
    commit(next);
    setSelectedId(document.ui.root);
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
      const result = applyFormPatch(document, patch);
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
    onValueChange?.(next);
  };

  return (
    <div className={`a3s-form-designer ${className ?? ''}`} data-testid="form-designer">
      <header className="a3s-form-designer-toolbar">
        <div>
          <strong>{document.metadata.title}</strong>
          <span>revision {document.revision}</span>
        </div>
        <div className="a3s-form-toolbar-actions">
          <button type="button" onClick={undo} disabled={!undoStack.length} aria-label="撤销">
            ↶ 撤销
          </button>
          <button type="button" onClick={redo} disabled={!redoStack.length} aria-label="重做">
            ↷ 重做
          </button>
          <fieldset className="a3s-form-segmented" aria-label="设计器模式">
            <button
              type="button"
              className={mode === 'design' ? 'is-active' : ''}
              onClick={() => setMode('design')}
            >
              设计
            </button>
            <button
              type="button"
              className={mode === 'preview' ? 'is-active' : ''}
              onClick={() => setMode('preview')}
            >
              预览
            </button>
          </fieldset>
        </div>
      </header>
      <div className="a3s-form-designer-main">
        <aside className="a3s-form-palette" aria-label="字段组件库">
          <div className="a3s-form-panel-heading">
            <strong>字段</strong>
            <span>点击添加</span>
          </div>
          <div className="a3s-form-palette-grid">
            {PALETTE.map((item) => (
              <button
                type="button"
                key={item.widget}
                aria-label={`添加${item.label}字段`}
                onClick={() => addField(item)}
              >
                <span className="a3s-form-palette-icon" aria-hidden="true">
                  ＋
                </span>
                {item.label}
              </button>
            ))}
          </div>
          <div className="a3s-form-panel-heading a3s-form-outline-heading">
            <strong>结构</strong>
            <span>{document.ui.nodes.length} 个节点</span>
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
                style={{ paddingLeft: `${12 + node.id.split('.').length * 4}px` }}
                key={node.id}
                onClick={() => setSelectedId(node.id)}
              >
                <span aria-hidden="true">{node.kind === 'field' ? '◇' : '▣'}</span>
                {node.label ?? node.id}
              </button>
            ))}
          </div>
        </aside>
        <main className="a3s-form-canvas" data-testid="designer-canvas">
          <div className="a3s-form-canvas-meta">
            <span>桌面 · 12 栏</span>
            <span className={compiled.ok ? 'is-ok' : 'is-error'}>
              {compiled.ok ? '● 编译通过' : `● ${compiled.diagnostics.length} 个问题`}
            </span>
          </div>
          <div className="a3s-form-canvas-page">
            {mode === 'preview' && compiled.plan ? (
              <FormRenderer
                plan={compiled.plan}
                value={activeValue}
                onChange={updateValue}
                onAction={onAction}
                hostAdapter={hostAdapter}
                errors={errors}
                readOnly={readOnly}
                locale={locale}
                widgetRegistry={widgetRegistry}
              />
            ) : (
              <div className="a3s-form-node-list">
                {document.ui.nodes
                  .filter((node) => node.kind === 'field' || node.kind === 'content')
                  .map((node) => (
                    <button
                      type="button"
                      key={node.id}
                      className={`a3s-form-node-card${selectedId === node.id ? ' is-selected' : ''}`}
                      onClick={() => setSelectedId(node.id)}
                    >
                      <span className="a3s-form-node-drag" aria-hidden="true">
                        ⠿
                      </span>
                      <span>
                        <strong>{node.label ?? node.id}</strong>
                        <small>
                          {node.widget ?? node.kind} · {node.schemaPath ?? '静态内容'}
                        </small>
                      </span>
                      <span className="a3s-form-node-width">{node.width ?? 12}/12</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
          {!compiled.ok && (
            <div className="a3s-form-diagnostics" role="alert">
              <strong>编译诊断</strong>
              {compiled.diagnostics.map((item) => (
                <p key={`${item.code}-${item.path}`}>
                  {item.path || '/'} · {item.message}
                </p>
              ))}
            </div>
          )}
        </main>
        <aside className="a3s-form-inspector" aria-label="属性面板">
          <div className="a3s-form-panel-heading">
            <strong>属性</strong>
            <span>{selected?.kind ?? '未选择'}</span>
          </div>
          {selected ? (
            <div className="a3s-form-inspector-fields">
              <label>
                <span>标题</span>
                <input
                  aria-label="字段标题"
                  value={selected.label ?? ''}
                  onChange={(event) => updateSelected({ label: event.target.value })}
                />
              </label>
              {selected.kind === 'field' && (
                <>
                  <label>
                    <span>组件</span>
                    <select
                      aria-label="字段组件"
                      value={selected.widget ?? 'text'}
                      onChange={(event) => updateSelected({ widget: event.target.value })}
                    >
                      {PALETTE.map((item) => (
                        <option key={item.widget} value={item.widget}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>说明</span>
                    <textarea
                      aria-label="字段说明"
                      value={selected.description ?? ''}
                      onChange={(event) => updateSelected({ description: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>占位提示</span>
                    <input
                      aria-label="占位提示"
                      value={selected.placeholder ?? ''}
                      onChange={(event) => updateSelected({ placeholder: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>栅格宽度</span>
                    <select
                      aria-label="栅格宽度"
                      value={selected.width ?? 12}
                      onChange={(event) =>
                        updateSelected({ width: Number(event.target.value) as UiNode['width'] })
                      }
                    >
                      {[3, 4, 6, 12].map((width) => (
                        <option key={width} value={width}>
                          {width} / 12
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="a3s-form-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(
                        selectedValuePath &&
                          document.schema.required?.includes(selectedValuePath.split('.')[0]),
                      )}
                      onChange={(event) => setRequired(event.target.checked)}
                    />
                    <span>必填字段</span>
                  </label>
                  <button type="button" className="a3s-form-danger" onClick={removeSelected}>
                    删除字段
                  </button>
                </>
              )}
            </div>
          ) : (
            <p className="a3s-form-empty">选择一个节点以编辑属性。</p>
          )}
          <details className="a3s-form-patch-review">
            <summary>AI 补丁审阅</summary>
            <p>仅接受绑定当前 revision 的类型化 FormPatch。</p>
            <textarea
              aria-label="FormPatch JSON"
              value={patchText}
              onChange={(event) => setPatchText(event.target.value)}
              placeholder={`{"apiVersion":"a3s.dev/form-patch/v1alpha1","baseRevision":${document.revision},"operations":[]}`}
            />
            <button type="button" onClick={reviewPatch}>
              校验并应用
            </button>
            {patchMessage && (
              <div className="a3s-form-patch-message" role="status">
                {patchMessage}
              </div>
            )}
          </details>
        </aside>
      </div>
    </div>
  );
}
