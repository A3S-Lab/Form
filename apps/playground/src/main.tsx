import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compileForm, type FormDocument, type JsonObject } from '../../../src/core';
import { FormDesigner } from '../../../src/react';
import '../../../src/styles.css';
import './playground.css';
import { sampleForm } from './sample';

function App() {
  const [document, setDocument] = useState<FormDocument>(() => {
    try {
      const stored = localStorage.getItem('a3s-form-playground');
      return stored ? (JSON.parse(stored) as FormDocument) : sampleForm;
    } catch {
      return sampleForm;
    }
  });
  const [value, setValue] = useState<JsonObject>({});
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const compilation = useMemo(() => compileForm(document), [document]);
  const save = () => {
    localStorage.setItem('a3s-form-playground', JSON.stringify(compilation.document ?? document));
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
    <div className="playground-shell">
      <header className="playground-header">
        <div className="playground-brand">
          <span className="playground-mark">A</span>
          <span>
            <strong>A3S Form</strong>
            <small>AI 原生表单设计器</small>
          </span>
        </div>
        <nav aria-label="主导航">
          <button type="button" className="is-active">
            设计器
          </button>
          <button type="button">模板</button>
          <button type="button">数据源</button>
          <button type="button">发布记录</button>
        </nav>
        <div className="playground-header-actions">
          <span className={`playground-status ${compilation.ok ? 'is-ready' : 'is-error'}`}>
            {compilation.ok ? '● 已就绪' : '● 编译失败'}
          </span>
          <button type="button" className="playground-secondary" onClick={exportJson}>
            导出 JSON
          </button>
          <button type="button" className="playground-primary" onClick={save}>
            {saved ? '已保存' : '保存表单'}
          </button>
          <span className="playground-avatar" role="img" aria-label="当前用户">
            林
          </span>
        </div>
      </header>
      <div className="playground-context">
        <div>
          <span className="playground-back">‹</span>
          <span className="playground-breadcrumb">工作台 / 人力资源 /</span>
          <strong>{document.metadata.title}</strong>
        </div>
        <div>
          <span>文档摘要</span>
          <code>{(compilation.document?.digest ?? '尚未封存').slice(0, 23)}…</code>
        </div>
      </div>
      <main>
        <FormDesigner
          document={compilation.document ?? document}
          onChange={setDocument}
          value={value}
          onValueChange={setValue}
          onAction={handleAction}
        />
      </main>
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
