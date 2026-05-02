param(
    [ValidateSet("check", "start", "stop")]
    [string]$Action,
    [int]$SolverPort = 18090,
    [int]$BackendPort = 18000,
    [int]$FrontendPort = 5173,
    [string]$NodeVersion = "v22.22.2",
    [switch]$SkipFrontendBuild,
    [switch]$SkipSolverBuild
)

$ErrorActionPreference = "Stop"

function Info($Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Ok($Message) {
    Write-Host "[ OK ] $Message" -ForegroundColor Green
}

function Warn($Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Fail($Message) {
    Write-Host "[FAIL] $Message" -ForegroundColor Red
    throw $Message
}

function Invoke-Step($Name, [scriptblock]$Block) {
    Info $Name
    & $Block
    Ok $Name
}

function Require-Command($Name, $InstallHint) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        Fail "$Name was not found. $InstallHint"
    }
    return $command
}

function Select-Action {
    Write-Host ""
    Write-Host "请选择要执行的操作：" -ForegroundColor Cyan
    Write-Host "  1. 编译运行环境检查"
    Write-Host "  2. 启动服务"
    Write-Host "  3. 停止服务"
    Write-Host ""

    $choice = Read-Host "输入 1/2/3"
    switch ($choice) {
        "1" { return "check" }
        "2" { return "start" }
        "3" { return "stop" }
        default { Fail "Unknown option: $choice" }
    }
}

function Ensure-File($Path, $Hint) {
    if (-not (Test-Path $Path)) {
        Fail "$Path was not found. $Hint"
    }
}

function Write-BackendEnv {
    $backendEnv = Join-Path $BackendDir ".env"
    "GNSS_SOLVER_BASE_URL=http://127.0.0.1:$SolverPort/solver/v1" | Set-Content -Path $backendEnv -Encoding utf8
}

function Get-PidFile($Name) {
    return Join-Path $PidDir "$Name.pid"
}

function Get-LogFile($Name) {
    return Join-Path $LogDir "$Name.log"
}

function Test-ManagedProcess($Name) {
    $pidFile = Get-PidFile $Name
    if (-not (Test-Path $pidFile)) {
        return $false
    }

    $rawPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (-not $rawPid) {
        return $false
    }

    $process = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
    return $null -ne $process
}

