import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  type PropType,
  ref,
  toRaw,
  watch,
} from 'vue';
import type { FormDocument, FormPlan, JsonObject } from './core';
import { FormDesigner, FormRenderer, type FormWidgetRegistry } from './react';

export const A3SFormRenderer = defineComponent({
  name: 'A3SFormRenderer',
  props: {
    plan: { type: Object as PropType<FormPlan>, required: true },
    modelValue: { type: Object as PropType<JsonObject>, required: true },
    readOnly: { type: Boolean, default: false },
    widgetRegistry: { type: Object as PropType<FormWidgetRegistry>, default: undefined },
  },
  emits: ['update:modelValue', 'action'],
  setup(props, { emit }) {
    const container = ref<HTMLElement>();
    let root: Root | undefined;
    const renderReact = () => {
      root?.render(
        createElement(FormRenderer, {
          plan: toRaw(props.plan),
          value: toRaw(props.modelValue),
          readOnly: props.readOnly,
          widgetRegistry: props.widgetRegistry ? toRaw(props.widgetRegistry) : undefined,
          onChange: (value) => emit('update:modelValue', value),
          onAction: (actionId, value) => emit('action', { actionId, value }),
        }),
      );
    };
    onMounted(() => {
      root = createRoot(container.value as HTMLElement);
      renderReact();
    });
    watch(() => [props.plan, props.modelValue, props.readOnly, props.widgetRegistry], renderReact, {
      deep: true,
    });
    onBeforeUnmount(() => root?.unmount());
    return () => h('div', { ref: container, class: 'a3s-form-vue-host' });
  },
});

export const A3SFormDesigner = defineComponent({
  name: 'A3SFormDesigner',
  props: {
    document: { type: Object as PropType<FormDocument>, required: true },
    modelValue: { type: Object as PropType<JsonObject>, default: () => ({}) },
    widgetRegistry: { type: Object as PropType<FormWidgetRegistry>, default: undefined },
  },
  emits: ['update:document', 'update:modelValue'],
  setup(props, { emit }) {
    const container = ref<HTMLElement>();
    let root: Root | undefined;
    const renderReact = () => {
      root?.render(
        createElement(FormDesigner, {
          document: toRaw(props.document),
          value: toRaw(props.modelValue),
          widgetRegistry: props.widgetRegistry ? toRaw(props.widgetRegistry) : undefined,
          onChange: (document) => emit('update:document', document),
          onValueChange: (value) => emit('update:modelValue', value),
        }),
      );
    };
    onMounted(() => {
      root = createRoot(container.value as HTMLElement);
      renderReact();
    });
    watch(() => [props.document, props.modelValue, props.widgetRegistry], renderReact, {
      deep: true,
    });
    onBeforeUnmount(() => root?.unmount());
    return () => h('div', { ref: container, class: 'a3s-form-vue-host' });
  },
});
