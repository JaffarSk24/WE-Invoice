# Deploying the gateway

Deployment is run by the owner only. Nothing in this folder deploys by itself. The gateway runs on the Hetzner VPS 5.75.136.96 next to whiteeagles.sk, behind nginx, at `https://invoice-api.whiteeagles.sk`, listening on `127.0.0.1:8787`.

## 0. Before the first deployment

1. Run the read-only survey and send the output back: `bash gateway/deploy/discover.sh > discover.txt 2>&1`. It decides between variant A (Docker Compose, preferred) and variant B (systemd with Node 22).
2. Add a DNS A record `invoice-api.whiteeagles.sk` pointing to `5.75.136.96`, then wait until `getent hosts invoice-api.whiteeagles.sk` answers that address.
3. Prepare the secrets for `.env` (see `gateway/.env.example`): SMTP access of the mail service of whiteeagles.sk, `FS_OPENDATA_API_KEY` from opendata.financnasprava.sk, and two long random strings for `ADMIN_TOKEN` and `BETA_HMAC_SECRET` (`openssl rand -base64 48`).

## 1. nginx and the certificate (both variants)

```bash
sudo cp gateway/deploy/nginx-invoice-api.conf /etc/nginx/sites-available/invoice-api.whiteeagles.sk
sudo ln -s /etc/nginx/sites-available/invoice-api.whiteeagles.sk /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d invoice-api.whiteeagles.sk
sudo nginx -t && sudo systemctl reload nginx
```

The vhost never logs secrets. The `log_format gateway_safe` writes `$uri` (the path without the query string) and no headers, so no `Authorization` or `X-Upstream-Authorization` value reaches the nginx log. The `location /v1/proxy/` has `access_log off`: provider API keys and tokens travel in its headers and bodies, and provider paths in its URL, so nothing about these requests is logged by nginx. Check after any edit of the vhost that no `log_format` with `$request_uri`, `$args` or `$http_authorization` is used for this server, and that `access_log off` stays in the proxy location. The gateway itself logs only the route pattern, status, duration and an anonymised IP, and answers every proxy request with `Cache-Control: no-store`.

## 2A. Variant A: Docker Compose

```bash
sudo mkdir -p /opt/we-invoice && sudo chown "$USER" /opt/we-invoice
git clone https://github.com/JaffarSk24/WE-Invoice.git /opt/we-invoice/repo
cd /opt/we-invoice/repo/gateway
cp .env.example .env && chmod 600 .env && nano .env
docker compose up -d --build
curl -fsS http://127.0.0.1:8787/v1/health
curl -fsS https://invoice-api.whiteeagles.sk/v1/health
```

The image is built from the repository root (compose sets the context), so it carries `packages/core/peppol/providers.json`, the proxy allow-list.

Update to a new release:

```bash
cd /opt/we-invoice/repo
docker tag we-invoice-gateway:local we-invoice-gateway:previous
git fetch origin && git checkout <release tag or main> && git pull
cd gateway && docker compose up -d --build
curl -fsS http://127.0.0.1:8787/v1/health
```

Roll back: `bash /opt/we-invoice/repo/gateway/deploy/rollback.sh docker`.

Daily backup at 03:15 with 14-day rotation (root crontab, `sudo crontab -e`):

```
15 3 * * * /opt/we-invoice/repo/gateway/deploy/backup-sqlite.sh docker >> /var/log/we-invoice-backup.log 2>&1
```

## 2B. Variant B: systemd and Node 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs sqlite3
sudo useradd --system --home /var/lib/we-invoice --shell /usr/sbin/nologin weinvoice
sudo mkdir -p /opt/we-invoice /var/lib/we-invoice /etc/we-invoice
sudo chown weinvoice:weinvoice /var/lib/we-invoice
sudo git clone https://github.com/JaffarSk24/WE-Invoice.git /opt/we-invoice/release-1
cd /opt/we-invoice/release-1/gateway && sudo npm ci --omit=dev
sudo ln -sfn /opt/we-invoice/release-1 /opt/we-invoice/current
sudo cp .env.example /etc/we-invoice/gateway.env
sudo chmod 600 /etc/we-invoice/gateway.env && sudo chown weinvoice /etc/we-invoice/gateway.env
sudo nano /etc/we-invoice/gateway.env   # DATABASE_PATH=/var/lib/we-invoice/gateway.sqlite, HOST=127.0.0.1
sudo cp deploy/we-invoice-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now we-invoice-gateway
curl -fsS http://127.0.0.1:8787/v1/health
```

Update: clone the new release to `/opt/we-invoice/release-N`, run `npm ci --omit=dev` in its gateway folder, then `sudo ln -sfn "$(readlink -f /opt/we-invoice/current)" /opt/we-invoice/previous`, `sudo ln -sfn /opt/we-invoice/release-N /opt/we-invoice/current` and `sudo systemctl restart we-invoice-gateway`.

Roll back: `sudo bash /opt/we-invoice/current/gateway/deploy/rollback.sh systemd`.

Backup (root crontab): `15 3 * * * /opt/we-invoice/current/gateway/deploy/backup-sqlite.sh /var/lib/we-invoice/gateway.sqlite`.

## 3. Owner's tasks after the start

- Waitlist export: `curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" https://invoice-api.whiteeagles.sk/v1/admin/waitlist.csv -o waitlist.csv`.
- Counters: `curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" https://invoice-api.whiteeagles.sk/v1/admin/stats`.
- Beta wave (variant A): `docker cp waitlist.csv we-invoice-gateway:/tmp/ && docker exec we-invoice-gateway node scripts/send-invites.mjs /tmp/waitlist.csv --dry-run`, check the list, then run it again without `--dry-run`. Variant B: `cd /opt/we-invoice/current/gateway && sudo -u weinvoice node --env-file=/etc/we-invoice/gateway.env scripts/send-invites.mjs waitlist.csv`.
- Monitoring: point UptimeRobot (or similar) at `https://invoice-api.whiteeagles.sk/v1/health`.
- A provider that publishes its API address between releases: add it to `PROVIDER_BASE_URLS` in `.env` as JSON and restart the gateway.
