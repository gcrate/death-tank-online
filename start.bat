@echo off
setlocal

cd /d "%~dp0"

echo Reading Terraform outputs...
pushd infra
for /f %%i in ('terraform output -raw aws_region') do set REGION=%%i
for /f %%i in ('terraform output -raw cluster_name') do set CLUSTER=%%i
for /f %%i in ('terraform output -raw service_name') do set SERVICE=%%i
popd

echo Starting game server (cluster: %CLUSTER%)...
aws ecs update-service --cluster %CLUSTER% --service %SERVICE% --desired-count 1 --force-new-deployment --region %REGION% --output json > nul
if errorlevel 1 goto :error

echo Waiting for task to reach RUNNING state (~60s)...
aws ecs wait services-stable --cluster %CLUSTER% --services %SERVICE% --region %REGION%
if errorlevel 1 goto :error

echo Resolving public IP...

for /f %%i in ('aws ecs list-tasks --cluster %CLUSTER% --service-name %SERVICE% --region %REGION% --query "taskArns[0]" --output text') do set TASK_ARN=%%i

rem AWS CLI --output text uses tabs between columns. The networkInterfaceId row looks like:
rem   DETAILS<tab>networkInterfaceId<tab>eni-xxx
rem for /f "tokens=3" picks the third tab-separated token (the ENI ID).
for /f "tokens=3" %%i in ('aws ecs describe-tasks --cluster %CLUSTER% --tasks %TASK_ARN% --region %REGION% --output text ^| findstr "networkInterfaceId"') do set ENI_ID=%%i

for /f %%i in ('aws ec2 describe-network-interfaces --network-interface-ids %ENI_ID% --region %REGION% --output text --query "NetworkInterfaces[0].Association.PublicIp"') do set PUBLIC_IP=%%i

echo.
echo =========================================
echo   Game is live!
echo   http://%PUBLIC_IP%
echo =========================================
echo.
echo Run stop.bat when done to avoid charges.
goto :eof

:error
echo.
echo ERROR: A command failed. See output above.
exit /b 1
