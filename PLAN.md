# Home Hosting Plan: Debian LXC, Docker Compose, Cloudflare Tunnel

## Summary

This site will migrate away from Render and run on a Debian LXC in Proxmox using Docker Compose.

The production stack is:

- Astro frontend served by nginx.
- Go Gin API.
- Postgres database.
- Cloudflare Tunnel container for public access.
- No Kubernetes.
- No Terraform.
- No router port forwarding.

Public domains:

```text
https://nikokomninos.com
https://www.nikokomninos.com
https://events.nikokomninos.com
https://api.nikokomninos.com
```

Traffic flow:

```text
Internet
  -> Cloudflare DNS / HTTPS
  -> Cloudflare Tunnel
  -> Docker Compose on Debian LXC
       -> web:80 for nikokomninos.com and events.nikokomninos.com
       -> api:8080 for api.nikokomninos.com
       -> db:5432 only on the private Docker network
```

## Repo Files

Production deployment uses:

```text
docker-compose.prod.yml
.env.production
Dockerfile
nginx.conf
apps/api/Dockerfile
apps/api/main.go
apps/api/schema.sql
```

Local development can keep using:

```text
docker-compose.yml
.env
```

## Public Routing

Main site:

```text
https://nikokomninos.com
https://www.nikokomninos.com
```

Events:

```text
https://events.nikokomninos.com
https://events.nikokomninos.com/welcome-to-narxville
```

The Astro build still contains events under `/events`, but nginx maps the events subdomain to those files:

```text
events.nikokomninos.com/welcome-to-narxville
  -> /events/welcome-to-narxville/index.html
```

API:

```text
https://api.nikokomninos.com/healthz
https://api.nikokomninos.com/events/:eventID/rsvp/me
https://api.nikokomninos.com/events/:eventID/rsvps
https://api.nikokomninos.com/admin/events/:eventID/invites
```

The production frontend should be built with:

```env
PUBLIC_API_BASE_URL=https://api.nikokomninos.com
```

Production invite links should use:

```env
PUBLIC_APP_BASE_URL=https://events.nikokomninos.com
```

## Create The Debian LXC

Create a Debian 12 LXC in Proxmox.

Recommended settings:

```text
Hostname: site
Template: Debian 12
Unprivileged: yes
CPU: 2 cores
RAM: 2-4 GB
Disk: 30-60 GB
Network: bridged LAN
IP: DHCP reservation or static LAN IP
Features: nesting=1,keyctl=1
```

In the Proxmox UI:

```text
Create CT
  -> Debian 12 template
  -> Unprivileged container
  -> Options
      -> Features
          -> nesting=1
          -> keyctl=1
```

Do not run this public stack directly on the Proxmox host.

## Install Docker In The LXC

SSH into the LXC:

```bash
ssh root@<lxc-lan-ip>
```

Install Docker:

```bash
apt update
apt upgrade -y
apt install -y git curl ca-certificates nano
curl -fsSL https://get.docker.com | sh
```

Verify:

```bash
docker version
docker compose version
```

If Docker fails, confirm the LXC has:

```text
nesting=1
keyctl=1
```

## Clone The Repo

Use `/opt/nikokomninos.com`:

```bash
mkdir -p /opt/nikokomninos.com
cd /opt/nikokomninos.com
git clone <repo-url> .
```

## Create Production Env File

On the LXC, copy the example:

```bash
cp .env.production.example .env.production
```

Edit it:

```bash
nano .env.production
```

Use long random values for:

```text
POSTGRES_PASSWORD
RSVP_TOKEN_PEPPER
ADMIN_TOKEN
CLOUDFLARE_TUNNEL_TOKEN
```

Generate secrets:

```bash
openssl rand -base64 32
openssl rand -base64 32
openssl rand -base64 24
```

Important: after creating real invite links, do not change `RSVP_TOKEN_PEPPER`. Changing it invalidates existing invite links.

## Create Cloudflare Tunnel

In Cloudflare:

