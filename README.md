# GNSS VRS CODEX

当前仓库已经完成第一阶段的可运行骨架，并在最近一轮迭代中把站点地图、详情抽屉、观测数据、SPP 结算和全局显示方案串成了更完整的操作闭环：

- `backend`
  - FastAPI 服务
  - SQLite 本地数据库
  - 启动时自动拉取 NPI 子网和站点元数据
  - 子网和站点 CRUD 接口
  - RINEX 远端查询、本地缓存、观测覆盖统计、SPP 任务编排
- `frontend`
  - React + Vite + Ant Design
  - 总览页、子网管理页、站点管理页、观测数据页、解算任务页、结果分析页、系统状态页
  - Leaflet + OpenStreetMap 站点地图
  - 全局明亮/深色主题和标准/玻璃显示方案切换
  - 子网详情、站点详情、站点内观测数据与 SPP 结算
- `solver`
  - 基于 `cpp-httplib` 的最小 C++ HTTP 服务骨架

当前还额外完成了第二、三阶段的最小闭环：

- RINEX 远端查询、本地下载和轻量索引
- SPP 解算任务创建、结果落库和前端展示
- 第四阶段的历史分析、质量指标和 NPI 同步预览/应用
- 第五阶段起步版真实 SPP：GPS 广播星历 + 单历元单点定位
- Stitch 设计稿驱动的前端视觉更新：统一字体、色彩、工具栏、卡片、表格、抽屉和地图样式

## 本地启动

推荐优先使用仓库内的 PowerShell 辅助脚本完成依赖检查、构建和启动：

```powershell
cd D:\WorkSpace\VRS_CODEX
.\docs\setup-runtime.ps1 -Action check
.\docs\setup-runtime.ps1 -Action start -BackendPort 18000 -SolverPort 18090 -FrontendPort 5173
```

停止服务：

```powershell
.\docs\setup-runtime.ps1 -Action stop
```

也可以按下面方式手动启动。

### 后台

```powershell
cd D:\WorkSpace\VRS_CODEX\backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18000
```

默认开发地址：`http://127.0.0.1:18000`

### 前端

```powershell
cd D:\WorkSpace\VRS_CODEX\frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

默认地址：`http://127.0.0.1:5173`

前端已通过 Vite 代理将 `/api` 转发到 `http://127.0.0.1:18000`。

### C++ 解算服务

```powershell
cd D:\WorkSpace\VRS_CODEX\solver
cmake -S . -B build
cmake --build build
```

默认端口可通过 `GNSS_SOLVER_PORT` 指定；当前本地联调使用 `18090`。

在当前机器上已额外验证过基于 Visual Studio 2022 的本地构建：

```powershell
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
```

启动 Release 版：

```powershell
$env:GNSS_SOLVER_PORT = "18090"
.\build-vs\Release\gnss_solver_service.exe
```

## 当前实现状态

已完成：

- NPI 数据首次导入和本地持久化
- 子网列表、新增、编辑、删除
- 站点列表、新增、编辑、删除
- 系统健康检查与初始化状态展示
- GA RINEX Web API 查询与本地缓存
- RINEX 头部、时间覆盖、采样率和星座轻量索引
- SPP 最小闭环：任务创建、任务列表、结果摘要、历元结果展示
- 历史分析页：站点可用率、历元质量趋势、卫星历史状态
- 系统页：NPI 同步预览与强制刷新
- solver 本机编译验证与健康检查联动
- solver 第一版真实 SPP：RINEX 3 观测文件解析、GPS 混合导航文件解析、广播星历卫星位置计算、单历元最小二乘解算
- solver 当前还支持基础质量控制与模型改正：最近可解历元搜索、截止高度角筛选、Klobuchar 电离层改正、Saastamoinen 对流层改正、简单残差剔除
- 前端 SPP 页面已支持导航文件选择
- 观测文件远端查询默认启用 `decompress=true`，便于下载 solver 可直接读取的明文文件
- 总览页：初始化进度提示、横向系统健康矩阵、最近任务列表、全局主题/显示方案入口
- 站点管理页：OpenStreetMap 全量站点分布图、按缩放比例聚合、视口裁剪渲染、点击地图图标打开站点详情
- 子网管理页：子网详情抽屉与子网站点列表
- 站点详情页：基本信息、子网信息、结算三个页签
- 站点详情页结算能力：远端 RINEX 查询、本地文件复用、SPP 预检、SPP 提交、结果摘要、历元结果、坐标误差分析
- 后台观测摘要：覆盖率、缺口、文件类型/周期统计、可用星座统计
- 后台远端 RINEX 错误转换：远端不可用时返回可读错误，不再只暴露 `internal server error`

## 前端显示方案

顶部工具栏提供全局显示方案图标：

- 太阳/月亮：明亮主题与深色主题
- 方框/布局：标准方案与玻璃方案

显示偏好保存在浏览器 `localStorage` 中，对所有页面生效。玻璃方案参考 `docs/stitch_.zip` 中 `login_modern` 设计稿的视觉方向，标准方案保持更稳定的管理后台密度。

## 关于当前 SPP 实现

当前已经不只是占位链路，但仍然属于“真实解算第一版”：

- 后台会优先调用 `solver` 服务的 `/solver/v1/solve/spp`
- 如果本机没有运行已编译的 C++ solver，后台会自动退回到 `mock-spp-fallback`
- 当前真实 solver 已支持：
  - 明文 RINEX 3 观测文件读取
  - GPS 广播星历导航文件读取
  - 单站单历元 SPP
- 当前限制：
  - 仅完成 GPS 第一版，BDS / GAL / GLO 还未接入真实求解
  - 目前优先支持通过 `decompress=true` 下载到本地的明文 RINEX 文件
  - 仍未完成电离层、对流层、载波相位、多历元滤波、RTD、RTK

下一阶段：

- 扩展 BDS / GAL / GLO 的真实广播星历解算
- 完善 SPP 模型改正和质量控制
- 实现 RTD / RTK 任务接口
- 增强结果分析图表和历史统计
- 为站点地图增加后端 bbox 查询或瓦片化聚合接口，进一步提升大规模站网浏览性能

## 设计文档

- `docs/gnss-system-design.md`：系统分层、数据模型、后台接口、solver 接口和近期实现更新
- `docs/frontend-web-design.md`：前端页面、组件、接口映射、全局显示方案、地图和详情页设计
