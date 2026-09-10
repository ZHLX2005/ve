// src/utils/repo.ts —— GitHub 链接解析纯函数(无 UI / 无依赖)。
//
// 只处理 github.com 的标准仓库链接,其余原样返回。解析失败返回 null / 空串,
// 让 UI 层安全降级(不自动改名、不显示打开链接)。

export interface ParsedRepo {
  owner: string;
  repo: string;
  /** 'owner/repo' —— 用作项目名建议 */
  full: string;
}

// 匹配 https://github.com/{owner}/{repo}(允许 www. / .git 后缀 / 尾部路径)
const GITHUB_URL_RE = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/;

export function parseRepoUrl(raw: string): ParsedRepo | null {
  const url = raw.trim();
  const m = GITHUB_URL_RE.exec(url);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, '');
  if (!repo) return null;
  return { owner, repo, full: `${owner}/${repo}` };
}

/** 从链接推导项目名建议('owner/repo');解析失败返回空串。 */
export function deriveRepoName(raw: string): string {
  return parseRepoUrl(raw)?.full ?? '';
}

/** 判断是否为可识别的 GitHub 仓库链接。 */
export function isGithubUrl(raw: string): boolean {
  return parseRepoUrl(raw) !== null;
}

/** 归一化链接为 https://github.com/owner/repo(便于复制分享)。 */
export function normalizeRepoUrl(raw: string): string {
  const p = parseRepoUrl(raw);
  if (!p) return raw.trim();
  return `https://github.com/${p.full}`;
}

/** 通用 http(s) 链接校验(演示地址 / 自定义链接列用,不限于 GitHub)。 */
export function isHttpUrl(raw: string): boolean {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    return !!u.hostname;
  } catch {
    return false;
  }
}

/** 取可点击链接的规范化 href;非法时返回空串(调用方隐藏链接)。 */
export function toHref(raw: string): string {
  const url = raw.trim();
  if (!isHttpUrl(url)) return '';
  return url;
}

/** 展示用链接文本:截断过长 URL,保留协议域名与路径主体。 */
export function displayLinkText(raw: string, maxLen = 48): string {
  const url = raw.trim();
  if (!url) return '';
  if (url.length <= maxLen) return url;
  return `${url.slice(0, maxLen - 1)}…`;
}
