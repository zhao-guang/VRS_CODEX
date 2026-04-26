# GNSS 前端 Web 应用设计

## 1. 文档定位

本文档描述当前仓库中前端 Web 应用的实际实现状态，重点覆盖：

1. 当前已落地的页面与模块
2. 每个模块的功能范围
3. 前端与 Python 后台接口映射
4. 每个接口的参数说明与返回值说明
5. 当前组件、状态管理与数据流组织方式

当前前端代码目录位于 `frontend/src`，后台接口统一由 `frontend/src/api.ts` 访问。

## 2. 当前技术栈

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Ant Design
- ECharts
- dayjs

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
- 当前没有单独的详情路由，详情主要通过弹窗和抽屉展示

## 4. 接口返回约定

当前前端访问的所有后台接口都返回统一结构：

```ts
type APIEnvelope<T> = {
  code: string
  message: string
  data: T
  meta: Record<string, unknown>
}
```

文档中“返回值说明”默认指 `data` 字段内容。

分页接口统一返回：

```ts
type PageResponse<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
}
```

## 5. 模块总览

当前前端围绕七个模块组织：

1. 总览 `OverviewPage`
2. 子网管理 `NetworksPage`
3. 站点管理 `SitesPage`
4. 观测数据 `ObservationsPage`
5. 解算任务 `SolveJobsPage`
6. 历史分析 `AnalyticsPage`
7. 系统状态 `SystemPage`

## 6. 页面、功能与后台接口

### 6.1 总览页

文件：

- `frontend/src/pages/OverviewPage.tsx`

当前功能：

- 展示系统是否已完成初始化
- 展示子网总数、站点总数、解算任务总数
- 展示后台、数据库、文件存储、solver 的健康状态
- 展示最近子网
- 展示站点样例列表

#### `GET /api/v1/system/health`

用途：

- 展示后台、数据库、文件存储和 solver 的健康状态

参数说明：

- 无

返回值说明：

- `backend.status`: 后台状态，当前正常时为 `ok`
- `backend.name`: 后台服务名称
- `backend.version`: 后台版本
- `database.status`: 数据库状态
- `database.path`: SQLite 数据库路径
- `storage.status`: 本地数据目录状态
- `storage.data_dir`: 本地数据目录路径
- `solver.status`: 解算服务状态，可能为 `ok`、`offline`、`unknown`
- `solver.base_url`: solver 服务基地址

#### `GET /api/v1/system/bootstrap-status`

用途：

- 展示初始化导入状态和基础数量

参数说明：

- 无

返回值说明：

- `bootstrapped`: 是否已完成初始化
- `latest_batch`: 最近一次导入批次
- `latest_batch.id`: 批次 ID
- `latest_batch.source`: 数据来源
- `latest_batch.status`: 批次状态
- `latest_batch.total_networks`: 导入子网数
- `latest_batch.total_sites`: 导入站点数
- `latest_batch.created_at`: 批次创建时间
- `counts.networks`: 当前本地子网总数
- `counts.sites`: 当前本地站点总数

#### `GET /api/v1/networks`

用途：

- 在总览页展示最近子网样例

参数说明：

- `page`: 页码，最小值 `1`
- `page_size`: 每页条数，范围 `1-200`
- `keyword`: 子网名称或描述关键字，可选
- `source_type`: 来源类型过滤，可选
- `status`: 状态过滤，可选

返回值说明：

- 分页结构 `PageResponse<Network>`
- `items[].id`: 子网 ID
- `items[].source_type`: 来源类型，如 `npi`、`local`
- `items[].external_id`: 外部数据源 ID
- `items[].name`: 子网名称
- `items[].description`: 子网描述
- `items[].status`: 子网状态
- `items[].site_count`: 子网内站点数量
- `items[].created_at`: 创建时间
- `items[].updated_at`: 更新时间

#### `GET /api/v1/sites`

用途：

- 在总览页展示站点样例

参数说明：

