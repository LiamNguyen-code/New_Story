#!/usr/bin/env bash
# Cập nhật site lên bản code mới nhất. Chạy trên VPS bằng user story:
#   sudo -u story bash /opt/story/deploy/deploy.sh
# Database + ảnh nằm ở DATA_DIR (/var/lib/story) nên không bị ảnh hưởng.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
. /etc/story.env
set +a

if [[ " $* " != *" --no-pull "* ]]; then
  git pull --ff-only
fi
# --include=dev: cần tsx cho lệnh user:create / db:import (NODE_ENV=production sẽ bỏ qua gói dev).
# --ignore-scripts: tránh lỗi thứ tự cài của npm với các bản esbuild lồng nhau; chỉ better-sqlite3 cần script cài.
npm ci --no-audit --no-fund --include=dev --ignore-scripts
npm rebuild better-sqlite3
npm run build
if [[ " $* " != *" --no-restart "* ]]; then
  sudo /usr/bin/systemctl restart story
  echo "✓ Đã cập nhật và khởi động lại site."
fi
