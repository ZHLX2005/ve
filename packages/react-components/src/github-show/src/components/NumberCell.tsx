// src/components/NumberCell.tsx —— 数字列单元格。
//
// 值以字符串存 values[colId](与其它列一致),编辑用 type="number" 输入框
// 保证只能输入数字(可小数、可空)。空值渲染为占位,方便展示页按数字排序。

import type { KeyboardEvent } from 'react';

export default function NumberCell({
  value,
  placeholder = '0',
  ariaLabel,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  onCommit: (v: string) => void;
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 输入法 / 移动端场景:Ctrl/Cmd + Enter 失焦提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <input
      className="sl-gh-input sl-gh-input--number"
      type="number"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      onChange={(e) => onCommit(e.target.value)}
    />
  );
}
