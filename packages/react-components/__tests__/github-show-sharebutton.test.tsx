// @vitest-environment jsdom
// ShareButton 弹层回归:点击弹层内部按钮不得触发 click-outside 关闭。
//
// 背景:组件运行在 Shadow DOM 内,document 级 mousedown 的 e.target 会被
// 浏览器 retarget 成 shadow host,若用 contains(target) 判断会把"点击弹层
// 内部"误判成外部导致弹层消失;必须用 e.composedPath() 判断。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ShareButton from '../src/github-show/src/components/ShareButton';

vi.mock('@api/services', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public code: number,
      message: string,
    ) {
      super(message);
    }
  },
  kvV1Service: {
    get: vi.fn(),
    setVisibility: vi.fn(),
  },
  userV1Service: {
    getDefaultGroup: vi.fn(),
  },
}));

import { kvV1Service, userV1Service } from '@api/services';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.clearAllMocks();
  vi.mocked(userV1Service.getDefaultGroup).mockResolvedValue({ groupId: 24 } as never);
  vi.mocked(kvV1Service.get).mockResolvedValue({
    key: 'github-show',
    value: '{}',
    visibility: 'private',
    groupId: 24,
    groupName: '默认',
  } as never);
  vi.mocked(kvV1Service.setVisibility).mockResolvedValue({ message: 'ok' } as never);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(): void {
  act(() => {
    root.render(<ShareButton />);
  });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
}

function clickButtonByText(text: string): HTMLButtonElement {
  const btn = buttons().find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`button with text "${text}" not found`);
  act(() => btn.click());
  return btn;
}

/** 在目标元素上触发一次 mousedown(冒泡到 document,模拟真实点击的第一步)。 */
function mouseDownOn(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
  });
}

describe('ShareButton popover', () => {
  it('keeps the popover open when clicking buttons inside it', async () => {
    render();
    clickButtonByText('设为公开分享');
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('.sl-gh-share__popover')).not.toBeNull();

    // 点击弹层内部"设为公开"按钮(mousedown 冒泡到 document + click)
    const popover = container.querySelector('.sl-gh-share__popover')!;
    const toggleBtn = Array.from(popover.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.includes('设为公开') && !b.textContent?.includes('分享'),
    );
    expect(toggleBtn).toBeTruthy();
    mouseDownOn(toggleBtn!);
    act(() => toggleBtn!.click());
    await act(async () => {
      await Promise.resolve();
    });

    // 弹层不得因 click-outside 误判而关闭
    expect(container.querySelector('.sl-gh-share__popover')).not.toBeNull();
    // 且 visibility 切换成功(公开状态文案出现)
    expect(container.textContent).toContain('改为私有');
  });

  it('closes the popover when clicking outside it', async () => {
    render();
    clickButtonByText('设为公开分享');
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.sl-gh-share__popover')).not.toBeNull();

    // 点击弹层外部区域(document.body 上新增的无关节点)
    const outside = document.createElement('button');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    mouseDownOn(outside);
    outside.remove();

    expect(container.querySelector('.sl-gh-share__popover')).toBeNull();
  });

  it('closes on Escape', async () => {
    render();
    clickButtonByText('设为公开分享');
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.sl-gh-share__popover')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('.sl-gh-share__popover')).toBeNull();
  });
});
