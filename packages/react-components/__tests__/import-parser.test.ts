import { describe, it, expect } from 'vitest';
import { parseImportToml, resolveCombo } from '../src/shortcut-library/src/engine/import-parser';
import type { KeyStroke } from '../src/shortcut-library/src/types';

describe('resolveCombo', () => {
  it('resolves Ctrl+R to ControlLeft + KeyR', () => {
    const result = resolveCombo('Ctrl+R');
    expect(result).toBeInstanceOf(Array);
    const keys = result as KeyStroke[];
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatchObject({ code: 'ControlLeft', label: 'Ctrl', isModifier: true });
    expect(keys[1]).toMatchObject({ code: 'KeyR', label: 'R', isModifier: false });
  });

  it('resolves Shift+Alt+F to ShiftLeft + AltLeft + KeyF', () => {
    const result = resolveCombo('Shift+Alt+F');
    expect(result).toBeInstanceOf(Array);
    const keys = result as KeyStroke[];
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatchObject({ code: 'ShiftLeft', isModifier: true });
    expect(keys[1]).toMatchObject({ code: 'AltLeft', isModifier: true });
    expect(keys[2]).toMatchObject({ code: 'KeyF', isModifier: false });
  });

  it('resolves ArrowUp', () => {
    const result = resolveCombo('↑');
    expect(result).toBeInstanceOf(Array);
    const keys = result as KeyStroke[];
    expect(keys[0]).toMatchObject({ code: 'ArrowUp', label: '↑' });
  });

  it('rejects modifier-only combo (Ctrl+Shift)', () => {
    const result = resolveCombo('Ctrl+Shift');
    expect(typeof result).toBe('string');  // error string
  });

  it('rejects empty combo', () => {
    const result = resolveCombo('');
    expect(typeof result).toBe('string');
  });

  it('resolves single letter', () => {
    const result = resolveCombo('X');
    expect(result).toBeInstanceOf(Array);
    expect((result as KeyStroke[])[0]).toMatchObject({ code: 'KeyX', label: 'X' });
  });

  it('resolves F1..F12', () => {
    const result = resolveCombo('F7');
    expect(result).toBeInstanceOf(Array);
    expect((result as KeyStroke[])[0]).toMatchObject({ code: 'F7' });
  });

  // 回归:键盘 ROWS / keymap.LABEL_MAP 加了导航簇,但 import-parser 有自己独立的
  // LABEL_REVERSE 表,当时漏了 → 导入 Krita 这类用 PageUp/PageDown 的配置直接
  // 报「无法识别的按键」。两套表必须同步。
  describe('navigation cluster keys', () => {
    it.each([
      ['PageUp', 'PageUp', 'PgUp'],
      ['PgUp', 'PageUp', 'PgUp'],
      ['PageDown', 'PageDown', 'PgDn'],
      ['PgDn', 'PageDown', 'PgDn'],
      ['Home', 'Home', 'Home'],
      ['End', 'End', 'End'],
      ['Insert', 'Insert', 'Ins'],
      ['Ins', 'Insert', 'Ins'],
      ['Delete', 'Delete', 'Del'],
      ['Del', 'Delete', 'Del'],
    ])('resolves %s → code %s / label %s', (input, code, label) => {
      const result = resolveCombo(input);
      expect(result, `"${input}" must resolve, got: ${String(result)}`).toBeInstanceOf(Array);
      const keys = result as KeyStroke[];
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatchObject({ code, label, isModifier: false });
    });

    it('resolves Ctrl+PageUp / Ctrl+PageDown as modifier + nav key', () => {
      for (const [input, expectedCode] of [
        ['Ctrl+PageUp', 'PageUp'],
        ['Ctrl+PageDown', 'PageDown'],
      ] as const) {
        const result = resolveCombo(input);
        expect(result, `"${input}" must resolve`).toBeInstanceOf(Array);
        const keys = result as KeyStroke[];
        expect(keys).toHaveLength(2);
        expect(keys[0]).toMatchObject({ code: 'ControlLeft', isModifier: true });
        expect(keys[1]).toMatchObject({ code: expectedCode, isModifier: false });
      }
    });
  });

  // 兼容层:AI 生成 TOML 时经常把方向键写成英文名(Alt+Left / ArrowUp 等),
  // 解析器必须能识别并归一为 ArrowXxx,否则 Grasshopper 这类方向键大户直接导入失败。
  describe('direction key aliases (AI-generated combos)', () => {
    it.each([
      ['Left', 'ArrowLeft', '←'],
      ['Right', 'ArrowRight', '→'],
      ['Up', 'ArrowUp', '↑'],
      ['Down', 'ArrowDown', '↓'],
      ['ArrowLeft', 'ArrowLeft', '←'],
      ['ArrowRight', 'ArrowRight', '→'],
      ['ArrowUp', 'ArrowUp', '↑'],
      ['ArrowDown', 'ArrowDown', '↓'],
    ])('resolves %s → code %s / label %s', (input, code, label) => {
      const result = resolveCombo(input);
      expect(result, `"${input}" must resolve, got: ${String(result)}`).toBeInstanceOf(Array);
      const keys = result as KeyStroke[];
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatchObject({ code, label, isModifier: false });
    });

    it('resolves modifier + English direction name combos (Grasshopper style)', () => {
      for (const [input, expectedCode] of [
        ['Alt+Left', 'ArrowLeft'],
        ['Alt+Right', 'ArrowRight'],
        ['Ctrl+Alt+Shift+Left', 'ArrowLeft'],
        ['Ctrl+Alt+Shift+Right', 'ArrowRight'],
        ['Ctrl+Alt+Shift+Up', 'ArrowUp'],
        ['Ctrl+Alt+Shift+Down', 'ArrowDown'],
      ] as const) {
        const result = resolveCombo(input);
        expect(result, `"${input}" must resolve, got: ${String(result)}`).toBeInstanceOf(Array);
        const keys = result as KeyStroke[];
        expect(keys[keys.length - 1]).toMatchObject({ code: expectedCode, isModifier: false });
        expect(keys.filter((k) => k.isModifier)).toHaveLength(keys.length - 1);
      }
    });
  });
});