- `page`: 页码，最小值 `1`
- `page_size`: 每页条数，范围 `1-200`
- `keyword`: 站点关键字，可匹配名称、四字符码、DOMES，可选
- `four_char_id`: 四字符码过滤，可选
- `domes_number`: DOMES 过滤，可选
- `network_id`: 子网 ID 过滤，可选
- `site_status`: 站点状态过滤，可选

返回值说明：

- 分页结构 `PageResponse<Site>`
- `items[].id`: 站点 ID
- `items[].source_type`: 来源类型
- `items[].external_id`: 外部数据源 ID
- `items[].name`: 站点名称
- `items[].four_char_id`: 四字符码
- `items[].domes_number`: DOMES 编号
- `items[].description`: 描述
- `items[].latitude`: 纬度
- `items[].longitude`: 经度
- `items[].ellipsoidal_height`: 大地高
- `items[].date_installed`: 安装时间
- `items[].site_status`: 站点状态
- `items[].networks`: 所属子网数组，元素包含 `id`、`name`、`status`

#### `GET /api/v1/analytics/network-overview`

用途：

- 展示总体统计

参数说明：

- 无

返回值说明：

- `totals.networks`: 子网总数
- `totals.sites`: 站点总数
- `totals.rinex_files`: 本地 RINEX 文件总数
- `solve_jobs`: 解算任务总数
- `recent_success_rate`: 最近解算成功率，范围 `0-1`

### 6.2 子网管理页

文件：

- `frontend/src/pages/NetworksPage.tsx`

当前功能：

- 子网列表
- 按关键字搜索子网名称
- 新增子网
- 编辑子网
- 删除子网

#### `GET /api/v1/networks`

用途：

- 子网主表格

参数说明：

- `page`: 页码
- `page_size`: 每页条数
- `keyword`: 名称或描述关键字，可选
- `source_type`: 来源类型过滤，可选
- `status`: 状态过滤，可选

返回值说明：

- 分页结构 `PageResponse<Network>`
- 关键字段见 `6.1` 中同名接口说明

#### `POST /api/v1/networks`

用途：

- 创建本地子网

参数说明：

- `name`: 子网名称，必填，长度 `1-255`
- `description`: 子网描述，可选
- `status`: 子网状态，默认 `active`

返回值说明：

- `id`: 新建子网 ID
- `source_type`: 固定为 `local`
- `external_id`: 通常为空
- `name`: 子网名称
- `description`: 子网描述
- `status`: 子网状态
- `site_count`: 初始为 `0`
- `created_at`: 创建时间
- `updated_at`: 更新时间

#### `PATCH /api/v1/networks/{networkId}`

用途：

- 编辑子网

参数说明：

- 路径参数 `networkId`: 子网 ID
- 请求体字段均可选：
- `name`: 子网名称
- `description`: 子网描述
- `status`: 子网状态

返回值说明：

- 返回更新后的 `Network`
- 字段与 `POST /api/v1/networks` 返回一致

#### `DELETE /api/v1/networks/{networkId}`

用途：

- 删除子网

参数说明：

- 路径参数 `networkId`: 子网 ID

返回值说明：

- `deleted`: 是否删除成功，成功时为 `true`
- `id`: 被删除的子网 ID

### 6.3 站点管理页

文件：

- `frontend/src/pages/SitesPage.tsx`

当前功能：

- 站点列表
- 关键字搜索
- 新增站点
- 编辑站点
- 删除站点
- 在表格中查看站点所属子网

#### `GET /api/v1/sites`

用途：

- 站点主表格

参数说明：

- `page`: 页码
- `page_size`: 每页条数
- `keyword`: 名称、四字符码、DOMES 关键字，可选
- `four_char_id`: 四字符码过滤，可选
- `domes_number`: DOMES 过滤，可选
- `network_id`: 子网过滤，可选
- `site_status`: 站点状态过滤，可选

返回值说明：

