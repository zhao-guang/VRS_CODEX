# 远端一键部署说明

本文档记录 GNSS VRS 程序部署到 Linux 云主机的流程。配套脚本是：

```bash
docs/deploy-remote.sh
```

当前默认目标：

- 主机：`132.226.8.108`
- SSH 用户：`opc`
- SSH 端口：`2222`
- 代码目录：`/home/opc/sourcecode/VRS`
- Web 服务端口：`18000`
- Solver 服务端口：`18090`
- 默认 SSH key：`/mnt/d/oracle_opc.pem`

> 如果在 WSL 中运行，Windows 的 `d:\oracle_opc.pem` 通常对应 `/mnt/d/oracle_opc.pem`。

## 一键部署

在项目根目录执行：

```bash
chmod +x docs/deploy-remote.sh
docs/deploy-remote.sh
```

如果 SSH key 不在默认位置：

```bash
docs/deploy-remote.sh -i ~/.ssh/oracle_opc.pem
```

脚本会自动完成：

1. 本地安装项目私有 Node.js。
2. 本地执行 `frontend` 的 `npm install` 和 `npm run build`。
3. 打包 `backend`、`frontend`、`solver` 和必要根文件。
4. 上传到远端 `/home/opc/sourcecode/VRS/.deploy/vrs-deploy.tgz`。
5. 远端安装兼容 CentOS 7 的 Miniconda Python 3.11 运行时。
6. 远端安装后端 Python 依赖。
7. 远端用 Conda 私有 C++ 工具链构建 solver。
8. 创建并启动 systemd 服务。
9. 验证本机和公网健康接口。

## 更新现有主机

程序改完后，重新运行同一个命令即可：

```bash
docs/deploy-remote.sh
```

默认会清理远端旧代码目录中的 `backend`、`frontend`、`solver`，再解压新包，但会保留：

- `backend/data`
- `.runtime`
- `.deploy`

因此 SQLite 数据库、RINEX 缓存和已安装运行时不会被覆盖。

如果只想覆盖解包，不想清理旧源码：

```bash
docs/deploy-remote.sh --no-clean-remote-code
```

如果只更新后端/前端，不想重新编译 solver：

```bash
docs/deploy-remote.sh --skip-solver-build
```

如果已经提前构建好 `frontend/dist`，不想重新执行前端构建：

```bash
docs/deploy-remote.sh --skip-frontend-build
```

## 更换主机

新主机需要满足：

- 能通过 SSH 登录。
- 登录用户可以 `sudo systemctl ...`，最好是免密 sudo。
- 能访问外网下载 Miniconda、PyPI、Conda 包和 CMake FetchContent 依赖。
- 云安全组或防火墙放行 Web 端口，默认 `18000/tcp`。

示例：

```bash
docs/deploy-remote.sh \
  -h 10.0.0.8 \
  -u opc \
  -p 2222 \
  -i ~/.ssh/new-host.pem \
  -d /home/opc/sourcecode/VRS
```

如果需要换 Web 端口：

```bash
docs/deploy-remote.sh --app-port 18080
```

## 服务管理

远端部署完成后会有两个 systemd 服务：

```bash
sudo systemctl status gnss-vrs.service
sudo systemctl status gnss-vrs-solver.service
```

重启：

```bash
sudo systemctl restart gnss-vrs-solver.service
sudo systemctl restart gnss-vrs.service
```

查看日志：

```bash
journalctl -u gnss-vrs.service -n 100 --no-pager
journalctl -u gnss-vrs-solver.service -n 100 --no-pager
```

验证接口：

```bash
curl http://127.0.0.1:18000/api/v1/system/health
curl http://127.0.0.1:18090/solver/v1/health
```

公网访问：

```text
http://132.226.8.108:18000/
```

## 目录结构

远端目录：

```text
/home/opc/sourcecode/VRS
├── backend
├── frontend
├── solver
├── .deploy
└── .runtime
```

重要文件：

- `backend/.env`：由部署脚本写入 `GNSS_SOLVER_BASE_URL`。
- `backend/data/gnss_vrs.db`：SQLite 数据库。
- `frontend/dist`：前端生产构建产物。
- `solver/build-linux/gnss_solver_service`：Linux solver 可执行文件。
- `.runtime/miniconda`：项目私有 Python/Conda/C++ 工具链。

## 常见问题

### 公网访问失败，但远端健康检查成功

通常是云安全组或主机防火墙没有放行端口。检查 `18000/tcp` 是否开放。

### Miniconda latest 不能安装

CentOS 7 的 glibc 是 `2.17`，新版 Miniconda 要求更高 glibc。脚本固定使用：

```text
Miniconda3-py311_23.5.2-0-Linux-x86_64.sh
```

这是为了兼容 CentOS 7。

### greenlet 编译失败

CentOS 7 可能没有系统 g++。脚本会先安装 `greenlet==3.1.1` 的预编译 wheel，避免走源码编译。

### solver 构建很慢

首次构建会下载 Conda C++ 工具链和 CMake 依赖，时间会比较长。后续可以用：

```bash
docs/deploy-remote.sh --skip-solver-build
```

### SSH key 权限报错

Linux/WSL 下私钥权限通常需要收紧：

```bash
chmod 600 /mnt/d/oracle_opc.pem
```
