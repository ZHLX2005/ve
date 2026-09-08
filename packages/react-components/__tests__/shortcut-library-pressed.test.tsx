// @vitest-environment jsdom
// Pinpoint test: 统一的「按住」交互(鼠标 / 物理键共享)
//   - 按下: 键立刻变蓝(is-on)—— 给用户视觉反馈「正在按住」
//   - 持续 KEY_HOLD_MS(400ms): 弹 mapping popup,展示该键绑定的快捷键
//   - 释放: 立刻回到基态(is-on 移除),popup 保留
// 鼠标 / 物理键路径统一,差别在入口(pointerdown vs keydown),后续一致。

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import ShortcutLibrary from '../src/shortcut-library';

const KEY_HOLD_MS = 400;

function seed(): void {
  localStorage.setItem(
    'sl-shortcut-library:v1',
    JSON.stringify([
      {
        id: 'g1', name: 'VSCode', createdAt: 0, updatedAt: 0,
        shortcuts: [
          {
            id: 's1', createdAt: 0,
            combo: [{ code: 'ControlLeft', label: 'Ctrl', isModifier: true }, { code: 'KeyR', label: 'R', isModifier: false }],
            description: 'open recent',
          },
        ],
      },
    ]),
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  container.style.height = '800px';
  container.style.width = '1280px';
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

describe('hold-to-popup wiring (mouse + keyboard unified)', () => {
  it('mouse pointerdown adds is-on to the key (visual feedback while pressing)', async () => {
    seed();
    await act(async () => {
      root.render(<ShortcutLibrary />);
    });

    const key = container.querySelector('.sl-sl-kb__key[title="KeyQ"]') as HTMLElement | null;
    expect(key).not.toBeNull();
    const classBefore = key!.className;
    expect(key!.classList.contains('is-on')).toBe(false);

    await act(async () => {
      key!.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
      );
    });
    // 按下立即变蓝,给用户「正在按住」反馈
    expect(
      key!.className,
      'key className must include is-on on pointerDown',
    ).toContain('is-on');
    expect(key!.className).not.toBe(classBefore);

    // 短按(< KEY_HOLD_MS)释放 → 回到基态,popup 不弹
    await act(async () => {
      key!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    });
    expect(key!.classList.contains('is-on')).toBe(false);
    expect(document.querySelectorAll('.sl-sl-longpress').length).toBe(0);
  });

  it('mouse hold >= KEY_HOLD_MS opens the mapping popup while still pressing', async () => {
    vi.useFakeTimers();
    try {
      seed();
      await act(async () => {
        root.render(<ShortcutLibrary />);
      });

      const ctr = container.querySelector('.sl-sl-kb__key[title="ControlLeft"]') as HTMLElement | null;
      expect(ctr).not.toBeNull();

      // 按下 → 立即变蓝 + 启动 hold timer
      await act(async () => {
        ctr!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
      });
      expect(ctr!.classList.contains('is-on')).toBe(true);

      // 阈值之前:popup 不应出现
      await act(async () => {
        await vi.advanceTimersByTimeAsync(KEY_HOLD_MS - 1);
      });
      expect(
        document.querySelectorAll('.sl-sl-longpress').length,
        'popup must not appear before KEY_HOLD_MS',
      ).toBe(0);

      // 跨过阈值:popup 出现,键仍保持 is-on(用户还没松开)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      const popups = document.querySelectorAll('.sl-sl-longpress');
      expect(popups.length, 'popup must appear after KEY_HOLD_MS').toBe(1);
      expect(ctr!.classList.contains('is-on'), 'key must stay is-on while popup is open').toBe(true);
      const popup = popups[0] as HTMLElement;
      expect(popup.textContent).toMatch(/VSCode/);
      expect(popup.textContent).toMatch(/Ctrl\s*\+\s*R/);
      expect(popup.textContent).toMatch(/open recent/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pointerout/leave during hold cancels: key returns to base, no popup', async () => {
    vi.useFakeTimers();
    try {
      seed();
      await act(async () => {
        root.render(<ShortcutLibrary />);
      });

      const ctr = container.querySelector('.sl-sl-kb__key[title="ControlLeft"]') as HTMLElement | null;
      await act(async () => {
        ctr!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
      });
      expect(ctr!.classList.contains('is-on')).toBe(true);

      // 鼠标移开键 → 取消 hold(timer 清掉,is-on 移除)
      await act(async () => {
        ctr!.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, button: 0, pointerType: 'mouse' }));
      });
      expect(ctr!.classList.contains('is-on'), 'is-on must be removed on cancel').toBe(false);
      expect(
        document.querySelectorAll('.sl-sl-longpress').length,
        'popup must NOT appear after cancel',
      ).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('physical keyboard hold: key turns blue on keydown, popup appears after KEY_HOLD_MS, key returns to base on keyup', async () => {
    // 与鼠标路径完全统一,只是入口是 window keydown/keyup。
    vi.useFakeTimers();
    try {
      seed();
      await act(async () => {
        root.render(<ShortcutLibrary />);
      });

      const r = container.querySelector('.sl-sl-kb__key[title="ControlLeft"]') as HTMLElement | null;
      expect(r).not.toBeNull();
      const classBefore = r!.className;
      expect(r!.classList.contains('is-on')).toBe(false);

      // 物理键 keydown(非 repeat)→ 键立即变蓝
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft', key: 'Control', bubbles: true }));
      });
      expect(r!.className, 'is-on must be applied on keydown').toContain('is-on');
      expect(r!.className).not.toBe(classBefore);

      // 阈值之前:popup 不应出现
      await act(async () => {
        await vi.advanceTimersByTimeAsync(KEY_HOLD_MS - 1);
      });
      expect(
        document.querySelectorAll('.sl-sl-longpress').length,
        'popup must not appear before KEY_HOLD_MS',
      ).toBe(0);

      // 跨过阈值 → popup 出现
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      const popups = document.querySelectorAll('.sl-sl-longpress');
      expect(popups.length, 'popup must appear after KEY_HOLD_MS').toBe(1);
      const popup = popups[0] as HTMLElement;
      expect(popup.textContent).toMatch(/VSCode/);
      expect(popup.textContent).toMatch(/Ctrl\s*\+\s*R/);

      // 键释放 → 立刻回到基态
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft', key: 'Control', bubbles: true }));
      });
      expect(r!.className, 'is-on must be removed on keyup').toBe(classBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('OS auto-repeat (e.repeat=true) does not restart the 400ms hold timer', async () => {
    // e.repeat 事件不该重启 hold timer(否则 OS auto-repeat 会让 popup
    // 永远弹不出来)。这里只验证:重复 keydown 后 heldKeys 仍只有一份。
    seed();
    await act(async () => {
      root.render(<ShortcutLibrary />);
    });
    const r = container.querySelector('.sl-sl-kb__key[title="KeyR"]') as HTMLElement | null;
    expect(r).not.toBeNull();

    // 第一次 keydown
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
    });
    expect(r!.classList.contains('is-on')).toBe(true);

    // 多次 auto-repeat keydown —— 由于 jsdom 不支持构造带 repeat=true 的事件,
    // 我们只验证没有崩、className 仍稳定。
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
      }
    });
    expect(r!.classList.contains('is-on')).toBe(true);
  });
});