- 分页结构 `PageResponse<Site>`
- `Site` 关键字段见 `6.1`

#### `POST /api/v1/sites`

用途：

- 创建本地站点

参数说明：

- `name`: 站点名称，可选
- `fourCharId`: 四字符码，可选
- `domesNumber`: DOMES 编号，可选
- `description`: 描述，可选
- `approximatePosition`: 近似坐标对象，可选
- `approximatePosition.latitude`: 纬度
- `approximatePosition.longitude`: 经度
- `approximatePosition.ellipsoidalHeight`: 大地高
- `dateInstalled`: 安装时间，可选
- `siteStatus`: 站点状态，可选
- `monument`: 站标信息对象，可选
- `monument.description`: 站标描述
- `monument.foundation`: 基础描述
- `monument.markerDescription`: 标记描述
- `monument.height`: 高度描述

返回值说明：

- 返回完整 `Site`
- 关键字段：
- `id`: 站点 ID
- `source_type`: 固定为 `local`
- `name`: 名称
- `four_char_id`: 四字符码
- `domes_number`: DOMES
- `latitude`: 纬度
- `longitude`: 经度
- `ellipsoidal_height`: 大地高
- `site_status`: 状态
- `networks`: 所属子网数组

#### `PATCH /api/v1/sites/{siteId}`

用途：

- 更新站点元数据

参数说明：

- 路径参数 `siteId`: 站点 ID
- 请求体字段均可选，字段与 `POST /api/v1/sites` 相同

返回值说明：

- 返回更新后的完整 `Site`

#### `DELETE /api/v1/sites/{siteId}`

用途：

- 删除站点

参数说明：

- 路径参数 `siteId`: 站点 ID

返回值说明：

- `deleted`: 是否删除成功
- `id`: 被删除站点 ID

### 6.4 观测数据页

文件：

- `frontend/src/pages/ObservationsPage.tsx`

当前功能：

- 查询远端 RINEX 文件
- 批量下载远端文件
- 查看本地文件
- 查看详情抽屉
- 重索引
- 删除本地文件

#### `GET /api/v1/rinex-files`

用途：

- 本地文件表格

参数说明：

- `page`: 页码
- `page_size`: 每页条数
- `site_id`: 站点 ID 过滤，可选
- `station_id`: 站点四字符码或站点标识过滤，可选
- `keyword`: 文件名关键字，可选
- `file_type`: 文件类型过滤，如 `obs`、`nav`
- `download_status`: 下载状态过滤，可选

返回值说明：

- 分页结构 `PageResponse<RinexFile>`
- `items[].id`: 文件 ID
- `items[].site_id`: 关联站点 ID
- `items[].station_id`: 站点标识
- `items[].source`: 来源
- `items[].remote_file_id`: 远端文件 ID
- `items[].remote_url`: 远端下载地址
- `items[].filename`: 文件名
- `items[].local_path`: 本地路径
- `items[].file_type`: 文件类型
- `items[].file_period`: 文件周期
- `items[].rinex_version`: RINEX 版本
- `items[].compression_type`: 压缩类型
- `items[].sample_interval_seconds`: 采样间隔秒数
- `items[].start_time`: 起始时间
- `items[].end_time`: 结束时间
- `items[].file_size`: 文件大小
- `items[].download_status`: 下载状态
- `items[].index_status`: 索引状态
- `items[].metadata_status`: 元数据状态
- `items[].constellations_json`: 星座列表
- `items[].observation_types_json`: 观测类型映射
- `items[].header_json`: 头部解析结果
- `items[].last_error`: 最后错误
- `items[].site_name`: 站点名称
- `items[].four_char_id`: 四字符码

#### `POST /api/v1/rinex-files/query-remote`

用途：

- 查询 GA 远端可下载文件

参数说明：

