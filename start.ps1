$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '=== 启动 CodeLife —— 会自我编程的数字生命 ===' -ForegroundColor Cyan

if (-not (Test-Path "$Root\backend\node_modules")) {
  Write-Host '[1/4] 安装后端依赖...' -ForegroundColor Yellow
  Push-Location "$Root\backend"
  npm install
  Pop-Location
}

if (-not (Test-Path "$Root\frontend\node_modules")) {
  Write-Host '[2/4] 安装前端依赖...' -ForegroundColor Yellow
  Push-Location "$Root\frontend"
  npm install
  Pop-Location
}

Write-Host '[3/4] 启动后端世界引擎 (http://localhost:8788)...' -ForegroundColor Green
$BackendProc = Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory "$Root\backend" -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 2

Write-Host '[4/4] 启动前端交互观测台 (http://localhost:5188)...' -ForegroundColor Green
Write-Host '按 Ctrl+C 停止全部服务' -ForegroundColor DarkGray

try {
  Push-Location "$Root\frontend"
  npx vite --port 5188
} finally {
  Pop-Location
  if ($BackendProc -and -not $BackendProc.HasExited) {
    Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue
  }
}
