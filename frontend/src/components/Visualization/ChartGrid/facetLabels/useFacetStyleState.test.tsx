import { renderHook, act } from '@testing-library/react';
import { useHeaderStyleState } from './useHeaderStyleState';
import { useValuesStyleState } from './useValuesStyleState';

describe('facet style state hooks', () => {
  test('useHeaderStyleState resolves active depth values and clears on close', () => {
    const { result } = renderHook(() => useHeaderStyleState({
      fontSize: 12,
      orientation: 'horizontal',
      orientationByDepth: ['horizontal', 'vertical'],
      horizontalAlign: 'center',
      verticalAlign: 'center',
      horizontalAlignByDepth: ['start', 'end'],
      verticalAlignByDepth: ['start', 'end'],
    }, {
      defaultOrientation: 'horizontal',
      defaultHorizontalAlign: 'center',
      defaultVerticalAlign: 'center',
    }));

    expect(result.current.activeOrientation).toBe('horizontal');

    const target = document.createElement('div');
    act(() => {
      result.current.handleClick({ currentTarget: target } as any, 1, 'Category');
    });

    expect(result.current.anchorEl).toBe(target);
    expect(result.current.activeDepth).toEqual({ depthIndex: 1, label: 'Category' });
    expect(result.current.activeOrientation).toBe('vertical');
    expect(result.current.activeHorizontalAlign).toBe('end');
    expect(result.current.activeVerticalAlign).toBe('end');

    act(() => {
      result.current.handleClose();
    });

    expect(result.current.anchorEl).toBeNull();
    expect(result.current.activeDepth).toBeNull();
  });

  test('useValuesStyleState resolves wrap mode and orientation by depth', () => {
    const { result } = renderHook(() => useValuesStyleState({
      orientation: 'horizontal' as const,
      orientationByDepth: ['horizontal', 'angled'] as const,
      horizontalAlign: 'center',
      verticalAlign: 'center',
      horizontalAlignByDepth: ['start', 'end'],
      verticalAlignByDepth: ['start', 'end'],
      wrapMode: 'wrap' as const,
      wrapModeByDepth: ['wrap', 'nowrap'] as const,
    }, {
      defaultOrientation: 'horizontal' as const,
      defaultHorizontalAlign: 'center',
      defaultVerticalAlign: 'center',
      defaultWrapMode: 'wrap',
    }));

    const target = document.createElement('div');
    act(() => {
      result.current.handleClick({ currentTarget: target } as any, 1, 'A');
    });

    expect(result.current.activeDepth).toEqual({ depthIndex: 1, label: 'A' });
    expect(result.current.activeOrientation).toBe('angled');
    expect(result.current.activeHorizontalAlign).toBe('end');
    expect(result.current.activeVerticalAlign).toBe('end');
    expect(result.current.activeWrapMode).toBe('nowrap');
  });
});