- `siteIds`: 本地站点 ID 数组，可选
- `stationIds`: 站点标识数组，可选
- `startDate`: 查询起始时间，必填
- `endDate`: 查询结束时间，必填
- `filePeriod`: 文件周期数组，默认 `["01D"]`
- `fileType`: 文件类型数组，默认 `["obs"]`
- `rinexVersion`: RINEX 版本数组，默认 `["2", "3", "4"]`
- `metadataStatus`: 元数据状态，默认 `valid`
- `decompress`: 是否下载前解压，默认 `true`

返回值说明：

- 返回数组 `RinexRemoteFile[]`
- 每个元素包括：
- `siteId`: 站点标识
- `fileType`: 文件类型
- `filePeriod`: 文件周期
- `startDate`: 起始时间
- `rinexVersion`: RINEX 版本
- `fileLocation`: 下载地址
- `metadataStatus`: 元数据状态
- `fileSize`: 文件大小
- `createdAt`: 创建时间
- `modifiedAt`: 修改时间
- `fileId`: 远端文件 ID
- `metadataErrors`: 元数据错误数组
- `filename`: 文件名

#### `POST /api/v1/rinex-files/download`

用途：

- 批量下载远端文件并写入本地库

参数说明：

- `items`: 待下载文件数组，必填
- `items[].stationId`: 站点标识
- `items[].remoteFileId`: 远端文件 ID
- `items[].remoteUrl`: 远端下载地址
- `items[].filename`: 文件名
- `items[].fileType`: 文件类型
- `items[].filePeriod`: 文件周期
- `items[].rinexVersion`: RINEX 版本
- `items[].metadataStatus`: 元数据状态
- `items[].startDate`: 起始时间，可选
- `items[].fileSize`: 文件大小，可选
- `overwrite`: 是否覆盖已存在文件，默认 `false`
- `autoIndex`: 下载后是否自动索引，默认 `true`

返回值说明：

- `items`: 下载结果数组
- `items[].id`: 本地文件 ID
- `items[].filename`: 文件名
- `items[].status`: 下载结果状态

#### `GET /api/v1/rinex-files/{rinexFileId}`

用途：

- 获取本地文件详情

参数说明：

- 路径参数 `rinexFileId`: 本地文件 ID

返回值说明：

- 返回单个 `RinexFile`
- 字段与 `GET /api/v1/rinex-files` 的单项结构一致

#### `GET /api/v1/rinex-files/{rinexFileId}/header`

用途：

- 获取文件头部解析结果

参数说明：

- 路径参数 `rinexFileId`: 本地文件 ID

返回值说明：

- `id`: 文件 ID
- `filename`: 文件名
- `header`: 头部解析结果对象，可为空

#### `GET /api/v1/rinex-files/{rinexFileId}/epochs`

用途：

- 获取历元概览信息

参数说明：

- 路径参数 `rinexFileId`: 本地文件 ID

返回值说明：

- `id`: 文件 ID
- `filename`: 文件名
- `start_time`: 起始时间
- `end_time`: 结束时间
- `sample_interval_seconds`: 采样间隔秒数
- `file_period`: 文件周期

#### `POST /api/v1/rinex-files/reindex`

用途：

- 重新索引一个或多个本地文件

参数说明：

- `ids`: 本地文件 ID 数组

返回值说明：

- `items`: 重索引结果数组
- `items[].id`: 文件 ID
- `items[].index_status`: 新索引状态
- `items[].filename`: 文件名

#### `DELETE /api/v1/rinex-files/{rinexFileId}`

用途：

- 删除本地文件及其索引记录

参数说明：

- 路径参数 `rinexFileId`: 本地文件 ID

返回值说明：

- `deleted`: 是否删除成功
- `id`: 被删除文件 ID

### 6.5 解算任务页

文件：

- `frontend/src/pages/SolveJobsPage.tsx`

当前实现范围仅覆盖 SPP。

#### `GET /api/v1/solve-jobs`

用途：

- 任务列表

参数说明：

- 无

返回值说明：