describe('parseImportToml', () => {
  it('parses a valid TOML with one group and one shortcut', () => {
    const toml = `[[groups]]
name = "VSCode"

[[groups.shortcuts]]
combo = "Ctrl+R"
desc = "打开目录"
`;
    const result = parseImportToml(toml);
    expect(result.errors).toHaveLength(0);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].name).toBe('VSCode');
    expect(result.groups[0].shortcuts).toHaveLength(1);
    expect(result.groups[0].shortcuts[0].description).toBe('打开目录');
    expect(result.groups[0].shortcuts[0].combo.length).toBeGreaterThan(0);
  });

  it('parses two groups with multiple shortcuts', () => {
    const toml = `[[groups]]
name = "Editor"

[[groups.shortcuts]]
combo = "Ctrl+S"
desc = "保存"

[[groups]]
name = "Browser"

[[groups.shortcuts]]
combo = "Ctrl+T"
desc = "新标签页"

[[groups.shortcuts]]
combo = "Ctrl+W"
desc = "关闭标签页"
`;
    const result = parseImportToml(toml);
    expect(result.errors).toHaveLength(0);
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].shortcuts).toHaveLength(1);
    expect(result.groups[1].shortcuts).toHaveLength(2);
  });

  it('returns empty result for empty input', () => {
    const result = parseImportToml('');
    expect(result.groups).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns errors for malformed combo in shortcut entry', () => {
    const toml = `[[groups]]
name = "Test"

[[groups.shortcuts]]
combo = "Ctrl+Shift"
desc = "modifier only"
`;
    const result = parseImportToml(toml);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    // shortcut with bad combo is still included with empty combo
  });

  it('rejects unknown keys in TOML', () => {
    const toml = `[[groups]]
name = "Test"
color = "red"
`;
    const result = parseImportToml(toml);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('skips comment lines', () => {
    const toml = `# 这是一个注释
[[groups]]
name = "G"

[[groups.shortcuts]]
combo = "A"
desc = "only A"
`;
    const result = parseImportToml(toml);
    expect(result.errors).toHaveLength(0);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].shortcuts).toHaveLength(1);
  });

  // 回归:TOML basic string 里 \\ 表示一个反斜杠。旧实现只 replace(/\\"/g,'"'),
  // 没处理 \\,于是 combo = "\\"(反斜杠键)解析出两个字符的 "\\",长度不为 1,
  // CHAR_TO_CODE 匹配失败 → 报「无法识别的按键: "\\"」。Krita 的工具选项快捷键
  // 正好就是反斜杠键,踩中这条。
  describe('TOML escape sequences', () => {
    it('parses combo = "\\\\" as the single Backslash key', () => {
      const toml = `[[groups]]
name = "Krita"

[[groups.shortcuts]]
combo = "\\\\"
desc = "显示工具选项"
`;
      const result = parseImportToml(toml);
      expect(result.errors, `unexpected errors: ${result.errors.join(' | ')}`).toHaveLength(0);
      expect(result.groups[0].shortcuts).toHaveLength(1);
      const combo = result.groups[0].shortcuts[0].combo;
      expect(combo).toHaveLength(1);
      expect(combo[0]).toMatchObject({ code: 'Backslash', label: '\\', isModifier: false });
    });

    it('keeps an escaped backslash inside desc/condition text', () => {
      const toml = `[[groups]]
name = "G"

[[groups.shortcuts]]
combo = "A"
desc = "路径 C:\\\\Users"
condition = "Krita 2.9.6 起 \\\\ 打开工具选项"
`;
      const result = parseImportToml(toml);
      expect(result.errors).toHaveLength(0);
      const sc = result.groups[0].shortcuts[0];
      expect(sc.description).toBe('路径 C:\\Users');
      expect(sc.condition).toBe('Krita 2.9.6 起 \\ 打开工具选项');
    });

    it('does not collapse \\\\" into a bare quote (single-pass unescaping)', () => {
      // 两步 replace 的经典坑:\\" 先变 \" 再被误判成 " —— 反斜杠 + 引号必须都留下
      const toml = `[[groups]]
name = "G"

[[groups.shortcuts]]
combo = "A"
desc = "ends with backslash \\\\ then quote \\" done"
`;
      const result = parseImportToml(toml);
      expect(result.errors).toHaveLength(0);
      expect(result.groups[0].shortcuts[0].description).toBe('ends with backslash \\ then quote " done');
    });
  });

  it('handles desc before combo order-independently', () => {
    const toml = `[[groups]]
name = "Editor"

[[groups.shortcuts]]
desc = "保存文件"
combo = "Ctrl+S"

[[groups.shortcuts]]
combo = "Ctrl+X"
desc = "剪切"
`;
    const result = parseImportToml(toml);
    expect(result.errors).toHaveLength(0);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].shortcuts).toHaveLength(2);
    expect(result.groups[0].shortcuts[0].description).toBe('保存文件');
    expect(result.groups[0].shortcuts[1].description).toBe('剪切');
    expect(result.groups[0].shortcuts[1].combo).toHaveLength(2);
  });

  // 回归:AI 生成的 Grasshopper 快捷键用 Alt+Left 这类英文方向名,
  // 旧解析器整条 combo 报「无法识别的按键」,导致整组导入失败。
  it('parses Grasshopper-style arrow-key combos (AI output regression)', () => {
    const toml = `[[groups]]
name = "Grasshopper"

[[groups.shortcuts]]
combo = "Alt+Left"
desc = "平移画布"

[[groups.shortcuts]]
combo = "Ctrl+Alt+Shift+Up"
desc = "放大视图"
`;
    const result = parseImportToml(toml);
    expect(result.errors, `unexpected errors: ${result.errors.join(' | ')}`).toHaveLength(0);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].name).toBe('Grasshopper');
    expect(result.groups[0].shortcuts).toHaveLength(2);
    expect(result.groups[0].shortcuts[0].combo).toHaveLength(2);
    expect(result.groups[0].shortcuts[0].combo[1]).toMatchObject({ code: 'ArrowLeft', label: '←' });
    expect(result.groups[0].shortcuts[1].combo).toHaveLength(4);
    expect(result.groups[0].shortcuts[1].combo[3]).toMatchObject({ code: 'ArrowUp', label: '↑' });
  });
});
