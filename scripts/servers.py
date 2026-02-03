#!/usr/bin/env python
# /// script
# requires-python = ">=3.10"
# dependencies = ["requests>=2.32.0,<3"]
# ///
"""Lightweight local web servers manager (caddy, nginx, apache).

Rebuilt clean file. Apache start strategy (baseline only):
  1. Find installed httpd (winget/system/portable).
  2. Copy stock httpd.conf -> .servers/apache-temp/httpd-patched.conf
  3. Patch only: Define SRVROOT (actual install path) + first Listen to desired port.
  4. Validate with -t, then start with -d <install> -f <patched>.

Later we can append a VirtualHost pointing at the repo root for listing capture.
"""
from __future__ import annotations

import os
import sys
import shutil
import subprocess
import zipfile
import tarfile
import platform
from pathlib import Path
from typing import Optional
import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
BIN_ROOT = REPO_ROOT / '.servers'
BIN_ROOT.mkdir(exist_ok=True)

IS_WINDOWS = os.name == 'nt'
IS_UBUNTU = (Path('/etc/os-release').exists() and not IS_WINDOWS)

PORTS = {'caddy': 8080, 'nginx': 8081, 'apache': 8082, 'iis': 8083}
DOWNLOADS = {
    'caddy': None,  # resolved dynamically
    'nginx': 'https://nginx.org/download/nginx-1.27.1.zip',
    'apache': 'https://www.apachelounge.com/download/VS17/binaries/httpd-2.4.59-240321-win64-VS17.zip',
    # iis uses built-in Windows components (no download)
}


def log(msg: str):
    print(f'[servers] {msg}')


def resolve_caddy_url() -> str:
    latest = 'https://github.com/caddyserver/caddy/releases/latest'
    try:
        r = requests.get(latest, allow_redirects=False, timeout=15)
        loc = r.headers.get('Location') or r.headers.get('location')
        if loc and '/tag/' in loc:
            tag = loc.rsplit('/tag/', 1)[-1]
            ver = tag.lstrip('v')
            return f'https://github.com/caddyserver/caddy/releases/download/{tag}/caddy_{ver}_windows_amd64.zip'
    except Exception as e:  # noqa: BLE001
        log(f'caddy redirect failed: {e}')
    try:
        api = requests.get('https://api.github.com/repos/caddyserver/caddy/releases/latest', timeout=20)
        if api.ok:
            data = api.json()
            for asset in data.get('assets', []):
                name = asset.get('name', '')
                if name.endswith('windows_amd64.zip'):
                    return asset.get('browser_download_url')
    except Exception as e:  # noqa: BLE001
        log(f'caddy api failed: {e}')
    return 'https://github.com/caddyserver/caddy/releases/download/v2.7.6/caddy_2.7.6_windows_amd64.zip'


def ensure_download(url: str, dest_dir: Path):
    dest_dir.mkdir(parents=True, exist_ok=True)
    fname = url.split('/')[-1]
    archive = dest_dir / fname
    if not archive.exists():
        log(f'downloading {fname}')
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(archive, 'wb') as f:
                for chunk in r.iter_content(65536):
                    if chunk:
                        f.write(chunk)
    else:
        log(f'using cached {fname}')
    if fname.endswith('.zip'):
        with open(archive, 'rb') as f:
            if f.read(4) != b'PK\x03\x04':
                bad = archive.with_suffix('.bad')
                if not bad.exists():
                    shutil.copyfile(archive, bad)
                raise RuntimeError('download not a valid zip (signature mismatch)')
    marker = dest_dir / (fname + '.extracted')
    if not marker.exists():
        log(f'extracting {fname}')
        if fname.endswith('.zip'):
            with zipfile.ZipFile(archive) as z:
                z.extractall(dest_dir)
        elif fname.endswith(('.tar.gz', '.tgz')):
            with tarfile.open(archive, 'r:gz') as t:
                t.extractall(dest_dir)
        marker.write_text('ok')


def _appcmd_path() -> Path:
    return Path(os.environ.get('WINDIR', 'C:/Windows')) / 'System32' / 'inetsrv' / 'appcmd.exe'


def _iis_available() -> bool:
    return _appcmd_path().exists()


