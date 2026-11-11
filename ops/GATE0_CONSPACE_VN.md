# CONSPACE Gate 0: conspace.vn -> 103.149.170.146

This is an operational checklist, NOT an executed deployment. The VPS is shared until proven otherwise. Never overwrite live Nginx configs or change another project's Node, database, firewall, or PM2 processes.

## 1. SSH / inventory first (read-only)

Log in using your existing SSH credentials (do not send keys or passwords over chat). On the VPS:

```bash
whoami
hostnamectl
free -h
df -h /
sudo ss -lntp
sudo nginx -t
sudo grep -R -n 'server_name' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null
sudo ufw status verbose
```

Never run `ufw enable` as a first step; check SSH access and existing provider firewall. If `nginx` is absent, report that before installing anything.

## 2. DNS zone to create AFTER verifying the domain is unused

| Type | Host | Target | TTL |
|---|---|---|---|
| A | @ | 103.149.170.146 | 300 |
| CNAME | www | conspace.vn | 300 |

Do not remove or edit MX, SPF, DKIM, DMARC, or TXT verification records. Remove an obsolete AAAA for this website only if you have verified the domain is not using IPv6; otherwise ensure IPv6 points to the correct origin. If Cloudflare is authoritative, use DNS-only (grey cloud) for initial origin verification; once TLS works, a proxy may be restored using Full (strict).

Check with:

```bash
DOMAIN=conspace.vn EXPECTED_IP=103.149.170.146 bash ops/check-dns.sh
```

Public resolvers should return the expected IPv4 when DNS-only. If proxied, use the direct-origin checks below instead of requiring public A = origin.

## 3. Checkout the infrastructure branch (only if path unused)

```bash
sudo test -e /var/www/conspace && echo 'STOP: /var/www/conspace already exists. Inspect it before cloning.'
# Run the following only if the path does not exist and the current account may write to /var/www:
git clone --branch infra/vps-domain-first https://github.com/hoanglamvu04/conspace.git /var/www/conspace
cd /var/www/conspace
DOMAIN=conspace.vn bash ops/vps-audit.sh
```

If permissions prevent cloning into /var/www, arrange a dedicated deploy user or create /var/www/conspace with reviewed ownership. Do not `chmod -R 777` or overwrite a directory already used.

## 4. Prepare the HTTP-only Nginx virtual host

```bash
sudo nginx -t
sudo grep -R -n 'server_name.*conspace' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null
sudo test -e /etc/nginx/sites-available/conspace.conf && echo 'STOP: vhost already exists.'
sudo test -e /etc/nginx/sites-enabled/conspace.conf && echo 'STOP: enabled vhost already exists.'
```

Proceed ONLY if no conflicting vhost exists and the two `test -e` checks did not find files:

```bash
sudo cp /var/www/conspace/ops/nginx/conspace-http.conf.example /etc/nginx/sites-available/conspace.conf
sudo ln -s /etc/nginx/sites-available/conspace.conf /etc/nginx/sites-enabled/conspace.conf
sudo nginx -t
sudo systemctl reload nginx
curl --fail --silent --show-error --resolve conspace.vn:80:127.0.0.1 http://conspace.vn/__infra/health
```

Expected JSON: `{"ok":true,"service":"conspace-edge","stage":"infrastructure"}`. This is Nginx health only.

For HTTP network access from another machine, verify security-group and UFW rules allow inbound TCP 80. If UFW is active, validate SSH allow rules before changing it. From a remote machine:

```bash
curl -v --resolve conspace.vn:80:103.149.170.146 http://conspace.vn/__infra/health
```

## 5. Obtain certificate only AFTER DNS and HTTP path pass

Verify that both names point to this origin or resolve through a known proxy, that 80/tcp is publicly reachable, and that both names are in the `server_name` of the CONSPACE vhost. Then:

```bash
sudo certbot --nginx -d conspace.vn -d www.conspace.vn --redirect
sudo nginx -t
sudo systemctl reload nginx
cd /var/www/conspace
DOMAIN=conspace.vn bash ops/check-public.sh
sudo certbot renew --dry-run
```

If issuance fails, do NOT retry repeatedly. Review Certbot's concrete error (DNS mismatch, IPv6, ACME HTTP path, port, duplicate server block or rate limit).

## 6. Gate 0 must prove

- Nginx passes config check, existing sites remain working.
- Both names have valid HTTPS and HTTP -> HTTPS redirect.
- `/__infra/health` returns the expected JSON from the correct origin.
- PostgreSQL (separate database/role) and local Node toolchain are ready, with no cross-project changes.
- Retest after a planned service restart/reboot in a safe maintenance window.

Only then switch to frontend/ React/Vite JSX and backend/ Node Express work.

## 7. The first useful artifact for remote review

Paste output from:

```bash
cd /var/www/conspace
bash ops/vps-audit.sh
sudo nginx -t
```

Do not paste any `.env` file, TLS private key, SSH key, database password, or complete sensitive Nginx configurations.
