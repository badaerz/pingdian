@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  评点 PINGDIAN
echo  把批注钉在原文上。钉不住的，它自己删掉。
echo.
echo  ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [!] 没有检测到 Node.js。
  echo.
  echo      请先安装 Node.js 20 或以上版本：https://nodejs.org
  echo      装完重新双击这个文件即可。
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo  Node.js %NODEV%

if exist node_modules goto BUILD

echo.
echo  第一次运行，正在安装依赖，大约 2-3 分钟...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  [!] 依赖安装失败。检查网络后重试。
  pause
  exit /b 1
)

:BUILD
if exist .next\BUILD_ID goto START

echo.
echo  正在构建，大约 1-2 分钟...
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo  [!] 构建失败。
  pause
  exit /b 1
)

:START
echo.
echo  ==========================================
echo   启动中：http://localhost:3000
echo.
echo   没有 API 密钥也能用——所有 AI 功能会显示
echo   标注清楚的「演」演示结果。想用真实调用，
echo   打开站点后到「设置」里填自己的 DeepSeek 密钥。
echo.
echo   关闭这个窗口即停止。
echo  ==========================================
echo.

start "" http://localhost:3000
call npm start
pause
