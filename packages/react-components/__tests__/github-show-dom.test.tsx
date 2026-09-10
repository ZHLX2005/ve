// @vitest-environment jsdom
// 挂载测试:空态引导 → 填充示例 → 行内链接可点击 → 双视图切换 → 列扩展。

// React 19 act 环境标记,避免 act() 包裹状态更新时的告警。
// @ts-expect-error - React exposes this global to test runners; type defs
// are intentionally missing because it's not part of the public API.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 没有 canvas 实现:把 echarts 换成桩,聚焦组件行为而非图表渲染。
vi.mock('echarts/core', () => ({
  use: () => {},
  init: () => ({
    setOption: () => {},
    resize: () => {},
    dispose: () => {},
    getDataURL: () => 'data:image/png;base64,stub',
  }),
}));

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GithubShow from '../src/github-show';

const CSS = readFileSync(resolve(__dirname, '../src/github-show/index.css'), 'utf8');

let container: HTMLDivElement;
let root: Root;
let styleNode: HTMLStyleElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  styleNode = document.createElement('style');
  styleNode.textContent = CSS;
  document.head.appendChild(styleNode);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  styleNode.remove();
  localStorage.clear();
});

async function flushLoad(): Promise<void> {
  // 组件 mount 时异步 load(localStorage 同步读取,微任务即可落定)
  await act(async () => {
    await Promise.resolve();
  });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
}

function clickButtonByText(text: string): void {
  const btn = buttons().find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`button with text "${text}" not found`);
  act(() => btn.click());
}

describe('GithubShow', () => {
  it('renders empty state with guidance for first-time guest', async () => {
    await act(async () => {
      root.render(<GithubShow />);
    });
    await flushLoad();

    const text = container.textContent ?? '';
    expect(text).toContain('还没有项目');
    expect(text).toContain('游客模式');
    expect(container.querySelector('.sl-gh-empty__actions')).not.toBeNull();
  });

  it('fills a sample row and derives project name from the url', async () => {
    await act(async () => {
      root.render(<GithubShow />);
    });
    await flushLoad();

    clickButtonByText('填充示例');
    await flushLoad();

    // 合法链接 → 渲染为可点击链接(可跳转),展示文本为 owner/repo
    const link = container.querySelector<HTMLAnchorElement>('.sl-gh-linkcell__a');
    expect(link?.getAttribute('href')).toBe('https://github.com/vuejs/core');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.textContent).toBe('vuejs/core');

    const nameInput = container.querySelector<HTMLInputElement>('input[aria-label="项目名"]');
    expect(nameInput?.value).toBe('vuejs/core');
    const highlights = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="vuejs/core 的亮点"]');
    expect(highlights?.value).toContain('示例亮点');
    const insights = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="vuejs/core 的启发"]');
    expect(insights?.value).toContain('示例启发');
  });

  it('supports adding an empty row', async () => {
    await act(async () => {
      root.render(<GithubShow />);
    });
    await flushLoad();

    clickButtonByText('添加一行');
    await flushLoad();

    const urlInput = container.querySelector<HTMLInputElement>('input[aria-label="GitHub 仓库链接"]');
    expect(urlInput).not.toBeNull();
    expect(urlInput?.value).toBe('');
    // 计数更新
    expect(container.textContent).toContain('1 个项目');
  });

  it('switches to display view: stats cards, chart containers and export button', async () => {
    await act(async () => {
      root.render(<GithubShow />);
    });
    await flushLoad();
    clickButtonByText('填充示例');
    await flushLoad();

    clickButtonByText('展示');
    await flushLoad();

    const text = container.textContent ?? '';
    expect(text).toContain('导出 PDF');
    expect(text).toContain('项目总数');
    expect(container.querySelector('.sl-gh-dchart__canvas')).not.toBeNull();
    // 展示表格里的链接也可点击
    expect(container.querySelector<HTMLAnchorElement>('.sl-gh-dlink')?.getAttribute('target')).toBe(
      '_blank',
    );
    // 编辑按钮不再可见(视图分离)
    expect(text).not.toContain('添加项目');
  });

  it('adds a custom column via column settings modal', async () => {
    await act(async () => {
      root.render(<GithubShow />);
    });
    await flushLoad();
    clickButtonByText('填充示例');
    await flushLoad();

    clickButtonByText('列设置');
    await flushLoad();

    const modal = container.querySelector('.sl-gh-modal');
    expect(modal).not.toBeNull();
    const titleInput = modal?.querySelector<HTMLInputElement>('input[aria-label="新列名"]');
    expect(titleInput).not.toBeNull();
    act(() => {
      // React 受控输入:用原生 value setter + input 事件模拟用户输入
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (titleInput && setter) {
        setter.call(titleInput, '技术栈');
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    clickButtonByText('添加列');
    await flushLoad();

    expect(container.textContent).toContain('技术栈');
  });
});
