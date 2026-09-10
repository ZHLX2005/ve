// src/components/PublicShareBanner.tsx —— 公开分享模式顶部 banner。
//
// 出现在 readOnly=true 时:左边图标 + 文案("公开分享模式"),右边提供
// 「📋 复制分享链接」(把当前 URL 再复制一次,方便转发) + 「我也要分享」链接
// (跳转到组件路由不带参数 = 编辑自己的 github-show,前提是用户登录)。
//
// 设计意图:让访客一眼明白这是只读视图(不会误以为能编辑);并给分享者一个
// "我能复用这套分享机制"的入口。

import { useState } from 'react';

export interface PublicShareBannerProps {
  /** 当前在读的 KV key,默认 'github-show' */
  keyName: string;
  /** 当前在读的工作空间 groupId */
  groupId: number;
}

/** 跳到不带 query 的组件页(等价于"我自己编辑一份")。 */
function ownEditUrl(): string {
  if (typeof window === 'undefined') return '/components/github-show';
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.pathname + url.search + url.hash;
}

export default function PublicShareBanner({ keyName, groupId }: PublicShareBannerProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // 静默:用户可手动复制地址栏
    }
  }

  return (
    <div className="sl-gh-public-banner" role="status">
      <div className="sl-gh-public-banner__left">
        <span className="sl-gh-public-banner__icon" aria-hidden="true">🌐</span>
        <div className="sl-gh-public-banner__text">
          <strong>公开分享模式</strong>
          <span className="sl-gh-public-banner__hint">
            正在只读查看工作空间 <code>#{groupId}</code> 的 KV{' '}
            <code>{keyName}</code>(无需登录);任何编辑都不会被保存。
          </span>
        </div>
      </div>
      <div className="sl-gh-public-banner__actions">
        <button
          type="button"
          className="sl-gh-btn sl-gh-btn--ghost sl-gh-btn--sm"
          onClick={() => void handleCopy()}
        >
          {copied ? '✓ 已复制' : '🔗 复制分享链接'}
        </button>
        <a
          className="sl-gh-btn sl-gh-btn--primary sl-gh-btn--sm"
          href={ownEditUrl()}
          title="不带 groupId 参数访问 = 编辑自己的 github-show(需登录)"
        >
          我也要分享 →
        </a>
      </div>
    </div>
  );
}
