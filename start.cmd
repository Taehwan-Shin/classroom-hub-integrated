@echo off
setlocal
where node >nul 2>nul
if not errorlevel 1 (
  node "%~dp0scripts\serve.mjs"
) else if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "%~dp0scripts\serve.mjs"
) else (
  echo Node.js is required. Install Node.js and try again.
  pause
)
