#!/usr/bin/env bash
# Cài đặt VPS Ubuntu (22.04/24.04) mới tinh để chạy site truyện. Chạy 1 lần bằng root:
#   bash setup-vps.sh <git-repo-url> [domain]
# Ví dụ:
#   bash setup-vps.sh git@github.com:LiamNguyen-code/New_Story.git yourdomain.com
#   bash setup-vps.sh git@github.com:LiamNguyen-code/New_Story.git            # chưa có domain: chạy bằng IP
set -euo pipefail

REPO="${1:?Thiếu URL repo. Dùng: bash setup-vps.sh <git-repo-url> [domain]}"
DOMAIN="${2:-}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/story          # code
DATA_DIR=/var/lib/story     # database + ảnh upload (không bị ảnh hưởng khi cập nhật code)
APP_USER=story
PORT=4321

[ "$(id -u)" = 0 ] || { echo "Hãy chạy bằng root (sudo -i)."; exit 1; }
step() { echo -e "\n\033[1;34m==> $*\033[0m"; }

step "Cập nhật hệ thống + cài phần mềm"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y curl git nginx ufw fail2ban unattended-upgrades sqlite3 build-essential python3 ca-certificates
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "Node $(node -v), npm $(npm -v)"

step "Múi giờ Việt Nam + tự cài bản vá bảo mật"
timedatectl set-timezone Asia/Ho_Chi_Minh
dpkg-reconfigure -f noninteractive unattended-upgrades

step "Swap 2GB (để build không hết RAM trên droplet nhỏ)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Tường lửa: chỉ mở SSH, HTTP, HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

step "Tạo user '$APP_USER' chạy app + thư mục"
id "$APP_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR/uploads" /var/backups/story
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR" /var/backups/story

step "Lấy code từ $REPO"
if [[ "$REPO" == git@* ]]; then
  KEY=/home/$APP_USER/.ssh/id_ed25519
  if [ ! -f "$KEY" ]; then
    sudo -u "$APP_USER" mkdir -p "/home/$APP_USER/.ssh"
    sudo -u "$APP_USER" ssh-keygen -t ed25519 -N "" -f "$KEY" -C "story-vps" >/dev/null
  fi
  sudo -u "$APP_USER" ssh-keyscan -t ed25519 github.com >> "/home/$APP_USER/.ssh/known_hosts" 2>/dev/null
  echo
  echo "Thêm khoá dưới đây vào GitHub: repo → Settings → Deploy keys → Add deploy key (KHÔNG tick 'Allow write access'):"
  echo
  cat "$KEY.pub"
  echo
  read -rp "Thêm xong thì nhấn Enter để tiếp tục... " _
fi
if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

step "Biến môi trường (/etc/story.env)"
SITE_URL="http://$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
[ -n "$DOMAIN" ] && SITE_URL="https://$DOMAIN"
cat > /etc/story.env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=$PORT
DATA_DIR=$DATA_DIR
PUBLIC_SITE_URL=$SITE_URL
EOF
chmod 644 /etc/story.env

step "Cài thư viện + build"
sudo -u "$APP_USER" bash "$APP_DIR/deploy/deploy.sh" --no-pull --no-restart

step "Dịch vụ systemd (tự chạy lại khi lỗi / khởi động lại máy)"
cp "$APP_DIR/deploy/story.service" /etc/systemd/system/story.service
systemctl daemon-reload
systemctl enable --now story
# Cho user story khởi động lại app khi deploy mà không cần mật khẩu
echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart story" > /etc/sudoers.d/story
chmod 440 /etc/sudoers.d/story

step "Nginx"
SERVER_NAME="${DOMAIN:-_}"
[ -n "$DOMAIN" ] && SERVER_NAME="$DOMAIN www.$DOMAIN"
sed "s/__SERVER_NAME__/$SERVER_NAME/; s#__DATA_DIR__#$DATA_DIR#; s/__PORT__/$PORT/" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/story
ln -sf /etc/nginx/sites-available/story /etc/nginx/sites-enabled/story
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

step "Backup hằng ngày lúc 3:00 (giữ 14 bản trong /var/backups/story)"
cat > /etc/cron.d/story-backup <<EOF
0 3 * * * $APP_USER DATA_DIR=$DATA_DIR bash $APP_DIR/deploy/backup.sh >> /var/log/story-backup.log 2>&1
EOF
touch /var/log/story-backup.log && chown "$APP_USER" /var/log/story-backup.log

if [ -n "$DOMAIN" ]; then
  step "HTTPS (Let's Encrypt)"
  apt-get install -y certbot python3-certbot-nginx
  if certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d "$DOMAIN" -d "www.$DOMAIN"; then
    echo "Đã bật HTTPS."
  else
    echo "!! Chưa cấp được HTTPS: kiểm tra bản ghi DNS A của $DOMAIN và www.$DOMAIN đã trỏ về IP VPS chưa,"
    echo "   rồi chạy lại: certbot --nginx --redirect -d $DOMAIN -d www.$DOMAIN"
  fi
fi

echo -e "\n\033[1;32m✓ Xong! Site: $SITE_URL\033[0m"
cat <<EOF

Việc còn lại:
  1. Nhập dữ liệu truyện mẫu (nếu muốn):
       cd $APP_DIR && sudo -u $APP_USER bash -c 'set -a; . /etc/story.env; npm run db:import'
  2. Tạo tài khoản admin:
       cd $APP_DIR && sudo -u $APP_USER bash -c 'set -a; . /etc/story.env; npm run user:create -- email@cua-ban.com MatKhauManh123 "Tên"'
  3. Đăng nhập: $SITE_URL/admin/login/

Cập nhật code về sau: sudo -u $APP_USER bash $APP_DIR/deploy/deploy.sh
Xem log app:         journalctl -u story -f
EOF
