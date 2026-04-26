# GNSS 前端 Web 应用设计

## 1. 文档目标

本文档是 GNSS 参考站管理与解算系统的前端独立设计文档，聚焦以下内容：

1. 前端 Web 应用的模块划分
2. 各模块的功能说明
3. 页面级交互与展示设计
4. 每个功能对应的 Python 后台接口说明
5. 前端数据模型、状态管理与技术实现建议

前端定位：

- 面向业务用户管理参考站网、子网、站点和观测文件
- 面向分析用户发起解算任务并查看结果
- 不直接接入 C++ 解算服务，统一通过 Python 后台访问

## 2. 设计原则

- 管理与分析分区清晰：站网管理、观测数据管理、解算分析三条主线清楚分离
- 结果可追溯：每个页面都能回到站点、文件、任务三个核心实体
- 大数据友好：表格、时间序列、地图展示支持分页、筛选和懒加载
- 状态显式：下载状态、索引状态、任务状态、解算状态都以统一标签展示
- 与后台契约稳定：前端只依赖 `/api/v1` 业务接口，不感知底层解算服务实现

## 3. 推荐技术方案

### 3.1 技术栈

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Zustand
- Ant Design
- ECharts
- MapLibre GL JS

### 3.2 技术职责

- React Router：页面路由和布局切换
- TanStack Query：服务端数据请求、缓存、失效刷新
- Zustand：页面内临时筛选状态、表格选择状态、任务创建草稿
- Ant Design：表单、表格、抽屉、详情弹窗、状态标签
- ECharts：时间序列图、统计图、卫星状态图
- MapLibre：站点地图、位置散点、结果轨迹

## 4. 信息架构

## 4.1 顶层导航

建议采用左侧主导航：

1. 总览
2. 子网管理
3. 站点管理
4. 观测数据
5. 解算任务
6. 结果分析
7. 系统状态

## 4.2 核心对象

前端围绕五类核心对象组织页面：

1. 子网 `network`
2. 站点 `site`
3. RINEX 文件 `rinexFile`
4. 解算任务 `solveJob`
5. 历元/卫星分析结果 `epochResult` / `satelliteState`

## 5. 页面与模块设计

## 5.1 总览页

### 功能

- 展示系统初始化状态
- 展示子网总数、站点总数、本地 RINEX 文件总数、最近任务数
- 展示站点地图分布
- 展示最近解算任务列表
- 展示解算服务和后台服务健康状态

### 页面模块

- 统计卡片区
- 地图概览区
- 最近任务区
- 系统健康状态区

### 对应后台接口

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 查询系统健康状态 | `GET` | `/api/v1/system/health` | 用于显示后台、数据库、文件存储、解算服务状态 |
| 查询初始化状态 | `GET` | `/api/v1/system/bootstrap-status` | 用于显示是否已完成导入和基础数据数量 |
| 查询站点列表简表 | `GET` | `/api/v1/sites` | 用于地图散点展示，可只取必要字段 |
| 查询近期任务 | `GET` | `/api/v1/solve-jobs` | 用于展示最近解算任务摘要 |
| 查询网络概览统计 | `GET` | `/api/v1/analytics/network-overview` | 用于概览统计与趋势 |

## 5.2 子网管理模块

### 功能

- 子网列表查看
- 按名称、来源、状态筛选
- 新增本地子网
- 编辑本地子网
- 删除本地子网
- 查看子网详情
- 查看子网下站点
- 批量添加站点到子网
- 将站点移出子网

### 页面结构

1. 子网列表页
2. 子网详情页
3. 新增/编辑子网弹窗
4. 子网站点管理弹窗

### 页面字段建议

列表字段：

- 子网名称
- 描述
- 来源类型
- 站点数量
- 状态
- 最后更新时间

详情字段：

- 基本信息
- 关联站点列表
- 操作日志摘要

### 对应后台接口

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 查询子网列表 | `GET` | `/api/v1/networks` | 支持分页、关键字、状态筛选 |
| 查询子网详情 | `GET` | `/api/v1/networks/{networkId}` | 展示子网完整信息 |
| 新增子网 | `POST` | `/api/v1/networks` | 创建本地子网 |
| 修改子网 | `PATCH` | `/api/v1/networks/{networkId}` | 修改名称、描述、状态 |
| 删除子网 | `DELETE` | `/api/v1/networks/{networkId}` | 逻辑删除 |
| 查询子网下站点 | `GET` | `/api/v1/networks/{networkId}/sites` | 展示归属站点 |
| 批量加入站点 | `POST` | `/api/v1/networks/{networkId}/sites` | 选中站点后加入子网 |
| 移出站点 | `DELETE` | `/api/v1/networks/{networkId}/sites/{siteId}` | 从子网中移除站点 |