def windows_install(server: str):
    if server == 'apache':
        if shutil.which('winget') is None:
            raise SystemExit('winget not found for apache install')
        log('installing Apache via winget (ApacheLounge.httpd)')
        r = subprocess.run([
            'winget', 'install', '-e', '--id', 'ApacheLounge.httpd',
            '--accept-package-agreements', '--accept-source-agreements'
        ], capture_output=True, text=True)
        if r.returncode != 0:
            log(r.stdout.strip())
            log(r.stderr.strip())
            raise SystemExit('winget Apache install failed')
        log('Apache installed (winget)')
        return
    if server == 'iis':
        if _iis_available():
            log('IIS already available (appcmd.exe found)')
            return
        # Attempt to enable minimal IIS features (requires elevated PowerShell)
        log('Enabling IIS (requires elevation)...')
        enable_cmd = [
            'powershell', '-NoLogo', '-NoProfile', '-Command',
            'Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole,Web-Server,Web-Common-Http,Web-Dir-Browsing -All -NoRestart -ErrorAction Stop'
        ]
        r = subprocess.run(enable_cmd, capture_output=True, text=True)
        if r.returncode != 0:
            log('IIS enable failed (likely not elevated). Run PowerShell as Administrator and re-run install iis.')
            log(r.stderr.strip() or r.stdout.strip())
            return
        log('IIS features enabled.')
        return
    url = resolve_caddy_url() if server == 'caddy' else DOWNLOADS[server]
    if not url:
        raise SystemExit(f'no download url for {server}')
    try:
        ensure_download(url, BIN_ROOT / server)
    except RuntimeError as e:
        log(str(e))
        raise SystemExit(1)
    log(f'installed {server}')


def windows_uninstall(server: str):
    if server == 'apache':
        if shutil.which('winget'):
            log('uninstalling Apache via winget')
            subprocess.run([
                'winget', 'uninstall', '-e', '--id', 'ApacheLounge.httpd',
                '--accept-package-agreements', '--accept-source-agreements'
            ], capture_output=True, text=True)
        return
    if server == 'iis':
        if not _iis_available():
            log('IIS not present (appcmd.exe missing)')
            return
        # Remove the site we create; we do NOT remove Windows features (too invasive)
        site = 'folderapi-iis'
        subprocess.run([str(_appcmd_path()), 'stop', 'site', f'/site.name:{site}'], capture_output=True)
        subprocess.run([str(_appcmd_path()), 'delete', 'site', f'/site.name:{site}'], capture_output=True)
        log('Removed IIS site (features still installed)')
        return
    path = BIN_ROOT / server
    if path.exists():
        shutil.rmtree(path)
        log(f'removed {server}')


def ubuntu_install(server: str):
    pkg = {'caddy': 'caddy', 'nginx': 'nginx', 'apache': 'apache2'}[server]
    subprocess.run(['sudo', 'apt', 'update'], check=True)
    subprocess.run(['sudo', 'apt', 'install', '-y', pkg], check=True)


def ubuntu_uninstall(server: str):
    pkg = {'caddy': 'caddy', 'nginx': 'nginx', 'apache': 'apache2'}[server]
    subprocess.run(['sudo', 'apt', 'remove', '-y', pkg], check=True)