```text
Zero Trust
  -> Networks
  -> Tunnels
  -> Create tunnel
```

Name:

```text
nikokomninos-home
```

Choose Docker as the connector type.

Copy the token into:

```env
CLOUDFLARE_TUNNEL_TOKEN=...
```

## Configure Cloudflare Public Hostnames

In the tunnel settings, add:

```text
nikokomninos.com
  -> http://web:80

www.nikokomninos.com
  -> http://web:80

events.nikokomninos.com
  -> http://web:80

api.nikokomninos.com
  -> http://api:8080
```

Do not expose:

```text
db:5432
```

## Start The Production Stack

On the LXC:

```bash
cd /opt/nikokomninos.com
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Expected:

```text
db           healthy
api          running
web          running
cloudflared  running
```

Watch logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f cloudflared web api
```

## Test Before Render Cutover

From the LXC:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec api wget -qO- http://localhost:8080/healthz
```

Expected:

```json
{"ok":true}
```

From your laptop:

```bash
curl -I https://nikokomninos.com
curl -I https://events.nikokomninos.com
curl https://api.nikokomninos.com/healthz
```

Expected:

```text
nikokomninos.com returns 200
events.nikokomninos.com returns 200
api.nikokomninos.com/healthz returns {"ok":true}
```

## Test RSVP Flow

Create an invite:

```bash
curl -X POST https://api.nikokomninos.com/admin/events/welcome-to-narxville/invites \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

Expected URL:

```text
https://events.nikokomninos.com/welcome-to-narxville#rsvp=<token>
```

Open that URL and confirm:

- Event content is visible.
- RSVP form loads.
- Save RSVP succeeds.
- Refresh pre-fills RSVP.
- Attendee list loads and updates.

No-token URL:

```text
https://events.nikokomninos.com/welcome-to-narxville
```

Expected:

- Title visible.
- Invite-required message visible.
- Private event body hidden.
- RSVP form hidden.

## Render Cutover

Keep Render running until the home-hosted stack is verified.

1. Confirm the Cloudflare tunnel is healthy.
2. Confirm all production URLs work.
3. Update Cloudflare DNS/tunnel routing away from Render and toward the tunnel.
4. Remove custom domains from the Render service.
5. Disable any Render deploy hooks or scheduled deploy workflows.
6. Keep Render available for one day as rollback.
7. Suspend or delete the Render service after validation.

## Backups

Create:

```text
/opt/nikokomninos.com/scripts/backup-db.sh
```

Script:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/nikokomninos.com
BACKUP_DIR=/opt/nikokomninos.com/backups

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

set -a
. ./.env.production
set +a

docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  > "$BACKUP_DIR/site-$(date +%Y%m%d-%H%M%S).sql"

find "$BACKUP_DIR" -type f -name "site-*.sql" -mtime +14 -delete
```

Make executable:

```bash
chmod +x /opt/nikokomninos.com/scripts/backup-db.sh
```

Add cron:

```bash
crontab -e
```

Daily backup:

```cron
15 3 * * * /opt/nikokomninos.com/scripts/backup-db.sh
```

Also configure Proxmox scheduled backups for the LXC.

## Deploy Updates

Manual deploy:

```bash
cd /opt/nikokomninos.com
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f
```

Restart API:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart api
```

Stop stack without deleting data:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

Do not run this unless you intentionally want to delete the database:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down -v
```

## Security Checklist

- Run Docker Compose inside Debian LXC, not directly on the Proxmox host.
- Use Cloudflare Tunnel instead of router port forwarding.
- Do not expose Postgres publicly.
- Do not publish production Docker ports publicly.
- Keep `.env.production` out of git.
- Use long random production secrets.
- Do not reuse local/dev RSVP secrets in production.
- Keep Proxmox UI LAN-only or VPN-only.
- Keep LXC SSH LAN-only or VPN-only.
- Enable Debian security updates:

```bash
apt install -y unattended-upgrades
dpkg-reconfigure unattended-upgrades
```