## 5.3 站点管理模块

### 功能

- 站点列表查看
- 关键字搜索
- 按四字符码、DOMES、子网、站点状态筛选
- 新增站点
- 编辑站点元数据
- 删除站点
- 查看站点详情
- 查看所属子网
- 查看元数据修改历史
- 查看站点观测概览

### 页面结构

1. 站点列表页
2. 站点详情页
3. 新增/编辑站点表单页或抽屉
4. 站点历史记录页签
5. 站点观测概览页签

### 页面字段建议

列表字段：

- 站点名称
- 四字符码
- DOMES
- 经度
- 纬度
- 高程
- 状态
- 所属子网
- 来源

详情字段：

- 基础元数据
- 位置和地图
- 安装信息
- Monument 信息
- 所属子网
- 历史变更
- 观测摘要

### 对应后台接口

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 查询站点列表 | `GET` | `/api/v1/sites` | 站点主列表 |
| 新增站点 | `POST` | `/api/v1/sites` | 创建本地站点 |
| 查询站点详情 | `GET` | `/api/v1/sites/{siteId}` | 查询完整站点信息 |
| 修改站点 | `PATCH` | `/api/v1/sites/{siteId}` | 更新元数据 |
| 删除站点 | `DELETE` | `/api/v1/sites/{siteId}` | 逻辑删除 |
| 查询站点所属子网 | `GET` | `/api/v1/sites/{siteId}/networks` | 展示归属网络 |
| 查询变更历史 | `GET` | `/api/v1/sites/{siteId}/history` | 展示操作审计记录 |
| 查询观测摘要 | `GET` | `/api/v1/sites/{siteId}/observation-summary` | 展示时间范围内文件覆盖情况 |
| 查询站点状态历史 | `GET` | `/api/v1/sites/{siteId}/status-history` | 展示可用率、固定率等历史指标 |

## 5.4 观测数据模块

### 功能

- 按站点、时间范围、文件周期、文件类型查询 RINEX 文件
- 同时查看本地文件和远端可下载文件
- 触发下载
- 查看下载状态和索引状态
- 查看 RINEX 文件详情
- 查看 RINEX 头部
- 查看时间覆盖、采样率、星座、观测类型
- 删除本地缓存文件
- 重新索引文件

### 页面结构

1. 文件查询页
2. 本地文件列表页
3. 文件详情抽屉
4. 远端查询结果表格
5. 下载任务反馈区

### 页面交互建议

- 默认先查本地
- 用户点击“查询远端”后调用远端查询接口
- 远端结果与本地结果使用来源标签区分
- 下载后自动刷新本地列表
- 文件详情支持切换“基本信息 / 头部 / 历元概览”

### 对应后台接口

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 查询本地文件 | `GET` | `/api/v1/rinex-files` | 获取本地文件列表和状态 |
| 查询远端文件 | `POST` | `/api/v1/rinex-files/query-remote` | 调用 GA 查询 API 获取可下载文件 |
| 下载远端文件 | `POST` | `/api/v1/rinex-files/download` | 批量下载并入库 |
| 查询文件详情 | `GET` | `/api/v1/rinex-files/{rinexFileId}` | 获取基础元数据和索引结果 |
| 查询文件头部 | `GET` | `/api/v1/rinex-files/{rinexFileId}/header` | 展示解析后的头部信息 |
| 查询历元概览 | `GET` | `/api/v1/rinex-files/{rinexFileId}/epochs` | 展示时间覆盖与采样率概览 |
| 重新索引文件 | `POST` | `/api/v1/rinex-files/reindex` | 对异常文件重新分析 |
| 删除本地缓存 | `DELETE` | `/api/v1/rinex-files/{rinexFileId}` | 删除本地文件和索引记录 |

## 5.5 解算任务模块

### 功能

- 创建 SPP 任务
- 创建 RTD 任务
- 创建 RTK 任务
- 查询任务列表
- 按模式、状态、时间筛选
- 查看任务状态
- 查看失败原因
- 取消任务
- 跳转到结果页

### 页面结构

1. 任务列表页
2. 新建任务页
3. 任务详情页
4. 任务日志面板

### 任务创建表单设计

#### SPP

