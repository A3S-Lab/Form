import { fireEvent, waitFor } from '@testing-library/react';
import { createApp, h, nextTick, ref as vueRef } from 'vue';
import { assertCompiled, compileForm, type FormDocument, type JsonObject } from '../src/core';
import { A3SFormDesigner, A3SFormRenderer } from '../src/vue';
import {
  type A3SFormDesignerElement,
  A3SFormRendererElement,
  defineA3SFormElements,
} from '../src/web-component';
import { createDocument } from './fixtures';

describe('framework adapters', () => {
  it('bridges Vue renderer values, actions and reactive props', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const plan = assertCompiled(createDocument());
    const value = vueRef<JsonObject>({ name: '张三' });
    const readOnly = vueRef(false);
    let action: { actionId: string; value: JsonObject } | undefined;
    const app = createApp({
      setup: () => () =>
        h(A3SFormRenderer, {
          plan,
          modelValue: value.value,
          readOnly: readOnly.value,
          'onUpdate:modelValue': (next: JsonObject) => {
            value.value = next;
          },
          onAction: (payload: { actionId: string; value: JsonObject }) => {
            action = payload;
          },
        }),
    });
    app.mount(container);
    await nextTick();
    const name = await waitFor(() => {
      const input = container.querySelector('input[id*="name"]') as HTMLInputElement | null;
      expect(input).toBeTruthy();
      return input as HTMLInputElement;
    });
    fireEvent.change(name, { target: { value: '李小明' } });
    await waitFor(() => expect(value.value.name).toBe('李小明'));
    await waitFor(() =>
      expect((container.querySelector('input[id*="name"]') as HTMLInputElement).value).toBe(
        '李小明',
      ),
    );
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);
    await waitFor(() => expect(action).toEqual({ actionId: 'submit', value: { name: '李小明' } }));
    readOnly.value = true;
    await nextTick();
    await waitFor(() =>
      expect((container.querySelector('input[id*="name"]') as HTMLInputElement).disabled).toBe(
        true,
      ),
    );
    app.unmount();
    container.remove();
  });

  it('bridges the Vue designer document and uncontrolled preview value', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const source = compileForm(createDocument()).document as FormDocument;
    const current = vueRef(source);
    let previewValue: JsonObject | undefined;
    const app = createApp({
      setup: () => () =>
        h(A3SFormDesigner as never, {
          document: current.value,
          'onUpdate:document': (next: FormDocument) => {
            current.value = next;
          },
          'onUpdate:modelValue': (next: JsonObject) => {
            previewValue = next;
          },
        }),
    });
    app.mount(container);
    await waitFor(() => expect(container.querySelector('[aria-label="字段标题"]')).toBeTruthy());
    fireEvent.change(container.querySelector('[aria-label="字段标题"]') as HTMLInputElement, {
      target: { value: '真实姓名' },
    });
    await waitFor(() =>
      expect(current.value.ui.nodes.some((node) => node.label === '真实姓名')).toBe(true),
    );
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === '预览',
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(container.querySelector('input[id*="name"]')).toBeTruthy());
    fireEvent.change(container.querySelector('input[id*="name"]') as HTMLInputElement, {
      target: { value: '王小云' },
    });
    await waitFor(() => expect(previewValue?.name).toBe('王小云'));
    app.unmount();
    container.remove();
  });

  it('defines idempotent Web Components and emits controlled value changes', async () => {
    defineA3SFormElements();
    defineA3SFormElements();
    expect(customElements.get('a3s-form-renderer')).toBe(A3SFormRendererElement);
    const element = document.createElement('a3s-form-renderer') as A3SFormRendererElement;
    element.plan = assertCompiled(createDocument());
    element.value = {};
    expect(element.plan).toBeTruthy();
    expect(element.value).toEqual({});
    let detail: JsonObject | undefined;
    let action: { actionId: string; value: JsonObject } | undefined;
    element.addEventListener('value-change', (event) => {
      detail = (event as CustomEvent<JsonObject>).detail;
    });
    element.addEventListener('form-action', (event) => {
      action = (event as CustomEvent<{ actionId: string; value: JsonObject }>).detail;
    });
    document.body.append(element);
    await waitFor(() => expect(element.querySelector('input[id*="name"]')).toBeTruthy());
    fireEvent.change(element.querySelector('input[id*="name"]') as HTMLInputElement, {
      target: { value: '王小云' },
    });
    expect(detail?.name).toBe('王小云');
    fireEvent.click(element.querySelector('button[type="submit"]') as HTMLButtonElement);
    await waitFor(() => expect(action).toEqual({ actionId: 'submit', value: { name: '王小云' } }));
    element.plan = undefined;
    expect(element.plan).toBeUndefined();
    element.remove();
  });

  it('mounts the Web Component designer and emits document and preview changes', async () => {
    defineA3SFormElements();
    const element = document.createElement('a3s-form-designer') as A3SFormDesignerElement;
    element.document = compileForm(createDocument()).document;
    element.value = {};
    expect(element.document).toBeTruthy();
    expect(element.value).toEqual({});
    let changed: FormDocument | undefined;
    let previewValue: JsonObject | undefined;
    element.addEventListener('document-change', (event) => {
      changed = (event as CustomEvent<FormDocument>).detail;
    });
    element.addEventListener('value-change', (event) => {
      previewValue = (event as CustomEvent<JsonObject>).detail;
    });
    document.body.append(element);
    await waitFor(() => expect(element.querySelector('[aria-label="字段标题"]')).toBeTruthy());
    fireEvent.change(element.querySelector('[aria-label="字段标题"]') as HTMLInputElement, {
      target: { value: '姓名字段' },
    });
    await waitFor(() =>
      expect(changed?.ui.nodes.some((node) => node.label === '姓名字段')).toBe(true),
    );
    fireEvent.click(
      Array.from(element.querySelectorAll('button')).find(
        (button) => button.textContent === '预览',
      ) as HTMLButtonElement,
    );
    await waitFor(() => expect(element.querySelector('input[id*="name"]')).toBeTruthy());
    fireEvent.change(element.querySelector('input[id*="name"]') as HTMLInputElement, {
      target: { value: '赵六' },
    });
    await waitFor(() => expect(previewValue?.name).toBe('赵六'));
    element.value = { name: '外部更新' };
    await waitFor(() =>
      expect((element.querySelector('input[id*="name"]') as HTMLInputElement).value).toBe(
        '外部更新',
      ),
    );
    element.document = undefined;
    expect(element.document).toBeUndefined();
    element.remove();
  });
});
