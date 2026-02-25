#!/usr/bin/env bash
# Scales the ECS service to 0. No tasks = no Fargate charges.
#
# Usage: ./stop.sh

set -euo pipefail
cd "$(dirname "$0")"

REGION=$(terraform -chdir=infra output -raw aws_region)
CLUSTER=$(terraform -chdir=infra output -raw cluster_name)
SERVICE=$(terraform -chdir=infra output -raw service_name)

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --desired-count 0 \
  --region "$REGION" \
  --output json > /dev/null

echo "Game server stopped. Fargate charges have stopped."
