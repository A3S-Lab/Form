import {
  workflowFormSeeds,
  workflowNodeDescriptors,
  workflowNodeKinds,
} from '../apps/playground/src/workflow-samples';
import { compileForm } from '../src/core';

const expectedDefaults = {
  start: {},
  template: { value: { message: '你好，{{input.name}}！' } },
  llm: { model: '', system: '', prompt: '{{input.prompt}}' },
  agent: { model: '', prompt: '{{input.prompt}}', maxIterations: 6, tools: [] },
  tool: { method: 'POST', endpoint: 'https://api.example.com', body: {} },
  router: { routes: [], default: 'default' },
  memory: { operation: 'search', query: '{{input.query}}', limit: 5 },
  http: { method: 'GET', url: 'https://api.example.com' },
  approval: { message: '是否批准本次运行？' },
  output: {},
};

const expectedKinds = Object.keys(expectedDefaults);

describe('A3S Workflow node configuration examples', () => {
  it('bundles one default A3S Form document for every standard workflow node', () => {
    expect(workflowNodeKinds).toEqual(expectedKinds);
    expect(workflowFormSeeds.map((seed) => seed.id)).toEqual(
      expectedKinds.map((kind) => `workflow-${kind}-config`),
    );
    expect(workflowFormSeeds.every((seed) => seed.seedVersion === 3)).toBe(true);
  });

  it('keeps every bundled example compilable with the playground registry', () => {
    for (const seed of workflowFormSeeds) {
      const result = compileForm(seed.document, {
        capabilities: { widgets: ['a3s.json'] },
      });
      expect(result.ok, `${seed.id}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      expect(seed.document.metadata.owner).toBe('A3S Workflow');
      expect(seed.document.metadata.tags).toContain('NodeDescriptor');
    }
  });

  it('mirrors NodeDescriptor.default_config exactly without executor-only fields', () => {
    for (const descriptor of workflowNodeDescriptors) {
      const expected = expectedDefaults[descriptor.kind];
      const seed = workflowFormSeeds.find(
        (candidate) => candidate.id === `workflow-${descriptor.kind}-config`,
      );

      expect(descriptor.defaultConfig).toEqual(expected);
      expect(seed?.document.schema.default).toEqual(expected);
      expect(Object.keys(seed?.document.schema.properties ?? {})).toEqual(Object.keys(expected));
      expect(
        seed?.document.ui.nodes
          .filter((node) => node.kind === 'field')
          .map((node) => node.schemaPath?.replace('/properties/', '')),
      ).toEqual(Object.keys(expected));
    }
  });

  it('uses a host-owned searchable catalog for workflow model fields', () => {
    for (const kind of ['llm', 'agent']) {
      const seed = workflowFormSeeds.find(
        (candidate) => candidate.id === `workflow-${kind}-config`,
      );
      const model = seed?.document.ui.nodes.find((node) => node.schemaPath === '/properties/model');
      expect(model).toEqual(expect.objectContaining({ widget: 'select', dataSource: 'models' }));
      expect(seed?.document.dataSources).toEqual([
        expect.objectContaining({
          id: 'models',
          registryKey: 'playground.workflow.models',
          trigger: 'focus',
          searchable: true,
        }),
      ]);
    }
  });
});