- 分页结构 `PageResponse<SolveJob>`
- 当前固定返回全部任务，`page` 为 `1`
- `items[].id`: 任务 ID
- `items[].job_type`: 任务类型，如 `spp`
- `items[].status`: 任务状态
- `items[].request_json`: 原始请求体
- `items[].solver_job_id`: solver 侧任务 ID
- `items[].started_at`: 开始时间
- `items[].finished_at`: 结束时间
- `items[].error_message`: 错误信息
- `items[].engine`: 使用的解算引擎
- `items[].summary`: 结果摘要对象

#### `POST /api/v1/solve-jobs/spp`

用途：

- 创建 SPP 任务

参数说明：

- `siteId`: 站点 ID，必填
- `observationFileId`: 本地观测文件 ID，必填
- `navigationFileIds`: 本地导航文件 ID 数组，至少一个
- `epochTime`: 解算时刻，必填
- `constellations`: 星座数组
- `elevationMaskDeg`: 截止高度角，默认 `10`
- `models`: 模型参数对象
- `models.ionosphere`: 电离层模型，当前使用 `broadcast`
- `models.troposphere`: 对流层模型，当前使用 `saastamoinen`
- `models.earthRotation`: 是否考虑地球自转
- `models.relativity`: 是否考虑相对论改正

返回值说明：

- 返回单个 `SolveJob`
- 关键字段：
- `id`: 任务 ID
- `status`: 任务状态，可能为 `succeeded` 或 `failed`
- `engine`: 引擎名
- `summary`: 摘要对象，可能包含 `stationId`、`nsatUsed`、`requestedEpochTime`、`solvedEpochTime`
- `error_message`: 失败时的错误信息

#### `POST /api/v1/solve-jobs/spp/precheck`

用途：

- 在提交 SPP 前做解算可用性预检

参数说明：

- 继承 `POST /api/v1/solve-jobs/spp` 的全部参数
- `searchWindowMinutes`: 搜索请求时刻附近候选历元的窗口分钟数，默认 `60`
- `maxCandidateEpochs`: 返回的候选历元数量上限，默认 `8`

返回值说明：

- `status`: 预检状态，可能为 `ready`、`risky`、`unavailable`
- `recommendation`: 建议文案
- `requestedEpochTime`: 请求时刻
- `searchWindowMinutes`: 搜索窗口
- `selectedConstellations`: 参与预检的星座
- `observationFileId`: 观测文件 ID
- `navigationFileIds`: 导航文件 ID 数组
- `availableNavSystems`: 导航文件中可用的星座列表
- `nearestCandidateEpochTime`: 最近候选历元，可为空
- `nearestCandidateOffsetSeconds`: 与请求时刻的偏差秒数，可为空
- `candidateEpochCount`: 候选历元数量
- `reasons`: 风险或失败原因数组
- `candidateEpochs`: 候选历元数组
- `candidateEpochs[].epochTime`: 候选历元时刻
- `candidateEpochs[].offsetSeconds`: 与请求时刻偏差秒数
- `candidateEpochs[].totalSatellites`: 总可用卫星数
- `candidateEpochs[].perSystemCounts`: 分系统卫星数
- `candidateEpochs[].satellites`: 卫星样本数组

#### `GET /api/v1/solve-jobs/{jobId}`

用途：

- 获取任务详情

参数说明：

- 路径参数 `jobId`: 任务 ID

返回值说明：

- 返回单个 `SolveJob`
- 字段与 `GET /api/v1/solve-jobs` 中单项结构一致

#### `GET /api/v1/solve-jobs/{jobId}/result`

用途：

- 获取任务结果摘要

参数说明：

- 路径参数 `jobId`: 任务 ID

返回值说明：

