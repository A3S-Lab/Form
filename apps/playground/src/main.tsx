import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compileForm, type FormDocument, type JsonObject } from '../../../src/core';
import { FormDesigner } from '../../../src/react';
import '../../../src/styles.css';
import './playground.css';
import './workspace.css';
import { playgroundNodeRegistry } from './custom-nodes';
import { ProductIcon } from './icons';
import { sampleForm } from './sample';
import { workflowFormSeeds } from './workflow-samples';
import {
  createFormRecord,
  loadPlaygroundWorkspace,
  savePlaygroundWorkspace,
  updateWorkspaceDocument,
} from './workspace';
import { type WorkspaceTemplateId, WorkspaceView } from './workspace-view';

const playgroundCapabilities = { widgets: Object.keys(playgroundNodeRegistry) };
const playgroundSeeds = [{ id: 'employee-onboarding', document: sampleForm }, ...workflowFormSeeds];

function createFormId(): string {
  return `form-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function defaultFormValue(document: FormDocument): JsonObject {
  const value = document.schema.default;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return structuredClone(value) as JsonObject;
}

function App() {
  const [workspace, setWorkspace] = useState(() =>
    loadPlaygroundWorkspace(localStorage, playgroundSeeds),
  );
  const [surface, setSurface] = useState<'workspace' | 'editor'>('workspace');
  const [value, setValue] = useState<JsonObject>({});
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const [storageAvailable, setStorageAvailable] = useState(true);
  const activeRecord =
    workspace.forms.find((record) => record.id === workspace.activeFormId) ?? workspace.forms[0];
  const document = activeRecord?.document ?? sampleForm;
  const compilation = useMemo(
    () => compileForm(document, { capabilities: playgroundCapabilities }),
    [document],
  );

  useEffect(() => {
    setStorageAvailable(savePlaygroundWorkspace(localStorage, workspace));
  }, [workspace]);

  const openForm = (formId: string) => {
    const record = workspace.forms.find((item) => item.id === formId);
    setWorkspace((current) => ({ ...current, activeFormId: formId }));
    setValue(record ? defaultFormValue(record.document) : {});
    setSurface('editor');
  };

  const createForm = (title: string, description: string, template: WorkspaceTemplateId) => {
    const record = createFormRecord(
      createFormId(),
      title,
      description,
      new Date(),
      template === 'onboarding' ? sampleForm : undefined,
    );
    setWorkspace((current) => ({
      ...current,
      activeFormId: record.id,
      forms: [record, ...current.forms],
    }));
    setValue({});
    setSurface('editor');
  };

  const updateDocument = (next: FormDocument) => {
    if (!activeRecord) return;
    setWorkspace((current) => updateWorkspaceDocument(current, activeRecord.id, next));
  };

  const save = () => {
    setStorageAvailable(savePlaygroundWorkspace(localStorage, workspace));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(compilation.document ?? document, null, 2)], {
      type: 'application/json',
    });
    const link = Object.assign(documentElement('a'), {
      href: URL.createObjectURL(blob),
      download: 'form.a3s.json',
    });
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleAction = (actionId: string) => {
    setNotice(actionId === 'submit' ? '申请已提交，正在等待审批。' : '草稿已保存。');
    window.setTimeout(() => setNotice(''), 2400);
  };

  return (
    <div className={`playground-shell is-${surface}`}>
      {surface === 'editor' && (
        <header className="playground-header">
          <div className="playground-brand">
            <button
              type="button"
              className="playground-back"
              aria-label="返回表单列表"
              onClick={() => setSurface('workspace')}
            >
              <ProductIcon name="arrow-left" size={19} />
            </button>
            <span className="playground-mark" aria-hidden="true">
              <ProductIcon name="form" size={19} />
            </span>
            <span>
              <strong>{document.metadata.title}</strong>
              <small>表单设计器</small>
            </span>
          </div>
          <div className="playground-document-state">
            <span className={`playground-status ${compilation.ok ? 'is-ready' : 'is-error'}`}>
              <ProductIcon name={compilation.ok ? 'check' : 'close'} size={13} />
              {compilation.ok ? '所有更改已保存' : `${compilation.diagnostics.length} 个问题待处理`}
            </span>
            <i aria-hidden="true" />
            <span>版本 {document.revision}</span>
            <span>{storageAvailable ? '本地工作区' : '临时会话'}</span>
          </div>
          <div className="playground-header-actions">
            <a
              className="playground-secondary"
              href="https://a3s-lab.github.io/Form/"
              target="_blank"
              rel="noreferrer"
            >
              <ProductIcon name="book" size={15} />
              帮助
            </a>
            <button type="button" className="playground-secondary" onClick={exportJson}>
              <ProductIcon name="download" size={15} />
              导出
            </button>
            <button type="button" className="playground-primary" onClick={save}>
              <ProductIcon name={saved ? 'check' : 'save'} size={15} />
              {saved ? '已保存' : '保存表单'}
            </button>
            <span className="playground-user">
              <span className="playground-avatar" role="img" aria-label="当前用户">
                林
              </span>
            </span>
          </div>
        </header>
      )}

      {surface === 'workspace' ? (
        <WorkspaceView
          forms={workspace.forms}
          storageAvailable={storageAvailable}
          onOpen={openForm}
          onCreate={createForm}
        />
      ) : (
        <main className="playground-editor">
          <FormDesigner
            document={compilation.document ?? document}
            onChange={updateDocument}
            value={value}
            onValueChange={setValue}
            onAction={handleAction}
            compileOptions={{ capabilities: playgroundCapabilities }}
            nodeRegistry={playgroundNodeRegistry}
          />
        </main>
      )}

      {notice && (
        <div className="playground-toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
    </div>
  );
}

function documentElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return window.document.createElement(tag);
}

const root = window.document.getElementById('root');
if (!root) throw new Error('找不到应用挂载节点。');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
