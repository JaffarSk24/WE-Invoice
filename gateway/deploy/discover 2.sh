#!/usr/bin/env bash
# Read-only survey of the server before the first deployment
# (06-gateway-server.md § 6.2). Changes nothing. The owner runs it on the
# server and sends the output back:
#   bash discover.sh > discover.txt 2>&1
set -u

section() { printf '\n=== %s ===\n' "$1"; }

section "System"
lsb_release -a 2>/dev/null || cat /etc/os-release
uname -a

section "Resources"
nproc
free -h
df -h

section "nginx"
nginx -v 2>&1 || echo "nginx not installed"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null
grep -rl "invoice-api" /etc/nginx/ 2>/dev/null || echo "no invoice-api vhost yet"

section "Node"
which node && node -v || echo "node not installed"
which npm && npm -v

section "Docker"
which docker && docker --version && docker compose version 2>/dev/null || echo "docker not installed"

section "Process managers and services"
which pm2 && pm2 ls 2>/dev/null || echo "pm2 not installed"
systemctl list-units --type=service --state=running 2>/dev/null | head -50

section "Listening ports"
ss -tlnp 2>/dev/null | head -40

section "Certificates"
ls /etc/letsencrypt/live/ 2>/dev/null || echo "no letsencrypt directory"
which certbot && certbot --version 2>&1 || echo "certbot not installed"

section "Firewall"
ufw status 2>/dev/null || echo "ufw not available"

section "Users"
id weinvoice 2>/dev/null || echo "user weinvoice does not exist yet"

section "DNS"
getent hosts invoice-api.whiteeagles.sk || echo "invoice-api.whiteeagles.sk does not resolve yet"
