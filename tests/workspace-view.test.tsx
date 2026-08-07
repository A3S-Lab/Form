import { fireEvent, render, screen } from '@testing-library/react';
import { sampleForm } from '../apps/playground/src/sample';
import { createFormRecord } from '../apps/playground/src/workspace';
import { WorkspaceView } from '../apps/playground/src/workspace-view';

describe('Playground WorkspaceView', () => {
  it('composes the workspace and create flow from A3S UI contracts', () => {
    const record = createFormRecord(
      'employee-onboarding',
      sampleForm.metadata.title,
      sampleForm.metadata.description ?? '',
      new Date('2026-08-07T00:00:00.000Z'),
      sampleForm,
    );
    render(
      <WorkspaceView
        forms={[record]}
        storageAvailable
        onOpen={() => undefined}
        onCreate={() => undefined}
      />,
    );

    const workspace = screen.getByRole('main');
    expect(workspace.classList.contains('app-shell')).toBe(true);
    expect(workspace.getAttribute('data-navigation')).toBe('expanded');
    expect(
      screen
        .getByRole('complementary', { name: 'A3S Form 导航' })
        .hasAttribute('data-app-navigation'),
    ).toBe(true);
    expect(workspace.querySelector('[data-app-main]')).toBeTruthy();
    expect(workspace.querySelector('[data-app-content]')).toBeTruthy();

    const createButton = screen.getByRole('button', { name: '新建表单' });
    expect(createButton.classList.contains('btn')).toBe(true);
    expect(createButton.getAttribute('data-variant')).toBe('primary');
    fireEvent.click(createButton);

    const dialog = screen.getByRole('dialog', { name: '创建表单' });
    expect(dialog.classList.contains('card')).toBe(true);
    expect(screen.getByLabelText('新表单名称').closest('.field')).toBeTruthy();
  });
});
