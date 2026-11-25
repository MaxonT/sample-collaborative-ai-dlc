import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  resetSidebarSpacesCache,
  setPinnedCollapsed,
  setSpacePinned,
  setSpacesCollapsed,
  useSidebarSpaces,
} from './useSidebarSpaces';

beforeEach(() => {
  localStorage.clear();
  resetSidebarSpacesCache();
});

afterEach(() => {
  resetSidebarSpacesCache();
});

describe('useSidebarSpaces', () => {
  it('starts empty and persists pins and the collapsed section under the user id', () => {
    const { result } = renderHook(() => useSidebarSpaces('u1'));
    expect(result.current.pinned).toEqual([]);
    expect(result.current.pinnedCollapsed).toBe(false);
    expect(result.current.spacesCollapsed).toBe(false);

    act(() => result.current.setPinned('p2', true));
    act(() => result.current.setPinned('p1', true));
    act(() => result.current.setSpacesCollapsed(true));
    act(() => result.current.setPinnedCollapsed(true));
    expect(result.current.pinned).toEqual(['p2', 'p1']);
    expect(result.current.isPinned('p1')).toBe(true);
    expect(result.current.pinnedCollapsed).toBe(true);
    expect(result.current.spacesCollapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem('aidlc.sidebar.spaces.u1')!)).toEqual({
      pinned: ['p2', 'p1'],
      pinnedCollapsed: true,
      spacesCollapsed: true,
    });

    act(() => result.current.setPinnedCollapsed(false));
    expect(result.current.pinnedCollapsed).toBe(false);
    expect(result.current.spacesCollapsed).toBe(true);

    act(() => result.current.setPinned('p2', false));
    expect(result.current.pinned).toEqual(['p1']);
  });

  it('keeps two users on one browser apart', () => {
    setSpacePinned('u1', 'p1', true);
    setSpacesCollapsed('u1', true);
    setPinnedCollapsed('u1', true);
    const other = renderHook(() => useSidebarSpaces('u2'));
    expect(other.result.current.pinned).toEqual([]);
    expect(other.result.current.pinnedCollapsed).toBe(false);
    expect(other.result.current.spacesCollapsed).toBe(false);
    const same = renderHook(() => useSidebarSpaces('u1'));
    expect(same.result.current.pinned).toEqual(['p1']);
    expect(same.result.current.pinnedCollapsed).toBe(true);
    expect(same.result.current.spacesCollapsed).toBe(true);
  });

  it('reads what an earlier session stored, ignoring malformed or duplicate entries', () => {
    localStorage.setItem(
      'aidlc.sidebar.spaces.u1',
      JSON.stringify({ pinned: ['a', 'a', 7, 'b'], pinnedCollapsed: 1, spacesCollapsed: 'yes' }),
    );
    const { result } = renderHook(() => useSidebarSpaces('u1'));
    expect(result.current.pinned).toEqual(['a', 'b']);
    expect(result.current.pinnedCollapsed).toBe(false);
    expect(result.current.spacesCollapsed).toBe(false);

    localStorage.setItem('aidlc.sidebar.spaces.u2', '{not json');
    const broken = renderHook(() => useSidebarSpaces('u2'));
    expect(broken.result.current.pinned).toEqual([]);
  });

  it('shares one value between two mounted sidebars', () => {
    const inline = renderHook(() => useSidebarSpaces('u1'));
    const drawer = renderHook(() => useSidebarSpaces('u1'));
    act(() => inline.result.current.setPinned('p1', true));
    expect(drawer.result.current.isPinned('p1')).toBe(true);
    act(() => inline.result.current.setPinned('p1', true));
    expect(drawer.result.current.pinned).toEqual(['p1']);
  });
});
