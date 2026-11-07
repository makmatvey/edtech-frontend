@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Класна
if not exist node_modules (
  echo Устанавливаю зависимости...
  call npm install
)
echo Данные хранятся в папке data (база создаётся сама при первом запуске).
echo Сбросить к демо-данным: «Сбросить демо-данные.bat».
echo.
echo Открываю http://localhost:5173  (вход: teacher / demo или student / demo)
start "" http://localhost:5173
call npm run dev
