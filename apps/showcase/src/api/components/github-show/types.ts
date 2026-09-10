// apps/showcase/src/api/components/github-show/types.ts
//
// 域类型(组件与服务之间的共享契约)。canonical 定义在这里,
// 组件包通过 '@api/components/github-show/types' 引用。
//
// 数据模型 = 一个 GitHub 项目展示数据库(Notion/Feishu 式表格):
//   - 一行 = 一个项目;第一列 = GitHub 仓库链接,随后是亮点 / 启发(开发者自填)
//   - v1.1.0:支持自定义列扩展(columns[]),每行 extra 值存 values[colId];
//     新增可选"线上地址"列(demoUrl)
//   - v1.2.0:列类型收敛为 text(含 http 自动渲染为链接)与 multi-select(多选,
//     值以 JSON 数组字符串存储);旧 link 列迁移为 text
//   - v1.3.0:demoUrl 字段更名为 output("产出"列)—— 文本列,含 http 自动
//     渲染链接,可写说明,可修改可清空;旧数据读取时自动迁移
//   - v1.4.0:自定义列新增 number(数字)类型,展示页按数字列排序可快速控制展示
//     顺序;每列新增 hiddenInDisplay —— 控制该列是否在展示页显示(默认显示)
//   - 整个文档序列化成一个 JSON blob,存单个 KV key('github-show')

export type GithubShowColumnType = 'text' | 'multi-select' | 'number';

export interface GithubShowColumn {
  id: string;
  title: string;
  type: GithubShowColumnType;
  createdAt: number;
  /** 是否在展示页隐藏(编辑页始终显示);默认 false */
  hiddenInDisplay: boolean;
}

export interface GithubShowRow {
  id: string;
  /** GitHub 仓库链接(第一列),如 https://github.com/owner/repo */
  repoUrl: string;
  /** 项目名,通常从链接自动解析(owner/repo),可手改 */
  name: string;
  /** 亮点:做了什么 / 技术亮点 / 成果 */
  highlights: string;
  /** 启发:做这件事的收获 / 可复用的思路(开发者自填) */
  insights: string;
  /** 产出:成果 / 线上地址 / 演示链接 —— 文本列,含 http 自动渲染链接,可写说明,可清空 */
  output: string;
  /** 自定义列的值:key = GithubShowColumn.id;multi-select 存 JSON 数组字符串 */
  values: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface GithubShowDoc {
  meta: {
    schemaVersion: '1.4.0';
    createdAt: number;
    updatedAt: number;
    authorEmail: string;
  };
  /** 用户扩展的自定义列(内建列固定,不在此列) */
  columns: GithubShowColumn[];
  rows: GithubShowRow[];
}

/** v1.3.0 旧文档形状 —— 仅用于迁移读取(demoUrl 已更名为 output)。 */
export interface GithubShowDocV130 {
  meta: {
    schemaVersion: '1.3.0';
    createdAt: number;
    updatedAt: number;
    authorEmail: string;
  };
  columns: Array<Omit<GithubShowColumn, 'hiddenInDisplay'>>;
  rows: GithubShowRow[];
}

/** v1.2.0 旧文档形状 —— 仅用于迁移读取(demoUrl 字段)。 */
export interface GithubShowDocV120 {
  meta: {
    schemaVersion: '1.2.0';
    createdAt: number;
    updatedAt: number;
    authorEmail: string;
  };
  columns: Array<Omit<GithubShowColumn, 'hiddenInDisplay'>>;
  rows: Array<Omit<GithubShowRow, 'output'> & { demoUrl: string }>;
}

/** v1.1.0 旧文档形状 —— 仅用于迁移读取。 */
export interface GithubShowDocV110 {
  meta: {
    schemaVersion: '1.1.0';
    createdAt: number;
    updatedAt: number;
    authorEmail: string;
  };
  columns: Array<
    Omit<GithubShowColumn, 'hiddenInDisplay' | 'type'> & {
      type: 'text' | 'link';
    }
  >;
  rows: Array<Omit<GithubShowRow, 'output'> & { demoUrl: string }>;
}

/** v1.0.0 旧文档形状 —— 仅用于迁移读取。 */
export interface GithubShowDocV100 {
  meta: {
    schemaVersion: '1.0.0';
    createdAt: number;
    updatedAt: number;
    authorEmail: string;
  };
  rows: Array<Omit<GithubShowRow, 'output' | 'values'>>;
}

/** 把 v1.3.0 旧文档升级到 v1.4.0:自定义列补 hiddenInDisplay:false。 */
export function migrateDocV130(old: GithubShowDocV130): GithubShowDoc {
  return {
    meta: {
      ...old.meta,
      schemaVersion: '1.4.0',
      updatedAt: Date.now(),
    },
    columns: old.columns.map((c) => ({ ...c, hiddenInDisplay: false })),
    rows: old.rows,
  };
}

/** 把 v1.2.0 旧文档升级到 v1.4.0:demoUrl 字段更名为 output + 列补 hiddenInDisplay。 */
export function migrateDocV120(old: GithubShowDocV120): GithubShowDoc {
  return {
    meta: {
      ...old.meta,
      schemaVersion: '1.4.0',
      updatedAt: Date.now(),
    },
    columns: old.columns.map((c) => ({ ...c, hiddenInDisplay: false })),
    rows: old.rows.map(({ demoUrl, ...rest }) => ({ ...rest, output: demoUrl })),
  };
}

/** 把 v1.1.0 旧文档升级到 v1.4.0:link 列收敛为 text + demoUrl 更名为 output。 */
export function migrateDocV110(old: GithubShowDocV110): GithubShowDoc {
  return {
    meta: {
      ...old.meta,
      schemaVersion: '1.4.0',
      updatedAt: Date.now(),
    },
    columns: old.columns.map((c) => ({
      ...c,
      type: c.type === 'link' ? 'text' : c.type,
      hiddenInDisplay: false,
    })),
    rows: old.rows.map(({ demoUrl, ...rest }) => ({ ...rest, output: demoUrl })),
  };
}

/** 把 v1.0.0 旧文档升级到 v1.4.0:补 output / values / columns。 */
export function migrateDocV100(old: GithubShowDocV100): GithubShowDoc {
  return {
    meta: {
      ...old.meta,
      schemaVersion: '1.4.0',
      updatedAt: Date.now(),
    },
    columns: [],
    rows: old.rows.map((r) => ({
      ...r,
      output: '',
      values: {},
    })),
  };
}

/** 空文档 —— KV 缺失 / 首次使用时的兜底。 */
export function emptyDoc(authorEmail = '', now = Date.now()): GithubShowDoc {
  return {
    meta: {
      schemaVersion: '1.4.0',
      createdAt: now,
      updatedAt: now,
      authorEmail,
    },
    columns: [],
    rows: [],
  };
}
