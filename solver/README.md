# GNSS Solver Service

最小 C++ 解算服务骨架，基于 `cpp-httplib`。

当前已提供：

- `GET /health`
- `GET /solver/v1/health`
- `GET /solver/v1/capabilities`
- `POST /solver/v1/solve/spp`
- `POST /solver/v1/solve/differential`

当前 `solve/spp` 会返回与后台第三阶段兼容的最小结果结构：

- `jobId`
- `status`
- `engine`
- `summary`
- `quality`
- `epochs`

后续将在这个骨架上继续接入：

- RINEX/CRX/gz 解析
- 广播星历解析
- SPP
- RTD
- RTK
