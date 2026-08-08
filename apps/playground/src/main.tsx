import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type StorageState = 'saving' | 'saved' | 'error';

interface PlaygroundNotice {
  message: string;
  tone: 'success' | 'error';
}

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
  const [storageState, setStorageState] = useState<StorageState>('saved');
  const [notice, setNotice] = useState<PlaygroundNotice>();
  const [storageAvailable, setStorageAvailable] = useState(true);
  const noticeTimer = useRef<number | undefined>(undefined);
  const activeRecord =
    workspace.forms.find((record) => record.id === workspace.activeFormId) ?? workspace.forms[0];
  const document = activeRecord?.document ?? sampleForm;
  const compilation = useMemo(
    () => compileForm(document, { capabilities: playgroundCapabilities }),
    [document],
  );

  const showNotice = useCallback((message: string, tone: PlaygroundNotice['tone'] = 'success') => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ message, tone });
    noticeTimer.current = window.setTimeout(() => setNotice(undefined), 2800);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  useEffect(() => {
    setStorageState('saving');
    const timer = window.setTimeout(() => {
      const available = savePlaygroundWorkspace(localStorage, workspace);
      setStorageAvailable(available);
      setStorageState(available ? 'saved' : 'error');
    }, 240);
    return () => window.clearTimeout(timer);
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

  const save = useCallback(() => {
    const available = savePlaygroundWorkspace(localStorage, workspace);
    setStorageAvailable(available);
    setStorageState(available ? 'saved' : 'error');
    showNotice(
      available ? '已保存到当前浏览器。' : '保存失败，请检查浏览器存储权限。',
      available ? 'success' : 'error',
    );
  }, [showNotice, workspace]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.key.toLocaleLowerCase() !== 's') return;
      event.preventDefault();
      save();
    };
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [save]);

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
    showNotice('表单 JSON 已导出。');
  };

  const importJson = async (file: File) => {
    try {
      const input: unknown = JSON.parse(await file.text());
      const result = compileForm(input, { capabilities: playgroundCapabilities });
      if (!result.ok || !result.document) {
        showNotice(
          `导入失败：${result.diagnostics[0]?.message ?? '文件不是有效的 A3S Form 文档。'}`,
          'error',
        );
        return;
      }
      const timestamp = new Date().toISOString();
      const record = {
        id: createFormId(),
        document: result.document,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      setWorkspace((current) => ({
        ...current,
        activeFormId: record.id,
        forms: [record, ...current.forms],
      }));
      setValue(defaultFormValue(result.document));
      setSurface('editor');
      showNotice(`已导入“${result.document.metadata.title}”。`);
    } catch {
      showNotice('导入失败：请选择有效的 JSON 文件。', 'error');
    }
  };

  const handleAction = (actionId: string) => {
    showNotice(actionId === 'submit' ? '申请已提交，正在等待审批。' : '草稿已保存。');
  };

  return (
    <div className={`playground-shell is-${surface}`}>
      {surface === 'editor' && (
        <header className="playground-header workspace-header">
          <div className="playground-brand" data-workspace-identity>
            <button
              type="button"
              className="playground-back btn"
              data-size="icon-sm"
              data-variant="ghost"
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
              <small>
                <span
                  className={`playground-status is-${storageState}`}
                  role="status"
                  aria-live="polite"
                >
                  <ProductIcon
                    name={
                      storageState === 'saving'
                        ? 'clock'
                        : storageState === 'saved'
                          ? 'check'
                          : 'close'
                    }
                    size={11}
                  />
                  {storageState === 'saving'
                    ? '正在保存'
                    : storageState === 'saved'
                      ? '已保存到本地'
                      : '保存失败'}
                </span>
                <i aria-hidden="true">·</i>
                FORM
                <i aria-hidden="true">·</i>v{document.revision}
              </small>
            </span>
          </div>
          <div className="playground-header-actions" data-workspace-actions>
            <a
              aria-label="打开产品文档"
              className="playground-secondary btn"
              data-variant="secondary"
              href="https://a3s-lab.github.io/Form/"
              target="_blank"
              rel="noreferrer"
            >
              <ProductIcon name="book" size={15} />
              <span>帮助</span>
            </a>
            <button
              aria-label="导出表单"
              type="button"
              className="playground-secondary btn"
              data-variant="secondary"
              onClick={exportJson}
            >
              <ProductIcon name="download" size={15} />
              <span>导出</span>
            </button>
            <button
              aria-label={storageState === 'error' ? '重试保存表单' : '保存表单'}
              aria-keyshortcuts="Control+S Meta+S"
              type="button"
              className={`playground-primary btn is-${storageState}`}
              data-variant="primary"
              onClick={save}
            >
              <ProductIcon
                name={
                  storageState === 'saving' ? 'clock' : storageState === 'saved' ? 'check' : 'save'
                }
                size={15}
              />
              <span>
                {storageState === 'saving'
                  ? '保存中'
                  : storageState === 'saved'
                    ? '已保存'
                    : '重试保存'}
              </span>
            </button>
          </div>
        </header>
      )}

      {surface === 'workspace' ? (
        <WorkspaceView
          forms={workspace.forms}
          storageAvailable={storageAvailable}
          onOpen={openForm}
          onCreate={createForm}
          onImport={importJson}
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
        <div
          className={`playground-toast is-${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {notice.message}
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
