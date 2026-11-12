#!/usr/bin/env python3
"""Safely switch only CONSPACE's existing HTTPS vhost and add the published-media alias."""
from __future__ import annotations
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

VHOST = pathlib.Path("/etc/nginx/sites-available/conspace.conf")
DIST = pathlib.Path("/var/www/conspace/frontend/dist")
MEDIA_PUBLIC = pathlib.Path("/var/lib/conspace/media/public")
BACKUP_STATE = pathlib.Path("/var/lib/conspace-ops/last-vhost-backup.txt")
ROOT_OLD = "/var/www/conspace/ops/holding"
ROOT_NEW = "/var/www/conspace/frontend/dist"

API_BLOCK = """\
{indent}location = /api {{
{indent}    proxy_pass http://127.0.0.1:5088;
{indent}    proxy_set_header Host $host;
{indent}    proxy_set_header X-Real-IP $remote_addr;
{indent}    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
{indent}    proxy_set_header X-Forwarded-Proto $scheme;
{indent}    proxy_connect_timeout 5s;
{indent}    proxy_read_timeout 30s;
{indent}}}
{indent}location ^~ /api/ {{
{indent}    proxy_pass http://127.0.0.1:5088;
{indent}    proxy_set_header Host $host;
{indent}    proxy_set_header X-Real-IP $remote_addr;
{indent}    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
{indent}    proxy_set_header X-Forwarded-Proto $scheme;
{indent}    proxy_connect_timeout 5s;
{indent}    proxy_read_timeout 30s;
{indent}}}
"""

MEDIA_BLOCK = """\
{indent}location ~* ^/media/(?<media_file>[a-f0-9]{{32}}\\.(?:jpe?g|png|webp|avif|pdf))$ {{
{indent}    alias /var/lib/conspace/media/public/$media_file;
{indent}    autoindex off;
{indent}    default_type application/octet-stream;
{indent}    types {{
{indent}        image/jpeg jpg jpeg;
{indent}        image/png png;
{indent}        image/webp webp;
{indent}        image/avif avif;
{indent}        application/pdf pdf;
{indent}    }}
{indent}    add_header X-Content-Type-Options "nosniff" always;
{indent}    add_header Content-Security-Policy "default-src 'none'; sandbox" always;
{indent}    add_header Cache-Control "public, max-age=31536000, immutable" always;
{indent}}}
{indent}location /media/ {{
{indent}    autoindex off;
{indent}    return 404;
{indent}}}
"""


def fail(message: str) -> None:
    print("STOP: " + message, file=sys.stderr)
    sys.exit(1)


def match_brace(source: str, brace_pos: int) -> int:
    depth = 0
    quote = None
    escape = False
    comment = False
    for index in range(brace_pos, len(source)):
        char = source[index]
        if comment:
            if char == "\n":
                comment = False
            continue
        if quote:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == quote:
                quote = None
            continue
        if char == "#":
            comment = True
        elif char in "'\"":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index + 1
    fail("Unbalanced Nginx server block")


def safe_run(*command: str) -> None:
    subprocess.run(command, check=True)


def write_vhost(source: str, start: int, end: int, updated_block: str) -> None:
    entire = source[:start] + updated_block + source[end:]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = VHOST.with_name(VHOST.name + ".before-gate1-" + stamp)
    shutil.copy2(VHOST, backup)
    if entire == source:
        BACKUP_STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        BACKUP_STATE.write_text(str(backup) + chr(10), encoding="utf-8")
        print("PASS: CONSPACE Nginx already matches required locations; no config change")
        print("Verified rollback snapshot: " + str(backup))
        return
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=str(VHOST.parent),
                                         prefix=".conspace-gate1-", delete=False) as output:
            tmp_path = pathlib.Path(output.name)
            output.write(entire)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(tmp_path, stat.S_IMODE(VHOST.stat().st_mode))
        os.replace(tmp_path, VHOST)
        tmp_path = None
        safe_run("nginx", "-t")
        safe_run("systemctl", "reload", "nginx")
    except Exception as exc:
        print("Switch failed: " + str(exc) + "; restoring CONSPACE vhost backup", file=sys.stderr)
        shutil.copy2(backup, VHOST)
        try:
            safe_run("nginx", "-t")
            safe_run("systemctl", "reload", "nginx")
        except Exception as rollback_exc:
            print("URGENT: Nginx recovery failed: " + str(rollback_exc), file=sys.stderr)
        raise
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink()
    BACKUP_STATE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    BACKUP_STATE.write_text(str(backup) + "\n", encoding="utf-8")
    print("PASS: CONSPACE HTTPS serves Vite, proxies /api and exposes allowlisted published media.")
    print("Nginx vhost backup: " + str(backup))
    print("Other Nginx vhosts and Certbot files were not modified.")


