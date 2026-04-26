# GNSS 前端 Web 应用设计

## 1. 文档定位

本文档描述当前仓库中前端 Web 应用的实际实现状态，重点覆盖：

1. 当前已落地的页面与模块
2. 每个模块的功能范围
3. 前端与 Python 后台接口映射
4. 当前组件、状态管理与数据流组织方式
5. 已实现能力与后续扩展边界

当前前端不是纯设计稿，而是已经可运行的管理台，代码目录位于 `frontend/src`。

## 2. 当前技术栈

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Ant Design
- ECharts
- dayjs

当前实现中未使用但曾在早期设计中预留的能力：

- 地图组件
- 多级详情路由
- Zustand 之外的复杂全局状态层

## 3. 当前应用结构

### 3.1 顶层布局

当前前端采用单一壳层布局：

- `AppShell`
- 左侧导航
- 主内容区域

### 3.2 当前路由

当前已实现路由如下：

```text
/
/overview
/networks
/sites
/observations
/solve-jobs
/analytics
/system
```

说明：

- `/` 会重定向到 `/overview`
- 当前没有单独的 `/results/:jobId`、`/sites/:siteId`、`/networks/:networkId` 页面
- 子网、站点、RINEX、解算结果详情目前以弹窗或抽屉方式展示

## 4. 模块总览

当前前端围绕七个模块组织：

1. 总览 `OverviewPage`
2. 子网管理 `NetworksPage`
3. 站点管理 `SitesPage`
4. 观测数据 `ObservationsPage`
5. 解算任务 `SolveJobsPage`
6. 历史分析 `AnalyticsPage`
7. 系统状态 `SystemPage`

## 5. 页面与功能

### 5.1 总览页

文件：

- `frontend/src/pages/OverviewPage.tsx`

当前功能：

- 展示系统是否已完成初始化
- 展示子网总数、站点总数、解算任务总数
- 展示后台、数据库、文件存储、solver 的健康状态
- 展示最近子网
- 展示站点样例列表

当前未实现：

- 地图分布
- 最近任务卡片
- 趋势图

对应后台接口：

| 功能 | 方法 | 路径 | 前端用途 |
| --- | --- | --- | --- |
| 系统健康检查 | `GET` | `/api/v1/system/health` | 展示后台、数据库、存储、solver 状态 |
| 初始化状态 | `GET` | `/api/v1/system/bootstrap-status` | 展示导入状态与基础数量 |
| 子网列表 | `GET` | `/api/v1/networks` | 取最近子网样例 |
| 站点列表 | `GET` | `/api/v1/sites` | 取站点样例 |
| 统计概览 | `GET` | `/api/v1/analytics/network-overview` | 展示任务数和总体统计 |

### 5.2 子网管理页

文件：

- `frontend/src/pages/NetworksPage.tsx`

当前功能：

- 子网列表
- 按关键字搜索子网名称
- 新增子网
- 编辑子网
- 删除子网

当前表格字段：

- 名称
- 描述
- 来源类型
- 站点数
- 状态

当前未实现：

- 子网详情页
- 子网站点分配面板
- 批量加入/移出站点

对应后台接口：

| 功能 | 方法 | 路径 | 前端用途 |
| --- | --- | --- | --- |
| 子网列表 | `GET` | `/api/v1/networks` | 主表格 |
| 新增子网 | `POST` | `/api/v1/networks` | 创建本地子网 |
| 编辑子网 | `PATCH` | `/api/v1/networks/{networkId}` | 修改名称、描述、状态 |
| 删除子网 | `DELETE` | `/api/v1/networks/{networkId}` | 删除本地子网 |

### 5.3 站点管理页

文件：

- `frontend/src/pages/SitesPage.tsx`

当前功能：

- 站点列表
- 关键字搜索
- 新增站点
- 编辑站点
- 删除站点
- 在表格中查看站点所属子网

当前表格和表单重点字段：

- `name`
- `four_char_id`
- `domes_number`
- `latitude`
- `longitude`
- `ellipsoidal_height`
- `site_status`
- `description`

当前未实现：

- 单独站点详情页
- 站点历史页签
- 站点观测摘要页签

对应后台接口：

| 功能 | 方法 | 路径 | 前端用途 |
| --- | --- | --- | --- |
| 站点列表 | `GET` | `/api/v1/sites` | 主表格 |
| 新增站点 | `POST` | `/api/v1/sites` | 创建本地站点 |
| 编辑站点 | `PATCH` | `/api/v1/sites/{siteId}` | 更新站点元数据 |
| 删除站点 | `DELETE` | `/api/v1/sites/{siteId}` | 删除本地站点 |

### 5.4 观测数据页

文件：

