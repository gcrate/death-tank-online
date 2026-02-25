@echo off
setlocal

cd /d "%~dp0"

echo Reading Terraform outputs...
pushd infra
for /f %%i in ('terraform output -raw aws_region') do set REGION=%%i
for /f %%i in ('terraform output -raw server_ecr_url') do set SERVER_REPO=%%i
for /f %%i in ('terraform output -raw client_ecr_url') do set CLIENT_REPO=%%i
popd

for /f %%i in ('aws sts get-caller-identity --query Account --output text') do set ACCOUNT_ID=%%i

echo Logging in to ECR (region: %REGION%)...
aws ecr get-login-password --region %REGION% | docker login --username AWS --password-stdin %ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com
if errorlevel 1 goto :error

echo.
echo Building server image...
docker build --platform linux/amd64 --provenance=false -f server/Dockerfile -t %SERVER_REPO%:latest .
if errorlevel 1 goto :error

echo.
echo Building client image...
docker build --platform linux/amd64 --provenance=false -f client/Dockerfile -t %CLIENT_REPO%:latest .
if errorlevel 1 goto :error

echo.
echo Pushing server image...
docker push %SERVER_REPO%:latest
if errorlevel 1 goto :error

echo.
echo Pushing client image...
docker push %CLIENT_REPO%:latest
if errorlevel 1 goto :error

echo.
echo Done. Images pushed to ECR.
echo Run start.bat to launch the game server.
goto :eof

:error
echo.
echo ERROR: A command failed. See output above.
exit /b 1
