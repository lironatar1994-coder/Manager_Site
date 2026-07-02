#!/usr/bin/env bash

set -euo pipefail

APP_NAME="Manager_Site"
PM2_NAME="manager-site"
ROUTE_BASE="/Manager_Site"
LOWER_ROUTE_BASE="/manager_site"
REMOTE_DIR="/root/${APP_NAME}"
APP_PORT="3027"
NGINX_SITE="/etc/nginx/sites-available/vee-app.co.il.conf"
NGINX_SNIPPET="/etc/nginx/snippets/${APP_NAME}-locations.conf"
NODE_ENV_FILE="${REMOTE_DIR}/.env"

echo "[INFO] Starting ${APP_NAME} deployment..."

cd "${REMOTE_DIR}"

if [ ! -f "server.js" ] || [ ! -f "package.json" ]; then
  echo "[ERROR] server.js or package.json was not found in ${REMOTE_DIR}" >&2
  exit 1
fi

echo "[INFO] Pulling latest code..."
git fetch origin main
git reset --hard origin/main

echo "[INFO] Installing production dependencies..."
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

if node -e "require.resolve('playwright')" >/dev/null 2>&1; then
  echo "[INFO] Ensuring Playwright Chromium is installed..."
  npx playwright install --with-deps chromium
fi

mkdir -p "${REMOTE_DIR}/data"
chmod 700 "${REMOTE_DIR}/data"

if [ ! -f "${NODE_ENV_FILE}" ]; then
  echo "[INFO] Creating production environment file..."
  ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
  ADMIN_PASSWORD_HASH="$(node scripts/hash-password.js "${ADMIN_PASSWORD}")"
  cat > "${NODE_ENV_FILE}" <<EOF
NODE_ENV=production
PORT=${APP_PORT}
BASE_PATH=${ROUTE_BASE}
DATA_DIR=${REMOTE_DIR}/data
UPLOAD_ROOT=${REMOTE_DIR}/data/uploads
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH='${ADMIN_PASSWORD_HASH}'
EOF
  chmod 600 "${NODE_ENV_FILE}"
  cat > "${REMOTE_DIR}/data/initial-admin.txt" <<EOF
Initial Manager Site admin login
URL: https://vee-app.co.il${ROUTE_BASE}/login
username: admin
password: ${ADMIN_PASSWORD}
created: $(date -Iseconds)
EOF
  chmod 600 "${REMOTE_DIR}/data/initial-admin.txt"
  echo "[SECURITY] Initial admin password saved to ${REMOTE_DIR}/data/initial-admin.txt"
fi

if grep -q "^ADMIN_PASSWORD_HASH=scrypt\\$" "${NODE_ENV_FILE}"; then
  echo "[INFO] Repairing unquoted ADMIN_PASSWORD_HASH in ${NODE_ENV_FILE}..."
  HASH_VALUE="$(grep "^ADMIN_PASSWORD_HASH=" "${NODE_ENV_FILE}" | head -n1 | cut -d= -f2-)"
  python3 - "${NODE_ENV_FILE}" "${HASH_VALUE}" <<'PY'
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
hash_value = sys.argv[2]
lines = env_path.read_text().splitlines()
updated = []
for line in lines:
    if line.startswith("ADMIN_PASSWORD_HASH="):
        updated.append(f"ADMIN_PASSWORD_HASH='{hash_value}'")
    else:
        updated.append(line)
env_path.write_text("\n".join(updated) + "\n")
PY
  chmod 600 "${NODE_ENV_FILE}"
fi

echo "[INFO] Starting PM2 process..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

set -a
# shellcheck disable=SC1090
. "${NODE_ENV_FILE}"
set +a

pm2 start server.js --name "${PM2_NAME}" --update-env || pm2 restart "${PM2_NAME}" --update-env
pm2 save

echo "[INFO] Writing Nginx route snippet..."
cat > "${NGINX_SNIPPET}" <<EOF
location = ${ROUTE_BASE} {
    return 301 ${ROUTE_BASE}/;
}

location = ${LOWER_ROUTE_BASE} {
    return 301 ${ROUTE_BASE}/;
}

location ^~ ${LOWER_ROUTE_BASE}/ {
    rewrite ^${LOWER_ROUTE_BASE}(/.*)$ ${ROUTE_BASE}\$1 permanent;
}

location ^~ ${ROUTE_BASE}/ {
    proxy_pass http://127.0.0.1:${APP_PORT}${ROUTE_BASE}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
EOF

if ! grep -q "include ${NGINX_SNIPPET};" "${NGINX_SITE}"; then
  echo "[INFO] Registering route snippet in ${NGINX_SITE}..."
  cp "${NGINX_SITE}" "${NGINX_SITE}.bak.$(date +%Y%m%d%H%M%S)"
  sed -i "/server_name vee-app.co.il www.vee-app.co.il;/a\\    include ${NGINX_SNIPPET};" "${NGINX_SITE}"
fi

echo "[INFO] Testing Nginx configuration..."
nginx -t

echo "[INFO] Reloading Nginx..."
systemctl reload nginx

echo "[INFO] Verifying local app..."
for attempt in {1..15}; do
  if curl -fsS "http://127.0.0.1:${APP_PORT}${ROUTE_BASE}/login" >/dev/null; then
    break
  fi
  if [ "${attempt}" -eq 15 ]; then
    echo "[ERROR] Local app health check failed after ${attempt} attempts" >&2
    exit 1
  fi
  sleep 1
done

echo "[SUCCESS] ${APP_NAME} deployment complete: https://vee-app.co.il${ROUTE_BASE}/login"
