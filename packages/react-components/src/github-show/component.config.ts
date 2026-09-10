// packages/react-components/src/github-show/component.config.ts
// 走 how-to-add-component §2 模板。

import type { ComponentConfig } from '@style-library/component-contract';

export default {
  id: 'github-show',
  name: 'GithubShow',
  title: 'GitHub 项目展示',
  description: 'Notion 式数据库表格:记录 GitHub 项目链接、亮点与开发启发;支持文本/多选列扩展,编辑/展示双视图,展示视图带统计图表与 PDF 下载。',
  version: '1.2.0',
  framework: 'react',
  entry: './index.tsx',
  platform: 'both',
  group: '效率',
  category: '项目展示',
  tags: ['github', 'showcase', 'database', 'table', 'project', 'interview', 'chart', 'pdf'],
  status: 'stable',
  route: { path: '/components/github-show', title: 'GitHub 项目展示' },
  mount: { kind: 'react', propsMode: 'none' },
  isolation: { mode: 'shadow-dom' },
  theme: { mode: 'css-variables', namespace: 'sl' },
  capabilities: { fullscreen: true, fullscreenMode: 'viewport', resizable: false },
  dependencies: [{ name: 'echarts', version: '^5.5.0', sharing: 'host' }],
} satisfies ComponentConfig;
