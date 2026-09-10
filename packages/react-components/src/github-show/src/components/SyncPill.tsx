// src/components/SyncPill.tsx —— 顶部同步状态条。
// 三种场景:游客(本机保存 + 登录入口)、云端(加载中 / 保存中 / 已同步 / 保存失败重试)。

import type { GithubShowStatus, SyncStatus } from '../hooks/useGithubShow';

interface SyncPillProps {
  status: GithubShowStatus;
  syncStatus: SyncStatus;
  isLoggedIn: boolean;
  onLogin: () => void;
  onRetry: () => void;
}

export default function SyncPill({ status, syncStatus, isLoggedIn, onLogin, onRetry }: SyncPillProps) {
  if (status === 'loading') {
    return <span className="sl-gh-pill">加载中…</span>;
  }
  if (!isLoggedIn) {
    return (
      <span className="sl-gh-pill sl-gh-pill--guest">
        游客模式 · 本机保存
        <button type="button" className="sl-gh-pill__btn" onClick={onLogin}>
          登录
        </button>
      </span>
    );
  }
  if (syncStatus === 'saving') {
    return <span className="sl-gh-pill">保存中…</span>;
  }
  if (syncStatus === 'error') {
    return (
      <button type="button" className="sl-gh-pill sl-gh-pill--error" onClick={onRetry}>
        保存失败 · 点击重试
      </button>
    );
  }
  return <span className="sl-gh-pill sl-gh-pill--ok">已同步</span>;
}