- `job_id`: 任务 ID
- `engine`: 引擎名
- `summary`: 结果摘要对象
- `quality`: 质量指标对象
- `summary` 常见字段：
- `mode`: 解算模式
- `stationId`: 站点标识
- `solutionStatus`: 解状态
- `requestedEpochTime`: 请求时刻
- `solvedEpochTime`: 实际解算时刻
- `requestedElevationMaskDeg`: 请求高度角
- `appliedElevationMaskDeg`: 实际高度角
- `nsatUsed`: 使用卫星数
- `observationFilename`: 观测文件名
- `attemptDiagnostics`: 失败诊断数组
- `quality` 常见字段：
- `pdop`
- `hdop`
- `vdop`
- `sigma0`

#### `GET /api/v1/solve-jobs/{jobId}/epochs`

用途：

- 获取历元结果列表

参数说明：

- 路径参数 `jobId`: 任务 ID

返回值说明：

- 返回数组 `SolutionEpoch[]`
- `id`: 历元记录 ID
- `job_id`: 任务 ID
- `epoch_time`: 历元时刻
- `site_role`: 站点角色
- `solution_status`: 解状态
- `x`, `y`, `z`: ECEF 坐标
- `latitude`, `longitude`, `height`: 大地坐标
- `pdop`, `hdop`, `vdop`: DOP 指标
- `nsat_used`: 使用卫星数
- `sigma0`: 单位权中误差
- `residual_summary_json`: 残差摘要

#### `GET /api/v1/solve-jobs/{jobId}/satellites`

用途：

- 获取卫星状态列表

参数说明：

- 路径参数 `jobId`: 任务 ID

返回值说明：

- 返回数组 `SatelliteState[]`
- `id`: 卫星状态记录 ID
- `job_id`: 任务 ID
- `epoch_time`: 历元时刻
- `satellite_system`: 星座
- `satellite_prn`: 卫星 PRN
- `elevation_deg`: 仰角
- `azimuth_deg`: 方位角
- `snr`: 信噪比
- `used_in_solution`: 是否参与解算
- `health_status`: 健康状态
- `cycle_slip_detected`: 是否检测到周跳
- `residual_code`: 码残差
- `residual_phase`: 相位残差

### 6.6 历史分析页

文件：

- `frontend/src/pages/AnalyticsPage.tsx`

当前功能：

- 展示站网统计
- 展示站点可用率
- 查看站点历元质量趋势
- 查看卫星历史状态

#### `GET /api/v1/analytics/network-overview`

用途：

- 顶部统计卡片

参数说明：

- 无

返回值说明：

- `totals.networks`: 子网总数
- `totals.sites`: 站点总数
- `totals.rinex_files`: 本地 RINEX 文件总数
- `solve_jobs`: 任务总数
- `recent_success_rate`: 最近成功率

#### `GET /api/v1/analytics/site-availability`

用途：

- 站点可用率与质量概览

参数说明：

- 无

返回值说明：

- 返回数组
- `site_id`: 站点 ID
- `four_char_id`: 四字符码
- `site_name`: 站点名称
- `site_status`: 站点状态
- `rinex_file_count`: 本地文件数
- `solve_job_count`: 解算任务数
- `solve_success_rate`: 解算成功率
- `has_local_data`: 是否已有本地数据

#### `GET /api/v1/analytics/site-epochs`

用途：

- 站点历元质量图和表

参数说明：

- `site_id`: 站点 ID，可选；不传时返回全部站点历史历元

返回值说明：

- 返回数组
- `job_id`: 任务 ID
- `epoch_time`: 历元时刻
- `solution_status`: 解状态
- `pdop`: PDOP
- `hdop`: HDOP
- `vdop`: VDOP
- `nsat_used`: 使用卫星数
- `sigma0`: 单位权中误差

#### `GET /api/v1/analytics/satellite-history`

用途：

- 卫星历史状态图和表

参数说明：

- `satellite_system`: 星座过滤，可选
- `satellite_prn`: PRN 过滤，可选

返回值说明：

- 返回数组
- `job_id`: 任务 ID
- `epoch_time`: 历元时刻
- `satellite_system`: 星座
- `satellite_prn`: PRN
- `elevation_deg`: 仰角
- `azimuth_deg`: 方位角
- `snr`: 信噪比
- `used_in_solution`: 是否参与解算
- `health_status`: 健康状态
- `cycle_slip_detected`: 是否周跳
- `residual_code`: 码残差
- `residual_phase`: 相位残差

