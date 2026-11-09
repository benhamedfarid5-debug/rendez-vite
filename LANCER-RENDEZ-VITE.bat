@echo off
chcp 65001 >nul
title Rendez-Vite
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe sur cet ordinateur.
  echo  Installe la version "LTS" depuis le site qui va s'ouvrir, puis relance ce fichier.
  echo.
  start https://nodejs.org/fr
  pause
  exit /b
)

if not exist node_modules\pdfkit (
  echo  Premiere fois : installation en cours, 2 a 3 minutes...
  call npm install --no-audit --no-fund
)
if not exist .env copy .env.example .env >nul
if not exist data\mawid.db call npm run db:reset
if not exist dist\index.html call npm run build

echo.
echo  ==============================================
echo   Rendez-Vite est lance :  http://localhost:4000
echo   Connexion cabinet : dentiste@demo.dz
echo   Mot de passe      : Demo2026!dent
echo   NE FERME PAS cette fenetre pendant le test.
echo  ==============================================
echo.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:4000"
call npm start
pause