def _find_httpd() -> Path | None:
    exe = next((p for p in (BIN_ROOT / 'apache').rglob('httpd.exe')), None)
    if exe:
        return exe
    winget_root = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'Microsoft' / 'WinGet' / 'Packages'
    if winget_root.exists():
        for cand in winget_root.glob('ApacheLounge.httpd_*/*/bin/httpd.exe'):
            return cand
    pwhich = shutil.which('httpd')
    if pwhich:
        return Path(pwhich)
    for guess in [Path('C:/Apache24/bin/httpd.exe'), Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Apache24' / 'bin' / 'httpd.exe']:
        if guess.exists():
            return guess
    return None


def start_windows(server: str):
    root = REPO_ROOT
    port = PORTS[server]
    env = os.environ.copy()

    if server == 'caddy':
        exe = next((p for p in (BIN_ROOT / 'caddy').rglob('caddy.exe')), None)
        if not exe:
            raise SystemExit('caddy.exe not found (install first)')
        cmd = [str(exe), 'file-server', '--root', str(root), '--listen', f':{port}', '--browse']

    elif server == 'nginx':
        exe = next((p for p in (BIN_ROOT / 'nginx').rglob('nginx.exe')), None)
        if not exe:
            raise SystemExit('nginx.exe not found (install first)')
        conf_dir = exe.parent / 'conf'
        conf_dir.mkdir(exist_ok=True)
        conf_file = conf_dir / 'folderapi.conf'
        # Minimal valid nginx configuration enabling directory listing (autoindex)
        nginx_conf = f"""events {{ }}
http {{
    server {{
        listen {port};
        charset utf-8;
        autoindex on;
        autoindex_exact_size off;
        autoindex_localtime on;
        root {root.as_posix()};
    }}
}}
"""
        conf_file.write_text(nginx_conf)
        (exe.parent / 'logs').mkdir(exist_ok=True)
        cmd = [str(exe), '-p', str(exe.parent), '-c', str(conf_file)]

    elif server == 'apache':
        exe = _find_httpd()
        if not exe or not exe.exists():
            log('apache httpd.exe not found; skipping')
            return
        package_root = exe.parent.parent  # .../Apache24
        stock_conf = package_root / 'conf' / 'httpd.conf'
        if not stock_conf.exists():
            log(f'stock httpd.conf missing at {stock_conf}')
            return
        temp_dir = BIN_ROOT / 'apache-temp'
        temp_dir.mkdir(exist_ok=True)
        patched_conf = temp_dir / 'httpd-patched.conf'
        try:
            lines = stock_conf.read_text(encoding='utf-8', errors='ignore').splitlines()
        except Exception as e:  # noqa: BLE001
            log(f'read httpd.conf failed: {e}')
            return
        new_lines: list[str] = []
        srvroot_fixed = False
        listen_fixed = False
        docroot_fixed = False
        repo_docroot = REPO_ROOT.as_posix()
        for ln in lines:
            low = ln.strip().lower()
            if low.startswith('define srvroot'):
                new_lines.append(f'Define SRVROOT "{package_root.as_posix()}"')
                srvroot_fixed = True
                continue
            if low.startswith('listen ') and not listen_fixed:
                new_lines.append(f'Listen {port}')
                listen_fixed = True
                continue
            if low.startswith('documentroot ' ) and not docroot_fixed:
                # Replace original DocumentRoot with repository root
                new_lines.append(f'DocumentRoot "{repo_docroot}"')
                docroot_fixed = True
                continue
            new_lines.append(ln)
        if not srvroot_fixed:
            new_lines.insert(0, f'Define SRVROOT "{package_root.as_posix()}"')
        if not listen_fixed:
            new_lines.insert(0, f'Listen {port}')
        if not docroot_fixed:
            new_lines.append(f'DocumentRoot "{repo_docroot}"')
        # Ensure our repo root has directory listing enabled
        new_lines.append(f'<Directory "{repo_docroot}">')
        new_lines.append('    Options Indexes FollowSymLinks')
        new_lines.append('    AllowOverride None')
        new_lines.append('    Require all granted')
        new_lines.append('</Directory>')
        try:
            patched_conf.write_text('\n'.join(new_lines) + '\n', encoding='utf-8')
        except Exception as e:  # noqa: BLE001
            log(f'write patched conf failed: {e}')
            return
        test_cmd = [str(exe), '-d', str(package_root), '-f', str(patched_conf), '-t']
        r = subprocess.run(test_cmd, capture_output=True, text=True)
        if r.returncode != 0:
            log('apache config test failed:\n' + (r.stdout or '') + (r.stderr or ''))
            return
        cmd = [str(exe), '-d', str(package_root), '-f', str(patched_conf), '-DFOREGROUND']

    elif server == 'iis':
        if not _iis_available():
            log('IIS not available (appcmd.exe missing) – run install iis as admin first')
            return
        appcmd = str(_appcmd_path())
        site = 'folderapi-iis'
        # Recreate site each start to ensure consistent config
        subprocess.run([appcmd, 'stop', 'site', f'/site.name:{site}'], capture_output=True)
        subprocess.run([appcmd, 'delete', 'site', f'/site.name:{site}'], capture_output=True)
        add_args = [
            appcmd, 'add', 'site', f'/name:{site}', f'/bindings:http/*:{port}:', f'/physicalPath:{root}'
        ]
        r = subprocess.run(add_args, capture_output=True, text=True)
        if r.returncode != 0:
            log('Failed adding IIS site: ' + (r.stderr.strip() or r.stdout.strip()))
            return
        # Enable directory browsing
        subprocess.run([appcmd, 'set', 'config', f'{site}/', '/section:directoryBrowse', '/enabled:true'], capture_output=True)
        subprocess.run([appcmd, 'start', 'site', f'/site.name:{site}'], capture_output=True)
        log('IIS site started')
        return
    else:
        raise ValueError(server)

    log(f'starting {server} on port {port}')
    subprocess.Popen(cmd, cwd=str(root), env=env)


def stop_windows(server: str):
    port = PORTS[server]
    if server == 'iis':
        if not _iis_available():
            log('IIS not available to stop')
            return
        site = 'folderapi-iis'
        subprocess.run([str(_appcmd_path()), 'stop', 'site', f'/site.name:{site}'], capture_output=True)
        log('Stopped IIS site')
        return
    try:
        out = subprocess.check_output([
            'powershell', '-NoLogo', '-NoProfile', '-Command',
            f"Get-NetTCPConnection -LocalPort {port} -State Listen | Select-Object -Expand OwningProcess"
        ], text=True)
        pids = [line.strip() for line in out.splitlines() if line.strip().isdigit()]
        for pid in pids:
            log(f'stopping {server} pid {pid}')
            subprocess.run(['taskkill', '/PID', pid, '/F'], check=False)
    except subprocess.CalledProcessError:
        log(f'no listener on {port}')


def start_ubuntu(server: str):
    port = PORTS[server]
    root = REPO_ROOT
    if server == 'nginx':
        conf = f"server {{ listen {port}; root {root}; autoindex on; index ''; }}"
        path = Path(f"/etc/nginx/sites-enabled/folderapi-{port}.conf")
        subprocess.run(['sudo', 'bash', '-c', f"echo '{conf}' > {path}"], check=True)
        subprocess.run(['sudo', 'nginx', '-s', 'reload'], check=False)
    elif server == 'apache':
        conf = f"<VirtualHost *:{port}>\nDocumentRoot {root}\n<Directory {root}>\nOptions Indexes FollowSymLinks\nRequire all granted\n</Directory>\n</VirtualHost>\n"
        path = Path(f"/etc/apache2/sites-available/folderapi-{port}.conf")
        subprocess.run(['sudo', 'bash', '-c', f"echo '{conf}' > {path}"], check=True)
        subprocess.run(['sudo', 'a2enmod', 'autoindex'], check=False)
        subprocess.run(['sudo', 'a2ensite', f'folderapi-{port}.conf'], check=True)
        subprocess.run(['sudo', 'systemctl', 'reload', 'apache2'], check=False)
    elif server == 'caddy':
        caddyfile = Path(f"/tmp/folderapi-caddy-{port}.Caddyfile")
        caddyfile.write_text(f":{port} {{\nroot * {root}\nfile_server browse\n}}\n")
        subprocess.Popen(['caddy', 'run', '--config', str(caddyfile)])
    else:
        raise ValueError(server)
    log(f'started {server} on {port}')


def stop_ubuntu(server: str):
    port = PORTS[server]
    if server == 'nginx':
        path = Path(f"/etc/nginx/sites-enabled/folderapi-{port}.conf")
        if path.exists():
            subprocess.run(['sudo', 'rm', str(path)])
            subprocess.run(['sudo', 'nginx', '-s', 'reload'], check=False)
    elif server == 'apache':
        subprocess.run(['sudo', 'a2dissite', f'folderapi-{port}.conf'], check=False)
        subprocess.run(['sudo', 'systemctl', 'reload', 'apache2'], check=False)
    elif server == 'caddy':
        subprocess.run(['pkill', '-f', 'folderapi-caddy'], check=False)
    log(f'stopped {server}')


def install(server: str):
    (windows_install if IS_WINDOWS else ubuntu_install)(server)


def uninstall(server: str):
    (windows_uninstall if IS_WINDOWS else ubuntu_uninstall)(server)


def start(server: str):
    (start_windows if IS_WINDOWS else start_ubuntu)(server)


def stop(server: str):
    (stop_windows if IS_WINDOWS else stop_ubuntu)(server)


ALL = ['caddy', 'nginx', 'apache', 'iis']


def parse_args(argv: list[str]):
    if len(argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    action = argv[1]
    if action not in {'install', 'uninstall', 'start', 'stop'}:
        raise SystemExit(f'unknown action {action}')
    targets = argv[2:] or ALL
    for t in targets:
        if t not in ALL:
            raise SystemExit(f'unknown server {t}')
    return action, targets


def main() -> int:
    action, targets = parse_args(sys.argv)
    log(f'action={action} targets={targets}')
    for t in targets:
        if action == 'install':
            install(t)
        elif action == 'uninstall':
            uninstall(t)
        elif action == 'start':
            start(t)
        elif action == 'stop':
            stop(t)
    return 0

if __name__ == '__main__':  # pragma: no cover
    raise SystemExit(main())