- 站点选择
- 观测文件选择
- 导航文件选择
- 指定解算时刻
- 星座选择
- 截止高度角
- 模型参数

#### RTD/RTK

- 模式选择
- 参考站选择
- 参考站观测文件选择
- 导航文件选择
- 流动站列表选择
- 每个流动站的观测文件选择
- 时间窗
- 历元间隔
- 模糊度参数

### 对应后台接口

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 查询任务列表 | `GET` | `/api/v1/solve-jobs` | 展示任务主列表 |
| 创建 SPP 任务 | `POST` | `/api/v1/solve-jobs/spp` | 发起单点定位任务 |
| 创建差分任务 | `POST` | `/api/v1/solve-jobs/differential` | 发起 RTD/RTK 任务 |
| 查询任务详情 | `GET` | `/api/v1/solve-jobs/{jobId}` | 获取状态与摘要 |
| 取消任务 | `DELETE` | `/api/v1/solve-jobs/{jobId}` | 取消排队或运行中的任务 |
| 查询任务结果摘要 | `GET` | `/api/v1/solve-jobs/{jobId}/result` | 用于结果页头部概览 |
| 查询任务日志 | `GET` | `/api/v1/solve-jobs/{jobId}/logs` | 用于错误排查和过程查看 |

## 5.6 结果分析模块

### 功能

- 查看单个任务结果
- 查看历元级坐标结果
- 查看轨迹、散点、误差图
- 查看 DOP、卫星数量、残差变化
- 查看基线变化
- 查看固定率、有效率
- 查看某时刻卫星参与情况
- 多任务对比

### 页面结构

1. 结果概览页
2. 历元结果页签
3. 轨迹/地图页签
4. 卫星状态页签
5. 质量统计页签

### 图表建议

- 坐标偏差折线图
- 高程误差折线图
- DOP 折线图
- 卫星数量折线图
- 基线长度变化图
- 固定/浮点/无效状态堆叠图
- 某时刻卫星天空图

### 对应后台接口

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 查询结果摘要 | `GET` | `/api/v1/solve-jobs/{jobId}/result` | 用于统计卡片和概览 |
| 查询历元结果 | `GET` | `/api/v1/solve-jobs/{jobId}/epochs` | 用于表格和时序图 |
| 查询卫星状态 | `GET` | `/api/v1/solve-jobs/{jobId}/satellites` | 用于卫星分析和天空图 |
| 查询任务中站点结果 | `GET` | `/api/v1/solve-jobs/{jobId}/sites` | 展示基站和流动站质量统计 |

## 5.7 站点与卫星历史分析模块

### 功能

- 查询某站点在历史时间范围内的可用率
- 查询固定率和数据缺口
- 查询某颗卫星的仰角、方位角、SNR、残差、健康状态
- 查看子网级统计

### 页面结构

1. 站点历史分析页
2. 卫星历史分析页
3. 子网运行概览页

### 对应后台接口

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 站点可用率统计 | `GET` | `/api/v1/analytics/site-availability` | 查询站点维度历史统计 |
| 站点历元质量统计 | `GET` | `/api/v1/analytics/site-epochs` | 查询历史历元质量 |
| 卫星历史状态 | `GET` | `/api/v1/analytics/satellite-history` | 查询单颗卫星历史趋势 |
| 子网运行概览 | `GET` | `/api/v1/analytics/network-overview` | 查询子网级别统计数据 |

## 5.8 系统状态模块

### 功能

- 查看初始化状态
- 手动触发首次初始化
- 查看 NPI 同步预览
- 查看同步差异
- 执行同步应用
- 查看系统能力信息

### 页面结构

1. 初始化状态卡片
2. 同步预览表格
3. 同步策略执行区
4. 系统能力和版本信息

### 对应后台接口

| 功能 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 查看初始化状态 | `GET` | `/api/v1/system/bootstrap-status` | 显示导入情况 |
| 执行初始化 | `POST` | `/api/v1/system/bootstrap` | 首次导入或手动重新导入 |
| 同步预览 | `POST` | `/api/v1/system/sync/npi/preview` | 获取 NPI 与本地差异 |
| 应用同步策略 | `POST` | `/api/v1/system/sync/npi/apply` | 应用同步 |
| 查看系统能力 | `GET` | `/api/v1/system/capabilities` | 展示支持的星座、格式、模式 |

## 6. 路由设计

建议路由如下：