- `frontend/src/pages/ObservationsPage.tsx`

当前功能：

- 查询远端 RINEX 文件
- 按站点、时间范围、文件周期、文件类型、RINEX 版本过滤
- 支持 `metadataStatus`
- 支持 `decompress`
- 勾选远端文件后批量下载到本地
- 查看本地文件列表
- 查看文件详情抽屉
- 查看头部摘要
- 重新索引本地文件
- 删除本地文件

当前页面分区：

1. 远端查询表单
2. 远端结果表格
3. 本地文件表格
4. 文件详情抽屉

当前详情抽屉展示内容：

- 站点
- 本地路径
- 文件类型
- 文件周期
- RINEX 版本
- 压缩类型
- 采样间隔
- 时间覆盖
- 星座
- 索引状态
- 错误信息
- 头部前 120 行

对应后台接口：

| 功能 | 方法 | 路径 | 前端用途 |
| --- | --- | --- | --- |
| 本地文件列表 | `GET` | `/api/v1/rinex-files` | 本地文件表格 |
| 远端文件查询 | `POST` | `/api/v1/rinex-files/query-remote` | 查询 GA 远端文件 |
| 下载文件 | `POST` | `/api/v1/rinex-files/download` | 下载并入库 |
| 文件详情 | `GET` | `/api/v1/rinex-files/{rinexFileId}` | 抽屉基础信息 |
| 文件头部 | `GET` | `/api/v1/rinex-files/{rinexFileId}/header` | 头部摘要 |
| 历元概览 | `GET` | `/api/v1/rinex-files/{rinexFileId}/epochs` | 时间覆盖和采样率 |
| 重新索引 | `POST` | `/api/v1/rinex-files/reindex` | 手动重索引 |
| 删除本地文件 | `DELETE` | `/api/v1/rinex-files/{rinexFileId}` | 删除缓存与记录 |

### 5.5 解算任务页

文件：

- `frontend/src/pages/SolveJobsPage.tsx`

当前实现范围仅覆盖 SPP。

当前功能：

- 选择站点
- 选择本地观测文件
- 选择本地导航文件
- 选择解算时刻
- 选择星座
- 选择截止高度角
- 执行 SPP 预检
- 根据预检结果一键回填最近候选历元
- 对任意候选历元执行“回填时刻”
- 提交 SPP 任务
- 查看任务列表
- 查看任务详情抽屉
- 查看任务失败原因
- 查看结果摘要
- 查看历元结果
- 查看失败诊断
- 查看卫星状态

当前预检展示内容：

- `ready / risky / unavailable`
- 建议文案
- 搜索窗口
- 最近候选历元
- 距请求时刻偏差
- 候选历元数
- 导航覆盖星座
- 风险原因
- 候选历元卫星统计表

当前任务详情抽屉展示内容：

- 任务状态
- 引擎名称
- 错误信息
- 解算模式
- 站点
- 解状态
- 使用卫星数
- 请求时刻
- 实际解算时刻
- 请求高度角
- 实际高度角
- 有效历元数
- 观测文件名
- `PDOP`
- `Sigma0`
- 历元结果表
- 失败诊断表
- 卫星状态表

当前未实现：

- RTD 任务
- RTK 任务
- 任务取消
- 独立日志面板

对应后台接口：

| 功能 | 方法 | 路径 | 前端用途 |
| --- | --- | --- | --- |
| 任务列表 | `GET` | `/api/v1/solve-jobs` | 任务表格 |
| 创建 SPP 任务 | `POST` | `/api/v1/solve-jobs/spp` | 提交单点定位 |
| SPP 预检 | `POST` | `/api/v1/solve-jobs/spp/precheck` | 判断请求时刻附近可解性 |
| 任务详情 | `GET` | `/api/v1/solve-jobs/{jobId}` | 抽屉标题和基础状态 |
| 任务结果摘要 | `GET` | `/api/v1/solve-jobs/{jobId}/result` | 结果概览 |
| 历元结果 | `GET` | `/api/v1/solve-jobs/{jobId}/epochs` | 历元结果表 |
| 卫星状态 | `GET` | `/api/v1/solve-jobs/{jobId}/satellites` | 卫星状态表 |

### 5.6 历史分析页

文件：

- `frontend/src/pages/AnalyticsPage.tsx`

当前功能：

- 展示站网统计
- 展示 RINEX 文件规模
- 展示最近成功率
- 查看站点可用率表
- 点击站点后查看历元质量趋势
- 查看 `PDOP / 卫星数 / Sigma0` 折线图
- 按星座和 PRN 查看卫星历史状态
- 查看 `SNR / 仰角 / 码残差` 折线图

当前页面分区：

1. 顶部统计卡片
2. 站点可用率与质量概览
3. 站点历元质量趋势
4. 卫星历史状态

