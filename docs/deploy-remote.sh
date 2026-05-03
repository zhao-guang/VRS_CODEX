#!/usr/bin/env bash
set -euo pipefail

HOST="132.226.8.108"
REMOTE_USER="opc"
SSH_PORT="2222"
IDENTITY_FILE="/mnt/d/oracle_opc.pem"
REMOTE_DIR="/home/opc/sourcecode/VRS"
APP_PORT="18000"
SOLVER_PORT="18090"
NODE_VERSION="v22.22.2"
SKIP_FRONTEND_BUILD="0"
SKIP_SOLVER_BUILD="0"
CLEAN_REMOTE_CODE="1"

usage() {
  cat <<'USAGE'
Usage:
  docs/deploy-remote.sh [options]

Options:
  -h, --host HOST              Remote host, default: 132.226.8.108
  -u, --user USER              SSH user, default: opc
  -p, --port PORT              SSH port, default: 2222
  -i, --identity FILE          SSH private key, default: /mnt/d/oracle_opc.pem
  -d, --remote-dir DIR         Remote deploy dir, default: /home/opc/sourcecode/VRS
      --app-port PORT          Web app port, default: 18000
      --solver-port PORT       Solver port, default: 18090
      --node-version VERSION   Local Node.js version, default: v22.22.2
      --skip-frontend-build    Reuse existing frontend/dist
      --skip-solver-build      Reuse existing remote solver/build-linux binary
      --no-clean-remote-code   Extract over existing code instead of cleaning source dirs
      --help                   Show this help

Examples:
  docs/deploy-remote.sh
  docs/deploy-remote.sh -i ~/.ssh/oracle_opc.pem -h 132.226.8.108
  docs/deploy-remote.sh -h 10.0.0.8 -u opc -p 2222 -i ~/.ssh/new-host.pem
USAGE
}

info() { echo -e "\033[36m[INFO]\033[0m $*"; }
ok() { echo -e "\033[32m[ OK ]\033[0m $*"; }
warn() { echo -e "\033[33m[WARN]\033[0m $*"; }
fail() { echo -e "\033[31m[FAIL]\033[0m $*" >&2; exit 1; }

require_cmd() {
  local name="$1"
  local hint="$2"
  command -v "$name" >/dev/null 2>&1 || fail "$name was not found. $hint"
}

step() {
  local name="$1"
  shift
  info "$name"
  "$@"
  ok "$name"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--host) HOST="$2"; shift 2 ;;
    -u|--user) REMOTE_USER="$2"; shift 2 ;;
    -p|--port) SSH_PORT="$2"; shift 2 ;;
    -i|--identity) IDENTITY_FILE="$2"; shift 2 ;;
    -d|--remote-dir) REMOTE_DIR="$2"; shift 2 ;;
    --app-port) APP_PORT="$2"; shift 2 ;;
    --solver-port) SOLVER_PORT="$2"; shift 2 ;;
    --node-version) NODE_VERSION="$2"; shift 2 ;;
    --skip-frontend-build) SKIP_FRONTEND_BUILD="1"; shift ;;
    --skip-solver-build) SKIP_SOLVER_BUILD="1"; shift ;;
    --no-clean-remote-code) CLEAN_REMOTE_CODE="0"; shift ;;
    --help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
TMP_DIR="$ROOT_DIR/.tmp"
TOOLS_DIR="$ROOT_DIR/.tools"
PACKAGE_PATH="$TMP_DIR/vrs-deploy.tgz"
REMOTE_INSTALLER="$TMP_DIR/vrs-remote-install.sh"
REMOTE_TARGET="$REMOTE_USER@$HOST"
REMOTE_PACKAGE="$REMOTE_DIR/.deploy/vrs-deploy.tgz"
REMOTE_INSTALLER_PATH="$REMOTE_DIR/.deploy/vrs-remote-install.sh"

SSH_ARGS=(
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
  -i "$IDENTITY_FILE"
  -p "$SSH_PORT"
)

SCP_ARGS=(
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
  -i "$IDENTITY_FILE"
  -P "$SSH_PORT"
)

remote_exec() {
  ssh "${SSH_ARGS[@]}" "$REMOTE_TARGET" "$@"
}

copy_to_remote() {
  local local_path="$1"
  local remote_path="$2"
  scp "${SCP_ARGS[@]}" "$local_path" "$REMOTE_TARGET:$remote_path"
}

