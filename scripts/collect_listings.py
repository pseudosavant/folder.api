# /// script
# dependencies = [
#   "requests>=2.32.0,<3"
# ]
# ///

"""Collect directory listing HTML from multiple local servers.

Usage (Astral uv):
  uv run scripts/collect_listings.py

Servers probed (skip if unreachable) – default ports (override via env, e.g. FOLDERAPI_PORT_CADDY=18080):
        caddy  : http://localhost:8080/
        nginx  : http://localhost:8081/
        apache : http://localhost:8082/
        iis    : http://localhost:8083/

Writes to listings/<server>/<relative path>/listing.html
Existing files overwritten.
"""
from __future__ import annotations

import os
import sys
import time
import urllib.parse as up
from dataclasses import dataclass
from pathlib import Path
from typing import List
import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = REPO_ROOT / "listings"

EXCLUDE_DIRS = {".git", "node_modules", "dist", "build", ".servers", ".idea", ".vscode", "coverage", "listings"}

DEFAULT_PORTS = {
    "caddy": 8080,
    "nginx": 8081,
    "apache": 8082,
    "iis": 8083,
}

def resolve_ports() -> dict[str, int]:
    ports: dict[str, int] = {}
    for name, port in DEFAULT_PORTS.items():
        env_key = f"FOLDERAPI_PORT_{name.upper()}"
        override = os.environ.get(env_key)
        if override and override.isdigit():
            ports[name] = int(override)
        else:
            ports[name] = port
    return ports

@dataclass
class Server:
    name: str
    port: int
    @property
    def base(self) -> str:
        return f"http://localhost:{self.port}/"

def build_servers() -> List[Server]:
    ports = resolve_ports()
    return [
        Server("caddy", ports["caddy"]),
        Server("nginx", ports["nginx"]),
        Server("apache", ports["apache"]),
        Server("iis", ports["iis"]),  # optional / may be absent
    ]

SERVERS: List[Server] = build_servers()


def enumerate_dirs(root: Path) -> List[Path]:
    dirs: List[Path] = [Path("")]
    for current_root, subdirs, _files in os.walk(root):
        rel_root = Path(current_root).relative_to(root)
        # in-place modify subdirs to skip excluded
        subdirs[:] = [d for d in subdirs if d not in EXCLUDE_DIRS]
        for d in subdirs:
            rel = rel_root / d
            dirs.append(rel)
    return dirs


def encode_rel(rel: Path) -> str:
    if rel == Path(""):
        return ""
    parts = [up.quote(p) for p in rel.parts]
    return "/".join(parts) + "/"


def fetch(url: str, timeout: float = 5.0):
    try:
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return True, r.text
    except Exception as e:  # noqa: BLE001
        return False, str(e)


def main() -> int:
    start = time.time()
    dirs = enumerate_dirs(REPO_ROOT)
    print(f"[collector] enumerated {len(dirs)} directories")
    OUT_ROOT.mkdir(exist_ok=True)

    for server in SERVERS:
        print(f"[collector] server {server.name} ({server.base})")
        ok, _ = fetch(server.base)
        if not ok:
            print(f"[collector] skipping {server.name}: unreachable", file=sys.stderr)
            continue
        for rel in dirs:
            encoded = encode_rel(rel)
            url = server.base + encoded
            success, payload = fetch(url)
            target_dir = OUT_ROOT / server.name / rel
            target_dir.mkdir(parents=True, exist_ok=True)
            if success:
                (target_dir / "listing.html").write_text(payload, encoding="utf-8")
            else:
                (target_dir / "listing.error.txt").write_text(payload, encoding="utf-8")
    elapsed = (time.time() - start) * 1000
    print(f"[collector] done in {elapsed:.0f} ms")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
