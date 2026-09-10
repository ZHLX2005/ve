// apps/showcase/src/api/components/github-show/types.ts
//
// 域类型(组件与服务之间的共享契约)。canonical 定义在这里,
// 组件包通过 '@api/components/github-show/types' 引用。
//
// 数据模型 = 一个 GitHub 项目展示数据库(Notion/Feishu 式表格):
//   - 一行 = 一个项目;第一列 = GitHub 仓库链接,随后是亮点 / 启发(开发者自填)
//   - v1.1.0:支持自定义列扩展(columns[]),每行 extra 值存 values[colId];
//     新增可选"线上地址"链接列(demoUrl)
//   - 整个文档序列化成一个 JSON blob,存单个 KV key('github-show')

export type GithubShowColumnType = 'text' | 'link';

export interface GithubShowColumn {
  id: string;
  title: string;
  type: GithubShowColumnType;
  createdAt: number;
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
  /** 可选:线上地址 / 演示链接(成功链接) */
  demoUrl: string;
  /** 自定义列的值:key = GithubShowColumn.id */
  values: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface GithubShowDoc {
  meta: {
    schemaVersion: '1.1.0';
    createdAt: number;
    updatedAt: number;
    authorEmail: string;
  };
  /** 用户扩展的自定义列(内建列固定,不在此列) */
  columns: GithubShowColumn[];
  rows: GithubShowRow[];
}

/** v1.0.0 旧文档形状 —— 仅用于迁移读取。 */
export interface GithubShowDocV100 {
  meta: {
    schemaVersion: '1.0.0';
    createdAt: number;
    updatedAt: number;
    authorEmail: string;
  };
  rows: Array<Omit<GithubShowRow, 'demoUrl' | 'values'>>;
}

/** 把 v1.0.0 旧文档升级到 v1.1.0:补 demoUrl / values / columns。 */
export function migrateDocV100(old: GithubShowDocV100): GithubShowDoc {
  return {
    meta: {
      ...old.meta,
      schemaVersion: '1.1.0',
      updatedAt: Date.now(),
    },
    columns: [],
    rows: old.rows.map((r) => ({
      ...r,
      demoUrl: '',
      values: {},
    })),
  };
}

/** 空文档 —— KV 缺失 / 首次使用时的兜底。 */
export function emptyDoc(authorEmail = '', now = Date.now()): GithubShowDoc {
  return {
    meta: {
      schemaVersion: '1.1.0',
      createdAt: now,
      updatedAt: now,
      authorEmail,
    },
    columns: [],
    rows: [],
  };
}
