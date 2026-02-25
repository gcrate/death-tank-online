#!/usr/bin/env bash
# Sets the ECS service to desired_count=1, waits for the task to be running,
# then prints the public IP so you can open the game in a browser.
#
# Usage: ./start.sh

set -euo pipefail
cd "$(dirname "$0")"

REGION=$(terraform -chdir=infra output -raw aws_region)
CLUSTER=$(terraform -chdir=infra output -raw cluster_name)
SERVICE=$(terraform -chdir=infra output -raw service_name)

echo "Starting game server (cluster: $CLUSTER)..."
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --desired-count 1 \
  --force-new-deployment \
  --region "$REGION" \
  --output json > /dev/null

echo "Waiting for task to reach RUNNING state (~60s)..."
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION"

# Resolve the task's public IP via its attached ENI
TASK_ARN=$(aws ecs list-tasks \
  --cluster "$CLUSTER" \
  --service-name "$SERVICE" \
  --region "$REGION" \
  --query 'taskArns[0]' \
  --output text)

ENI_ID=$(aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --region "$REGION" \
  --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
  --output text)

PUBLIC_IP=$(aws ec2 describe-network-interfaces \
  --network-interface-ids "$ENI_ID" \
  --region "$REGION" \
  --query 'NetworkInterfaces[0].Association.PublicIp' \
  --output text)

echo ""
echo "========================================="
echo "  Game is live!"
echo "  http://$PUBLIC_IP"
echo "========================================="
echo ""
echo "Run ./stop.sh when done to avoid charges."
