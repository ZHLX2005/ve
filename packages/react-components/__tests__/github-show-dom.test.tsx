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

  it('moves rows up/down in edit mode (order syncs with doc)', async () => {
    await act(async () => {
      root.render(<GithubShow />);
    });
    await flushLoad();
    clickButtonByText('填充示例');
    await flushLoad();
    clickButtonByText('添加一行');
    await flushLoad();

    // 初始顺序:[vuejs/core, 空行]
    let rows = container.querySelectorAll<HTMLElement>('.sl-gh-row');
    expect(rows).toHaveLength(2);
    const nameOf = (row: HTMLElement) =>
      row.querySelector<HTMLInputElement>('input[aria-label="项目名"]')?.value ?? '';
    expect(nameOf(rows[0])).toBe('vuejs/core');
    expect(nameOf(rows[1])).toBe('');

    // 下移 vuejs/core → [空行, vuejs/core]
    const downBtn = rows[0].querySelector<HTMLButtonElement>('button[title="下移"]');
    expect(downBtn).not.toBeNull();
    act(() => downBtn!.click());
    await flushLoad();
    rows = container.querySelectorAll<HTMLElement>('.sl-gh-row');
    expect(nameOf(rows[0])).toBe('');
    expect(nameOf(rows[1])).toBe('vuejs/core');

    // 上移 vuejs/core → 恢复 [vuejs/core, 空行];此时空行在首位,其"上移"按钮应被禁用
    const firstUpBtn = rows[0].querySelector<HTMLButtonElement>('button[title="上移"]');
    expect(firstUpBtn?.disabled).toBe(true);
    const upBtn = rows[1].querySelector<HTMLButtonElement>('button[title="上移"]');
    expect(upBtn).not.toBeNull();
    act(() => upBtn!.click());
    await flushLoad();
    rows = container.querySelectorAll<HTMLElement>('.sl-gh-row');
    expect(nameOf(rows[0])).toBe('vuejs/core');
    expect(nameOf(rows[1])).toBe('');
  });

  it('adds a number column, sorts by it in display view, and hides columns from display', async () => {
    await act(async () => {
      root.render(<GithubShow />);
    });
    await flushLoad();
    clickButtonByText('填充示例');
    await flushLoad();
    clickButtonByText('添加一行');
    await flushLoad();

    // 列设置:添加"评分"数字列
    clickButtonByText('列设置');
    await flushLoad();
    const titleInput = container.querySelector<HTMLInputElement>('input[aria-label="新列名"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (titleInput && setter) {
        setter.call(titleInput, '评分');
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    const typeSelect = container.querySelector<HTMLSelectElement>('select[aria-label="列类型"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (typeSelect && setter) {
        setter.call(typeSelect, 'number');
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    clickButtonByText('添加列');
    await flushLoad();
    // 关闭按钮文案为 ×,用 aria-label 定位
    const closeBtn = container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
    expect(closeBtn).not.toBeNull();
    act(() => closeBtn!.click());
    await flushLoad();

    // 两行填评分:vuejs/core=80,空行=100
    const scoreInputs = container.querySelectorAll<HTMLInputElement>('input[aria-label="评分"]');
    expect(scoreInputs).toHaveLength(2);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(scoreInputs[0], '80');
        scoreInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        setter.call(scoreInputs[1], '100');
        scoreInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await flushLoad();

    const displayNames = () =>
      Array.from(container.querySelectorAll<HTMLElement>('.sl-gh-dname')).map((n) => n.textContent ?? '');

    // 展示视图:默认保持编辑顺序
    clickButtonByText('展示');
    await flushLoad();
    expect(displayNames()[0]).toBe('vuejs/core');

    // 点"评分"表头 → 升序:80(vuejs/core)在前
    const scoreTh = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.sl-gh-dsort'),
    ).find((b) => b.textContent?.includes('评分'));
    expect(scoreTh).toBeTruthy();
    act(() => scoreTh!.click());
    await flushLoad();
    expect(displayNames()[0]).toBe('vuejs/core');
    // 再点 → 降序:100(空行)在前
    act(() => scoreTh!.click());
    await flushLoad();
    expect(displayNames()[0]).toBe('—');

    // 切回编辑,在列设置里隐藏"评分"列 → 展示页不再出现
    clickButtonByText('编辑');
    await flushLoad();
    clickButtonByText('列设置');
    await flushLoad();
    const visCheckbox = container.querySelector<HTMLInputElement>('input[aria-label="展示页显示 评分"]');
    expect(visCheckbox).not.toBeNull();
    act(() => visCheckbox!.click());
    await flushLoad();
    const closeBtn2 = container.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
    expect(closeBtn2).not.toBeNull();
    act(() => closeBtn2!.click());
    await flushLoad();
    clickButtonByText('展示');
    await flushLoad();
    expect(container.textContent).not.toContain('评分');
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
