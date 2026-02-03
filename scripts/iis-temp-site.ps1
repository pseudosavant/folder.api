<#!
.SYNOPSIS
  Creates (or removes) a temporary IIS site exposing the repo root with directory browsing enabled.

.PARAMETER Action
  'create' (default) or 'remove'

.PARAMETER Port
  TCP port to bind (default 8083)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/iis-temp-site.ps1 -Action create -Port 8083

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/iis-temp-site.ps1 -Action remove
#!>
param(
  [ValidateSet('create','remove')][string]$Action='create',
  [int]$Port=8083,
  [string]$SiteName='folderapi-temp'
)

Import-Module WebAdministration -ErrorAction Stop

if ($Action -eq 'remove') {
  if (Test-Path IIS:\Sites\$SiteName) {
    Write-Host "[iis] Removing site $SiteName" -ForegroundColor Yellow
    Remove-WebSite -Name $SiteName
  } else {
    Write-Host "[iis] Site $SiteName not present" -ForegroundColor DarkYellow
  }
  return
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Write-Host "[iis] Creating site $SiteName at $root on port $Port" -ForegroundColor Cyan

if (Test-Path IIS:\Sites\$SiteName) {
  Write-Host "[iis] Existing site found; removing first" -ForegroundColor Yellow
  Remove-WebSite -Name $SiteName
}

New-WebSite -Name $SiteName -Port $Port -PhysicalPath $root -Force | Out-Null
Set-WebConfigurationProperty -Filter /system.webServer/directoryBrowse -PSPath IIS:\ -Name enabled -Value true -Location $SiteName
Restart-WebAppPool -Name $SiteName -ErrorAction SilentlyContinue
Write-Host "[iis] Ready: http://localhost:$Port/" -ForegroundColor Green