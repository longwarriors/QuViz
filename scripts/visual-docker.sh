#!/usr/bin/env bash
# POSIX twin of scripts/visual-docker.ps1: run (check) or regenerate (update) the visual
# gate in the pinned Playwright image. Usage: bash scripts/visual-docker.sh [check|update] [--fresh]
# See the .ps1 header for why. tests/test_visual_docker.py pins that both wrappers use the
# same image, volume, entry script and engines source.
set -euo pipefail

IMAGE='mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e'
VOLUME='quviz-visual-node-modules'
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mode="${1:-check}"
fresh=0
if [ "${2:-}" = "--fresh" ]; then fresh=1; fi
case "$mode" in
  check|update) ;;
  *) echo "visual-docker: mode must be check or update, not '$mode'" >&2; exit 2 ;;
esac

command -v docker >/dev/null 2>&1 || { echo "visual-docker: docker is not on PATH" >&2; exit 1; }
docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 \
  || { echo "visual-docker: the Docker daemon is not running" >&2; exit 1; }

version_ge() {  # $1 >= $2, both X.Y.Z
  local a1 a2 a3 b1 b2 b3
  IFS=. read -r a1 a2 a3 <<<"$1"
  IFS=. read -r b1 b2 b3 <<<"$2"
  (( a1 > b1 || (a1 == b1 && (a2 > b2 || (a2 == b2 && a3 >= b3))) ))
}

satisfies() {  # $1 = vX.Y.Z, $2 = engines range of ^X.Y.Z / >=X.Y.Z clauses joined by ||
  local have="${1#v}" clause floor
  [[ "$have" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  IFS='|' read -ra clauses <<<"${2//||/|}"
  for clause in "${clauses[@]}"; do
    clause="${clause//[[:space:]]/}"
    [ -n "$clause" ] || continue
    case "$clause" in
      '^'*) floor="${clause#^}"; [ "${have%%.*}" = "${floor%%.*}" ] && version_ge "$have" "$floor" && return 0 ;;
      '>='*) floor="${clause#>=}"; version_ge "$have" "$floor" && return 0 ;;
      *) echo "visual-docker: unsupported engines clause '$clause'" >&2; exit 1 ;;
    esac
  done
  return 1
}

engines="$(sed -n 's/^[[:space:]]*"node":[[:space:]]*"\([^"]*\)".*/\1/p' "$repo_root/web/package.json" | head -n 1)"
node_version="$(docker run --rm "$IMAGE" node --version)"
if ! satisfies "$node_version" "$engines"; then
  echo "visual-docker: the image ships Node $node_version, which web/package.json engines '$engines' rejects" >&2
  exit 1
fi
echo "visual-docker: image Node $node_version satisfies engines '$engines'"

exec docker run --rm --init --ipc=host \
  -e CI=1 -e "QUVIZ_FRESH=$fresh" -e "HOST_UID=$(id -u)" -e "HOST_GID=$(id -g)" \
  -v "$repo_root:/work" -v "$VOLUME:/work/web/node_modules" -w /work \
  "$IMAGE" bash scripts/visual-docker-entry.sh "$mode"
