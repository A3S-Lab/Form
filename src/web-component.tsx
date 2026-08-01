import { createRoot, type Root } from 'react-dom/client';
import type { FormDocument, FormPlan, JsonObject } from './core';
import { FormDesigner, FormRenderer } from './react';

abstract class ReactFormElement extends HTMLElement {
  protected reactRoot?: Root;

  connectedCallback(): void {
    this.reactRoot ??= createRoot(this);
    this.renderReact();
  }

  disconnectedCallback(): void {
    this.reactRoot?.unmount();
    this.reactRoot = undefined;
  }

  protected abstract renderReact(): void;
}

export class A3SFormRendererElement extends ReactFormElement {
  private currentPlan?: FormPlan;
  private currentValue: JsonObject = {};

  get plan(): FormPlan | undefined {
    return this.currentPlan;
  }

  set plan(value: FormPlan | undefined) {
    this.currentPlan = value;
    this.renderReact();
  }

  get value(): JsonObject {
    return this.currentValue;
  }

  set value(value: JsonObject) {
    this.currentValue = value;
    this.renderReact();
  }

  protected renderReact(): void {
    if (!this.reactRoot || !this.currentPlan) return;
    this.reactRoot.render(
      <FormRenderer
        plan={this.currentPlan}
        value={this.currentValue}
        onChange={(value) => {
          this.currentValue = value;
          this.renderReact();
          this.dispatchEvent(
            new CustomEvent('value-change', { detail: value, bubbles: true, composed: true }),
          );
        }}
        onAction={(actionId, value) => {
          this.dispatchEvent(
            new CustomEvent('form-action', {
              detail: { actionId, value },
              bubbles: true,
              composed: true,
            }),
          );
        }}
      />,
    );
  }
}

export class A3SFormDesignerElement extends ReactFormElement {
  private currentDocument?: FormDocument;
  private currentValue: JsonObject = {};

  get document(): FormDocument | undefined {
    return this.currentDocument;
  }

  set document(value: FormDocument | undefined) {
    this.currentDocument = value;
    this.renderReact();
  }

  get value(): JsonObject {
    return this.currentValue;
  }

  set value(value: JsonObject) {
    this.currentValue = value;
    this.renderReact();
  }

  protected renderReact(): void {
    if (!this.reactRoot || !this.currentDocument) return;
    this.reactRoot.render(
      <FormDesigner
        document={this.currentDocument}
        value={this.currentValue}
        onChange={(document) => {
          this.currentDocument = document;
          this.renderReact();
          this.dispatchEvent(
            new CustomEvent('document-change', { detail: document, bubbles: true, composed: true }),
          );
        }}
        onValueChange={(value) => {
          this.currentValue = value;
          this.renderReact();
          this.dispatchEvent(
            new CustomEvent('value-change', { detail: value, bubbles: true, composed: true }),
          );
        }}
      />,
    );
  }
}

export function defineA3SFormElements(registry: CustomElementRegistry = customElements): void {
  if (!registry.get('a3s-form-renderer'))
    registry.define('a3s-form-renderer', A3SFormRendererElement);
  if (!registry.get('a3s-form-designer'))
    registry.define('a3s-form-designer', A3SFormDesignerElement);
}