ensure_local_node() {
  local node_dir="$TOOLS_DIR/node-$NODE_VERSION-linux-x64"
  local node_bin="$node_dir/bin/node"
  local npm_bin="$node_dir/bin/npm"
  local node_archive="$TOOLS_DIR/node-$NODE_VERSION-linux-x64.tar.xz"

  mkdir -p "$TOOLS_DIR"

  if [ ! -x "$node_bin" ]; then
    local url="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz"
    info "Downloading project-local Node.js from $url"
    curl -fL --retry 3 -o "$node_archive" "$url"
    tar -xJf "$node_archive" -C "$TOOLS_DIR"
  fi

  [ -x "$npm_bin" ] || fail "npm was not found under $node_dir"
  export PATH="$node_dir/bin:$PATH"
}

build_frontend() {
  if [ "$SKIP_FRONTEND_BUILD" = "1" ]; then
    warn "Skipping frontend build"
    [ -f "$FRONTEND_DIR/dist/index.html" ] || fail "frontend/dist/index.html does not exist. Remove --skip-frontend-build or build frontend first."
    return
  fi

  ensure_local_node
  (cd "$FRONTEND_DIR" && npm install && npm run build)
}

create_package() {
  mkdir -p "$TMP_DIR"
  rm -f "$PACKAGE_PATH"
  (
    cd "$ROOT_DIR"
    tar \
      --exclude=.git \
      --exclude=.venv \
      --exclude=.tools \
      --exclude=.tmp \
      --exclude='backend/data/*.db' \
      --exclude=backend/data/rinex \
      --exclude='backend/*.log' \
      --exclude=frontend/node_modules \
      --exclude=solver/build \
      --exclude=solver/build-vs \
      --exclude=solver/build-linux \
      -czf "$PACKAGE_PATH" \
      backend frontend solver README.md .gitignore
  )
  info "Package: $PACKAGE_PATH ($(du -h "$PACKAGE_PATH" | awk '{print $1}'))"
}

