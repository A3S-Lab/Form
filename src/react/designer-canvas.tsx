import { type CSSProperties, type DragEvent, type ReactNode, useState } from 'react';
import type { FormDocument, UiNode } from '../core';
import type { FormNodeDefinition, FormNodeRegistry } from './node-registry';
import { SelectControl } from './select-control';

export const catalogDragType = 'application/x-a3s-form-catalog';
export const nodeDragType = 'application/x-a3s-form-node';

export interface CanvasDropTarget {
  containerId: string;
  index: number;
}

interface DesignerCanvasProps {
  document: FormDocument;
  selectedId: string;
  viewport: 'desktop' | 'mobile';
  nodeRegistry?: FormNodeRegistry;
  onSelect: (nodeId: string) => void;
  onCatalogDrop: (catalogId: string, target: CanvasDropTarget) => void;
  onNodeDrop: (nodeId: string, target: CanvasDropTarget) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function DesignerCanvas(props: DesignerCanvasProps) {
  const root = props.document.ui.nodes.find((node) => node.id === props.document.ui.root);
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});
  return (
    <div className={`a3s-form-design-stage is-${props.viewport}`}>
      <div className="a3s-form-design-page">
        {root ? (
          <>
            <button
              type="button"
              className={`a3s-form-page-heading${props.selectedId === root.id ? ' is-selected' : ''}`}
              aria-label={`选择${root.label ?? root.id}`}
              onClick={() => props.onSelect(root.id)}
            >
              <strong>{props.document.metadata.title}</strong>
              <span>
                {props.document.metadata.description ?? root.description ?? '请填写以下信息'}
              </span>
            </button>
            <CanvasChildren
              {...props}
              container={root}
              activeTabs={activeTabs}
              onActivateTab={(containerId, tabId) =>
                setActiveTabs((current) => ({ ...current, [containerId]: tabId }))
              }
            />
          </>
        ) : (
          <div className="a3s-form-canvas-unavailable">根节点不可用，请先修复编译诊断。</div>
        )}
      </div>
    </div>
  );
}

interface CanvasTreeProps extends DesignerCanvasProps {
  activeTabs: Record<string, string>;
  onActivateTab: (containerId: string, tabId: string) => void;
}

function CanvasChildren(props: CanvasTreeProps & { container: UiNode; ancestry?: Set<string> }) {
  const { container } = props;
  const children = container.children ?? [];
  const style = {
    '--a3s-form-columns': container.columns ?? 12,
    '--a3s-form-gap': `${container.gap ?? 16}px`,
  } as CSSProperties;
  return (
    <div className="a3s-form-design-grid" style={style}>
      {children.map((child, index) => {
        const childNode = props.document.ui.nodes.find((node) => node.id === child);
        return (
          <div
            className="a3s-form-canvas-item"
            style={
              {
                '--a3s-form-item-column': `span ${childNode?.width ?? 12}`,
              } as CSSProperties
            }
            key={child}
          >
            <CanvasDropSlot
              {...props}
              containerId={container.id}
              index={index}
              placement="before"
            />
            <CanvasNode {...props} nodeId={child} ancestry={props.ancestry} />
          </div>
        );
      })}
      {children.length === 0 ? (
        <CanvasDropSlot {...props} containerId={container.id} index={0} placement="empty" />
      ) : (
        <CanvasDropSlot
          {...props}
          containerId={container.id}
          index={children.length}
          placement="end"
        />
      )}
    </div>
  );
}

function CustomCanvasNode(
  props: CanvasTreeProps & {
    node: UiNode;
    definition: FormNodeDefinition;
    selected: boolean;
    ancestry: Set<string>;
    style: CSSProperties;
  },
) {
  const Design = props.definition.design;
  const property = props.node.schemaPath?.replace('/properties/', '');
  const schema = property ? props.document.schema.properties?.[property] : undefined;
  const required = Boolean(property && props.document.schema.required?.includes(property));
  const acceptsChildren = props.node.kind === 'section' || props.node.kind === 'group';
  return (
    <article
      className={`a3s-form-design-custom${props.selected ? ' is-selected' : ''}`}
      data-node-id={props.node.id}
      data-node-type={props.node.widget}
      style={props.style}
      draggable
      onDragStart={(event) => beginNodeDrag(event, props.node.id)}
    >
      <button
        type="button"
        className="a3s-form-node-select"
        aria-label={`选择${props.node.label ?? props.node.id}`}
        onClick={() => props.onSelect(props.node.id)}
      />
      <span className="a3s-form-node-handle" aria-hidden="true">
        ⋮⋮
      </span>
      <div className="a3s-form-design-custom-body">
        {Design ? (
          <Design node={props.node} schema={schema} required={required} />
        ) : (
          <div className="a3s-form-design-custom-fallback">
            <strong>{props.node.label ?? props.definition.catalog.label}</strong>
            <span>{props.definition.catalog.description}</span>
          </div>
        )}
      </div>
      {acceptsChildren && (
        <CanvasChildren {...props} container={props.node} ancestry={props.ancestry} />
      )}
      {props.selected && <NodeActions actionNode={props.node} {...props} />}
    </article>
  );
}

