#!/usr/bin/env bash
# SybilScan VPS setup script for Ubuntu
# Sets up the API service with systemd and nginx reverse proxy
# Usage: sudo bash vps_setup.sh

set -euo pipefail

APP_DIR="/opt/sybilscan"
SERVICE_USER="sybilscan"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Installing system dependencies"
apt-get update -y
apt-get install -y python3 python3-pip python3-venv nginx

echo "==> Creating service user"
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "==> Setting up application directory"
mkdir -p "$APP_DIR"
cp -r "$REPO_DIR/api/." "$APP_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

echo "==> Creating virtual environment and installing dependencies"
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"

echo "==> Writing systemd service file"
cat > /etc/systemd/system/sybilscan.service <<EOF
[Unit]
Description=SybilScan API (uvicorn)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
Environment="PYTHONPATH=${APP_DIR}"
ExecStart=${APP_DIR}/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "==> Enabling and starting sybilscan service"
systemctl daemon-reload
systemctl enable sybilscan
systemctl restart sybilscan

echo "==> Writing nginx reverse proxy config"
cat > /etc/nginx/sites-available/sybilscan <<EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sf /etc/nginx/sites-available/sybilscan /etc/nginx/sites-enabled/sybilscan
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo ""
echo "==> Done. SybilScan API is running at http://0.0.0.0:80"
echo "    Check status: systemctl status sybilscan"
echo "    View logs:    journalctl -u sybilscan -f"