function Start-ManagedProcess($Name, $WorkingDirectory, $Command) {
    if (Test-ManagedProcess $Name) {
        Warn "$Name is already running"
        return
    }

    $pidFile = Get-PidFile $Name
    $logFile = Get-LogFile $Name
    $errFile = Join-Path $LogDir "$Name.err.log"
    $runner = (Get-Process -Id $PID).Path
    $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", $Command
    )

    $process = Start-Process `
        -FilePath $runner `
        -ArgumentList $arguments `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError $errFile `
        -PassThru `
        -WindowStyle Hidden

    $process.Id | Set-Content -Path $pidFile -Encoding ascii
    Start-Sleep -Seconds 2
    if ($process.HasExited) {
        Remove-Item $pidFile -ErrorAction SilentlyContinue
        Warn "$Name exited immediately. See logs:"
        Warn "  $logFile"
        Warn "  $errFile"
        Fail "$Name failed to start"
    }
    Ok "$Name started, pid=$($process.Id)"
}

function Stop-ManagedProcess($Name) {
    $pidFile = Get-PidFile $Name
    if (-not (Test-Path $pidFile)) {
        Warn "$Name is not recorded as running"
        return
    }

    $rawPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($rawPid) {
        $process = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $process.Id -Force
            Ok "$Name stopped, pid=$($process.Id)"
        } else {
            Warn "$Name pid file existed, but process was already stopped"
        }
    }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

function Test-HttpReady($Name, $Url) {
    for ($i = 1; $i -le 20; $i++) {
        try {
            Invoke-RestMethod -Uri $Url -TimeoutSec 2 | Out-Null
            Ok "$Name is reachable at $Url"
            return
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    Warn "$Name did not respond at $Url yet. Check logs under $LogDir"
}

function Invoke-CheckRuntime {
    Invoke-Step "Checking base tools" {
        Require-Command "python" "Install Python 3.12+ and make sure python is on PATH." | Out-Null
        Require-Command "cmake" "Install CMake and make sure cmake is on PATH." | Out-Null
        Require-Command "git" "Install Git and make sure git is on PATH." | Out-Null
        python --version
        cmake --version | Select-Object -First 1
        git --version
    }

    Invoke-Step "Creating Python virtual environment" {
        if (-not (Test-Path $VenvPython)) {
            python -m venv .venv
        }
        Ensure-File $VenvPython "Virtual environment creation failed."
    }

    Invoke-Step "Bootstrapping pip in virtual environment" {
        & $VenvPython -m ensurepip --upgrade --default-pip
        & $VenvPython -m pip --version
    }

    Invoke-Step "Installing backend dependencies" {
        & $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
    }

    Invoke-Step "Checking backend imports" {
        Push-Location $BackendDir
        try {
            $routeCount = & "..\.venv\Scripts\python.exe" -c "from app.api.router import api_router; print(len(api_router.routes))"
            Info "Backend route count: $routeCount"
        } finally {
            Pop-Location
        }
    }

    Invoke-Step "Installing project-local Node.js $NodeVersion" {
        if (-not (Test-Path $NodeExe)) {
            $url = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
            Info "Downloading $url"
            Invoke-WebRequest -Uri $url -OutFile $NodeZip
            Expand-Archive -Path $NodeZip -DestinationPath $ToolsDir -Force
        }
        Ensure-File $NodeExe "Node.js download or extraction failed."
        & $NodeExe --version
        & $NpmCmd --version
    }

    Invoke-Step "Installing frontend dependencies" {
        $env:PATH = "$NodeDir;$env:PATH"
        Push-Location $FrontendDir
        try {
            & $NpmCmd install
        } finally {
            Pop-Location
        }
    }

    if (-not $SkipFrontendBuild) {
        Invoke-Step "Building frontend" {
            $env:PATH = "$NodeDir;$env:PATH"
            Push-Location $FrontendDir
            try {
                & $NpmCmd run build
            } finally {
                Pop-Location
            }
        }
    } else {
        Warn "Skipping frontend build"
    }

    Invoke-Step "Writing backend .env" {
        Write-BackendEnv
        Get-Content (Join-Path $BackendDir ".env")
    }

    if (-not $SkipSolverBuild) {
        Invoke-Step "Configuring C++ solver with Visual Studio 2022" {
            Push-Location $SolverDir
            try {
                cmake -S . -B build-vs -G "Visual Studio 17 2022" -A x64
            } finally {
                Pop-Location
            }
        }

        Invoke-Step "Building C++ solver" {
            Push-Location $SolverDir
            try {
                cmake --build build-vs --config Release
            } finally {
                Pop-Location
            }
            Ensure-File $SolverExe "Solver build failed."
        }

        Invoke-Step "Smoke testing C++ solver health endpoint" {
            $env:GNSS_SOLVER_PORT = "$SolverPort"
            $process = Start-Process -FilePath $SolverExe -PassThru -WindowStyle Hidden
            Start-Sleep -Seconds 2
            try {
                $health = Invoke-RestMethod -Uri "http://127.0.0.1:$SolverPort/solver/v1/health" -TimeoutSec 5
                $health | ConvertTo-Json -Compress
            } finally {
                if ($process -and -not $process.HasExited) {
                    Stop-Process -Id $process.Id -Force
                }
            }
        }
    } else {
        Warn "Skipping solver build"
    }

    Ok "Runtime check completed"
}

function Start-Services {
    Ensure-File $VenvPython "Run this script and choose '编译运行环境检查' first."
    Ensure-File $NodeExe "Run this script and choose '编译运行环境检查' first."
    Ensure-File $NpmCmd "Run this script and choose '编译运行环境检查' first."
    Ensure-File $SolverExe "Run this script and choose '编译运行环境检查' first."
    Write-BackendEnv

    Invoke-Step "Starting solver service" {
        $command = "`$env:GNSS_SOLVER_PORT='$SolverPort'; & '$SolverExe'"
        Start-ManagedProcess "solver" $Root $command
        Test-HttpReady "solver" "http://127.0.0.1:$SolverPort/solver/v1/health"
    }

    Invoke-Step "Starting backend service" {
        $command = "& '$VenvPython' -m uvicorn app.main:app --host 127.0.0.1 --port $BackendPort --reload"
        Start-ManagedProcess "backend" $BackendDir $command
        Test-HttpReady "backend" "http://127.0.0.1:$BackendPort/api/v1/system/health"
    }

    Invoke-Step "Starting frontend service" {
        $command = "`$env:PATH='$NodeDir;' + `$env:PATH; & '$NpmCmd' run dev -- --host 127.0.0.1 --port $FrontendPort"
        Start-ManagedProcess "frontend" $FrontendDir $command
        Test-HttpReady "frontend" "http://127.0.0.1:$FrontendPort/"
    }

    Ok "Services started"
    Write-Host ""
    Write-Host "Frontend: http://127.0.0.1:$FrontendPort" -ForegroundColor Cyan
    Write-Host "Backend:  http://127.0.0.1:$BackendPort" -ForegroundColor Cyan
    Write-Host "Solver:   http://127.0.0.1:$SolverPort/solver/v1/health" -ForegroundColor Cyan
    Write-Host "Logs:     $LogDir" -ForegroundColor Cyan
}

function Stop-Services {
    Invoke-Step "Stopping services" {
        Stop-ManagedProcess "frontend"
        Stop-ManagedProcess "backend"
        Stop-ManagedProcess "solver"
    }
    Ok "Services stopped"
}

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptPath
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$SolverDir = Join-Path $Root "solver"
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$TmpDir = Join-Path $Root ".tmp"
$LogDir = Join-Path $TmpDir "logs"
$PidDir = Join-Path $TmpDir "pids"
$ToolsDir = Join-Path $Root ".tools"
$NodeDir = Join-Path $ToolsDir "node-$NodeVersion-win-x64"
$NodeZip = Join-Path $ToolsDir "node-$NodeVersion-win-x64.zip"
$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
$SolverExe = Join-Path $SolverDir "build-vs\Release\gnss_solver_service.exe"

Set-Location $Root
New-Item -ItemType Directory -Force $TmpDir, $LogDir, $PidDir, $ToolsDir | Out-Null
$env:TEMP = $TmpDir
$env:TMP = $TmpDir

if (-not $Action) {
    $Action = Select-Action
}

switch ($Action) {
    "check" { Invoke-CheckRuntime }
    "start" { Start-Services }
    "stop" { Stop-Services }
}
