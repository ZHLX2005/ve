// api/components/index.ts —— 应用层组件 barrel。
//
// 每个 micro-frontend 组件有自己的子目录(如 shortcut-library/),
// 收 createShortcutStore + 域类型 + index.ts。组件层只依赖 services/ 的
// HTTP 包装,不反过来。新增组件:在 components/ 下建目录;修改 services/
// 与本目录无关。
//
// 调用方:
//   import { createShortcutStore } from '@/api/components/shortcut-library';
//   import type { Group } from '@/api/components/shortcut-library';

export * from './shortcut-library';
export * from './user-space';
export * from './color-studio';
export * from './github-show';
