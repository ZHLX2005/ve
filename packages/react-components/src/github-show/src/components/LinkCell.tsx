// src/components/LinkCell.tsx —— 可点击跳转的链接单元格(Notion 式)。
//
// 行为:
//   - 值合法(https)且不在编辑态 → 显示为可点击链接,点击新标签页打开
//   - 点击"编辑"或值为空/非法 → 输入框;Enter/失焦提交,Esc 还原
// 输入框聚焦期间始终保持输入态,不会因为输入到一半变成合法 URL 而打断。

import { useEffect, useState, type KeyboardEvent } from 'react';
import { displayLinkText, toHref } from '../utils/repo';

export interface LinkCellProps {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  /** 展示态文本(如 owner/repo);缺省用截断后的 URL */
  displayText?: string;
  autoFocus?: boolean;
  onCommit: (value: string) => void;
}

export default function LinkCell({
  value,
  placeholder,
  ariaLabel,
  displayText,
  autoFocus,
  onCommit,
}: LinkCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const href = toHref(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    onCommit(draft);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  }

  if (!editing && href) {
    return (
      <div className="sl-gh-linkcell">
        <a
          className="sl-gh-linkcell__a"
          href={href}
          target="_blank"
          rel="noreferrer"
          title={value}
        >
          {displayText || displayLinkText(value)}
        </a>
        <button
          type="button"
          className="sl-gh-linkcell__edit"
          aria-label={ariaLabel ? `编辑${ariaLabel}` : '编辑链接'}
          onClick={startEdit}
        >
          编辑
        </button>
      </div>
    );
  }

  return (
    <input
      className="sl-gh-input"
      type="url"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}
