import { act, renderHook } from '@testing-library/react';
import type { JsonValue } from '../src/core';
import { useStableRepeaterRows } from '../src/react/repeater-state';

function identity(item: JsonValue): string | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  return typeof item.id === 'string' ? item.id : undefined;
}

describe('stable repeater row state', () => {
  it('allocates new host identities while retaining existing keys across replacements', () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: JsonValue[] }) => useStableRepeaterRows(items, identity),
      { initialProps: { items: [{ id: 'alpha' }] } },
    );
    const alphaKey = result.current.rows[0].key;

    rerender({ items: [{ id: 'alpha' }, { id: 'beta' }] });
    const betaKey = result.current.rows[1].key;
    expect(result.current.rows[0].key).toBe(alphaKey);
    expect(betaKey).not.toBe(alphaKey);

    rerender({ items: [{ id: 'beta' }, { id: 'alpha' }] });
    expect(result.current.rows.map((row) => row.key)).toEqual([betaKey, alphaKey]);
  });

  it('returns a safe copy when a move would leave the array', () => {
    const items: JsonValue[] = [{ id: 'alpha' }];
    const { result } = renderHook(() => useStableRepeaterRows(items, identity));
    let next: JsonValue[] = [];

    act(() => {
      next = result.current.move(0, -1);
    });

    expect(next).toEqual(items);
    expect(next).not.toBe(items);
  });
});
