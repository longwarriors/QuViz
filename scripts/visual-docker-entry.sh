#!/usr/bin/env bash
# Runs INSIDE mcr.microsoft.com/playwright (started by scripts/visual-docker.ps1 or
# scripts/visual-docker.sh) with the checkout at /work. Installs the locked web
# dependencies into the node_modules volume when package-lock.json changed, then runs
# the visual gate in the requested mode. Never run it on a host: it expects /work.
set -euo pipefail

mode="${1:-check}"
cd /work/web

lock_hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
marker="node_modules/.quviz-package-lock.sha256"
if [ "${QUVIZ_FRESH:-0}" = "1" ] || [ ! -f "$marker" ] || [ "$(cat "$marker")" != "$lock_hash" ]; then
  # npm ci empties node_modules' entries (not the mount point) and reinstalls the lockfile.
  npm ci --no-audit --no-fund
  printf '%s\n' "$lock_hash" > "$marker"
fi

status=0
case "$mode" in
  check)
    npm run test:visual || status=$?
    ;;
  update)
    { npm run test:visual:update && npm run test:visual; } || status=$?
    ;;
  *)
    echo "visual-docker-entry: unknown mode '$mode' (expected check or update)" >&2
    exit 2
    ;;
esac

# POSIX hosts pass their uid/gid so files written into the bind mount stay theirs.
if [ -n "${HOST_UID:-}" ] && [ -n "${HOST_GID:-}" ]; then
  for path in /work/web/dist /work/web/test-results /work/web/playwright-report /work/web/e2e/__screenshots__; do
    if [ -e "$path" ]; then chown -R "$HOST_UID:$HOST_GID" "$path"; fi
  done
fi
exit "$status"
