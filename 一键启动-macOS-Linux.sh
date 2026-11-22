#!/usr/bin/env bash
# 评点 PINGDIAN · 本地一键启动（macOS / Linux）
# 用法：双击，或在终端执行 ./一键启动-macOS-Linux.sh

set -euo pipefail
cd "$(dirname "$0")"

echo
echo "  评点 PINGDIAN"
echo "  把批注钉在原文上。钉不住的，它自己删掉。"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  [!] 没有检测到 Node.js。"
  echo "      请先安装 Node.js 20 或以上版本：https://nodejs.org"
  exit 1
fi
echo "  Node.js $(node -v)"

if [ ! -d node_modules ]; then
  echo
  echo "  第一次运行，正在安装依赖，大约 2-3 分钟..."
  echo
  npm install --no-audit --no-fund
fi

if [ ! -f .next/BUILD_ID ]; then
  echo
  echo "  正在构建，大约 1-2 分钟..."
  echo
  npm run build
fi

echo
echo "  =========================================="
echo "   启动中：http://localhost:3000"
echo
echo "   没有 API 密钥也能用——所有 AI 功能会显示"
echo "   标注清楚的「演」演示结果。想用真实调用，"
echo "   打开站点后到「设置」里填自己的 DeepSeek 密钥。"
echo
echo "   按 Ctrl-C 停止。"
echo "  =========================================="
echo

( sleep 3
  if command -v open >/dev/null 2>&1; then open http://localhost:3000
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000
  fi ) &

exec npm start
