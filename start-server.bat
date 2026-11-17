@echo off
setlocal
cd /d "%~dp0"

set "DOTNET=%LOCALAPPDATA%\restaurant-ordering-tools\dotnet-sdk\dotnet.exe"
if not exist "%DOTNET%" set "DOTNET=dotnet"

"%DOTNET%" run --project "%~dp0RestaurantOrdering.csproj" --urls http://localhost:5080
if errorlevel 1 (
  echo.
  echo The server stopped because of an error.
  pause
)
