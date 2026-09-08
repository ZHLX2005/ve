# Color Studio

设计 / 前端用的色彩管理工作台。

## 路线

`/components/color-studio`

## 功能

### 色彩核心
- **HSB 圆盘** — SVG 实现,点击/拖拽选色,明度滑杆独立
- **多格式详情** — HEX / RGB / HSL / LAB / LCH / OKLCH 六格式并列,可编辑实时联动,WCAG AAA/AA 等级
- **屏幕取色** — 浏览器原生 EyeDropper API,不支持时降级提示
- **图像取色** — 上传图片,canvas 悬停取色 + K-means 主色提取
- **快速粘贴** — 底部输入条,支持 `hex / rgb / hsl / 颜色英文名`,空格 / 逗号分隔批量
- **取色历史** — 最近 12 个,FIFO

### 调色板管理
- 多板 CRUD,色卡上下移排序,锁定 / 删除
- **分组** — 自由文本组标签,平铺 / 按组折叠切换,组头可折叠
- **和声规则** — 5 种(互补 / 三角 / 类似 / 分裂互补 / 单色),色盘叠加几何标记
- **和声 autoFill** — 锚色变化自动重派生,派生色带角标标记

### 三视图工作区
- **色盘视图** — 上述核心交互
- **比例视图** — 条形(拖分割线)/ 环形 / 面积三种呈现,按权重归一化,模拟实际使用占比
- **笔刷视图** — Canvas 2D 叠加着色:5 种混合模式(正常/正片叠底/滤色/叠加/柔光)、大小/不透明度、撤销(20 步)、清空、Alt+点击反向取色

### 滤镜(非破坏性)
- 7 种 CSS 滤镜(亮度/对比度/饱和度/色相旋转/灰度/棕褐/反相)
- 只存参数不改色值,实时预览条,可开关/删除

### 导出
- CSS Variables / Tailwind config / W3C Design Tokens / 完整 JSON,四格式 tabs + 预览 + 复制/下载

### 快捷键(可自定义,云端同步)
- 默认:P(取色)/ A(加入)/ C(复制)/ X(清历史)
- 右栏面板点击键位徽章 → 按新键即绑定,冲突检测
- 存独立 KV key `ve-color-key`,登录后跨设备同步

## 持久化

| 数据 | KV key | 说明 |
|---|---|---|
| 主文档(schema 1.3.0)| `color-studio` | 调色板/色卡/滤镜栈/视图偏好,整体 JSON |
| 快捷键偏好 | `ve-color-key` | 用户级键位映射,跨文档生效 |

均走 `/api/v1/kv`,tag `['color-studio']`,caller `default_group_id`。旧版本 schema(1.0.0 / 1.1.0)load 时自动迁移。

## 本地开发

```bash
pnpm install
pnpm --filter @style-library/showcase dev
# 打开 http://localhost:5173/components/color-studio
```

## 后续(未实现)

Pantone 近似色、IndexedDB 离线 + 笔刷画布持久化、跨标签页乐观锁、滤镜预设分享 —— 见 `docs/superpowers/specs/2026-08-26-color-studio-phase2a-design.md` §8。