write_remote_installer() {
  cat > "$REMOTE_INSTALLER" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

REMOTE_DIR="$1"
APP_PORT="$2"
SOLVER_PORT="$3"
SKIP_SOLVER_BUILD="$4"
CLEAN_CODE="$5"

MINICONDA_URL="https://repo.anaconda.com/miniconda/Miniconda3-py311_23.5.2-0-Linux-x86_64.sh"
CONDA_DIR="$REMOTE_DIR/.runtime/miniconda"
PYTHON="$CONDA_DIR/bin/python"
CONDA="$CONDA_DIR/bin/conda"
RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"

info() { echo "[INFO] $*"; }
ok() { echo "[ OK ] $*"; }
fail() { echo "[FAIL] $*" >&2; exit 1; }

wait_http() {
  local name="$1"
  local url="$2"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "$url" >/tmp/gnss-vrs-health.json 2>/tmp/gnss-vrs-health.err; then
      ok "$name is reachable at $url"
      cat /tmp/gnss-vrs-health.json
      echo
      return 0
    fi
    sleep 1
  done

  cat /tmp/gnss-vrs-health.err >&2 || true
  fail "$name did not become reachable at $url"
}

mkdir -p "$REMOTE_DIR/.deploy" "$REMOTE_DIR/.runtime"
cd "$REMOTE_DIR"

if [ "$CLEAN_CODE" = "1" ]; then
  info "Cleaning previous source while preserving backend/data, .runtime and .deploy"
  preserve_dir=".deploy/preserve-$(date +%s)"
  mkdir -p "$preserve_dir"
  if [ -d backend/data ]; then
    mv backend/data "$preserve_dir/backend-data"
  fi
  rm -rf backend frontend solver README.md .gitignore
  tar -xzf .deploy/vrs-deploy.tgz -C "$REMOTE_DIR"
  if [ -d "$preserve_dir/backend-data" ]; then
    mkdir -p backend
    rm -rf backend/data
    mv "$preserve_dir/backend-data" backend/data
  fi
  rmdir "$preserve_dir" 2>/dev/null || true
else
  info "Extracting package without cleaning previous source"
  tar -xzf .deploy/vrs-deploy.tgz -C "$REMOTE_DIR"
fi

cat > backend/.env <<ENV
GNSS_SOLVER_BASE_URL=http://127.0.0.1:${SOLVER_PORT}/solver/v1
ENV

if [ ! -x "$PYTHON" ]; then
  info "Installing CentOS 7 compatible Miniconda runtime"
  rm -rf "$CONDA_DIR"
  curl -fL --retry 3 -o .deploy/miniconda-py311.sh "$MINICONDA_URL"
  bash .deploy/miniconda-py311.sh -b -p "$CONDA_DIR"
fi

info "Python runtime: $($PYTHON --version)"
info "Installing backend dependencies"
$PYTHON -m pip install --upgrade pip
$PYTHON -m pip install --only-binary=:all: "greenlet==3.1.1" || true
$PYTHON -m pip install -r backend/requirements.txt

if [ "$SKIP_SOLVER_BUILD" != "1" ]; then
  info "Installing private C++ toolchain and building solver"
  $CONDA install -y gxx_linux-64 cmake make
  "$CONDA_DIR/bin/cmake" \
    -S solver \
    -B solver/build-linux \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER="$CONDA_DIR/bin/x86_64-conda-linux-gnu-gcc" \
    -DCMAKE_CXX_COMPILER="$CONDA_DIR/bin/x86_64-conda-linux-gnu-g++"
  "$CONDA_DIR/bin/cmake" --build solver/build-linux --config Release -j2
else
  info "Skipping solver build"
fi

if [ ! -x solver/build-linux/gnss_solver_service ]; then
  fail "solver/build-linux/gnss_solver_service was not found. Re-run without --skip-solver-build."
fi

info "Installing systemd services"
sudo tee /etc/systemd/system/gnss-vrs-solver.service >/dev/null <<SERVICE
[Unit]
Description=GNSS VRS solver service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REMOTE_DIR
Environment=GNSS_SOLVER_PORT=$SOLVER_PORT
Environment=LD_LIBRARY_PATH=$CONDA_DIR/lib
ExecStart=$REMOTE_DIR/solver/build-linux/gnss_solver_service
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo tee /etc/systemd/system/gnss-vrs.service >/dev/null <<SERVICE
[Unit]
Description=GNSS VRS web application
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$REMOTE_DIR/backend
Environment=GNSS_SOLVER_BASE_URL=http://127.0.0.1:$SOLVER_PORT/solver/v1
ExecStart=$PYTHON -m uvicorn app.main:app --host 0.0.0.0 --port $APP_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable --now gnss-vrs-solver.service
sudo systemctl restart gnss-vrs-solver.service
wait_http "solver" "http://127.0.0.1:${SOLVER_PORT}/solver/v1/health"

sudo systemctl enable --now gnss-vrs.service
sudo systemctl restart gnss-vrs.service
wait_http "web app" "http://127.0.0.1:${APP_PORT}/api/v1/system/health"

ok "Deployment completed"
systemctl --no-pager --full status gnss-vrs.service | sed -n '1,12p'
systemctl --no-pager --full status gnss-vrs-solver.service | sed -n '1,12p'
REMOTE_SCRIPT
  chmod +x "$REMOTE_INSTALLER"
}

check_public_endpoint() {
  local health_url="http://$HOST:$APP_PORT/api/v1/system/health"
  if curl -fsS --max-time 20 "$health_url" >/tmp/gnss-vrs-public-health.json; then
    ok "Public health endpoint is reachable: $health_url"
    cat /tmp/gnss-vrs-public-health.json
    echo
  else
    warn "Deployment succeeded on the host, but public health check failed: $health_url"
    warn "Check cloud security group/firewall for TCP port $APP_PORT."
  fi
}

upload_files() {
  copy_to_remote "$PACKAGE_PATH" "$REMOTE_PACKAGE"
  copy_to_remote "$REMOTE_INSTALLER" "$REMOTE_INSTALLER_PATH"
}

main() {
  step "Checking local tools" require_cmd ssh "Install openssh-client."
  require_cmd scp "Install openssh-client."
  require_cmd tar "Install tar."
  require_cmd curl "Install curl."
  [ -f "$IDENTITY_FILE" ] || fail "SSH identity file was not found: $IDENTITY_FILE"

  step "Building frontend" build_frontend
  step "Creating deployment package" create_package
  step "Writing remote installer" write_remote_installer
  step "Preparing remote directory" remote_exec "mkdir -p '$REMOTE_DIR/.deploy'"
  step "Uploading package and installer" upload_files
  step "Running remote deployment" remote_exec "chmod +x '$REMOTE_INSTALLER_PATH' && '$REMOTE_INSTALLER_PATH' '$REMOTE_DIR' '$APP_PORT' '$SOLVER_PORT' '$SKIP_SOLVER_BUILD' '$CLEAN_REMOTE_CODE'"
  step "Checking public endpoint" check_public_endpoint
  ok "Done. Open http://$HOST:$APP_PORT/"
}

main
