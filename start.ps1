# Meeting Lens launcher (Windows). Run:  powershell -ExecutionPolicy Bypass -File start.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py = Join-Path $root "backend\venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py (Join-Path $root "run.py")
