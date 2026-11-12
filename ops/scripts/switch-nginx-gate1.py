#!/usr/bin/env python3
"""Switch only CONSPACE's existing HTTPS Nginx vhost from holding to React/API.

Run as root after PM2 conspace-api passes /api/ready and frontend/dist is built.
Refuses unexpected Nginx layout. Makes a timestamped backup and restores on error.
Does not edit any other site's vhost or restart Nginx.
"""
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
BACKUP_STATE = pathlib.Path("/var/lib/conspace-ops/last-vhost-backup.txt")
ROOT_OLD = "/var/www/conspace/ops/holding"
ROOT_NEW = "/var/www/conspace/frontend/dist"
PROXY = """\
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


def main() -> None:
    if os.geteuid() != 0:
        fail("Run as root on the CONSPACE VPS")
    if not DIST.is_symlink() or not (DIST / "index.html").is_file():
        fail("Expected managed frontend/dist symlink and built index.html")
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
        if len(names) != 1 or set(names[0].split()) != {"conspace.vn", "www.conspace.vn"}:
            continue
        matched.append((start, end, block))
    if len(matched) != 1:
        fail("Expected exactly one CONSPACE HTTPS vhost (found " + str(len(matched)) + ")")
    start, end, block = matched[0]
    if not re.search(r"(?m)^\s*ssl_certificate\s+", block):
        fail("HTTPS vhost has no certificate directive")
    if not re.search(r"(?m)^\s*location\s*=\s*/__infra/health\s*\{", block):
        fail("Gate 0 edge health location missing")
    has_api = re.search(r"(?m)^\s*location\s+\^~\s+/api/\s*\{", block)
    has_root = re.search(r"(?m)^\s*root\s+" + re.escape(ROOT_NEW) + r"\s*;", block)
    if has_api or has_root:
        if has_api and has_root and re.search(r"(?m)^\s*location\s*=\s*/api\s*\{", block):
            print("PASS: CONSPACE Nginx already points to React and API; no change")
            return
        fail("Vhost partially migrated; review manually instead of overwriting")
    root_matches = list(re.finditer(r"(?m)^[ \t]*root\s+" + re.escape(ROOT_OLD) + r"\s*;", block))
    loc_matches = list(re.finditer(r"(?m)^(?P<indent>[ \t]*)location\s+/\s*\{", block))
    if len(root_matches) != 1 or len(loc_matches) != 1:
        fail("Unexpected root or location / layout; need manual review")
    loc = loc_matches[0]
    loc_body = block[loc.start():match_brace(block, loc.end() - 1)]
    if "try_files $uri $uri/ /index.html;" not in loc_body:
        fail("Existing location / is not the Gate 0 holding fallback")
    if re.search(r"(?m)^\s*location\s+(?:=\s*/api|\^~\s*/api/)\s*\{", block):
        fail("Existing API location not owned by this script")
    replacement = PROXY.format(indent=loc.group("indent"))
    updated = block[:loc.start()] + replacement + "\n" + block[loc.start():]
    updated = updated.replace(ROOT_OLD, ROOT_NEW, 1)
    entire = source[:start] + updated + source[end:]
    if entire == source:
        fail("No vhost change produced")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = VHOST.with_name(VHOST.name + ".before-gate1-" + stamp)
    shutil.copy2(VHOST, backup)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8",
                                         dir=str(VHOST.parent), prefix=".conspace-gate1-",
                                         delete=False) as output:
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
        print("Switch failed: " + str(exc) + "; restoring Nginx vhost backup", file=sys.stderr)
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
    print("PASS: CONSPACE HTTPS now serves frontend/dist and proxies /api")
    print("Nginx vhost backup: " + str(backup))
    print("Other Nginx vhosts were not modified.")


if __name__ == "__main__":
    main()