### 6.7 系统状态页

文件：

- `frontend/src/pages/SystemPage.tsx`

当前功能：

- 查看初始化状态
- 重新检查初始化
- 查看系统健康状态
- 生成 NPI 同步预览
- 应用 NPI 刷新

#### `GET /api/v1/system/bootstrap-status`

用途：

- 初始化状态卡片

参数说明：

- 无

返回值说明：

- 字段说明见 `6.1`

#### `POST /api/v1/system/bootstrap`

用途：

- 手动重新触发初始化检查或导入

参数说明：

- `force`: 是否强制重新导入，默认 `false`

返回值说明：

- 返回初始化执行结果对象
- 具体字段由后台初始化服务生成
- 前端当前只依赖调用成功与否，并在成功后刷新状态、子网、站点数据

#### `GET /api/v1/system/health`

用途：

- 系统健康检查面板

参数说明：

- 无

返回值说明：

- 字段说明见 `6.1`

#### `POST /api/v1/system/sync/npi/preview`

用途：

- 生成本地数据与 NPI 远端数据的差异预览

参数说明：

- 无

返回值说明：

- `summary.remote_network_count`: 远端子网数
- `summary.remote_site_count`: 远端站点数
- `summary.added_networks`: 新增子网数
- `summary.updated_networks`: 更新子网数
- `summary.removed_networks`: 删除子网数
- `summary.added_sites`: 新增站点数
- `summary.updated_sites`: 更新站点数
- `summary.removed_sites`: 删除站点数
- `samples`: 差异样本对象
- `samples.added_networks`: 新增子网样本
- `samples.updated_networks`: 更新子网样本
- `samples.removed_networks`: 删除子网样本
- `samples.added_sites`: 新增站点样本
- `samples.updated_sites`: 更新站点样本
- `samples.removed_sites`: 删除站点样本

#### `POST /api/v1/system/sync/npi/apply`

用途：

- 应用 NPI 刷新结果到本地库

参数说明：

- `force`: 是否强制应用，默认 `true`

返回值说明：

- 返回同步执行结果对象
- 具体字段由后台同步服务生成
- 前端当前主要依赖调用成功后刷新初始化状态、子网和站点数据

## 7. 当前共享组件

当前前端已经沉淀出少量通用组件：

- `PageSection`
- `StatusTag`

## 8. 当前状态管理与数据流

### 8.1 服务端状态

当前统一使用 TanStack Query 处理：

- 数据请求
- 缓存
- 失效重取

### 8.2 本地页面状态

当前主要通过 React `useState` 和 Ant Design `Form` 维护：

- 当前选中任务
- 当前选中文件
- 远端查询结果
- 远端勾选结果
- 预检结果
- 各页面弹窗和抽屉开关

### 8.3 轻量筛选状态

当前项目保留了 `frontend/src/store.ts` 中的轻量筛选状态，用于：

- 子网关键字过滤
- 站点关键字过滤

## 9. 当前 API 封装方式

文件：

- `frontend/src/api.ts`
- `frontend/src/types.ts`

当前特点：

- 所有请求统一走 `/api/v1`
- 统一解析 `APIEnvelope`
- 在 `api.ts` 中按领域组织函数
- 在 `types.ts` 中维护前端类型

## 10. 后续前端扩展建议

基于当前实现，下一步建议按下面顺序扩展：

1. 为子网、站点、解算任务补独立详情路由
2. 把结果抽屉拆分为“概览 / 历元 / 卫星 / 诊断”页签
3. 在观测页增加本地文件筛选和分页参数联动
4. 为 SPP 结果增加图表视图
5. 在 solver 真实支持后再补 RTD / RTK 页面流
6. 条件成熟后加入地图能力
