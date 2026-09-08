import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// 用真解析器校验提示词里的示例 —— 见 "every TOML example inside the prompt parses"
import { parseImportToml } from '../src/shortcut-library/src/engine/import-parser';

/**
 * Source-level regression tests for the four product features added on top
 * of the scroll/collapse fix. Each describe block pins the wiring that the
 * DOM tests don't fully cover (e.g. parser handling of the new `condition`
 * field, helper exports, long-press timing constants).
 *
 * The DOM tests in shortcut-library-dom.test.tsx already verify that the
 * computed styles match the CSS rules below.
 */

const css = readFileSync(
  resolve(__dirname, '../src/shortcut-library/index.css'),
  'utf8',
);
const indexTsx = readFileSync(
  resolve(__dirname, '../src/shortcut-library/index.tsx'),
  'utf8',
);
const importModal = readFileSync(
  resolve(__dirname, '../src/shortcut-library/src/pages/ImportModal.tsx'),
  'utf8',
);
const parser = readFileSync(
  resolve(__dirname, '../src/shortcut-library/src/engine/import-parser.ts'),
  'utf8',
);
const types = readFileSync(
  resolve(__dirname, '../src/shortcut-library/src/types.ts'),
  'utf8',
);
const useShortcuts = readFileSync(
  resolve(__dirname, '../src/shortcut-library/src/hooks/useShortcuts.ts'),
  'utf8',
);
const keyboard = readFileSync(
  resolve(__dirname, '../src/shortcut-library/src/pages/Keyboard.tsx'),
  'utf8',
);
const table = readFileSync(
  resolve(__dirname, '../src/shortcut-library/src/pages/ShortcutTable.tsx'),
  'utf8',
);
const keymap = readFileSync(
  resolve(__dirname, '../src/shortcut-library/src/engine/keymap.ts'),
  'utf8',
);

interface CssRule {
  selector: string;
  decls: Record<string, string>;
}

