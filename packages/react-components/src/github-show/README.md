# github-show

GitHub 项目展示数据库 —— Notion/Feishu 式表格,给面试官看项目介绍与开发启发(减少用人成本)。

## 功能(v1.1.0)

- **双视图**:编辑视图(维护数据)/ 展示视图(给面试官看),顶栏一键切换,记忆上次选择
- **数据库表格**:第一列 GitHub 链接,后续列:项目名 / 亮点 / 启发 / 线上地址(可选)+ 自定义列,全部内联可编辑
- **链接可点击跳转**:合法 http(s) 链接(GitHub / 线上地址 / 自定义链接列)渲染为可点击链接,新标签页打开
- **列扩展**:列设置弹窗可新增自定义列(文本 / 链接)、重命名、删除
- **展示视图**:统计卡(项目总数 / 已填亮点 / 已填启发 / 内容完整度)+ ECharts 图表(项目介绍充实度柱状图、亮点填写率环形图)+ 只读表格(列头可排序)
- **导出 PDF**:展示视图一键导出,自包含 HTML + 图表走浏览器打印,输出稳定版面
- **链接自动解析**:粘贴 `https://github.com/owner/repo` 自动填充项目名,可手动覆盖
- **搜索**:跨链接 / 项目名 / 亮点 / 启发 / 线上地址 / 自定义列过滤
- **云端同步**:整份文档 JSON blob 存单个 KV key(`github-show`),登录后自动云端保存
- **游客降级**:未登录时数据保存在本机 localStorage,登录后无缝接管
- **删除两步确认**:`×` → `?` → 删除,避免误删

## 数据模型(v1.1.0)

```ts
interface GithubShowColumn {
  id: string;
  title: string;
  type: 'text' | 'link';   // 自定义列类型
  createdAt: number;
}

interface GithubShowRow {
  id: string;
  repoUrl: string;         // GitHub 仓库链接(第一列)
  name: string;            // 项目名(自动解析,可改)
  highlights: string;      // 亮点
  insights: string;        // 启发(开发者自填)
  demoUrl: string;         // 可选:线上地址 / 演示链接
  values: Record<string, string>; // 自定义列值,key = column.id
  createdAt: number;
  updatedAt: number;
}
```

整份 `GithubShowDoc { meta, columns[], rows[] }` 序列化为一个 JSON,存 `kvV1` 单 key(模型二
single-blob,不传 groupId,后端走 caller default_group_id),与 shortcut-library / color-studio
同范式。旧 v1.0.0 文档读取时自动迁移(补 demoUrl / values / columns)。

## 目录

```
index.tsx                  # 入口(双视图切换 + 组合)
component.config.ts        # 组件元数据
index.css                  # sl-gh- 前缀样式
src/
  hooks/useGithubShow.ts   # 数据层:JWT 选 store + debounce 保存 + 行列 CRUD
  hooks/useECharts.ts      # ECharts 生命周期(按需注册 + resize + dispose)
  hooks/useAuth.ts         # re-export host 登录态
  hooks/useLoginModal.ts   # re-export host 登录弹窗
  storage/LocalStore.ts    # 游客 localStorage 存储
  utils/repo.ts            # GitHub 链接解析 + http 链接工具纯函数
  engine/stats.ts          # 展示统计纯函数(指标 + 图表数据)
  engine/printDoc.ts       # PDF 导出 HTML 生成(纯函数,可单测)
  engine/print.ts          # iframe 打印(隔离 ShadowRoot 样式)
  components/GithubShowTable.tsx    # 编辑视图表格
  components/DisplayView.tsx        # 展示视图(统计 + 图表 + 只读表格 + 导出)
  components/ColumnSettingsModal.tsx # 列扩展弹窗
  components/LinkCell.tsx           # 可点击跳转的链接单元格
  components/SyncPill.tsx           # 同步状态条
```