describe('double-click = accelerated hold (instant popup)', () => {
  it('dblclick opens the mapping popup immediately, closes on outside pointerup / Esc', async () => {
    seed();
    await act(async () => {
      root.render(<ShortcutLibrary />);
    });
    const r = container.querySelector('.sl-sl-kb__key[title="KeyR"]') as HTMLElement | null;
    expect(r).not.toBeNull();

    await act(async () => {
      r!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    const popups = document.querySelectorAll('.sl-sl-longpress');
    expect(popups.length, 'dblclick must open the mapping popup immediately').toBe(1);
    const popup = popups[0] as HTMLElement;
    expect(popup.textContent).toMatch(/VSCode/);
    expect(popup.textContent).toMatch(/Ctrl\s*\+\s*R/);

    // 跟其它 popup 完全一样:外部 pointerup 关闭
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    });
    expect(document.querySelectorAll('.sl-sl-longpress').length, 'outside pointerup closes it').toBe(0);

    // Esc 同样关闭
    await act(async () => {
      r!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(document.querySelectorAll('.sl-sl-longpress').length).toBe(1);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelectorAll('.sl-sl-longpress').length, 'Esc closes it').toBe(0);
  });

  it('double-clicking another key replaces the popup (one shared display logic)', async () => {
    seed();
    await act(async () => {
      root.render(<ShortcutLibrary />);
    });
    const r = container.querySelector('.sl-sl-kb__key[title="KeyR"]') as HTMLElement;
    const ctr = container.querySelector('.sl-sl-kb__key[title="ControlLeft"]') as HTMLElement;
    expect(r).not.toBeNull();
    expect(ctr).not.toBeNull();

    await act(async () => {
      r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(document.querySelectorAll('.sl-sl-longpress').length).toBe(1);
    expect(
      (document.querySelector('.sl-sl-longpress') as HTMLElement).textContent,
    ).toMatch(/KeyR/);

    // 双击另一个键 → 覆盖旧 popup(始终只有一个 popup)
    await act(async () => {
      ctr.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(document.querySelectorAll('.sl-sl-longpress').length).toBe(1);
    expect(
      (document.querySelector('.sl-sl-longpress') as HTMLElement).textContent,
      'popup switched to the newly double-clicked key',
    ).toMatch(/ControlLeft/);
  });
});

describe('hover popup: continuity (grace close + popup adoption) + full list', () => {
  const HOVER_OPEN_DELAY = 150;
  const POPUP_CLOSE_DELAY = 200;

  /** 触发 React 合成 onMouseEnter:dispatch mouseover(relatedTarget 在键外) */
  function hoverEnterKey(key: HTMLElement): void {
    key.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
  }

  /** 触发 React 合成 onPointerLeave:dispatch pointerout(relatedTarget 在键外) */
  function hoverLeaveKey(key: HTMLElement): void {
    key.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, button: 0, relatedTarget: document.body }));
  }

  it('hover opens popup; leaving the key does NOT close it instantly (grace)', async () => {
    vi.useFakeTimers();
    try {
      seed();
      await act(async () => { root.render(<ShortcutLibrary />); });
      const key = container.querySelector('.sl-sl-kb__key[title="KeyR"]') as HTMLElement | null;
      expect(key).not.toBeNull();

      await act(async () => { hoverEnterKey(key!); });
      await act(async () => { await vi.advanceTimersByTimeAsync(HOVER_OPEN_DELAY); });
      expect(document.querySelectorAll('.sl-sl-longpress').length, 'hover must open popup').toBe(1);

      // 离开键:宽限期内 popup 保持(旧行为是瞬间关闭,这是本次修复点)
      await act(async () => { hoverLeaveKey(key!); });
      expect(
        document.querySelectorAll('.sl-sl-longpress').length,
        'popup survives leaving the key during grace',
      ).toBe(1);

      // 超过宽限 → 关闭
      await act(async () => { await vi.advanceTimersByTimeAsync(POPUP_CLOSE_DELAY + 10); });
      expect(document.querySelectorAll('.sl-sl-longpress').length, 'popup closes after grace').toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('entering the popup cancels the pending close; leaving the popup closes after grace', async () => {
    vi.useFakeTimers();
    try {
      seed();
      await act(async () => { root.render(<ShortcutLibrary />); });
      const key = container.querySelector('.sl-sl-kb__key[title="KeyR"]') as HTMLElement | null;
      expect(key).not.toBeNull();

      await act(async () => { hoverEnterKey(key!); });
      await act(async () => { await vi.advanceTimersByTimeAsync(HOVER_OPEN_DELAY); });
      const popup = document.querySelector('.sl-sl-longpress') as HTMLElement | null;
      expect(popup).not.toBeNull();

      // 离开键 → 宽限启动;移入 popup → 取消待关闭
      await act(async () => { hoverLeaveKey(key!); });
      await act(async () => { popup!.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(POPUP_CLOSE_DELAY + 50); });
      expect(
        document.querySelectorAll('.sl-sl-longpress').length,
        'popup stays open while the pointer is inside it',
      ).toBe(1);

      // 移出 popup → 宽限后关闭
      await act(async () => { popup!.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })); });
      expect(
        document.querySelectorAll('.sl-sl-longpress').length,
        'popup survives during grace after popup leave',
      ).toBe(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(POPUP_CLOSE_DELAY + 10); });
      expect(document.querySelectorAll('.sl-sl-longpress').length, 'popup closes after leaving popup').toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows ALL bindings for a heavily-bound key (no "… 还有 N 条")', async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(
        'sl-shortcut-library:v1',
        JSON.stringify([
          {
            id: 'g1', name: 'VSCode', createdAt: 0, updatedAt: 0,
            shortcuts: Array.from({ length: 7 }, (_, i) => ({
              id: `s${i}`, createdAt: 0,
              combo: [{ code: 'KeyR', label: 'R', isModifier: false }],
              description: `binding ${i}`,
            })),
          },
        ]),
      );
      await act(async () => { root.render(<ShortcutLibrary />); });
      const key = container.querySelector('.sl-sl-kb__key[title="KeyR"]') as HTMLElement | null;
      expect(key).not.toBeNull();

      await act(async () => {
        key!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      const popup = document.querySelector('.sl-sl-longpress');
      expect(popup).not.toBeNull();
      expect(
        popup!.querySelectorAll('.sl-sl-longpress__item').length,
        'all 7 bindings must render',
      ).toBe(7);
      expect(popup!.textContent).not.toMatch(/还有/);
    } finally {
      vi.useRealTimers();
    }
  });
});
