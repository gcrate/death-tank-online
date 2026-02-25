#!/usr/bin/env bash
# Builds Docker images for server and client, pushes them to ECR.
# Run this from the repo root after `terraform apply` in infra/.
#
# Usage: ./deploy.sh
#
# Prerequisites:
#   - Docker running
#   - AWS CLI configured (aws configure)
#   - Terraform applied (cd infra && terraform apply)

set -euo pipefail
cd "$(dirname "$0")"

echo "Reading Terraform outputs..."
REGION=$(terraform -chdir=infra output -raw aws_region)
SERVER_REPO=$(terraform -chdir=infra output -raw server_ecr_url)
CLIENT_REPO=$(terraform -chdir=infra output -raw client_ecr_url)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Logging in to ECR (region: $REGION)..."
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin \
      "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo ""
echo "Building server image..."
docker build --platform linux/amd64 --provenance=false -f server/Dockerfile -t "$SERVER_REPO:latest" .

echo ""
echo "Building client image..."
docker build --platform linux/amd64 --provenance=false -f client/Dockerfile -t "$CLIENT_REPO:latest" .

echo ""
echo "Pushing server image..."
docker push "$SERVER_REPO:latest"

echo ""
echo "Pushing client image..."
docker push "$CLIENT_REPO:latest"

echo ""
echo "Done. Images pushed to ECR."
echo "Run ./start.sh to launch the game server."
