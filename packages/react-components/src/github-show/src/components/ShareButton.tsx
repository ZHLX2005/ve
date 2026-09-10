// src/components/ShareButton.tsx —— github-show 公开分享控制入口。
//
// 只在「登录 + 自己编辑」场景下挂载(由 index.tsx 守卫):
//   - 点击 🔗 分享 → 弹层(details/summary 自管理 + click-outside dismiss)
//   - 内容:当前 visibility 状态 + 切换按钮 + 分享链接 + 复制按钮
//   - 切换 visibility 走 kvV1Service.setVisibility(写审计 set_public/set_private)
//   - groupId 取 userV1Service.getDefaultGroup()(github-show 默认存于用户默认组)
//
// 关键约束:
//   - 拉 visibility / 切 visibility 都用 `kvV1Service.get({ key, groupId })` /
//     `kvV1Service.setVisibility({ key, visibility, groupId })`,显式 groupId
//     —— 不能用无 groupId 的版本,因为无 groupId 时 Set 会走 caller 的 default_group_id,
//     跟 Get 时的不一定一致时会出 audit 错位。
//   - 切换后乐观更新本地 visibility 状态;失败回滚 + 显示错误文案
//   - 复制走 navigator.clipboard + execCommand fallback(对齐 PublicShareBanner)

import { useEffect, useRef, useState } from 'react';
import { kvV1Service, userV1Service, ApiError } from '@api/services';
import { buildShareUrl } from '../utils/shareLink';

const SHARE_KEY = 'github-show';

interface ShareState {
  /** 用户的默认工作空间 id;null = 未设置 / 加载中 */
  groupId: number | null;
  /** 当前 KV visibility;null = 加载中或 KV 不存在 */
  visibility: 'public' | 'private' | null;
  /** 加载 / 切换错误 */
  error: string | null;
  /** 正在加载 / 切换 */
  busy: boolean;
  /** 复制成功瞬时提示 */
  copied: boolean;
}

const INITIAL: ShareState = {
  groupId: null,
  visibility: null,
  error: null,
  busy: false,
  copied: false,
};

export interface ShareButtonProps {
  /** 组件当前数据已 ready(用来阻止空分享)。可选;默认 true。 */
  ready?: boolean;
}