function CanvasNode(
  props: CanvasTreeProps & { nodeId: string; ancestry?: Set<string> },
): ReactNode {
  const node = props.document.ui.nodes.find((candidate) => candidate.id === props.nodeId);
  if (!node) return null;
  if (props.ancestry?.has(node.id)) {
    return <div className="a3s-form-canvas-unavailable">布局存在循环：{node.id}</div>;
  }
  const ancestry = new Set(props.ancestry ?? []);
  ancestry.add(node.id);
  const selected = props.selectedId === node.id;
  const style = {
    '--a3s-form-gap': `${node.gap ?? 24}px`,
    width: '100%',
  } as CSSProperties;

  const extension = node.widget ? props.nodeRegistry?.[node.widget] : undefined;
  if (extension) {
    return (
      <CustomCanvasNode
        {...props}
        node={node}
        definition={extension}
        selected={selected}
        ancestry={ancestry}
        style={style}
      />
    );
  }

  if (node.kind === 'section' || node.kind === 'group') {
    if (node.layout === 'tabs')
      return <TabbedContainer {...props} node={node} selected={selected} ancestry={ancestry} />;
    if (node.layout === 'collapse')
      return <CollapseContainer {...props} node={node} selected={selected} ancestry={ancestry} />;
    return (
      <fieldset
        aria-label={node.label ?? node.id}
        className={`a3s-form-design-container is-${node.layout ?? 'flow'}${selected ? ' is-selected' : ''}`}
        data-node-id={node.id}
        style={style}
        draggable
        onDragStart={(event) => beginNodeDrag(event, node.id)}
      >
        <ContainerHeading {...props} node={node} selected={selected} />
        {node.description && <p className="a3s-form-container-description">{node.description}</p>}
        <CanvasChildren {...props} container={node} ancestry={ancestry} />
      </fieldset>
    );
  }

  if (node.kind === 'content') {
    return <ContentNode {...props} node={node} selected={selected} style={style} />;
  }

  const valuePath = node.schemaPath?.replace('/properties/', '');
  const required = Boolean(valuePath && props.document.schema.required?.includes(valuePath));
  return (
    <article
      className={`a3s-form-design-field${selected ? ' is-selected' : ''}`}
      data-node-id={node.id}
      style={style}
      draggable
      onDragStart={(event) => beginNodeDrag(event, node.id)}
    >
      <button
        type="button"
        className="a3s-form-node-select"
        aria-label={`选择${node.label ?? node.id}`}
        onClick={() => props.onSelect(node.id)}
      />
      <span className="a3s-form-node-handle" aria-hidden="true">
        ⠿
      </span>
      {node.kind === 'repeater' ? (
        <FieldShell node={node} required={required}>
          <div className="a3s-form-mock-repeater">
            <span>列表项</span>
            <button type="button" disabled>
              添加一项
            </button>
          </div>
        </FieldShell>
      ) : (
        <FieldShell node={node} required={required}>
          <MockControl node={node} />
        </FieldShell>
      )}
      {selected && <NodeActions actionNode={node} {...props} />}
    </article>
  );
}

