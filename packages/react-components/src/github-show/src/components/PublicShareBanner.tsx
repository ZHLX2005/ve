// src/components/PublicShareBanner.tsx —— 公开分享模式顶部轻量条。
//
// 出现在 readOnly=true 时:访客已经通过 ?groupId= 链接进入,知道这是只读公开内容,
// 不再做大段说明;只保留两个轻量动作 — 复制当前链接(方便转发) + 跳到不带参数
// 的同组件页(让访客也能 fork 一份自己的)。设计目标:小、安静、不抢戏。

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
      <span className="sl-gh-public-banner__label">公开分享 · {keyName} · #{groupId}</span>
      <div className="sl-gh-public-banner__actions">
        <button
          type="button"
          className="sl-gh-btn sl-gh-btn--ghost sl-gh-btn--sm"
          onClick={() => void handleCopy()}
        >
          {copied ? '已复制' : '复制链接'}
        </button>
        <a
          className="sl-gh-btn sl-gh-btn--primary sl-gh-btn--sm"
          href={ownEditUrl()}
          title="不带 groupId 参数访问 = 编辑自己的 github-show(需登录)"
        >
          我也要用
        </a>
      </div>
    </div>
  );
}
