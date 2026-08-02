import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductIcon } from './icons';
import { countFormFields, type PlaygroundFormRecord } from './workspace';

export type WorkspaceTemplateId = 'blank' | 'onboarding';

type WorkspaceCollection = 'all' | 'workflow';

export interface WorkspaceViewProps {
  forms: readonly PlaygroundFormRecord[];
  storageAvailable: boolean;
  onOpen: (formId: string) => void;
  onCreate: (title: string, description: string, template: WorkspaceTemplateId) => void;
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function isWorkflowForm(record: PlaygroundFormRecord): boolean {
  return record.document.metadata.title.endsWith('节点配置');
}

function getPreviewFields(record: PlaygroundFormRecord): readonly string[] {
  return record.document.ui.nodes
    .filter((node) => node.kind === 'field' || node.kind === 'repeater')
    .slice(0, 3)
    .map((node) => node.label ?? node.schemaPath ?? '未命名字段');
}

export function WorkspaceView(props: WorkspaceViewProps) {
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState<WorkspaceCollection>('all');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 840);
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState<WorkspaceTemplateId>('blank');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const workflowCount = props.forms.filter(isWorkflowForm).length;
  const fieldCount = props.forms.reduce(
    (total, record) => total + countFormFields(record.document),
    0,
  );
  const sortedForms = useMemo(
    () => [...props.forms].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [props.forms],
  );
  const visibleForms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    return sortedForms.filter((record) => {
      if (collection === 'workflow' && !isWorkflowForm(record)) return false;
      if (!normalized) return true;
      return `${record.document.metadata.title} ${record.document.metadata.description ?? ''}`
        .toLocaleLowerCase('zh-CN')
        .includes(normalized);
    });
  }, [collection, query, sortedForms]);

  useEffect(() => {
    if (!creating) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCreating(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    const focusFrame = window.requestAnimationFrame(() => titleInputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [creating]);

  const chooseTemplate = (nextTemplate: WorkspaceTemplateId) => {
    setTemplate(nextTemplate);
    if (nextTemplate === 'onboarding') {
      setTitle('新员工入职申请');
      setDescription('收集入职资料并提交给人力资源团队审核。');
    } else {
      setTitle('');
      setDescription('');
    }
  };

  const openCreate = (nextTemplate: WorkspaceTemplateId = 'blank') => {
    chooseTemplate(nextTemplate);
    setCreating(true);
  };

  const create = () => {
    if (!title.trim()) return;
    props.onCreate(title.trim(), description.trim(), template);
    setCreating(false);
    setTitle('');
    setDescription('');
    setTemplate('blank');
  };

  const showCollection = (nextCollection: WorkspaceCollection) => {
    setCollection(nextCollection);
    setQuery('');
    if (window.innerWidth < 840) setSidebarOpen(false);
  };

  const clearFilters = () => {
    setCollection('all');
    setQuery('');
  };

  const collectionTitle = collection === 'workflow' ? '工作流节点示例' : '最近表单';

  return (
    <main className={`playground-workspace ${sidebarOpen ? 'sidebar-visible' : ''}`}>
      {sidebarOpen && (
        <aside className="playground-workspace-sidebar" aria-label="A3S Form 导航" inert={creating}>
          <header className="playground-sidebar-product-header">
            <strong>表单</strong>
            <button
              type="button"
              className="playground-icon-button"
              aria-label="收起表单侧边栏"
              title="收起侧边栏"
              onClick={() => setSidebarOpen(false)}
            >
              <ProductIcon name="panel-left-close" size={16} />
            </button>
          </header>

          <section className="playground-workspace-card" aria-label="当前工作区">
            <span className="playground-sidebar-label">工作区</span>
            <div>
              <span className="playground-workspace-card-icon">
                <ProductIcon name="database" size={17} />
              </span>
              <span>
                <strong>在线 Playground</strong>
                <small>
                  {props.forms.length} 份表单 · {fieldCount} 个字段
                </small>
              </span>
            </div>
          </section>

          <nav className="playground-sidebar-nav" aria-label="产品页面">
            <span className="playground-sidebar-label">产品</span>
            <button
              type="button"
              className={collection === 'all' ? 'is-active' : ''}
              aria-current={collection === 'all' ? 'page' : undefined}
              onClick={() => showCollection('all')}
            >
              <ProductIcon name="folder" size={16} />
              <span className="playground-sidebar-item-label">我的表单</span>
              <em>{props.forms.length}</em>
            </button>
            <button
              type="button"
              className={collection === 'workflow' ? 'is-active' : ''}
              aria-current={collection === 'workflow' ? 'page' : undefined}
              onClick={() => showCollection('workflow')}
            >
              <ProductIcon name="template" size={16} />
              <span className="playground-sidebar-item-label">工作流节点</span>
              <em>{workflowCount}</em>
            </button>
            <a href="https://a3s-lab.github.io/Form/" target="_blank" rel="noreferrer">
              <ProductIcon name="book" size={16} />
              <span className="playground-sidebar-item-label">产品文档</span>
              <ProductIcon name="arrow-right" size={12} />
            </a>
          </nav>

          <section className="playground-sidebar-create" aria-label="快速新建">
            <span className="playground-sidebar-label">快速新建</span>
            <button type="button" onClick={() => openCreate('blank')}>
              <span className="playground-quick-create-icon">
                <ProductIcon name="file" size={15} />
              </span>
              <span className="playground-sidebar-item-label">空白表单</span>
            </button>
            <button type="button" onClick={() => openCreate('onboarding')}>
              <span className="playground-quick-create-icon template">
                <ProductIcon name="form" size={15} />
              </span>
              <span className="playground-sidebar-item-label">入职申请</span>
            </button>
          </section>

          <div className="playground-sidebar-footer">
            <section className="playground-sidebar-storage" aria-label="存储状态">
              <span className={props.storageAvailable ? 'is-ready' : 'is-warning'} />
              <div>
                <strong>{props.storageAvailable ? '本地自动保存' : '临时会话'}</strong>
                <small>
                  {props.storageAvailable ? '数据仅保存在此浏览器' : '关闭页面后数据可能丢失'}
                </small>
              </div>
            </section>
          </div>
        </aside>
      )}

      {sidebarOpen && (
        <button
          type="button"
          className="playground-sidebar-scrim"
          aria-label="关闭表单侧边栏"
          inert={creating}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <section className="playground-workspace-main" inert={creating}>
        <div className="playground-workspace-content">
          <header className="playground-home-header">
            <div className="playground-home-title">
              {!sidebarOpen && (
                <button
                  type="button"
                  className="playground-icon-button playground-sidebar-open"
                  aria-label="展开表单侧边栏"
                  title="展开侧边栏"
                  onClick={() => setSidebarOpen(true)}
                >
                  <ProductIcon name="panel-left-open" size={17} />
                </button>
              )}
              <div>
                <span>A3S Form</span>
                <h1>我的表单</h1>
              </div>
            </div>
            <div className="playground-home-actions">
              <label className="playground-search">
                <ProductIcon name="search" size={15} />
                <span className="sr-only">搜索表单</span>
                <input
                  value={query}
                  placeholder="搜索表单"
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}>
                    <ProductIcon name="close" size={13} />
                  </button>
                )}
              </label>
              <button type="button" className="playground-primary" onClick={() => openCreate()}>
                <ProductIcon name="plus" size={15} />
                新建表单
              </button>
            </div>
          </header>

          <section className="playground-template-section" aria-labelledby="create-title">
            <div className="playground-section-heading">
              <div>
                <h2 id="create-title">新建</h2>
                <span>选择一个起点</span>
              </div>
            </div>
            <div className="playground-template-grid">
              <TemplateCard
                icon="file"
                title="空白表单"
                description="从空白画布开始"
                onClick={() => openCreate('blank')}
              />
              <TemplateCard
                icon="form"
                title="入职申请模板"
                description="包含字段与显隐规则"
                onClick={() => openCreate('onboarding')}
              />
            </div>
          </section>

          <section className="playground-recent-section" aria-labelledby="recent-title">
            <div className="playground-section-heading">
              <div>
                <h2 id="recent-title">{collectionTitle}</h2>
                <span>{visibleForms.length} 份表单</span>
              </div>
              {(query || collection !== 'all') && (
                <button type="button" className="playground-text-button" onClick={clearFilters}>
                  查看全部
                  <ProductIcon name="arrow-right" size={13} />
                </button>
              )}
            </div>

            {!props.storageAvailable && (
              <div className="playground-storage-warning" role="alert">
                <ProductIcon name="database" size={16} />
                浏览器拒绝了本地存储访问，本次修改只能保留到页面关闭前。
              </div>
            )}

            {visibleForms.length > 0 ? (
              <div className="playground-form-grid">
                {visibleForms.map((record) => (
                  <FormCard
                    key={record.id}
                    record={record}
                    onOpen={() => props.onOpen(record.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="playground-search-empty">
                <span>
                  <ProductIcon name="search" size={21} />
                </span>
                <strong>{query ? `没有找到“${query}”` : '这个分类暂时没有表单'}</strong>
                <p>{query ? '换一个关键词试试。' : '返回全部表单，或从上方模板新建。'}</p>
                <button type="button" className="playground-secondary" onClick={clearFilters}>
                  查看全部表单
                </button>
              </div>
            )}
          </section>
        </div>
      </section>

      {creating && (
        <div className="playground-dialog-backdrop" role="presentation">
          <button
            type="button"
            className="playground-dialog-dismiss"
            aria-label="点击遮罩关闭新建表单"
            onClick={() => setCreating(false)}
          />
          <section
            className="playground-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-form-title"
          >
            <header>
              <div>
                <span className="playground-dialog-icon" aria-hidden="true">
                  <ProductIcon name="form" size={19} />
                </span>
                <span>
                  <strong id="create-form-title">创建表单</strong>
                  <small>选择起点，命名后进入设计器</small>
                </span>
              </div>
              <button type="button" aria-label="关闭新建表单" onClick={() => setCreating(false)}>
                <ProductIcon name="close" size={17} />
              </button>
            </header>
            <div className="playground-dialog-body">
              <fieldset className="playground-template-picker">
                <legend>选择起点</legend>
                <div className="playground-template-options">
                  <button
                    type="button"
                    className={template === 'blank' ? 'is-selected' : ''}
                    aria-pressed={template === 'blank'}
                    onClick={() => chooseTemplate('blank')}
                  >
                    <ProductIcon name="file" size={18} />
                    <span>
                      <strong>空白表单</strong>
                      <small>从零开始搭建</small>
                    </span>
                    <i>
                      <ProductIcon name="check" size={12} />
                    </i>
                  </button>
                  <button
                    type="button"
                    className={template === 'onboarding' ? 'is-selected' : ''}
                    aria-pressed={template === 'onboarding'}
                    onClick={() => chooseTemplate('onboarding')}
                  >
                    <ProductIcon name="form" size={18} />
                    <span>
                      <strong>入职审批</strong>
                      <small>字段与显隐规则</small>
                    </span>
                    <i>
                      <ProductIcon name="check" size={12} />
                    </i>
                  </button>
                </div>
              </fieldset>
              <div className="playground-dialog-fields">
                <label>
                  <span>
                    表单名称 <em>*</em>
                  </span>
                  <input
                    ref={titleInputRef}
                    aria-label="新表单名称"
                    placeholder="例如：客户满意度调查"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') create();
                    }}
                  />
                </label>
                <label>
                  <span>
                    表单说明 <small>选填</small>
                  </span>
                  <textarea
                    aria-label="新表单说明"
                    placeholder="说明这个表单用于收集什么信息"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </div>
              <p className="playground-dialog-note">
                <ProductIcon name="database" size={14} />
                创建后自动保存在当前浏览器，不会上传任何数据。
              </p>
            </div>
            <footer>
              <button
                type="button"
                className="playground-secondary"
                onClick={() => setCreating(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="playground-primary"
                disabled={!title.trim()}
                onClick={create}
              >
                创建并开始设计
                <ProductIcon name="arrow-right" size={15} />
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

function TemplateCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: 'file' | 'form';
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="playground-template-card" onClick={onClick}>
      <span className="playground-template-preview" aria-hidden="true">
        <span className="playground-template-sheet">
          <ProductIcon name={icon} size={22} />
          <i />
          <i />
          <i />
        </span>
      </span>
      <span className="playground-template-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

function FormCard({ record, onOpen }: { record: PlaygroundFormRecord; onOpen: () => void }) {
  const previewFields = getPreviewFields(record);
  const recordFieldCount = countFormFields(record.document);

  return (
    <button
      type="button"
      className="playground-form-card"
      aria-label={`打开${record.document.metadata.title}`}
      onClick={onOpen}
    >
      <span className="playground-form-preview" aria-hidden="true">
        <span className="playground-form-sheet">
          <strong>{record.document.metadata.title}</strong>
          <span>
            {previewFields.length > 0 ? (
              previewFields.map((field) => (
                <i key={field}>
                  <em>{field}</em>
                  <span />
                </i>
              ))
            ) : (
              <i className="is-empty">
                <em>空白表单</em>
                <span />
              </i>
            )}
          </span>
        </span>
      </span>
      <span className="playground-form-copy">
        <strong>{record.document.metadata.title}</strong>
        <small>{record.document.metadata.description || '尚未填写表单说明'}</small>
        <span>
          {recordFieldCount} 个字段 · v{record.document.revision} ·{' '}
          <time dateTime={record.updatedAt}>{formatUpdatedAt(record.updatedAt)}</time>
        </span>
      </span>
      <span className="playground-form-kind">
        <ProductIcon name="form" size={14} />
      </span>
    </button>
  );
}