function parseCss(source: string): CssRule[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: CssRule[] = [];
  let i = 0;
  while (i < stripped.length) {
    const braceOpen = stripped.indexOf('{', i);
    if (braceOpen < 0) break;
    const selector = stripped.slice(i, braceOpen).trim();
    let depth = 1;
    let j = braceOpen + 1;
    while (j < stripped.length && depth > 0) {
      const ch = stripped[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      j++;
    }
    const body = stripped.slice(braceOpen + 1, j - 1);
    const decls: Record<string, string> = {};
    for (const raw of body.split(';')) {
      const line = raw.trim();
      if (!line) continue;
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const prop = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      decls[prop] = val;
    }
    out.push({ selector, decls });
    i = j;
  }
  return out;
}

const rules = parseCss(css);
const decl = (selector: string, prop: string): string | null => {
  for (const r of rules) {
    const sels = r.selector.split(',').map((s) => s.trim());
    if (!sels.includes(selector)) continue;
    const v = r.decls[prop.toLowerCase()];
    if (v !== undefined) return v;
  }
  return null;
};

describe('feature 1 — copy-format prompt', () => {
  it('mentions the role + output constraints LLM needs', () => {
    // The prompt must be self-contained: role, fields, modifiers, examples,
    // and explicit "don't" rules. Without these, the LLM drifts into
    // generic TOML tutorials and the user has to manually fix output.
    expect(importModal).toMatch(/FORMAT_PROMPT\s*=/);
    const promptMatch = importModal.match(/FORMAT_PROMPT\s*=\s*`([\s\S]*?)`;/);
    expect(promptMatch, 'FORMAT_PROMPT template literal missing').not.toBeNull();
    const prompt = promptMatch![1];
    for (const fragment of [
      'condition',
      '组合键',
      'combo',
      'desc',
      '字段表',
      '修饰键',
      '主键',
      '不要',
    ]) {
      expect(prompt).toContain(fragment);
    }
  });

  it('updated doc + parser agree on the condition field', () => {
    // If the doc promises condition but parser rejects it, user gets
    // mysterious "未知字段" errors on import. Keep them in sync.
    const docPath = resolve(__dirname, '../src/shortcut-library/src/IMPORT_FORMAT.md');
    const doc = readFileSync(docPath, 'utf8');
    expect(doc).toMatch(/condition/);
    expect(parser).toMatch(/key === 'condition'/);
  });

  it('documents the key vocabulary the parser actually accepts', () => {
    // 提示词的按键清单就是 LLM 的唯一依据。清单漏了什么,LLM 就只能猜,
    // 用户拿到的就是「无法识别的按键」。导航簇当初就是这么漏掉的。
    const prompt = importModal.match(/FORMAT_PROMPT\s*=\s*`([\s\S]*?)`;/)![1];
    for (const key of ['PageUp', 'PgUp', 'PageDown', 'PgDn', 'Home', 'End', 'Insert']) {
      expect(prompt, `按键清单必须包含 ${key}`).toContain(key);
    }
    // 反斜杠转义 + 加号不能进 combo,这两条是实际踩过的坑
    expect(prompt, '必须说明反斜杠要转义').toMatch(/转义/);
    expect(prompt, '必须说明 + 是分隔符不能当按键').toMatch(/\+ 是分隔符/);
  });

  it('every TOML example inside the prompt parses with zero errors', () => {
    // 这条把「提示词教的写法」和「解析器认的写法」锁在一起。
    // 之前示例里写了 Ctrl+Shift+Digit1,而 Digit1 恰好是提示词自己
    // 明令禁止的全名写法 —— 靠人眼才发现。现在示例一旦自相矛盾,测试就红。
    const prompt = importModal.match(/FORMAT_PROMPT\s*=\s*`([\s\S]*?)`;/)![1]
      // 模板字面量里的 \` 和 \\ 在运行时会还原,这里手工还原成实际文本
      .replace(/\\`/g, '`')
      .replace(/\\\\/g, '\\');

    // 只保留真正的 TOML 语句行,丢掉 # 注释和说明
    const tomlLines = prompt.split('\n').filter((line) => {
      const t = line.trim();
      if (t === '' || t.startsWith('#')) return false;
      return /^\[\[groups(\.shortcuts)?\]\]$/.test(t)
        || /^(name|combo|desc|condition)\s*=/.test(t);
    });
    const toml = tomlLines.join('\n');

    const result = parseImportToml(toml);
    expect(
      result.errors,
      `提示词示例里有解析器不接受的写法: ${result.errors.join(' | ')}`,
    ).toHaveLength(0);
    // sanity:确实抽到了示例,而不是把所有行都过滤空了
    expect(result.groups.length).toBeGreaterThanOrEqual(4);
    const allCombos = result.groups.flatMap((g) => g.shortcuts.map((s) => s.combo));
    expect(allCombos.length).toBeGreaterThanOrEqual(10);
    // 示例 4 必须真的示范了反斜杠键和导航键
    expect(allCombos.some((c) => c.length === 1 && c[0].code === 'Backslash')).toBe(true);
    expect(allCombos.some((c) => c.some((k) => k.code === 'PageUp'))).toBe(true);
  });
});

describe('feature 2 — condition field', () => {
  it('adds condition to the Shortcut type', () => {
    expect(types).toMatch(/condition\?:\s*string/);
  });

  it('passes condition through addShortcut / updateShortcut / importGroups', () => {
    // The addShortcut signature spans the next line in source, so match a
    // distinctive token pair instead of the full sig.
    expect(useShortcuts).toMatch(/addShortcut\s*=\s*useCallback/);
    expect(useShortcuts).toMatch(/condition\?\s*:\s*string/);
    expect(useShortcuts).toMatch(/updateShortcut[\s\S]*condition/);
    // importGroups spreads condition from incoming shortcuts
    expect(useShortcuts).toMatch(/condition:\s*s\.condition/);
  });

  it('parses `condition = "..."` after a shortcut block', () => {
    expect(parser).toMatch(/pendingCondition\s*=\s*null/);
    expect(parser).toMatch(/key === 'condition'/);
    // Normalizes empty string back to undefined so the table doesn't render
    // an empty "条件: " cell.
    expect(parser).toMatch(/condition:\s*sc\.condition\s*\?\s*sc\.condition\s*:\s*undefined/);
  });

  it('renders a 条件 column with explicit width', () => {
    expect(decl('.sl-sl-table__col-cond', 'width')).toBe('22%');
    expect(table).toMatch(/条件/);
  });

  it('lets CapturePopover edit condition alongside combo', () => {
    expect(table).toMatch(/initialCondition=\{s\.condition \?\? ''\}/);
  });
});

describe('feature 3 — long-press mapping popup + flash throttle', () => {
  it('exports findBindingsByCode helper', () => {
    expect(useShortcuts).toMatch(/export function findBindingsByCode/);
    expect(useShortcuts).toMatch(/BindingHit/);
  });

  it('Keyboard wires pointer events with unified onPress/onRelease (heldKeys-driven)', () => {
    // 之前是 timer-based:pointerdown 后 setTimeout 250ms 触发 onLongPress。
    // 然后改成 release-based:pointerdown 记下时间戳,pointerup 时计算按住
    // 时长。最新版:不再有 LONG_PRESS_MS / setTimeout,完全由父组件的
    // onPress / onRelease 回调 + heldKeys state 决定视觉态 + 弹 popup。
    // 鼠标 / 物理键路径完全统一。
    expect(keyboard).toMatch(/onPointerDown=/);
    expect(keyboard).toMatch(/onPointerUp=/);
    expect(keyboard).toMatch(/onPointerLeave=/);
    expect(keyboard).toMatch(/onPointerOut=/);
    expect(keyboard).toMatch(/onPointerCancel=/);
    // 1:1 键盘改造后,Props 改成必选(回调必须显式提供),不再有可选 '?'
    expect(keyboard).toMatch(/onPress: \(code: string\) => void/);
    expect(keyboard).toMatch(/onRelease: \(code: string\) => void/);
  });

  it('Keyboard data lives in keyboard-layout.ts (full 104-key table)', () => {
    // 改造前 Keyboard.tsx 内联 ROWS;改造后拆到独立 data 模块。
    // 这里 grep 数据文件,确保 nav cluster + 异形键都在(回归保护)。
    const layout = readFileSync(
      resolve(__dirname, '../src/shortcut-library/src/data/keyboard-layout.ts'),
      'utf8',
    );
    expect(layout).toMatch(/F1/);
    expect(layout).toMatch(/PrintScreen/);
    expect(layout).toMatch(/NumpadEnter/);
    expect(layout).toMatch(/Numpad0/);
  });

  it('pointerDown now ADDS is-on (hold-to-popup is the new visual feedback)', () => {
    // 之前的设计是「pointerdown 不变 className,长按只弹 popup」,用户反馈
    // 看不到反馈。这一版改为「按下立刻变蓝、持续 hold 弹 popup」,鼠标
    // 和物理键统一。所以 className 会变。
    expect(keyboard).toMatch(/is-on/);
  });

  it('index.tsx tracks keyboard hold for KEY_HOLD_MS then fires onLongPress', () => {
    // 物理键按下时键变蓝,持续 KEY_HOLD_MS(400ms)后弹 mapping popup。
    // 鼠标走同样的 onPress / onRelease 路径,达到同样的 400ms 阈值。
    expect(indexTsx).toMatch(/KEY_HOLD_MS\s*=\s*400/);
    expect(indexTsx).toMatch(/heldKeys/);
    expect(indexTsx).toMatch(/setHeldKeys/);
    expect(indexTsx).toMatch(/holdPress/);
    expect(indexTsx).toMatch(/holdRelease/);
  });

  it('renders the long-press popup via portal to the host target', () => {
    // Without portal the popup would be clipped by .sl-sl-preview's
    // overflow-x:auto (and any other scroll container in the tree).
    expect(indexTsx).toMatch(/createPortal/);
    expect(indexTsx).toMatch(/sl-sl-longpress/);
  });

  it('renders ALL bindings for a key — no "… 还有 N 条" truncation', () => {
    // 用户反馈:悬浮预览的长列表要全部显示,不要截断成「… 还有 N 条」。
    // 实现:全部 hits 直接 map 渲染,popup 内滚动(max-height + overflow-y:auto)。
    expect(indexTsx).not.toMatch(/LONG_PRESS_MAX/);
    // 旧的截断 JSX(「… 还有 {hits.length - MAX} 条」)必须消失;注释里出现
    // 「还有」二字不算,运行期行为由 shortcut-library-pressed.test.tsx 锁定
    expect(indexTsx).not.toMatch(/还有\s*\{longPressPopup/);
    expect(indexTsx).toMatch(/longPressPopup\.hits\.map/);
    expect(css).toMatch(/overflow-y:\s*auto/);
  });

  it('popup positioning avoids viewport edges', () => {
    expect(indexTsx).toMatch(/VIEWPORT_PAD/);
    expect(indexTsx).toMatch(/longPressPopupPos/);
  });
});

describe('feature 4 — row-hover description tooltip', () => {
  it('renders the tooltip via portal (avoiding viewport clipping)', () => {
    expect(indexTsx).toMatch(/sl-sl-rowtip/);
    expect(indexTsx).toMatch(/rowtipPos/);
  });

  it('shows combo + description + condition when present', () => {
    // The tooltip is informational; combo + description must always render,
    // condition is conditional. This guarantees the tooltip is useful even
    // for shortcuts without a condition.
    expect(indexTsx).toMatch(/rowtip__combo/);
    expect(indexTsx).toMatch(/rowtip__desc/);
    expect(indexTsx).toMatch(/rowtip__cond/);
  });

  it('ShortcutTable fires onShortcutHover with shortcut + rect', () => {
    expect(table).toMatch(/onShortcutHover\?:\s*\(shortcut:\s*Shortcut/);
    // Sanity-check that the wiring reaches the props, not the literal pattern.
    expect(table).toMatch(/onShortcutHover\(s,\s*\(e\.currentTarget/);
    expect(table).toMatch(/onShortcutHover\?/);
    expect(table).toMatch(/\(null,\s*null\)/);
  });
});

describe('feature 5 — navigation cluster keys', () => {
  it('renders the 6-key nav cluster in Keyboard layout data', () => {
    // 1:1 键盘改造后,数据从 Keyboard.tsx 搬到 src/data/keyboard-layout.ts。
    // 这里 grep 数据文件,确认 nav 6 键都在(回归保护)。
    const layout = readFileSync(
      resolve(__dirname, '../src/shortcut-library/src/data/keyboard-layout.ts'),
      'utf8',
    );
    for (const code of ['Insert', 'Home', 'PageUp', 'Delete', 'End', 'PageDown']) {
      expect(layout, `${code} must appear in NAV_ROWS`).toMatch(new RegExp(`code: '${code}'`));
    }
  });

  it('keymap labels the nav keys so captured shortcuts render correctly', () => {
    // 没有这些标签,录入 Home/Delete 等会落到 fallback 的全大写(如 'HOME'),很难看
    expect(keymap).toMatch(/Insert: 'Ins'/);
    expect(keymap).toMatch(/Home: 'Home'/);
    expect(keymap).toMatch(/PageUp: 'PgUp'/);
    expect(keymap).toMatch(/Delete: 'Del'/);
    expect(keymap).toMatch(/End: 'End'/);
    expect(keymap).toMatch(/PageDown: 'PgDn'/);
  });
});

describe('feature 6 — hover + double-click-pin reveal', () => {
  it('Keyboard wires mouse hover + double-click', () => {
    // 悬停(仅鼠标)与双击是新加的两个"显示快捷键"入口,与长按汇入同一个 popup
    expect(keyboard).toMatch(/onMouseEnter=/);
    expect(keyboard).toMatch(/onPointerLeave=/);
    expect(keyboard).toMatch(/onDoubleClick=/);
    expect(keyboard).toMatch(/onKeyHoverEnter/);
    expect(keyboard).toMatch(/onKeyHoverLeave/);
    expect(keyboard).toMatch(/onDoubleClickKey/);
  });

  it('index.tsx holds one unified popup — no pin concept at all', () => {
    expect(indexTsx).toMatch(/HOVER_OPEN_DELAY\s*=\s*\d+/);
    expect(indexTsx).toMatch(/handleHoverEnter/);
    expect(indexTsx).toMatch(/handleHoverLeave/);
    expect(indexTsx).toMatch(/handleDoubleClickKey/);
    // pin 概念已完全移除:没有 pinned 状态字段、没有 📌 徽章、没有 is-pinned 环
    expect(indexTsx).not.toMatch(/pinned/);
    expect(indexTsx).not.toMatch(/📌/);
    expect(keyboard).not.toMatch(/pinned/i);
    expect(css).not.toMatch(/is-pinned/);
    expect(css).not.toMatch(/longpress__pin/);
  });

  it('hover popup has a close grace + popup hover adoption (hover continuity)', () => {
    // 悬浮连贯性:离开键不立即关闭(宽限),移入 popup 取消待关闭,
    // popup 用原生 pointerenter/pointerleave(portal 事件不走 React 委托)。
    expect(indexTsx).toMatch(/POPUP_CLOSE_DELAY\s*=\s*\d+/);
    expect(indexTsx).toMatch(/startPopupCloseTimer/);
    expect(indexTsx).toMatch(/clearPopupCloseTimer/);
    expect(indexTsx).toMatch(/addEventListener\('pointerenter'/);
    expect(indexTsx).toMatch(/addEventListener\('pointerleave'/);
    expect(indexTsx).toMatch(/popupRef/);
  });
});