function TabbedContainer(
  props: CanvasTreeProps & {
    node: UiNode;
    selected: boolean;
    ancestry: Set<string>;
  },
) {
  const tabs = (props.node.children ?? [])
    .map((id) => props.document.ui.nodes.find((node) => node.id === id))
    .filter((node): node is UiNode => Boolean(node));
  const activeId = tabs.some((tab) => tab.id === props.activeTabs[props.node.id])
    ? props.activeTabs[props.node.id]
    : tabs[0]?.id;
  const active = tabs.find((tab) => tab.id === activeId);
  return (
    <fieldset
      aria-label={props.node.label ?? props.node.id}
      className={`a3s-form-design-container is-tabs${props.selected ? ' is-selected' : ''}`}
      style={{ width: '100%' }}
      data-node-id={props.node.id}
      draggable
      onDragStart={(event) => beginNodeDrag(event, props.node.id)}
    >
      <ContainerHeading {...props} node={props.node} selected={props.selected} />
      <div className="a3s-form-design-tablist" role="tablist" aria-label={props.node.label}>
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab.id === activeId}
            className={tab.id === activeId ? 'is-active' : ''}
            key={tab.id}
            onClick={() => {
              props.onActivateTab(props.node.id, tab.id);
              props.onSelect(tab.id);
            }}
          >
            {tab.label ?? '未命名标签'}
          </button>
        ))}
      </div>
      {active ? (
        <CanvasPanel {...props} node={active} ancestry={props.ancestry} label="标签页内容" />
      ) : (
        <CanvasDropSlot {...props} containerId={props.node.id} index={0} placement="empty" />
      )}
    </fieldset>
  );
}

function CollapseContainer(
  props: CanvasTreeProps & {
    node: UiNode;
    selected: boolean;
    ancestry: Set<string>;
  },
) {
  const panels = (props.node.children ?? [])
    .map((id) => props.document.ui.nodes.find((node) => node.id === id))
    .filter((node): node is UiNode => Boolean(node));
  return (
    <fieldset
      aria-label={props.node.label ?? props.node.id}
      className={`a3s-form-design-container is-collapse${props.selected ? ' is-selected' : ''}`}
      style={{ width: '100%' }}
      data-node-id={props.node.id}
      draggable
      onDragStart={(event) => beginNodeDrag(event, props.node.id)}
    >
      <ContainerHeading {...props} node={props.node} selected={props.selected} />
      <div className="a3s-form-design-collapse-list">
        {panels.map((panel) => (
          <details open key={panel.id}>
            <summary>
              <button type="button" onClick={() => props.onSelect(panel.id)}>
                {panel.label ?? '未命名面板'}
              </button>
              {props.selectedId === panel.id && <NodeActions actionNode={panel} {...props} />}
            </summary>
            <CanvasChildren {...props} container={panel} ancestry={props.ancestry} />
          </details>
        ))}
        {panels.length === 0 && (
          <CanvasDropSlot {...props} containerId={props.node.id} index={0} placement="empty" />
        )}
      </div>
    </fieldset>
  );
}

function CanvasPanel(
  props: CanvasTreeProps & { node: UiNode; ancestry: Set<string>; label: string },
) {
  const selected = props.selectedId === props.node.id;
  return (
    <div className={`a3s-form-design-panel${selected ? ' is-selected' : ''}`}>
      <div className="a3s-form-design-panel-heading">
        <button type="button" onClick={() => props.onSelect(props.node.id)}>
          {props.label}
        </button>
        {selected && <NodeActions actionNode={props.node} {...props} />}
      </div>
      <CanvasChildren {...props} container={props.node} ancestry={props.ancestry} />
    </div>
  );
}

function ContainerHeading(props: CanvasTreeProps & { node: UiNode; selected: boolean }) {
  const fallback = props.node.kind === 'section' ? '未命名分组' : '布局容器';
  return (
    <header className="a3s-form-design-container-heading">
      <button type="button" onClick={() => props.onSelect(props.node.id)}>
        <span className="a3s-form-node-handle" aria-hidden="true">
          ⠿
        </span>
        <span>{props.node.label ?? fallback}</span>
      </button>
      {props.selected && <NodeActions actionNode={props.node} {...props} />}
    </header>
  );
}

function ContentNode(
  props: CanvasTreeProps & {
    node: UiNode;
    selected: boolean;
    style: CSSProperties;
  },
) {
  const className = `a3s-form-design-content is-${props.node.presentation ?? 'text'}${props.selected ? ' is-selected' : ''}`;
  return (
    <article
      className={className}
      data-node-id={props.node.id}
      style={props.style}
      draggable
      onDragStart={(event) => beginNodeDrag(event, props.node.id)}
    >
      <button
        type="button"
        className="a3s-form-node-select"
        aria-label={`选择${props.node.label ?? props.node.id}`}
        onClick={() => props.onSelect(props.node.id)}
      />
      {props.node.presentation === 'divider' ? (
        <div className="a3s-form-mock-divider">
          <span />
          {props.node.content && <em>{props.node.content}</em>}
          <span />
        </div>
      ) : props.node.presentation === 'spacer' ? (
        <div className="a3s-form-mock-spacer">间距 {props.node.gap ?? 24}px</div>
      ) : (
        <>
          <span className="a3s-form-content-icon" aria-hidden="true">
            i
          </span>
          <p>{props.node.content ?? '在属性面板中编辑说明文字。'}</p>
        </>
      )}
      {props.selected && <NodeActions actionNode={props.node} {...props} />}
    </article>
  );
}

