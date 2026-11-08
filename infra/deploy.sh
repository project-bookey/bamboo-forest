#!/usr/bin/env bash
set -euo pipefail
PACKAGE=${1:?archive required}
VERSION=${2:?release ID required}
[[ "$VERSION" =~ ^[a-zA-Z0-9-]+$ ]]
EXPECTED_REVISION=${3:-}
[[ -z "$EXPECTED_REVISION" || "$EXPECTED_REVISION" =~ ^[a-f0-9]{40}$ ]]
APP=/opt/bamboo-forest
exec 9>"$APP/deploy.lock"
flock -w 300 9
RELEASE="$APP/releases/$VERSION"
test ! -e "$RELEASE"
BACKUP=$(mktemp -d "$APP/deploy-backup.XXXXXX")
PREVIOUS=$(readlink -f "$APP/current")
cp -p /etc/nginx/conf.d/bookey-web.conf "$BACKUP/bookey-web.conf"
cp -p /etc/nginx/snippets/bamboo-forest.locations.conf "$BACKUP/locations.conf"
if [ -f /etc/systemd/system/bamboo-forest.service ]; then cp -p /etc/systemd/system/bamboo-forest.service "$BACKUP/service"; fi
rollback() {
  trap - ERR
  ln -sfn "$PREVIOUS" "$APP/current"
  cp -p "$BACKUP/bookey-web.conf" /etc/nginx/conf.d/bookey-web.conf
  cp -p "$BACKUP/locations.conf" /etc/nginx/snippets/bamboo-forest.locations.conf
  if [ -f "$BACKUP/service" ]; then
    cp -p "$BACKUP/service" /etc/systemd/system/bamboo-forest.service
    systemctl daemon-reload
    systemctl restart bamboo-forest
  else
    systemctl disable --now bamboo-forest || true
  fi
  nginx -t && systemctl reload nginx
  echo "Restored $PREVIOUS" >&2
}
trap rollback ERR
id bamboo-forest >/dev/null 2>&1 || useradd --system --no-create-home --shell /sbin/nologin bamboo-forest
test -x /opt/mandragora/node/bin/node
mkdir -p "$RELEASE"
tar -xzf "$PACKAGE" -C "$RELEASE"
chmod -R a+rX "$RELEASE"
(cd "$RELEASE" && /opt/mandragora/node/bin/node --input-type=module -e "await import('./server.mjs')")
ln -sfn "$RELEASE" "$APP/current"
install -m 644 "$RELEASE/infra/bamboo-forest.service" /etc/systemd/system/bamboo-forest.service
systemctl daemon-reload
systemctl enable --now bamboo-forest
systemctl restart bamboo-forest
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 http://127.0.0.1:3212/metro-chat/api/health
install -m 644 "$RELEASE/infra/bamboo-forest.locations.conf" /etc/nginx/snippets/bamboo-forest.locations.conf
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 1 --resolve www.bookey.site:443:127.0.0.1 https://www.bookey.site/metro-chat/api/health
if [ -n "$EXPECTED_REVISION" ]; then
  for URL in http://127.0.0.1:3212/metro-chat/api/health https://www.bookey.site/metro-chat/api/health; do
    curl --fail --silent --show-error --max-time 20 "$URL" | /opt/mandragora/node/bin/node --input-type=module -e '
      let body = ""; for await (const chunk of process.stdin) body += chunk;
      const health = JSON.parse(body);
      if (health.status !== "ok" || health.mode !== "live" || health.revision !== process.argv[1]) process.exit(1);
    ' "$EXPECTED_REVISION"
  done
fi
trap - ERR
printf '\nDeployed %s; backup %s\n' "$VERSION" "$BACKUP"