对应后台接口：

| 功能 | 方法 | 路径 | 前端用途 |
| --- | --- | --- | --- |
| 统计概览 | `GET` | `/api/v1/analytics/network-overview` | 顶部统计 |
| 站点可用率 | `GET` | `/api/v1/analytics/site-availability` | 站点列表与成功率 |
| 站点历元质量 | `GET` | `/api/v1/analytics/site-epochs` | 历元质量图和表 |
| 卫星历史状态 | `GET` | `/api/v1/analytics/satellite-history` | 卫星图和表 |

### 5.7 系统状态页

文件：

- `frontend/src/pages/SystemPage.tsx`

当前功能：

- 查看初始化状态
- 重新检查初始化
- 查看系统健康状态
- 查看数据库路径、数据目录、solver 地址
- 生成 NPI 同步预览
- 应用 NPI 刷新

当前页面分区：

1. 初始化状态
2. 系统健康检查
3. NPI 同步预览

对应后台接口：

| 功能 | 方法 | 路径 | 前端用途 |
| --- | --- | --- | --- |
| 初始化状态 | `GET` | `/api/v1/system/bootstrap-status` | 初始化状态卡片 |
| 手动初始化 | `POST` | `/api/v1/system/bootstrap` | 重新触发检查 |
| 健康检查 | `GET` | `/api/v1/system/health` | 系统状态面板 |
| 同步预览 | `POST` | `/api/v1/system/sync/npi/preview` | NPI 差异预览 |
| 应用同步 | `POST` | `/api/v1/system/sync/npi/apply` | 应用本地刷新 |

## 6. 当前共享组件

当前前端已经沉淀出少量通用组件：

- `PageSection`
- `StatusTag`

说明：

- 当前组件层还比较轻，业务逻辑大多仍在页面组件中
- 后续如果继续扩展 RTD / RTK、结果页和地图页，建议再抽公共表单与结果组件

## 7. 当前状态管理与数据流

### 7.1 服务端状态

当前统一使用 TanStack Query 处理：

- 数据请求
- 缓存
- 刷新
- 失效重取

当前典型查询包括：

- `['bootstrap-status']`
- `['health']`
- `['networks', params]`
- `['sites', params]`
- `['rinex-files']`
- `['solve-jobs']`
- `['solve-job', id]`
- `['solve-result', id]`
- `['solve-epochs', id]`
- `['solve-satellites', id]`
- `['analytics-overview']`
- `['analytics-site-availability']`

### 7.2 本地页面状态

当前主要通过 React `useState` 和 Ant Design `Form` 维护：

- 当前选中任务
- 当前选中文件
- 远端查询结果
- 远端勾选结果
- 预检结果
- 各页面弹窗和抽屉开关

### 7.3 轻量筛选状态

当前项目保留了 `frontend/src/store.ts` 中的轻量筛选状态，用于：

- 子网关键字过滤
- 站点关键字过滤

## 8. 当前 API 封装方式

文件：

- `frontend/src/api.ts`
- `frontend/src/types.ts`

当前特点：

- 所有请求统一走 `/api/v1`
- 统一解析后端 `ApiEnvelope`
- 在 `api.ts` 中按领域组织函数
- 在 `types.ts` 中维护前端类型定义

当前已封装的接口分组包括：

- `system`
- `analytics`
- `networks`
- `sites`
- `rinex-files`
- `solve-jobs`

## 9. 与旧版设计相比的主要变化

当前代码实现与早期设计存在以下差异：

1. 当前没有多级详情路由，详情更多通过抽屉完成
2. 当前没有地图展示
3. 当前没有 RTD / RTK 前端入口
4. 当前已经新增了 SPP 预检与候选历元回填，这部分比旧设计更具体
5. 当前历史分析页已经接入 ECharts，不再只是规划
6. 当前系统页已经接入 NPI 同步预览和应用能力

## 10. 后续前端扩展建议

基于当前实现，下一步建议按下面顺序扩展：

1. 为子网、站点、解算任务补独立详情路由
2. 把结果抽屉拆分为“概览 / 历元 / 卫星 / 诊断”页签
3. 在观测页增加本地文件筛选和分页参数联动
4. 为 SPP 结果增加图表视图
5. 在 solver 真实支持后再补 RTD / RTK 页面流
6. 条件成熟后加入地图能力

## 11. 文档使用方式

这份文档现在更适合作为“当前前端实现说明”，而不是纯目标态蓝图。

使用建议：

- 看代码结构时，以本文件为页面索引
- 对接后台接口时，以本文件中的接口映射为准
- 规划下一阶段前端工作时，以“当前未实现”与“后续扩展建议”为切入点
