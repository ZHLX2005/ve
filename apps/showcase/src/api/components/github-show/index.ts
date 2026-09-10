// api/components/github-show/index.ts —— github-show 业务封装 barrel。
//
// 调用方:
//   import { createGithubShowStore } from '@api/components/github-show';
//   import type { GithubShowDoc } from '@api/components/github-show/types';

export * from './types';
export * from './createGithubShowStore';
export { docSchema } from './docSchema';