export default function ShareButton({ ready = true }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ShareState>(INITIAL);
  // 上一次成功的 groupId:popover 关掉再开时复用,避免每次都重新拉 userV1Service。
  const cachedGroupIdRef = useRef<number | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // click-outside dismiss:弹层打开时挂全局监听,点非弹层区域关掉。
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent): void {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 打开弹层时拉一次 groupId + 当前 visibility
  async function loadState(): Promise<void> {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      // 1) 用户默认组
      let groupId = cachedGroupIdRef.current;
      if (groupId == null) {
        const info = await userV1Service.getDefaultGroup();
        if (info.groupId <= 0) {
          setState({
            ...INITIAL,
            error: '尚未设置默认工作空间,请先在「用户空间」中选定一个组作为默认。',
          });
          return;
        }
        groupId = info.groupId;
        cachedGroupIdRef.current = groupId;
      }
      // 2) 当前 visibility —— 走 kvV1Service.get(显式 groupId),GET 会顺带返 visibility 字段。
      //    KV 不存在(首次使用还没建过 github-show)→ ApiError code 50,视为 private + 不报错
      try {
        const item = await kvV1Service.get({ key: SHARE_KEY, groupId });
        setState({
          groupId,
          visibility: item.visibility ?? 'private',
          error: null,
          busy: false,
          copied: false,
        });
      } catch (e) {
        if (e instanceof ApiError && e.code === 50) {
          // KV 尚未创建 —— 提示用户先添加至少一个项目(因为没有 value 也无法分享)
          setState({
            groupId,
            visibility: 'private',
            error: '尚未创建任何内容 —— 请先添加至少一个项目,再设为公开分享。',
            busy: false,
            copied: false,
          });
        } else {
          setState({
            groupId,
            visibility: null,
            error: e instanceof Error ? e.message : String(e),
            busy: false,
            copied: false,
          });
        }
      }
    } catch (e) {
      setState({
        ...INITIAL,
        error: e instanceof Error ? e.message : String(e),
        busy: false,
      });
    }
  }

  async function handleToggle(): Promise<void> {
    if (state.groupId == null || state.visibility == null || state.busy) return;
    const next: 'public' | 'private' = state.visibility === 'public' ? 'private' : 'public';
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await kvV1Service.setVisibility({ key: SHARE_KEY, visibility: next, groupId: state.groupId });
      setState((s) => ({ ...s, visibility: next, busy: false }));
    } catch (e) {
      setState((s) => ({
        ...s,
        busy: false,
        error: e instanceof Error ? e.message : '切换失败',
      }));
    }
  }

  async function handleCopy(): Promise<void> {
    if (state.groupId == null) return;
    const url = buildShareUrl({ groupId: state.groupId, key: SHARE_KEY });
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
      setState((s) => ({ ...s, copied: true }));
      setTimeout(() => setState((s) => ({ ...s, copied: false })), 2500);
    } catch {
      // 静默:用户可手动复制地址栏
    }
  }

  function handleClickButton(): void {
    const next = !open;
    setOpen(next);
    // 清空旧状态 + 重新拉(保证可见性是最新的,避免上次操作残留)
    setState(INITIAL);
    if (next) void loadState();
  }

  const isPublic = state.visibility === 'public';
  const shareUrl = state.groupId != null ? buildShareUrl({ groupId: state.groupId, key: SHARE_KEY }) : '';

  return (
    <div className="sl-gh-share">
      <button
        type="button"
        className={`sl-gh-btn sl-gh-btn--ghost${isPublic ? ' sl-gh-btn--public' : ''}`}
        onClick={handleClickButton}
        disabled={!ready}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="公开分享:设置可见性 + 复制分享链接"
      >
        {isPublic ? '🌐 已公开' : '🔒 设为公开分享'}
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="sl-gh-share__popover"
          role="dialog"
          aria-label="公开分享设置"
        >
          <div className="sl-gh-share__row">
            <span className="sl-gh-share__label">当前状态</span>
            <span className={`sl-gh-share__status${isPublic ? ' is-public' : ''}`}>
              {state.busy && state.visibility == null
                ? '加载中…'
                : isPublic
                  ? '🌐 公开(任何人可经 ?groupId=' + (state.groupId ?? '') + ' 读取)'
                  : state.visibility === 'private'
                    ? '🔒 私有(仅自己可见)'
                    : '—'}
            </span>
          </div>

          {state.error && (
            <div className="sl-gh-share__error" role="alert">{state.error}</div>
          )}

          {state.visibility != null && state.groupId != null && !state.error?.startsWith('尚未创建') && (
            <div className="sl-gh-share__row sl-gh-share__row--toggle">
              <button
                type="button"
                className={`sl-gh-btn ${isPublic ? 'sl-gh-btn--ghost' : 'sl-gh-btn--primary'}`}
                onClick={() => void handleToggle()}
                disabled={state.busy}
              >
                {state.busy ? '切换中…' : isPublic ? '🔒 改为私有' : '🌐 设为公开'}
              </button>
              <span className="sl-gh-share__hint">
                {isPublic
                  ? '关闭后原分享链接立即 404。已发出的链接不再可访问。'
                  : '开启后任何人(无需登录)可经下方链接访问。'}
              </span>
            </div>
          )}

          {isPublic && state.groupId != null && (
            <div className="sl-gh-share__row sl-gh-share__row--link">
              <span className="sl-gh-share__label">分享链接</span>
              <div className="sl-gh-share__urlbox">
                <input
                  className="sl-gh-share__url"
                  type="text"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="公开读链接"
                />
                <button
                  type="button"
                  className="sl-gh-btn sl-gh-btn--primary"
                  onClick={() => void handleCopy()}
                >
                  {state.copied ? '✓ 已复制' : '📋 复制'}
                </button>
              </div>
              <span className="sl-gh-share__hint">
                发给面试官 / 同行 / 邮件;对方无需登录即可浏览你的项目库。
              </span>
            </div>
          )}

          <div className="sl-gh-share__row sl-gh-share__row--foot">
            <span className="sl-gh-share__hint">
              公开读接口:<code>GET /api/v1/kv/public/github-show?groupId={state.groupId ?? '?'}</code>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
