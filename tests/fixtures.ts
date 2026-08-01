import type { FormDocument } from '../src/core';

export function createDocument(): FormDocument {
  return {
    kind: 'a3s.form',
    apiVersion: 'a3s.dev/form/v1alpha1',
    revision: 3,
    metadata: { title: '测试表单' },
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2 },
        age: { type: 'integer', minimum: 18 },
        active: { type: 'boolean' },
        role: { type: 'string', enum: ['admin', 'member'] },
      },
      required: ['name'],
    },
    ui: {
      root: 'root',
      nodes: [
        {
          id: 'root',
          kind: 'root',
          label: '基础信息',
          children: ['name', 'age', 'active', 'role'],
        },
        {
          id: 'name',
          kind: 'field',
          label: '姓名',
          schemaPath: '/properties/name',
          widget: 'text',
        },
        {
          id: 'age',
          kind: 'field',
          label: '年龄',
          schemaPath: '/properties/age',
          widget: 'number',
          width: 6,
        },
        {
          id: 'active',
          kind: 'field',
          label: '启用',
          schemaPath: '/properties/active',
          widget: 'switch',
        },
        {
          id: 'role',
          kind: 'field',
          label: '角色',
          schemaPath: '/properties/role',
          widget: 'select',
          dataSource: 'roles',
        },
      ],
    },
    dataSources: [{ id: 'roles', registryKey: 'test.roles' }],
    actions: [{ id: 'submit', registryKey: 'test.submit', label: '提交', tone: 'primary' }],
    rules: [
      {
        id: 'show-age',
        target: 'age',
        kind: 'visible',
        expression: { op: 'field', path: 'active' },
      },
    ],
  };
}
