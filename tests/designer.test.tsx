import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { compileForm, type FormDocument, type JsonObject } from '../src/core';
import { FormDesigner } from '../src/react';
import { createDocument } from './fixtures';

function DesignerHarness({ initial = createDocument() }: { initial?: FormDocument }) {
  const [document, setDocument] = useState(() => compileForm(initial).document as FormDocument);
  return (
    <>
      <FormDesigner document={document} onChange={setDocument} />
      <output data-testid="designer-document">{JSON.stringify(document)}</output>
    </>
  );
}

describe('React FormDesigner', () => {
  it('adds, configures, previews, deletes and restores fields in Chinese', () => {
    render(<DesignerHarness />);
    expect(screen.getByTestId('form-designer')).toBeTruthy();
    expect(screen.getByText(/编译通过/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /单行文本/ }));
    expect(screen.getByTestId('designer-document').textContent).toContain('field-1');
    fireEvent.change(screen.getByLabelText('字段标题'), { target: { value: '联系电话' } });
    fireEvent.change(screen.getByLabelText('字段组件'), { target: { value: 'textarea' } });
    fireEvent.change(screen.getByLabelText('字段说明'), { target: { value: '请留下联系方式' } });
    fireEvent.change(screen.getByLabelText('占位提示'), { target: { value: '手机或座机' } });
    fireEvent.change(screen.getByLabelText('栅格宽度'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '必填字段' }));
    expect(screen.getByRole('button', { name: /联系电话/ })).toBeTruthy();
    expect(screen.getByTestId('designer-document').textContent).toContain('请留下联系方式');

    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    fireEvent.change(screen.getByLabelText('联系电话'), { target: { value: '010-12345678' } });
    expect((screen.getByLabelText('联系电话') as HTMLTextAreaElement).value).toBe('010-12345678');
    fireEvent.click(screen.getByRole('button', { name: '设计' }));
    fireEvent.click(screen.getByRole('button', { name: '删除字段' }));
    expect(screen.queryByRole('button', { name: /联系电话/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /撤销/ }));
    expect(screen.getByRole('button', { name: /联系电话/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重做/ }));
    expect(screen.queryByRole('button', { name: /联系电话/ })).toBeNull();
  });

  it('reviews revision-bound AI patches and rejects malformed input', () => {
    const document = compileForm(createDocument()).document as FormDocument;
    render(<DesignerHarness initial={document} />);
    const editor = screen.getByLabelText('FormPatch JSON');
    fireEvent.change(editor, { target: { value: '{invalid' } });
    fireEvent.click(screen.getByRole('button', { name: '校验并应用' }));
    expect(screen.getByText('补丁不是有效 JSON，请检查后重试。')).toBeTruthy();

    fireEvent.change(editor, {
      target: {
        value: JSON.stringify({
          apiVersion: 'a3s.dev/form-patch/v1alpha1',
          baseRevision: document.revision,
          operations: [{ op: 'set', path: '/metadata/title', value: 'AI 审阅后的表单' }],
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '校验并应用' }));
    expect(screen.getByText(/已应用 1 项受控变更/)).toBeTruthy();
    expect(screen.getByTestId('designer-document').textContent).toContain('AI 审阅后的表单');
  });

  it('forwards preview actions to the embedding host', async () => {
    let action = '';
    const document = compileForm(createDocument()).document as FormDocument;
    function Harness() {
      const [value, setValue] = useState<JsonObject>({ name: '张三' });
      return (
        <FormDesigner
          document={document}
          onChange={() => undefined}
          value={value}
          onValueChange={setValue}
          onAction={(id) => {
            action = id;
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(action).toBe('submit'));
  });

  it('adds fields to selected containers, allocates unique ids and reports patch conflicts', () => {
    render(<DesignerHarness />);
    fireEvent.click(screen.getByRole('treeitem', { name: '选择基础信息' }));
    fireEvent.click(screen.getByRole('button', { name: '添加单行文本字段' }));
    fireEvent.click(screen.getByRole('button', { name: '添加单行文本字段' }));
    expect(screen.getByTestId('designer-document').textContent).toContain('field-1');
    expect(screen.getByTestId('designer-document').textContent).toContain('field-2');

    fireEvent.change(screen.getByLabelText('FormPatch JSON'), {
      target: {
        value: JSON.stringify({
          apiVersion: 'a3s.dev/form-patch/v1alpha1',
          baseRevision: 0,
          operations: [{ op: 'set', path: '/metadata/title', value: '过期补丁' }],
        }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '校验并应用' }));
    expect(screen.getByText(/补丁基于 revision 0/)).toBeTruthy();
    expect(screen.getByTestId('designer-document').textContent).not.toContain('过期补丁');
  });

  it('shows compiler diagnostics and an empty inspector for invalid documents', () => {
    const invalid = createDocument();
    invalid.ui.root = 'missing';
    invalid.ui.nodes = [];
    render(<FormDesigner document={invalid} onChange={() => undefined} className="invalid-form" />);
    expect(screen.getByTestId('form-designer').className).toContain('invalid-form');
    expect(screen.getByRole('alert').textContent).toContain('编译诊断');
    expect(screen.getByText('选择一个节点以编辑属性。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '预览' }));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('keeps sparse optional metadata editable through documented defaults', () => {
    const sparse = createDocument();
    sparse.schema.required = undefined;
    sparse.rules = [];
    sparse.dataSources = [];
    sparse.ui.nodes = [
      { id: 'root', kind: 'root', children: ['name'] },
      { id: 'name', kind: 'field', schemaPath: '/properties/name' },
    ];

    render(<DesignerHarness initial={sparse} />);
    expect(screen.getByRole('treeitem', { name: '选择root' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: '选择name' })).toBeTruthy();
    expect((screen.getByLabelText('字段标题') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('字段组件') as HTMLSelectElement).value).toBe('text');
    expect((screen.getByLabelText('栅格宽度') as HTMLSelectElement).value).toBe('12');

    const required = screen.getByRole('checkbox', { name: '必填字段' });
    fireEvent.click(required);
    expect(screen.getByTestId('designer-document').textContent).toContain('"required":["name"]');
    fireEvent.click(required);
    expect(screen.getByTestId('designer-document').textContent).toContain('"required":[]');
  });

  it('fails closed for invalid mutations and safely removes cyclic unmapped nodes', () => {
    const invalid = createDocument();
    invalid.ui.root = 'missing-root';
    render(<FormDesigner document={invalid} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '添加数字字段' }));
    expect(screen.getByRole('alert')).toBeTruthy();

    const cyclic = createDocument();
    cyclic.rules = [];
    cyclic.ui.nodes = [
      { id: 'root', kind: 'root', label: '根节点', children: ['orphan'] },
      { id: 'orphan', kind: 'field', label: '孤立字段', children: ['orphan'] },
    ];
    let changed: FormDocument | undefined;
    const view = render(
      <FormDesigner
        document={cyclic}
        onChange={(next) => {
          changed = next;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '删除字段' }));
    expect(changed?.ui.nodes.map((node) => node.id)).toEqual(['root']);
    view.unmount();
  });
});
