@echo off
chcp 65001 >nul
title CRM de prospeccao
rem Roda a partir da pasta deste arquivo, onde quer que ele esteja.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao esta instalado.
  echo  Baixe a versao LTS em https://nodejs.org, instale e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)

echo.
echo  CRM de prospeccao rodando em http://localhost:3000
echo  Deixe esta janela aberta enquanto usar. Para fechar o CRM, feche esta janela.
echo.
start "" http://localhost:3000
node --no-warnings server.js
echo.
echo  O CRM parou. Veja a mensagem acima.
pause