function FieldShell({
  node,
  required,
  children,
}: {
  node: UiNode;
  required: boolean;
  children: ReactNode;
}) {
  return (
    <div className="a3s-form-mock-field">
      <div className="a3s-form-mock-label">
        {node.label ?? node.id}
        {required && <em>*</em>}
      </div>
      {node.description && <small>{node.description}</small>}
      {children}
    </div>
  );
}

function MockControl({ node }: { node: UiNode }) {
  if (node.widget === 'textarea')
    return <textarea disabled placeholder={node.placeholder ?? '请输入'} />;
  if (node.widget === 'select')
    return (
      <SelectControl disabled defaultValue="">
        <option value="">请选择</option>
      </SelectControl>
    );
  if (node.widget === 'radio')
    return (
      <div className="a3s-form-mock-options">
        {(node.options ?? []).slice(0, 3).map((option) => (
          <span key={String(option.value)}>
            <i />
            {option.label}
          </span>
        ))}
      </div>
    );
  if (node.widget === 'checkbox' || node.widget === 'switch')
    return (
      <div className={`a3s-form-mock-check is-${node.widget}`}>
        <i />
        <span>{node.label ?? '启用'}</span>
      </div>
    );
  return (
    <input
      disabled
      type={
        node.widget === 'number' ||
        node.widget === 'email' ||
        node.widget === 'password' ||
        node.widget === 'date'
          ? node.widget
          : 'text'
      }
      placeholder={node.placeholder ?? '请输入'}
    />
  );
}

function NodeActions(props: CanvasTreeProps & { actionNode: UiNode }) {
  return (
    <div className="a3s-form-node-actions">
      <button
        type="button"
        aria-label="上移节点"
        title="上移"
        onClick={(event) => {
          event.stopPropagation();
          props.onMove(-1);
        }}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label="下移节点"
        title="下移"
        onClick={(event) => {
          event.stopPropagation();
          props.onMove(1);
        }}
      >
        ↓
      </button>
      <button
        type="button"
        aria-label="复制节点"
        title="复制"
        onClick={(event) => {
          event.stopPropagation();
          props.onDuplicate();
        }}
      >
        ⧉
      </button>
      <button
        type="button"
        aria-label="删除节点"
        title="删除"
        onClick={(event) => {
          event.stopPropagation();
          props.onRemove();
        }}
      >
        ×
      </button>
    </div>
  );
}

function CanvasDropSlot(
  props: CanvasTreeProps & {
    containerId: string;
    index: number;
    placement: 'before' | 'end' | 'empty';
  },
) {
  const [active, setActive] = useState(false);
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`a3s-form-canvas-drop is-${props.placement}${active ? ' is-active' : ''}`}
      aria-label={`插入到${props.containerId}第${props.index + 1}位`}
      onDragEnter={(event) => {
        event.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        setActive(false);
        handleDrop(event, { containerId: props.containerId, index: props.index }, props);
      }}
    >
      {props.placement === 'empty' ? (
        <span>
          <i aria-hidden="true">＋</i>
          <strong>添加第一个组件</strong>
          <small>从左侧添加字段和布局组件。</small>
          <em>拖拽组件到这里，或从左侧点击添加</em>
        </span>
      ) : (
        <i />
      )}
    </button>
  );
}

function beginNodeDrag(event: DragEvent, nodeId: string) {
  event.stopPropagation();
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(nodeDragType, nodeId);
}

function handleDrop(event: DragEvent, target: CanvasDropTarget, props: DesignerCanvasProps) {
  event.preventDefault();
  event.stopPropagation();
  const catalogId = event.dataTransfer.getData(catalogDragType);
  if (catalogId) {
    props.onCatalogDrop(catalogId, target);
    return;
  }
  const nodeId = event.dataTransfer.getData(nodeDragType);
  if (nodeId) props.onNodeDrop(nodeId, target);
}
