# github-show

GitHub 项目展示数据库 —— Notion/Feishu 式表格,给面试官看项目介绍与开发启发(减少用人成本)。

## 功能(v1.2.0)

- **双视图**:编辑视图(维护数据)/ 展示视图(给面试官看),顶栏一键切换,记忆上次选择
- **数据库表格**:第一列 GitHub 链接,后续列:项目名 / 亮点 / 启发 / 线上地址(可选文本列)+ 自定义列,全部内联可编辑
- **线上地址为可选文本列**:可写解释文字,含 http 自动渲染为可点击链接,可修改、可清空
- **列类型**:自定义列支持「文本」(含 http 自动渲染链接)与「多选」(chip 标签,回车/逗号添加)两类
- **列扩展 CRUD**:列设置弹窗可新增自定义列(选类型)、重命名、删除(列数据一并删除)
- **链接可点击跳转**:合法 http(s) 链接(GitHub / 线上地址 / 文本列内 URL)渲染为可点击链接,新标签页打开
- **展示视图**:统计卡(项目总数 / 已填亮点 / 已填启发 / 内容完整度)+ ECharts 图表(项目介绍充实度柱状图、亮点填写率环形图)+ 只读表格(列头可排序,多选列渲染为标签)
- **导出 PDF**:展示视图一键**下载 .pdf 文件**(html2canvas + jsPDF 分页,中文/图表所见即所得;异常自动降级浏览器打印)
- **链接自动解析**:粘贴 `https://github.com/owner/repo` 自动填充项目名,可手动覆盖
- **搜索**:跨链接 / 项目名 / 亮点 / 启发 / 线上地址 / 自定义列过滤
- **云端同步**:整份文档 JSON blob 存单个 KV key(`github-show`),登录后自动云端保存
- **游客降级**:未登录时数据保存在本机 localStorage,登录后无缝接管
- **公开分享 URL**(2026-09 起):URL 带 `?groupId=N[&key=...]` 时进入只读分享模式,任何人(匿名)都能看别人公开的 github-show,详情见下文
- **删除两步确认**:`×` → `?` → 删除,避免误删

## 公开分享 URL(v1.3.0+)

把"我的 github-show"分享给面试官或同行:**只需在组件 URL 后面带一个 `groupId` 参数**,
组件自动从后端公开读接口拉取那个工作空间的 KV,只读展示。

```
# 默认 key(github-show)
https://<host>/components/github-show?groupId=42

# 自定义 key(给将来其他 KV 留口子)
https://<host>/components/github-show?groupId=42&key=my-cover
```

### 工作机制

1. **进入条件**:URL 含 `groupId=正整数`。`key` 可选,默认 `github-show`。
2. **数据源**:走 `GET /api/v1/kv/public/:key?groupId=` 无鉴权接口,
   仅放行 `visibility='public'` 且未过期的 KV。其他状态(key 不存在 / visibility=private / 过期)
   统一返 404,UI 显示「公开分享加载失败」并提示原因。
3. **只读模式**:任何编辑按钮(添加项目 / 编辑 / 删除 / 列设置)被隐藏;顶栏强制 `展示` 视图;
   `mutate()` 在 hook 内部拦截成 no-op(双保险,即使误调也不会写)。
4. **顶部 banner**:提示「公开分享模式」+ 当前在读的 groupId / key;「🔗 复制分享链接」一键复制
   当前 URL 给别人;「我也要分享 →」跳到不带 query 的同组件页 = 编辑自己的 github-show。

### 分享者操作步骤

**方法 A:组件内一键分享**(推荐,2026-09 起)

1. 登录后,在自己编辑的 github-show 顶栏点击 **「🔒 设为公开分享」** 按钮
2. 弹层里点 **「🌐 设为公开」** → 后端 `POST /kv/:key/visibility` 写审计 `set_public`
3. 弹层下方自动展示分享链接(完整 URL,带 `?groupId=<你的 groupId>`),点 **「📋 复制」** 即拿到
4. 链接可发给任何人 / 邮件 / 简历 — 对方无需登录即可浏览
5. 想收回分享?再点弹层里 **「🔒 改为私有」** → 写审计 `set_private`,原链接立即 404

**方法 B:经 KV UI 设置可见性**(通用流程)

1. 在「用户空间 → KV 库存」编辑 `github-show`,在「可见性」单选里选 **🌐 公开** → 保存
2. 从浏览器地址栏复制当前 `?groupId=<我的 groupId>` 的 URL(因为组件默认走默认组)
3. 发给面试官 / 同行 / 邮件 / 简历 → 对方无需登录即可浏览

两种方法底层调同一个端点,效果一致。**方法 A 更直观**(组件内即看即用,无需跳转),**方法 B 通用**(任何 KV 都适用)。

### 关键约束

- `groupId` 是数字(后端 `users.user_groups.id`),**不能跨用户**:你分享出去的是
  你所在工作空间里的 KV;别人可以浏览,但**没有写权限**(公开读接口无 Set/Delete/List)
- 关闭公开 = 在 KV UI 切回 `🔒 私有`,原 URL 立即 404(下次访问就看不到)
- TTL 设了就会过期;过期后原 URL 也 404

## 数据模型(v1.2.0)

```ts
interface GithubShowColumn {
  id: string;
  title: string;
  type: 'text' | 'multi-select'; // 列类型;multi-select 值存 JSON 数组字符串
  createdAt: number;
}

interface GithubShowRow {
  id: string;
  repoUrl: string;         // GitHub 仓库链接(第一列)
  name: string;            // 项目名(自动解析,可改)
  highlights: string;      // 亮点
  insights: string;        // 启发(开发者自填)
  demoUrl: string;         // 可选文本列:线上地址 / 说明,含 http 自动可点
  values: Record<string, string>; // 自定义列值,key = column.id
  createdAt: number;
  updatedAt: number;
}
```

整份 `GithubShowDoc { meta, columns[], rows[] }` 序列化为一个 JSON,存 `kvV1` 单 key(模型二
single-blob,不传 groupId,后端走 caller default_group_id),与 shortcut-library / color-studio
同范式。旧文档读取时自动迁移:v1.1.0 的 link 列收敛为 text(自动渲染 http 等价);
v1.0.0 补 demoUrl / values / columns。

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
  storage/PublicStore.ts   # 公开分享模式只读 store(走 /kv/public/:key?groupId=)
  utils/shareLink.ts       # URL 解析(readPublicParamsFromUrl) + 构建(buildShareUrl)
  utils/repo.ts            # GitHub 链接解析 + http 链接/文本拆分纯函数
  utils/tags.ts            # 多选值序列化 / 解析纯函数
  engine/stats.ts          # 展示统计纯函数(指标 + 图表数据)
  engine/printDoc.ts       # PDF 导出内容生成(纯函数,可单测)
  engine/exportPdf.ts      # PDF 直接下载(html2canvas + jsPDF 分页)
  engine/print.ts          # iframe 打印(降级路径)
  components/GithubShowTable.tsx    # 编辑视图表格
  components/DisplayView.tsx        # 展示视图(统计 + 图表 + 只读表格 + 导出)
  components/ColumnSettingsModal.tsx # 列扩展弹窗(类型选择 + CRUD)
  components/LinkCell.tsx           # 可点击跳转的链接单元格
  components/MultiSelectCell.tsx    # 多选列 chip 编辑器
  components/SyncPill.tsx           # 同步状态条
  components/PublicShareBanner.tsx  # 公开分享模式顶部 banner
```
