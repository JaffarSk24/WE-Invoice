#!/usr/bin/env bash
# Rolls the gateway back to the previous release.
#   Variant A (Docker): rollback.sh docker
#     deploy tags the running image we-invoice-gateway:previous before a
#     rebuild; rollback starts that image again.
#   Variant B (systemd): rollback.sh systemd
#     /opt/we-invoice/current and /opt/we-invoice/previous are symlinks to
#     release checkouts; rollback swaps them and restarts the service.
set -euo pipefail

MODE="${1:-docker}"

if [ "$MODE" = "docker" ]; then
  cd "$(dirname "$0")/.."
  if ! docker image inspect we-invoice-gateway:previous >/dev/null 2>&1; then
    echo "no previous image tagged we-invoice-gateway:previous" >&2
    exit 1
  fi
  docker tag we-invoice-gateway:local we-invoice-gateway:broken || true
  docker tag we-invoice-gateway:previous we-invoice-gateway:local
  docker compose up -d --no-build
  sleep 3
  curl -fsS http://127.0.0.1:8787/v1/health && echo && echo "rolled back to the previous image"
elif [ "$MODE" = "systemd" ]; then
  ROOT="${ROOT:-/opt/we-invoice}"
  if [ ! -L "$ROOT/previous" ]; then
    echo "no previous release at $ROOT/previous" >&2
    exit 1
  fi
  CURRENT="$(readlink -f "$ROOT/current")"
  PREVIOUS="$(readlink -f "$ROOT/previous")"
  ln -sfn "$PREVIOUS" "$ROOT/current"
  ln -sfn "$CURRENT" "$ROOT/previous"
  systemctl restart we-invoice-gateway
  sleep 3
  curl -fsS http://127.0.0.1:8787/v1/health && echo && echo "rolled back to $PREVIOUS"
else
  echo "usage: rollback.sh docker|systemd" >&2
  exit 2
fi
