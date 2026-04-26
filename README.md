# GNSS VRS CODEX

当前仓库已经完成第一阶段的可运行骨架：

- `backend`
  - FastAPI 服务
  - SQLite 本地数据库
  - 启动时自动拉取 NPI 子网和站点元数据
  - 子网和站点 CRUD 接口
- `frontend`
  - React + Vite + Ant Design
  - 总览页
  - 子网管理页
  - 站点管理页
  - 系统状态页
- `solver`
  - 基于 `cpp-httplib` 的最小 C++ HTTP 服务骨架

当前还额外完成了第二、三阶段的最小闭环：

- RINEX 远端查询、本地下载和轻量索引
- SPP 解算任务创建、结果落库和前端展示
- 第四阶段的历史分析、质量指标和 NPI 同步预览/应用
- 第五阶段起步版真实 SPP：GPS 广播星历 + 单历元单点定位

## 本地启动

### 后台

```powershell
cd D:\SourceCode\VRS_CODEX\backend
uvicorn app.main:app --reload
```

默认地址：`http://127.0.0.1:8000`

### 前端

```powershell
cd D:\SourceCode\VRS_CODEX\frontend
npm install
npm run dev
```

默认地址：`http://127.0.0.1:5173`

前端已通过 Vite 代理将 `/api` 转发到后台。

### C++ 解算服务

```powershell
cd D:\SourceCode\VRS_CODEX\solver
cmake -S . -B build
cmake --build build
```

默认端口：`8090`

在当前机器上已额外验证过基于 Visual Studio 2022 的本地构建：

```powershell
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release
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
