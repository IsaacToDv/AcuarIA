@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto missing
where npm >nul 2>&1
if errorlevel 1 goto missing
node scripts\check-node.cjs
if errorlevel 1 goto failed

echo.
echo Instalando dependencias; se necesita conexion a Internet...
call npm ci
if errorlevel 1 goto failed

echo.
echo Iniciando acuarIA. Manten esta ventana abierta; para salir pulsa Ctrl+C.
call npm run dev -- --open
if errorlevel 1 goto failed
exit /b 0

:missing
echo Falta Node.js o npm. Instala Node.js LTS desde https://nodejs.org/ y vuelve a ejecutar este archivo.
:failed
echo.
echo No se pudo iniciar acuarIA. Revisa el mensaje anterior.
pause
exit /b 1
