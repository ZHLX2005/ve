// @vitest-environment jsdom
// __tests__/github-show-multisel.test.tsx —— 多选列单元格编辑器:标签增删、去重、序列化。

// React 19 act 环境标记,避免 act() 包裹状态更新时的告警。
// @ts-expect-error - React exposes this global to test runners; type defs
// are intentionally missing because it's not part of the public API.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import MultiSelectCell from '../src/github-show/src/components/MultiSelectCell';

let container: HTMLDivElement;
let root: Root;

function mount(initial: string, onCommit: (v: string) => void) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<MultiSelectCell value={initial} ariaLabel="技术栈" onCommit={onCommit} />);
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function input(): HTMLInputElement {
  const el = container.querySelector('.sl-gh-multisel__input');
  if (!el) throw new Error('multi-select input not found');
  return el as HTMLInputElement;
}

function change(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function key(el: HTMLElement, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });
}

function blur(el: HTMLElement) {
  act(() => {
    // React onBlur 由 focusout(bubbles)驱动
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('MultiSelectCell', () => {
  it('renders existing tags as chips', () => {
    const onCommit = vi.fn();
    mount('["Vue","React"]', onCommit);
    expect(container.textContent).toContain('Vue');
    expect(container.textContent).toContain('React');
  });

  it('adds a tag on Enter and commits serialized JSON', () => {
    const onCommit = vi.fn();
    mount('["Vue","React"]', onCommit);
    const el = input();
    change(el, 'TypeScript');
    key(el, 'Enter');
    expect(onCommit).toHaveBeenCalledWith('["Vue","React","TypeScript"]');
    expect(input().value).toBe('');
  });

  it('does not duplicate an existing tag', () => {
    const onCommit = vi.fn();
    mount('["Vue","React"]', onCommit);
    const el = input();
    change(el, 'Vue');
    key(el, 'Enter');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('removes a tag via its x button', () => {
    const onCommit = vi.fn();
    mount('["Vue","React"]', onCommit);
    const x = container.querySelector<HTMLButtonElement>('[aria-label="删除 Vue"]');
    expect(x).not.toBeNull();
    if (x) click(x);
    expect(onCommit).toHaveBeenCalledWith('["React"]');
  });

  it('commits pending draft on blur', () => {
    const onCommit = vi.fn();
    mount('["Vue","React"]', onCommit);
    const el = input();
    change(el, 'Next');
    blur(el);
    expect(onCommit).toHaveBeenCalledWith('["Vue","React","Next"]');
  });

  it('deletes the last tag on Backspace when input is empty', () => {
    const onCommit = vi.fn();
    mount('["Vue","React"]', onCommit);
    key(input(), 'Backspace');
    expect(onCommit).toHaveBeenCalledWith('["Vue"]');
  });
});
