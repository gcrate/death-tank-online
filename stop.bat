@echo off
setlocal

cd /d "%~dp0"

pushd infra
for /f %%i in ('terraform output -raw aws_region') do set REGION=%%i
for /f %%i in ('terraform output -raw cluster_name') do set CLUSTER=%%i
for /f %%i in ('terraform output -raw service_name') do set SERVICE=%%i
popd

aws ecs update-service --cluster %CLUSTER% --service %SERVICE% --desired-count 0 --region %REGION% --output json > nul
if errorlevel 1 goto :error

echo Game server stopped. Fargate charges have stopped.
goto :eof

:error
echo.
echo ERROR: A command failed. See output above.
exit /b 1
