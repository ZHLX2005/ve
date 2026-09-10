// src/components/MultiSelectCell.tsx —— 多选列单元格编辑器(Notion 式 chip)。
//
// 行为:
//   - 已选值以标签(chip)展示,每个 chip 带 × 可单独删除
//   - 输入框输入新值,Enter / 逗号 / 失焦提交;自动去重、去空白
//   - Backspace 且输入框为空时删除最后一个标签(轻量快捷操作)
// 值存储:serializeTags(tags) → JSON 数组字符串,与 utils/tags 保持一致。

import { useEffect, useState, type KeyboardEvent } from 'react';
import { parseTags, serializeTags } from '../utils/tags';

export interface MultiSelectCellProps {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  onCommit: (value: string) => void;
}

export default function MultiSelectCell({
  value,
  placeholder = '输入后回车添加…',
  ariaLabel,
  onCommit,
}: MultiSelectCellProps) {
  const [tags, setTags] = useState<string[]>(() => parseTags(value));
  const [draft, setDraft] = useState('');

  // 外部值变化(如重新 load / 其它行编辑引发的 doc 重写)时同步
  useEffect(() => {
    setTags(parseTags(value));
  }, [value]);

  function commit(next: string[]) {
    setTags(next);
    onCommit(serializeTags(next));
  }

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (tags.includes(tag)) {
      setDraft('');
      return;
    }
    commit([...tags, tag]);
    setDraft('');
  }

  function removeTag(tag: string) {
    commit(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
      return;
    }
    if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="sl-gh-multisel" role="group" aria-label={ariaLabel}>
      {tags.map((t) => (
        <span className="sl-gh-multisel__tag" key={t}>
          {t}
          <button
            type="button"
            className="sl-gh-multisel__x"
            aria-label={`删除 ${t}`}
            title={`删除 ${t}`}
            onClick={() => removeTag(t)}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="sl-gh-multisel__input"
        value={draft}
        placeholder={tags.length === 0 ? placeholder : ''}
        aria-label={ariaLabel ? `新增${ariaLabel}` : '新增选项'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => addTag(draft)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