```text
/
/overview
/networks
/networks/:networkId
/sites
/sites/:siteId
/observations
/observations/files/:rinexFileId
/solve-jobs
/solve-jobs/new
/solve-jobs/:jobId
/results/:jobId
/analytics/sites
/analytics/satellites
/analytics/networks
/system
```

## 7. 前端组件分层建议

## 7.1 通用组件

- `PageHeader`
- `FilterBar`
- `StatusTag`
- `MetricCard`
- `AsyncTable`
- `MapPanel`
- `ChartPanel`
- `EntityDrawer`
- `ConfirmActionModal`

## 7.2 业务组件

- `NetworkForm`
- `NetworkSitePicker`
- `SiteForm`
- `SiteDetailPanel`
- `RinexQueryForm`
- `RinexFileTable`
- `RinexHeaderViewer`
- `SolveJobForm`
- `SolveJobSummary`
- `EpochResultTable`
- `SatelliteSkyPlot`
- `SiteAvailabilityChart`

## 8. 前端数据请求设计

## 8.1 Query Key 建议

```text
["system", "health"]
["system", "bootstrap-status"]
["networks", filters]
["network", networkId]
["network-sites", networkId, filters]
["sites", filters]
["site", siteId]
["site-history", siteId, filters]
["site-observation-summary", siteId, filters]
["rinex-files", filters]
["rinex-file", rinexFileId]
["rinex-file-header", rinexFileId]
["solve-jobs", filters]
["solve-job", jobId]
["solve-job-result", jobId]
["solve-job-epochs", jobId, filters]
["solve-job-satellites", jobId, filters]
["analytics", "site-availability", filters]
["analytics", "satellite-history", filters]
```

## 8.2 刷新策略

- 任务列表、任务详情：运行中时轮询
- 下载后：使 `rinex-files` 相关查询失效刷新
- 编辑子网/站点后：使详情和列表都失效刷新
- 创建任务后：跳转任务详情并开始状态轮询

## 9. 表单与校验设计

## 9.1 子网表单

字段：

- `name` 必填，长度限制
- `description` 选填
- `status` 必选

## 9.2 站点表单

字段：

- `name`
- `fourCharId`
- `domesNumber`
- `description`
- `latitude`
- `longitude`
- `ellipsoidalHeight`
- `dateInstalled`
- `siteStatus`
- `monument.description`
- `monument.foundation`
- `monument.markerDescription`
- `monument.height`

校验重点：

- 四字符码格式
- 经度纬度范围
- DOMES 可为空但格式合法

## 9.3 RINEX 查询表单

字段：

- 站点
- 开始时间
- 结束时间
- 文件周期
- 文件类型
- RINEX 版本

校验重点：

- 开始时间小于结束时间
- 时间跨度不能超过后台允许上限

## 9.4 解算任务表单

校验重点：

- SPP 必须选择一个观测文件和至少一个导航文件
- RTD/RTK 必须选择一个参考站和至少一个流动站
- 时间窗必须落在文件覆盖范围内
- 参考站和流动站不能重复

## 10. 状态与权限表现

当前阶段未要求用户权限系统，前端只需处理业务状态：

- `download_status`
- `index_status`
- `solve_job_status`
- `solution_status`
- `site_status`

建议统一状态标签颜色：

- `queued`：蓝色
- `running`：金色
- `succeeded`：绿色
- `failed`：红色
- `cancelled`：灰色
- `fix`：绿色
- `float`：橙色
- `code`：蓝色
- `invalid`：灰色

## 11. 后台接口封装建议

建议前端按领域拆分 API client：

- `systemApi`
- `networkApi`
- `siteApi`
- `rinexApi`
- `solveJobApi`
- `analyticsApi`

建议每个 client 统一返回：

- `data`
- `meta`
- `code`
- `message`

对于分页接口统一适配：

```ts
type PageResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
```

## 12. 前端实现顺序建议

### 第一阶段

- 搭建应用骨架
- 布局、路由、基础请求层
- 总览页
- 子网管理
- 站点管理

### 第二阶段

- 观测数据查询页
- 文件详情页
- 下载与索引状态展示

### 第三阶段

- 解算任务创建页
- 任务列表与详情页
- 结果概览与历元结果展示

### 第四阶段

- 历史分析
- 高级图表
- 多任务对比

## 13. 本文档与总设计文档关系

本文档是前端专用设计，对应总设计文档中的前端部分，并补充了：

- 页面结构
- 路由设计
- 组件设计
- 状态管理设计
- 前端到 Python 后台接口映射

实现阶段可将本文件作为前端开发主依据，将总设计文档作为系统级约束依据。
