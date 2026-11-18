#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== 启动 CodeLife —— 会自我编程的数字生命 ==="

if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  echo "[1/4] 安装后端依赖..."
  (cd "$ROOT_DIR/backend" && npm install)
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "[2/4] 安装前端依赖..."
  (cd "$ROOT_DIR/frontend" && npm install)
fi

echo "[3/4] 启动后端世界引擎 (http://localhost:8788)..."
(cd "$ROOT_DIR/backend" && node src/server.js) &
BACKEND_PID=$!

cleanup() {
  echo ""
  echo "正在优雅关闭 CodeLife 服务..."
  kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 2

echo "[4/4] 启动前端交互观测台 (http://localhost:5188)..."
cd "$ROOT_DIR/frontend"
npx vite --port 5188
