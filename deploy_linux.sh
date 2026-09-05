#!/usr/bin/env bash

set -Eeuo pipefail

# Load the entire function before switching revisions, so updating this file
# during a direct invocation cannot change the script currently being executed.
main() {
umask 077

APP_NAME="Manager_Site"
PM2_NAME="manager-site"
ROUTE_BASE="/Manager_Site"
LOWER_ROUTE_BASE="/manager_site"
REMOTE_DIR="/root/${APP_NAME}"
BRANCH="main"
REVISION=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --ref|--branch|--dir)
      [ "$#" -ge 2 ] || { echo "[ERROR] Missing value for $1" >&2; exit 2; }
      case "$1" in --ref) REVISION="$2";; --branch) BRANCH="$2";; --dir) REMOTE_DIR="$2";; esac
      shift 2;;
    --help)
      echo 'Usage: bash deploy_linux.sh [--ref FULL_COMMIT_SHA] [--branch main] [--dir /root/Manager_Site]'
      exit 0;;
    *) echo "[ERROR] Unknown argument: $1" >&2; exit 2;;
  esac
done
[[ "$REMOTE_DIR" =~ ^/[A-Za-z0-9_/-]+$ && "$REMOTE_DIR" != / && "$REMOTE_DIR" != *//* ]] || { echo '[ERROR] Invalid app directory' >&2; exit 2; }
[[ -z "$REVISION" || "$REVISION" =~ ^[0-9a-f]{40}$ ]] || { echo '[ERROR] --ref must be a full commit SHA' >&2; exit 2; }
APP_PORT="3027"
NGINX_SITE="/etc/nginx/sites-available/vee-app.co.il.conf"
NGINX_SNIPPET="/etc/nginx/snippets/${APP_NAME}-locations.conf"
NODE_ENV_FILE="${REMOTE_DIR}/.env"
ANALYTICS_KEY_FILE="/root/.manager-site-analytics-key"
MONITOR_ANALYTICS_ENDPOINT="http://127.0.0.1:4010/serve-monitor/api/visitor-analytics/manager-site"
PUBLIC_URL="https://vee-app.co.il"
PREVIOUS_REV=""
DEPLOY_STAGE="preflight"
on_deploy_error() {
  local result="$?"
  trap - ERR
  echo "[ERROR] Deployment failed during: ${DEPLOY_STAGE}. Exit ${result}." >&2
  if [ -n "$PREVIOUS_REV" ]; then
    echo "[RECOVERY] Previous commit: ${PREVIOUS_REV}. Runtime data has not been reset." >&2
    echo "[RECOVERY] Use a saved copy of this script with --ref ${PREVIOUS_REV} to redeploy it." >&2
  fi
  exit "$result"
}
trap on_deploy_error ERR

for command in git node npm curl nginx systemctl flock openssl python3; do
  command -v "$command" >/dev/null || { echo "[ERROR] Required command missing: $command" >&2; exit 1; }
done
git check-ref-format --branch "$BRANCH" >/dev/null
node -e 'if(Number(process.versions.node.split(".")[0]) < 20) process.exit(1)'
exec 9>/run/lock/manager-site-deploy.lock
flock -n 9 || { echo '[ERROR] Another Manager Site deployment is running.' >&2; exit 1; }
nginx -t

echo "[INFO] Starting ${APP_NAME} deployment..."

cd "${REMOTE_DIR}"
git diff --quiet && git diff --cached --quiet || { echo '[ERROR] Production has modified tracked files. Preserve them before deploying.' >&2; exit 1; }
PREVIOUS_REV="$(git rev-parse HEAD)"

if [ ! -f "server.js" ] || [ ! -f "package.json" ]; then
  echo "[ERROR] server.js or package.json was not found in ${REMOTE_DIR}" >&2
  exit 1
fi

echo "[INFO] Pulling latest code..."
DEPLOY_STAGE="fetch and checkout"
git fetch origin "$BRANCH"
TARGET_REV="$(git rev-parse --verify "${REVISION:-origin/$BRANCH}^{commit}")"
git merge-base --is-ancestor "$TARGET_REV" "origin/$BRANCH" || { echo '[ERROR] Requested commit is not in the selected origin branch.' >&2; exit 1; }
if [ -n "$(git ls-tree -r --name-only "$TARGET_REV" -- .env data)" ]; then
  echo '[ERROR] Target commit contains runtime data or .env; refusing checkout.' >&2
  exit 1
fi
BACKUP_ROOT="/root/.manager-site-deployments"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
BACKUP_DIR="$(mktemp -d "${BACKUP_ROOT}/$(date +%Y%m%d-%H%M%S).XXXXXX")"
printf '%s\n' "$PREVIOUS_REV" > "${BACKUP_DIR}/previous-ref.txt"
printf '%s\n' "$TARGET_REV" > "${BACKUP_DIR}/target-ref.txt"
declare -f main > "${BACKUP_DIR}/deploy-recovery.sh"
printf '\nset -Eeuo pipefail\nmain "$@"\n' >> "${BACKUP_DIR}/deploy-recovery.sh"
for config in "$NODE_ENV_FILE" "$NGINX_SITE" "$NGINX_SNIPPET"; do
  if [ -f "$config" ]; then cp -p -- "$config" "${BACKUP_DIR}/$(basename "$config")"; fi
done
echo "[INFO] Configuration and recovery script saved in ${BACKUP_DIR}"
# Checkout refuses untracked collisions; no git clean and no directory deletion.
git checkout --detach "$TARGET_REV"

echo "[INFO] Installing production dependencies..."
DEPLOY_STAGE="dependencies and validation"
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi
npm run check
if node -e 'process.exit(require("./package.json").scripts["test:links"] ? 0 : 1)'; then
  npm run test:links
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

if ! grep -q "^ERROR_ALERT_EMAIL=" "${NODE_ENV_FILE}"; then
  echo "ERROR_ALERT_EMAIL=lironatar94@gmail.com" >> "${NODE_ENV_FILE}"
fi

if ! grep -q "^RESEND_API_KEY=" "${NODE_ENV_FILE}" && [ -f "/root/Vee/backend/.env" ]; then
  RESEND_KEY="$(grep '^RESEND_API_KEY=' /root/Vee/backend/.env | head -n1 | cut -d= -f2-)"
  if [ -n "${RESEND_KEY}" ]; then
    printf 'RESEND_API_KEY=%s\n' "${RESEND_KEY}" >> "${NODE_ENV_FILE}"
  fi
fi

chmod 600 "${NODE_ENV_FILE}"

if [ ! -s "${ANALYTICS_KEY_FILE}" ]; then
  echo "[INFO] Creating the shared visitor analytics service key..."
  umask 077
  openssl rand -hex 32 > "${ANALYTICS_KEY_FILE}"
fi
chmod 600 "${ANALYTICS_KEY_FILE}"

echo "[INFO] Starting PM2 process..."
DEPLOY_STAGE="PM2 restart"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

set -a
# shellcheck disable=SC1090
. "${NODE_ENV_FILE}"
set +a
export MONITOR_ANALYTICS_URL="${MONITOR_ANALYTICS_ENDPOINT}"
export MONITOR_ANALYTICS_KEY_FILE="${ANALYTICS_KEY_FILE}"
unset MONITOR_ANALYTICS_KEY

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start server.js --name "$PM2_NAME" --update-env
fi
pm2 save

echo "[INFO] Writing Nginx route snippet..."
DEPLOY_STAGE="Nginx configuration"
mkdir -p "$(dirname "$NGINX_SNIPPET")"
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
    # Allow multipart overhead through; the app enforces the 16 MB file limit.
    client_max_body_size 17m;

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
  grep -q 'server_name vee-app.co.il www.vee-app.co.il;' "$NGINX_SITE" || { echo '[ERROR] Expected Nginx server block not found.' >&2; exit 1; }
  sed -i "/server_name vee-app.co.il www.vee-app.co.il;/a\\    include ${NGINX_SNIPPET};" "${NGINX_SITE}"
fi

echo "[INFO] Testing Nginx configuration..."
if ! nginx -t; then
  cp -p -- "${BACKUP_DIR}/$(basename "$NGINX_SITE")" "$NGINX_SITE"
  if [ -f "${BACKUP_DIR}/$(basename "$NGINX_SNIPPET")" ]; then
    cp -p -- "${BACKUP_DIR}/$(basename "$NGINX_SNIPPET")" "$NGINX_SNIPPET"
  else
    rm -f -- "$NGINX_SNIPPET"
  fi
  echo '[ERROR] Invalid Nginx changes were restored from the configuration backup.' >&2
  exit 1
fi

echo "[INFO] Reloading Nginx..."
systemctl reload nginx

echo "[INFO] Verifying local app..."
DEPLOY_STAGE="HTTP health checks"
for attempt in {1..15}; do
  if [ "$(curl --connect-timeout 2 --max-time 5 -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}${ROUTE_BASE}/login" || true)" = 200 ]; then
    break
  fi
  if [ "${attempt}" -eq 15 ]; then
    echo "[ERROR] Local app health check failed after ${attempt} attempts" >&2
    exit 1
  fi
  sleep 1
done

for asset in app.js boot.js styles.css links.js links.css interface.js interface.css; do
  # Old revisions can be deployed for recovery without the new interface files.
  if [ -f "public/$asset" ]; then
    [ "$(curl --connect-timeout 3 --max-time 10 -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}${ROUTE_BASE}/$asset")" = 200 ]
  fi
done
[ "$(curl --connect-timeout 5 --max-time 20 -s -o /dev/null -w '%{http_code}' "${PUBLIC_URL}${ROUTE_BASE}/login")" = 200 ]
[ "$(curl --connect-timeout 5 --max-time 20 -s -o /dev/null -w '%{http_code}' "${PUBLIC_URL}${LOWER_ROUTE_BASE}/login")" = 301 ]
printf '%s\n' "$TARGET_REV" > "${BACKUP_ROOT}/last-successful-ref.txt"

echo "[SUCCESS] ${APP_NAME} deployment complete: https://vee-app.co.il${ROUTE_BASE}/login"
echo "[SUCCESS] Revision: ${TARGET_REV}"
}

main "$@"
