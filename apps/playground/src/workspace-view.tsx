import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductIcon } from './icons';
import { countFormFields, type PlaygroundFormRecord } from './workspace';

export type WorkspaceTemplateId = 'blank' | 'onboarding';

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

function getPreviewFields(record: PlaygroundFormRecord): readonly string[] {
  return record.document.ui.nodes
    .filter((node) => node.kind === 'field' || node.kind === 'repeater')
    .slice(0, 3)
    .map((node) => node.label ?? node.schemaPath ?? '未命名字段');
}

export function WorkspaceView(props: WorkspaceViewProps) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState<WorkspaceTemplateId>('blank');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const sortedForms = useMemo(
    () => [...props.forms].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [props.forms],
  );
  const visibleForms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    if (!normalized) return sortedForms;
    return sortedForms.filter((record) =>
      `${record.document.metadata.title} ${record.document.metadata.description ?? ''}`
        .toLocaleLowerCase('zh-CN')
        .includes(normalized),
    );
  }, [query, sortedForms]);
  const fieldCount = props.forms.reduce(
    (total, record) => total + countFormFields(record.document),
    0,
  );

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
    props.onCreate(title, description, template);
    setCreating(false);
    setTitle('');
    setDescription('');
    setTemplate('blank');
  };

  return (
    <main className="playground-workspace">
      <aside className="playground-workspace-sidebar">
        <div className="playground-sidebar-brand">
          <span aria-hidden="true">
            <ProductIcon name="form" size={20} />
          </span>
          <div>
            <strong>A3S Form</strong>
            <small>表单工作台</small>
          </div>
        </div>

        <nav className="playground-sidebar-nav" aria-label="工作区导航">
          <span className="playground-sidebar-label">工作区</span>
          <span className="playground-sidebar-item is-active" aria-current="page">
            <ProductIcon name="folder" size={17} />
            <span>我的表单</span>
            <em>{props.forms.length}</em>
          </span>
          <button
            type="button"
            className="playground-sidebar-item"
            onClick={() => setQuery('节点配置')}
          >
            <ProductIcon name="template" size={17} />
            <span>工作流节点示例</span>
          </button>
          <a
            className="playground-sidebar-item"
            href="https://a3s-lab.github.io/Form/"
            target="_blank"
            rel="noreferrer"
          >
            <ProductIcon name="book" size={17} />
            <span>产品文档</span>
            <ProductIcon name="arrow-right" size={13} />
          </a>
        </nav>

        <div className="playground-sidebar-spacer" />
        <section className="playground-sidebar-storage" aria-label="存储状态">
          <ProductIcon name="database" size={17} />
          <span>
            <strong>{props.storageAvailable ? '本地自动保存' : '临时会话'}</strong>
            <small>
              {props.storageAvailable ? '数据仅保存在此浏览器' : '关闭页面后数据可能丢失'}
            </small>
          </span>
        </section>
        <div className="playground-sidebar-user">
          <span className="playground-avatar" aria-hidden="true">
            林
          </span>
          <span>
            <strong>林</strong>
            <small>个人工作区</small>
          </span>
        </div>
      </aside>

      <section className="playground-workspace-main">
        <header className="playground-workspace-topbar">
          <div className="playground-breadcrumb">
            <span>个人工作区</span>
            <i>/</i>
            <strong>表单</strong>
          </div>
          <span
            className={`playground-topbar-state ${props.storageAvailable ? 'is-ready' : 'is-warning'}`}
          >
            <i />
            {props.storageAvailable ? '已开启自动保存' : '本地存储不可用'}
          </span>
        </header>

        <div className="playground-workspace-content">
          <section className="playground-workspace-hero">
            <div>
              <h1>我的表单</h1>
              <p>集中管理表单、查看结构，并继续进入设计器编辑。</p>
            </div>
            <button type="button" className="playground-primary" onClick={() => openCreate()}>
              <ProductIcon name="plus" size={17} />
              新建表单
            </button>
          </section>

          <section className="playground-workspace-metrics" aria-label="工作区概览">
            <article>
              <span>表单总数</span>
              <strong>{props.forms.length}</strong>
              <small>当前工作区</small>
            </article>
            <article>
              <span>字段总数</span>
              <strong>{fieldCount}</strong>
              <small>所有表单合计</small>
            </article>
            <article className={props.storageAvailable ? 'is-ready' : 'is-warning'}>
              <span>存储状态</span>
              <strong>{props.storageAvailable ? '正常' : '受限'}</strong>
              <small>{props.storageAvailable ? '浏览器本地存储' : '仅保留当前会话'}</small>
            </article>
          </section>

          <div className="playground-workspace-body">
            <section
              className="playground-library playground-panel"
              aria-labelledby="form-library-title"
            >
              <header>
                <div>
                  <h2 id="form-library-title">表单列表</h2>
                  <p>
                    {visibleForms.length === props.forms.length
                      ? `共 ${props.forms.length} 份`
                      : `找到 ${visibleForms.length} 份`}
                  </p>
                </div>
                <label className="playground-search">
                  <ProductIcon name="search" size={16} />
                  <input
                    aria-label="搜索表单"
                    placeholder="搜索名称或说明"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}>
                      <ProductIcon name="close" size={14} />
                    </button>
                  )}
                </label>
              </header>

              {!props.storageAvailable && (
                <div className="playground-storage-warning" role="alert">
                  <ProductIcon name="database" size={16} />
                  浏览器拒绝了本地存储访问，本次修改只能保留到页面关闭前。
                </div>
              )}

              {visibleForms.length > 0 ? (
                <div className="playground-form-grid">
                  {visibleForms.map((record) => {
                    const previewFields = getPreviewFields(record);
                    const recordFieldCount = countFormFields(record.document);
                    return (
                      <article className="playground-form-card" key={record.id}>
                        <button
                          type="button"
                          className="playground-form-card-open"
                          aria-label={`打开${record.document.metadata.title}`}
                          onClick={() => props.onOpen(record.id)}
                        >
                          <span className="playground-form-preview" aria-hidden="true">
                            <span className="playground-preview-kicker">表单预览</span>
                            <strong>{record.document.metadata.title}</strong>
                            <span className="playground-preview-fields">
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
                          <span className="playground-form-copy">
                            <span className="playground-form-state">
                              <i /> 可编辑草稿
                            </span>
                            <strong>{record.document.metadata.title}</strong>
                            <small>
                              {record.document.metadata.description || '尚未填写表单说明'}
                            </small>
                            <dl>
                              <div>
                                <dt>字段</dt>
                                <dd>{recordFieldCount}</dd>
                              </div>
                              <div>
                                <dt>版本</dt>
                                <dd>v{record.document.revision}</dd>
                              </div>
                              <div>
                                <dt>最近更新</dt>
                                <dd>
                                  <time dateTime={record.updatedAt}>
                                    {formatUpdatedAt(record.updatedAt)}
                                  </time>
                                </dd>
                              </div>
                            </dl>
                            <span className="playground-form-link">
                              打开设计器 <ProductIcon name="arrow-right" size={14} />
                            </span>
                          </span>
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="playground-search-empty">
                  <span>
                    <ProductIcon name="search" size={22} />
                  </span>
                  <strong>没有找到“{query}”</strong>
                  <p>换一个关键词试试，或清空搜索查看全部表单。</p>
                  <button
                    type="button"
                    className="playground-secondary"
                    onClick={() => setQuery('')}
                  >
                    清空搜索
                  </button>
                </div>
              )}
            </section>

            <aside
              className="playground-quickstart playground-panel"
              aria-labelledby="quickstart-title"
            >
              <header>
                <h2 id="quickstart-title">快速创建</h2>
                <p>选择一个适合的起点</p>
              </header>
              <div className="playground-quickstart-options">
                <button type="button" onClick={() => openCreate('blank')}>
                  <span>
                    <ProductIcon name="file" size={18} />
                  </span>
                  <span>
                    <strong>空白表单</strong>
                    <small>从空白画布开始</small>
                  </span>
                  <ProductIcon name="arrow-right" size={14} />
                </button>
                <button type="button" onClick={() => openCreate('onboarding')}>
                  <span>
                    <ProductIcon name="template" size={18} />
                  </span>
                  <span>
                    <strong>入职申请模板</strong>
                    <small>包含 7 个字段和显隐规则</small>
                  </span>
                  <ProductIcon name="arrow-right" size={14} />
                </button>
              </div>
              <div className="playground-workspace-tip">
                <ProductIcon name="database" size={16} />
                <div>
                  <strong>关于本地工作区</strong>
                  <p>表单数据仅保存在当前浏览器，不会上传到服务器。</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {creating && (
        <div className="playground-dialog-backdrop" role="presentation">
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
                  <small>选择起点，命名后即可进入设计器</small>
                </span>
              </div>
              <button type="button" aria-label="关闭新建表单" onClick={() => setCreating(false)}>
                <ProductIcon name="close" size={18} />
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
                    <ProductIcon name="template" size={18} />
                    <span>
                      <strong>入职审批</strong>
                      <small>7 个字段与显隐规则</small>
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
                    placeholder="告诉协作者这个表单用于收集什么信息"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </div>
              <p className="playground-dialog-note">
                <ProductIcon name="database" size={14} />
                创建后会自动保存在当前浏览器中，不会上传任何数据。
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
