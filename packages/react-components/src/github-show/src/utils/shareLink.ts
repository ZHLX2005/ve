// utils/shareLink.ts —— 公开分享 URL 解析 / 构建。
//
// URL 形态:`<host>/components/github-show?groupId=<必填>&key=<可选>`
//   - groupId 必填:后端 KV key 只在组内唯一(`UNIQUE(group_id, key)`),
//     跨组可能撞名,公开读必须显式 groupId
//   - key 可选,默认 'github-show'(本组件固定 KV key)。给将来其他组件
//     共享这套分享机制留口子,例如 `?key=my-cover&groupId=42`
//
// 用法:
//   - `useGithubShow` 在 mount 时调用 `readPublicParamsFromUrl()`,
//     有结果就走 PublicStore(只读)而不是 Local/Cloud store
//   - UI 在「编辑自己的 github-show」时,调用 `buildShareUrl({groupId})`
//     拼出可对外分享的链接,clipboard.copy 后给别人

const DEFAULT_KEY = 'github-show';

/** 从 window.location.search 解析公开读参数。无效 / 缺 groupId → null(走原 store)。 */
export function readPublicParamsFromUrl(search?: string): { key: string; groupId: number } | null {
  const s = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (!s) return null;
  const params = new URLSearchParams(s);
  const rawGroupId = params.get('groupId');
  if (!rawGroupId) return null;
  // Number('') 是 0;Number('abc') 是 NaN —— 都判 false 分支
  const groupId = Number(rawGroupId);
  if (!Number.isFinite(groupId) || groupId <= 0 || !Number.isInteger(groupId)) return null;
  const key = (params.get('key') ?? '').trim() || DEFAULT_KEY;
  return { key, groupId };
}

/** 构造可分享的公开读 URL(供「🔗 复制分享链接」按钮)。
 *  若 key 是默认值 'github-show',省略 key 参数让 URL 更短一些。
 *  无 window 时返回空字符串(SSR / 测试 fallback)。 */
export function buildShareUrl(args: { groupId: number; key?: string; baseHref?: string }): string {
  if (typeof window === 'undefined' && !args.baseHref) return '';
  const base = args.baseHref ?? window.location.href;
  const url = new URL(base);
  url.search = ''; // 清掉原 search(hash 保留,避免误清滚动位置)
  url.searchParams.set('groupId', String(args.groupId));
  const key = (args.key ?? '').trim() || DEFAULT_KEY;
  if (key !== DEFAULT_KEY) url.searchParams.set('key', key);
  return url.toString();
}
