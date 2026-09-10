// src/components/ColumnSettingsModal.tsx —— 列扩展弹窗(编辑视图)。
//
// 支持:新增自定义列(名称 + 类型:文本 / 多选 / 数字)、重命名、删除 —— 完整 CRUD;
// 每列可切换「展示页显示 / 隐藏」(编辑页始终显示全部列)。
// 内建列(GitHub 链接 / 项目名 / 亮点 / 启发)固定,不在此管理;
// 产出是内建可选文本列(可修改 / 清空),不在此管理。

import { useEffect, useState, type KeyboardEvent } from 'react';
import type { GithubShowColumn, GithubShowColumnType } from '@api/components/github-show/types';

export interface ColumnSettingsModalProps {
  columns: GithubShowColumn[];
  onAdd: (title: string, type: GithubShowColumnType) => void;
  onRename: (colId: string, title: string) => void;
  onDelete: (colId: string) => void;
  onToggleVisible: (colId: string, hiddenInDisplay: boolean) => void;
  onClose: () => void;
}

const TYPE_LABEL: Record<GithubShowColumnType, string> = {
  text: '文本',
  'multi-select': '多选',
  number: '数字',
};

const BUILTIN_HINT =
  '内建列:GitHub 链接 / 项目名 / 亮点 / 启发(固定);产出为内建可选列,可直接在表格中修改或清空。';

export default function ColumnSettingsModal({
  columns,
  onAdd,
  onRename,
  onDelete,
  onToggleVisible,
  onClose,
}: ColumnSettingsModalProps) {
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState<GithubShowColumnType>('text');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit() {
    const title = draftTitle.trim();
    if (!title) return;
    onAdd(title, draftType);
    setDraftTitle('');
  }

  return (
    <div
      className="sl-gh-modal__backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sl-gh-modal"
        role="dialog"
        aria-modal="true"
        aria-label="列设置"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sl-gh-modal__head">
          <h3 className="sl-gh-modal__title">列设置</h3>
          <button
            type="button"
            className="sl-gh-modal__close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="sl-gh-modal__hint">{BUILTIN_HINT}</p>

        <div className="sl-gh-colmgr">
          {columns.map((c) => (
            <div className="sl-gh-colmgr__row" key={c.id}>
              <input
                className="sl-gh-input"
                value={c.title}
                aria-label="列名"
                onChange={(e) => onRename(c.id, e.target.value)}
              />
              <span
                className={`sl-gh-colmgr__type${c.type === 'multi-select' ? ' is-multi' : ''}${c.type === 'number' ? ' is-num' : ''}`}
              >
                {TYPE_LABEL[c.type]}
              </span>
              <label className="sl-gh-colmgr__vis" title="展示页显示 / 隐藏(编辑页始终显示)">
                <input
                  type="checkbox"
                  checked={!c.hiddenInDisplay}
                  aria-label={`展示页显示 ${c.title}`}
                  onChange={(e) => onToggleVisible(c.id, !e.target.checked)}
                />
                展示
              </label>
              <button
                type="button"
                className="sl-gh-colmgr__del"
                aria-label={`删除列 ${c.title}`}
                title="删除此列(列数据一并删除)"
                onClick={() => onDelete(c.id)}
              >
                ×
              </button>
            </div>
          ))}

          <div className="sl-gh-colmgr__add">
            <input
              className="sl-gh-input"
              value={draftTitle}
              placeholder="新列名,如 技术栈 / 标签 / 评分"
              aria-label="新列名"
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <select
              className="sl-gh-select"
              value={draftType}
              aria-label="列类型"
              onChange={(e) => setDraftType(e.target.value as GithubShowColumnType)}
            >
              <option value="text">文本</option>
              <option value="multi-select">多选</option>
              <option value="number">数字</option>
            </select>
            <button
              type="button"
              className="sl-gh-btn sl-gh-btn--primary"
              onClick={submit}
              disabled={!draftTitle.trim()}
            >
              添加列
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
