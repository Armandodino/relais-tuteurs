@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Installez Node.js 24 ou plus recent, puis relancez ce fichier.
 pause
 exit /b 1
)
echo Ouvrez http://127.0.0.1:4173 dans votre navigateur.
echo Laissez cette fenetre ouverte pendant l'utilisation.
node local-server.mjs
pause
