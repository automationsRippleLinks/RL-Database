@echo off
setlocal

rem Resolve the repo root from this script's own location, and strip the trailing backslash
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

rem Locate the virtualenv activate script
if exist "%ROOT%\.venv\Scripts\activate.bat" (
    set "VENV=%ROOT%\.venv\Scripts\activate.bat"
) else if exist "%ROOT%\venv\Scripts\activate.bat" (
    set "VENV=%ROOT%\venv\Scripts\activate.bat"
) else (
    echo [ERROR] No venv found at "%ROOT%\.venv" or "%ROOT%\venv".
    echo Edit VENV in this script if yours lives elsewhere.
    pause
    exit /b 1
)

set "NGROK=C:\ngrok\ngrok.exe"
if not exist "%NGROK%" (
    echo [ERROR] ngrok not found at "%NGROK%".
    pause
    exit /b 1
)

rem Public address of the app (your ngrok domain). Apify posts run results to
rem %PUBLIC_API_URL%/api/v1/apify/webhook, which Vite proxies to the backend.
rem Every window started below inherits this, and it overrides PUBLIC_API_URL in .env.
set "PUBLIC_API_URL=https://sneak-afternoon-palatable.ngrok-free.dev"

echo Starting ngrok...
start "Ripple Pulse - ngrok" cmd /s /k ""%NGROK%" start app"

echo Starting backend...
start "Ripple Pulse - backend" cmd /s /k "call "%VENV%" && cd /d "%ROOT%\backend" && fastapi run"

@REM  echo Starting worker...
@REM  start "Ripple Pulse - worker" cmd /s /k "call "%VENV%" && cd /d "%ROOT%\backend" && taskiq worker app.worker:broker --workers 2"

rem scheduler not needed for local deployment
@REM  echo Starting scheduler...
@REM  start "Ripple Pulse - scheduler" cmd /s /k "call "%VENV%" && cd /d "%ROOT%\backend" && taskiq scheduler app.worker:scheduler"

rem Give the backend a moment to bind its port before the frontend proxies to it
timeout /t 3 /nobreak >nul

echo Starting frontend...
start "Ripple Pulse - frontend" cmd /s /k "cd /d "%ROOT%\frontend" && npm run dev"

echo.
echo Five windows launched. Close a window to stop that service.
echo Apify webhook: %PUBLIC_API_URL%/api/v1/apify/webhook
endlocal