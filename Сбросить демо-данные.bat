@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Класна — сброс данных
echo ВНИМАНИЕ: все данные в data\klasna.db (оценки, регистрации, квизы) будут удалены
echo и заменены демо-данными на сегодняшнюю дату. Сервер перед этим нужно остановить.
choice /c YN /m "Продолжить (Y - да, N - нет)"
if errorlevel 2 exit /b
call npm run seed
pause
