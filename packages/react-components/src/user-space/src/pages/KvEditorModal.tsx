// pages/KvEditorModal.tsx —— 新建 / 编辑 KV 共用表单(portal 渲染到 shadowRoot 外)。
// 新建:key 可填;编辑:key 锁定(唯一键不可改)。ttl 以「天」输入,提交时换算秒。
// 编辑模式额外带「版本历史」:列出历史版本摘要(无 value 全文),可选中某版本
// 回滚到它(需 write 权限)。恢复后由父级刷新 initial,value 输入框随之更新。
//
// 可见性(2026-08-30 起后端支持):两态 private/public,public 允许匿名
// 经 `/api/v1/kv/public/:key?groupId=` 直读。本弹窗提供 radio 切换 +
// visibility=public 时显示「🔗 复制公开链接」按钮(走 store.getKvPublicUrl)。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KvVersionView, KvView } from '@api/components/user-space';

export interface KvEditorModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** 编辑模式初始值;新建传 null */
  initial: KvView | null;
  saving: boolean;
  /**
   * 是否允许写入。false 时 value/tags/ttl 输入框与「保存」按钮均 disabled,
   * 编辑模式下给读者一个真正的只读详情视图(只有 Key 始终锁定,见下方)。
   * 默认 true,保持非 reader 行为不变。
   */
  canWrite?: boolean;
  /** 编辑模式的历史版本摘要(version_no DESC,最新在前)。创建模式不拉。 */
  versions?: KvVersionView[];
  versionsLoading?: boolean;
  /** 回滚到指定版本。版本列表不含 value 全文,所以"选择版本"的动作即回滚。 */
  onRestoreVersion?: (version: number) => void;
  onSave: (payload: { key: string; value: string; tags: string[]; ttl: number; visibility?: 'public' | 'private' }) => Promise<void>;
  /** 当前组 id(用于构造公开链接 URL)。不传则「复制公开链接」按钮不出。 */
  groupId?: number;
  /** 当前组名称(展示用,例如「默认组的 site-banner」)。 */
  groupName?: string;
  /** 构造公开读完整 URL(`origin/api/v1/kv/public/:key?groupId=`)。 */
  getPublicUrl: (args: { key: string; groupId: number }) => string;
  onClose: () => void;
}