def main() -> None:
    if os.geteuid() != 0:
        fail("Run as root on the CONSPACE VPS")
    if not DIST.is_symlink() or not (DIST / "index.html").is_file():
        fail("Expected managed frontend/dist symlink and built index.html")
    if not MEDIA_PUBLIC.is_dir() or MEDIA_PUBLIC.is_symlink():
        fail("Expected real /var/lib/conspace/media/public; run setup-storage.sh first")
    if not VHOST.is_file():
        fail("CONSPACE Nginx vhost not found")
    safe_run("nginx", "-t")
    source = VHOST.read_text(encoding="utf-8")

    matched = []
    for match in re.finditer(r"(?m)^[ \t]*server[ \t]*\{", source):
        start, end = match.start(), match_brace(source, match.end() - 1)
        block = source[start:end]
        if not re.search(r"(?m)^\s*listen\s+(?:\[::\]:)?443\s+ssl\b", block):
            continue
        names = re.findall(r"(?m)^\s*server_name\s+([^;]+);", block)
        if len(names) == 1 and set(names[0].split()) == {"conspace.vn", "www.conspace.vn"}:
            matched.append((start, end, block))
    if len(matched) != 1:
        fail("Expected exactly one CONSPACE HTTPS vhost (found " + str(len(matched)) + ")")
    start, end, block = matched[0]
    if not re.search(r"(?m)^\s*ssl_certificate\s+", block):
        fail("HTTPS vhost has no certificate directive")
    if not re.search(r"(?m)^\s*location\s*=\s*/__infra/health\s*\{", block):
        fail("Gate 0 edge health location missing")

    root_new = bool(re.search(r"(?m)^\s*root\s+" + re.escape(ROOT_NEW) + r"\s*;", block))
    root_old = bool(re.search(r"(?m)^\s*root\s+" + re.escape(ROOT_OLD) + r"\s*;", block))
    api_exact = bool(re.search(r"(?m)^\s*location\s*=\s*/api\s*\{", block))
    api_prefix = bool(re.search(r"(?m)^\s*location\s+\^~\s+/api/\s*\{", block))
    media_regex = bool(re.search(r"(?m)^\s*location\s+~\*\s+\^/media/", block))
    media_fallback = bool(re.search(r"(?m)^\s*location\s+/media/\s*\{", block))
    if api_exact != api_prefix:
        fail("Partial API proxy configuration; manual review required")
    if media_regex != media_fallback:
        fail("Partial media location configuration; manual review required")

    loc = re.search(r"(?m)^(?P<indent>[ \t]*)location\s+/\s*\{", block)
    if not loc:
        fail("Existing location / missing")
    loc_end = match_brace(block, loc.end() - 1)
    if "try_files $uri $uri/ /index.html;" not in block[loc.start():loc_end]:
        fail("Existing location / is not the expected SPA fallback; manual review required")
    indent = loc.group("indent")

    updated = block
    if root_old and not root_new:
        if api_exact or api_prefix or media_regex or media_fallback:
            fail("Holding root has pre-existing API/media locations; manual review required")
        updated = block.replace(ROOT_OLD, ROOT_NEW, 1)
        # Recalculate location offset after the root path length changes.
        loc = re.search(r"(?m)^(?P<indent>[ \t]*)location\s+/\s*\{", updated)
        updated = updated[:loc.start()] + API_BLOCK.format(indent=indent) + MEDIA_BLOCK.format(indent=indent) + updated[loc.start():]
    elif root_new:
        if not (api_exact and api_prefix):
            fail("Frontend root is active but API proxy is incomplete; manual review required")
        if not (media_regex and media_fallback):
            if media_regex or media_fallback:
                fail("Partial media configuration; manual review required")
            loc = re.search(r"(?m)^(?P<indent>[ \t]*)location\s+/\s*\{", updated)
            updated = updated[:loc.start()] + MEDIA_BLOCK.format(indent=loc.group("indent")) + updated[loc.start():]
    else:
        fail("Unexpected CONSPACE document root; no automatic edit performed")

    if "proxy_pass http://127.0.0.1:5088;" not in updated:
        fail("Expected loopback API proxy is missing")
    if "/var/lib/conspace/media/public/$media_file" not in updated:
        fail("Published media alias is missing")
    write_vhost(source, start, end, updated)


if __name__ == "__main__":
    main()
