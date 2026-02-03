"""Run multiple FastAPI apps (ports 8101-8104) serving directory listings.

Layouts + Server headers emulate Apache, Nginx, IIS, and Caddy.

Usage (with Astral uv):
    uv run mock_servers/run.py

The embedded PEP 723 metadata below lets uv resolve dependencies automatically.
"""
# /// script
# dependencies = ["fastapi>=0.110.0", "uvicorn>=0.29.0"]
# ///
from datetime import datetime
from fastapi import FastAPI, Response
from fastapi.responses import HTMLResponse
import uvicorn

COMMON_FILES = [
    ("file1.txt", 123, datetime(2024, 3, 1, 12, 0)),
    ("file.two.jpg", 4567, datetime(2024, 3, 1, 12, 1)),
    ("space name.txt", 2048, datetime(2024, 3, 1, 12, 2)),
    (".hidden", 10, datetime(2024, 3, 1, 12, 3)),
]

SUB_FILES = [
    ("deep.md", 89, datetime(2024, 3, 2, 1, 2)),
]

SUBDIRS = ["sub"]


def fmt_apache(dt: datetime) -> str:
    return dt.strftime("%d-%b-%Y %H:%M")


def fmt_nginx(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


def fmt_iis(dt: datetime) -> str:
    return dt.strftime("%m/%d/%Y %I:%M %p")


def fmt_caddy(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


def size_compact(size: int) -> str:
    value = float(size)
    unit = "B"
    for u in ["B", "K", "M", "G"]:
        unit = u
        if value < 1024 or u == "G":
            break
        value = value / 1024.0
    if unit == "B":
        return f"{int(value)}"
    if value.is_integer():
        return f"{int(value)}{unit}"
    return f"{value:.1f}{unit}"


def apache_style_listing(files, subdirs):
    rows = ["<tr><th>Name</th><th>Last modified</th><th>Size</th></tr>"]
    for name, size, dt in files:
        rows.append(
            "<tr>"
            f"<td><a href='{name}'>{name}</a></td>"
            f"<td>{fmt_apache(dt)}</td>"
            f"<td>{size}</td>"
            "</tr>"
        )
    for d in subdirs:
        rows.append(
            "<tr>"
            f"<td><a href='{d}/'>{d}/</a></td>"
            f"<td>{fmt_apache(files[0][2])}</td>"
            "<td>-</td>"
            "</tr>"
        )
    return "<table>" + "".join(rows) + "</table>"


def nginx_style_listing(files, subdirs):
    lines = []
    for name, size, dt in files:
        lines.append(f"<a href='{name}'>{name}</a> {fmt_nginx(dt)} {size_compact(size)}")
    for d in subdirs:
        lines.append(f"<a href='{d}/'>{d}/</a> {fmt_nginx(files[0][2])} -")
    return "<pre>" + "\n".join(lines) + "</pre>"


def iis_style_listing(files, subdirs):
    lines = ["<A HREF=\"../\">[To Parent Directory]</A><br><br>"]
    for d in subdirs:
        lines.append(
            f"{fmt_iis(files[0][2])}        &lt;dir&gt; <A HREF=\"{d}/\">{d}</A><br>"
        )
    for name, size, dt in files:
        lines.append(
            f"{fmt_iis(dt)}          {size} <A HREF=\"{name}\">{name}</A><br>"
        )
    return "<pre>" + "".join(lines) + "</pre>"


def caddy_style_listing(files, subdirs):
    rows = ["<tr><th>Name</th><th>Size</th><th>Modified</th></tr>"]
    for name, size, dt in files:
        rows.append(
            "<tr>"
            f"<td><a href='{name}'>{name}</a></td>"
            f"<td>{size_compact(size)}</td>"
            f"<td>{fmt_caddy(dt)}</td>"
            "</tr>"
        )
    for d in subdirs:
        rows.append(
            "<tr>"
            f"<td><a href='{d}/'>{d}/</a></td>"
            "<td>-</td>"
            f"<td>{fmt_caddy(files[0][2])}</td>"
            "</tr>"
        )
    return "<table>" + "".join(rows) + "</table>"


def html_page(title: str, body: str) -> str:
    return f"<!doctype html><html><head><title>{title}</title></head><body>{body}</body></html>"


def build_app(layout_func, server_header: str):
    app = FastAPI()

    @app.get("/root/")
    def root():
        body = layout_func(COMMON_FILES, SUBDIRS)
        html = html_page("Index of /root/", body)
        return HTMLResponse(html, headers={"Server": server_header})

    @app.get("/root/sub/")
    def sub():
        body = layout_func(SUB_FILES, [])
        html = html_page("Index of /root/sub/", body)
        return HTMLResponse(html, headers={"Server": server_header})

    @app.head("/root/{path:path}")
    def head_root(path: str):
        return Response(
            status_code=200,
            headers={
                "Server": server_header,
                "Content-Type": "text/plain",
                "Content-Length": "12",
            },
        )

    return app


LAYOUTS = {
    "apache": (apache_style_listing, "Apache/2.4.57"),
    "nginx": (nginx_style_listing, "nginx/1.25.3"),
    "iis": (iis_style_listing, "Microsoft-IIS/10.0"),
    "caddy": (caddy_style_listing, "Caddy"),
}

APPS = [
    (8101, "apache"),
    (8102, "nginx"),
    (8103, "iis"),
    (8104, "caddy"),
]


def _run(port: int, label: str):
    layout_func, server_header = LAYOUTS[label]
    app = build_app(layout_func, server_header)
    print(f"[mock_servers] starting {label} on http://127.0.0.1:{port}/root/")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    try:
        from multiprocessing import Process

        procs = []
        for port, label in APPS:
            p = Process(target=_run, args=(port, label), daemon=True)
            p.start()
            procs.append(p)
        print("[mock_servers] all mock listing servers launched (Ctrl+C to stop)")
        for p in procs:
            p.join()
    except KeyboardInterrupt:
        print("\n[mock_servers] shutdown requested")