/** replaced_at(RFC3339)压成「MM-DD HH:mm」;非法/空串原样返回。 */
function formatReplacedAt(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return iso || '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function KvEditorModal({
  open, mode, initial, saving, canWrite = true,
  versions = [], versionsLoading = false, onRestoreVersion,
  onSave, groupId, groupName, getPublicUrl, onClose,
}: KvEditorModalProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [ttlDays, setTtlDays] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  // 编辑模式下拉到的「原 visibility」——只在与 initial 不同(用户主动改了)时
  // 透传给 onSave,否则省略字段,让后端保留现有可见态(防覆盖写把 public 打回 private)。
  // 新建模式无 initial → 默认 'private',显式由用户切换为 'public' 才上送。
  const [initialVisibility, setInitialVisibility] = useState<'public' | 'private'>('private');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  // 复制公开链接成功 toast;3s 自动消失。不复用父级 actionError(那是失败反馈)。
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initVis: 'public' | 'private' = initial?.visibility ?? 'private';
    setKey(mode === 'edit' && initial ? initial.key : '');
    setValue(mode === 'edit' && initial ? initial.value : '');
    setTagsText(mode === 'edit' && initial ? (initial.tags ?? []).join(', ') : '');
    setTtlDays(0);
    setSelectedVersion(null);
    setInitialVisibility(initVis);
    setVisibility(initVis);
    setPublicLinkCopied(false);
  }, [open, mode, initial]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 复制公开链接 → navigator.clipboard.writeText。失败降级用 document.execCommand
  // 选中文本(老浏览器 / 非安全上下文如 http:// 内网可能没有 Clipboard API)。
  async function handleCopyPublicLink(): Promise<void> {
    if (!groupId || !key.trim()) return;
    const url = getPublicUrl({ key: key.trim(), groupId });
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setPublicLinkCopied(true);
      setTimeout(() => setPublicLinkCopied(false), 3000);
    } catch {
      // 静默失败:不打扰用户;如需反馈可在此 setPublicLinkCopied 改为错误态
    }
  }

  if (!open) return null;

  const tags = tagsText.split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const visibilityChanged = visibility !== initialVisibility;
  // 只有「用户主动改过 visibility」才在 payload 里带上,否则省略让后端保留现有可见态。
  const visibilityPayload: 'public' | 'private' | undefined = visibilityChanged ? visibility : (mode === 'create' ? visibility : undefined);

  const portalRoot =
    (typeof document !== 'undefined' && document.querySelector('[data-sl-portal]')) ||
    (typeof document !== 'undefined' ? document.body : null);

  const node = (
    <div className="sl-us-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sl-us-modal" role="dialog" aria-label={mode === 'create' ? '新建 KV' : '编辑 KV'}>
        <header className="sl-us-modal__head">
          <h3 className="sl-us-modal__title">{mode === 'create' ? '新建 KV' : '编辑 KV'}</h3>
          <button
            className="sl-us-btn sl-us-btn--ghost sl-us-btn--icon-sm"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="sl-us-modal__body">
          <div className="sl-us-field">
            <span className="sl-us-field__label">Key</span>
            <input
              className="sl-us-input"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={saving || mode === 'edit'}
              placeholder="如 api_url"
              autoFocus
            />
            {mode === 'edit' && <span className="sl-us-field__hint">key 创建后不可修改</span>}
          </div>
          <div className="sl-us-field">
            <span className="sl-us-field__label">Value</span>
            <textarea
              className="sl-us-input sl-us-input--textarea"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving || !canWrite}
              rows={8}
            />
          </div>
          <div className="sl-us-field">
            <span className="sl-us-field__label">Tags(逗号分隔)</span>
            <input
              className="sl-us-input"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              disabled={saving || !canWrite}
              placeholder="prod, cache"
            />
          </div>
          <div className="sl-us-field">
            <span className="sl-us-field__label">TTL(天,0 = 永久)</span>
            <input
              className="sl-us-input sl-us-input--num"
              type="number"
              min={0}
              value={ttlDays}
              onChange={(e) => setTtlDays(Number(e.target.value))}
              disabled={saving || !canWrite}
            />
          </div>
          <div className="sl-us-field">
            <span className="sl-us-field__label">可见性</span>
            <div className="sl-us-radio-row" role="radiogroup" aria-label="可见性">
              <label className="sl-us-radio">
                <input
                  type="radio"
                  name="sl-us-kv-visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                  disabled={saving || !canWrite}
                />
                <span>私有(仅组内成员可见)</span>
              </label>
              <label className="sl-us-radio">
                <input
                  type="radio"
                  name="sl-us-kv-visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                  disabled={saving || !canWrite}
                />
                <span>公开(匿名可经 /kv/public/:key?groupId= 读取)</span>
              </label>
            </div>
            {visibility === 'public' && mode === 'edit' && groupId && (
              <div className="sl-us-field__public-link">
                <button
                  type="button"
                  className="sl-us-btn sl-us-btn--sm"
                  onClick={() => void handleCopyPublicLink()}
                  disabled={saving}
                  title={getPublicUrl({ key: key.trim() || initial?.key || '', groupId })}
                >
                  复制公开链接
                </button>
                {publicLinkCopied && (
                  <span className="sl-us-field__hint sl-us-field__hint--ok">已复制到剪贴板</span>
                )}
                <span className="sl-us-field__hint">
                  公开链接:{getPublicUrl({ key: key.trim() || initial?.key || '', groupId })}
                </span>
              </div>
            )}
            {visibility === 'public' && mode === 'create' && (
              <span className="sl-us-field__hint">保存后此 KV 即可匿名公开读取;复制链接按钮在编辑模式可用</span>
            )}
          </div>
          {mode === 'edit' && (
            <div className="sl-us-field">
              <span className="sl-us-field__label">版本历史</span>
              {versionsLoading ? (
                <span className="sl-us-muted">加载中…</span>
              ) : versions.length === 0 ? (
                <span className="sl-us-muted">暂无历史版本</span>
              ) : (
                <div className="sl-us-versions__row">
                  <select
                    className="sl-us-input sl-us-input--compact"
                    value={selectedVersion ?? ''}
                    onChange={(e) => setSelectedVersion(e.target.value ? Number(e.target.value) : null)}
                    disabled={saving}
                    aria-label="选择历史版本"
                  >
                    <option value="">选择版本</option>
                    {versions.map((v) => (
                      <option key={v.versionNo} value={v.versionNo} title={v.replacedAt || undefined}>
                        v{v.versionNo} · {v.valueLen}B · {formatReplacedAt(v.replacedAt)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="sl-us-btn"
                    disabled={!canWrite || !selectedVersion || saving}
                    title={canWrite ? '将当前值回滚到所选版本' : '只读,无法恢复版本'}
                    onClick={() => selectedVersion && onRestoreVersion?.(selectedVersion)}
                  >
                    恢复该版本
                  </button>
                </div>
              )}
              {selectedVersion && <span className="sl-us-field__hint">恢复会覆盖当前 value(可再次回退)</span>}
            </div>
          )}
        </div>
        <footer className="sl-us-modal__foot">
          <button className="sl-us-btn" onClick={onClose} disabled={saving}>取消</button>
          <button
            className="sl-us-btn sl-us-btn--primary"
            disabled={saving || !canWrite || !key.trim() || mode === 'edit' && !initial}
            onClick={() => void onSave({
              key: key.trim(),
              value,
              tags,
              ttl: ttlDays > 0 ? ttlDays * 86400 : 0,
              visibility: visibilityPayload,
            })}
          >
            {saving ? '保存中…' : mode === 'create' ? '创建' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  );

  if (!portalRoot) return null;
  return createPortal(node, portalRoot);
}
