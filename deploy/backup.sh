#!/usr/bin/env bash
# Backup database + ảnh upload vào /var/backups/story, giữ 14 bản gần nhất. Cron chạy lúc 3:00 mỗi ngày.
# Nên tải định kỳ các file này về máy hoặc lên nơi khác (VPS hỏng là mất cả backup).
set -euo pipefail
DATA_DIR="${DATA_DIR:-/var/lib/story}"
OUT=/var/backups/story
STAMP=$(date +%Y%m%d-%H%M)
TMP=$(mktemp -d)

# .backup an toàn khi site đang chạy (không copy file .db trực tiếp)
sqlite3 "$DATA_DIR/app.db" ".backup '$TMP/app.db'"
tar -czf "$OUT/story-$STAMP.tar.gz" -C "$TMP" app.db -C "$DATA_DIR" uploads
rm -rf "$TMP"

ls -1t "$OUT"/story-*.tar.gz | tail -n +15 | xargs -r rm -f
echo "$(date '+%F %T') ✓ $OUT/story-$STAMP.tar.gz"
