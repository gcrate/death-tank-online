terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
  required_version = ">= 1.5"
}

provider "aws" {
  region = var.aws_region
}

# ── Remote state: pull cluster_name and service_name from existing infra ──────

data "terraform_remote_state" "infra" {
  backend = "local"
  config = {
    path = "../../infra/terraform.tfstate"
  }
}

# ── Data sources for resources not exposed in infra outputs ───────────────────

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Look up the subnet and security group by the Name tags set in infra/main.tf
data "aws_subnet" "public" {
  tags = { Name = "${var.app_name}-public" }
}

data "aws_security_group" "task" {
  tags = { Name = "${var.app_name}-task" }
}

data "aws_ecs_cluster" "main" {
  cluster_name = data.terraform_remote_state.infra.outputs.cluster_name
}

locals {
  cluster_name = data.terraform_remote_state.infra.outputs.cluster_name
  service_name = data.terraform_remote_state.infra.outputs.service_name
  region       = data.aws_region.current.name
  account_id   = data.aws_caller_identity.current.account_id
  # Stable key used as DynamoDB partition key — one record per region
  server_id = "${var.app_name}-${data.aws_region.current.name}"
}

# ── DynamoDB table ────────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "game_servers" {
  name         = "${var.app_name}-servers"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "serverId"

  attribute {
    name = "serverId"
    type = "S"
  }

  tags = { Name = "${var.app_name}-servers" }
}

# ── SSM parameters (placeholder values — set real values manually after apply) -

resource "aws_ssm_parameter" "discord_bot_token" {
  name  = "/death-tank-bot/discord-bot-token"
  type  = "SecureString"
  value = "PLACEHOLDER"
  lifecycle { ignore_changes = [value] }
}

# ── IAM ───────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "bot_lambda" {
  name               = "${var.app_name}-bot-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "basic_execution" {
  role       = aws_iam_role.bot_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "bot_permissions" {
  # DynamoDB — game-servers table only
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Scan"]
    resources = [aws_dynamodb_table.game_servers.arn]
  }

  # ECS — start, stop, describe tasks; scale service
  statement {
    effect    = "Allow"
    actions   = ["ecs:UpdateService", "ecs:ListTasks", "ecs:DescribeTasks", "ecs:StopTask"]
    resources = ["*"]
    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [data.aws_ecs_cluster.main.arn]
    }
  }

  # EC2 — required to resolve public IP from ENI attachment
  statement {
    effect    = "Allow"
    actions   = ["ec2:DescribeNetworkInterfaces"]
    resources = ["*"]
  }

  # SSM — Discord bot token only
  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.discord_bot_token.arn]
  }

  # Lambda — interactions invokes start-server asynchronously
  statement {
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.start_server.arn]
  }
}

resource "aws_iam_role_policy" "bot_permissions" {
  name   = "${var.app_name}-bot-permissions"
  role   = aws_iam_role.bot_lambda.id
  policy = data.aws_iam_policy_document.bot_permissions.json
}

# ── Lambda bundles ────────────────────────────────────────────────────────────
# Run `npm run build` in bot/ before terraform apply to generate these files.

data "archive_file" "interactions" {
  type        = "zip"
  source_file = "${path.module}/../dist/interactions/index.js"
  output_path = "${path.module}/../dist/interactions.zip"
}

data "archive_file" "start_server" {
  type        = "zip"
  source_file = "${path.module}/../dist/start-server/index.js"
  output_path = "${path.module}/../dist/start-server.zip"
}

data "archive_file" "stop_idle" {
  type        = "zip"
  source_file = "${path.module}/../dist/stop-idle/index.js"
  output_path = "${path.module}/../dist/stop-idle.zip"
}

# ── Lambda: interactions ──────────────────────────────────────────────────────

resource "aws_lambda_function" "interactions" {
  function_name    = "${var.app_name}-bot-interactions"
  role             = aws_iam_role.bot_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.interactions.output_path
  source_code_hash = data.archive_file.interactions.output_base64sha256
  timeout          = 10
  memory_size      = 512

  environment {
    variables = {
      DISCORD_APPLICATION_ID   = var.discord_application_id
      DISCORD_PUBLIC_KEY       = var.discord_public_key
      DYNAMODB_TABLE           = aws_dynamodb_table.game_servers.name
      SERVER_ID                = local.server_id
      ECS_CLUSTER_NAME         = local.cluster_name
      ECS_SERVICE_NAME         = local.service_name
      GAME_PORT                = tostring(var.game_port)
      START_SERVER_LAMBDA_NAME = aws_lambda_function.start_server.function_name
    }
  }
}

# ── Lambda: start-server ──────────────────────────────────────────────────────

resource "aws_lambda_function" "start_server" {
  function_name    = "${var.app_name}-bot-start-server"
  role             = aws_iam_role.bot_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.start_server.output_path
  source_code_hash = data.archive_file.start_server.output_base64sha256
  timeout          = 300 # polls up to 3 minutes
  memory_size      = 128

  environment {
    variables = {
      DISCORD_APPLICATION_ID = var.discord_application_id
      DYNAMODB_TABLE         = aws_dynamodb_table.game_servers.name
      SERVER_ID              = local.server_id
      ECS_CLUSTER_NAME       = local.cluster_name
      ECS_SERVICE_NAME       = local.service_name
      GAME_PORT              = tostring(var.game_port)
    }
  }
}

# ── Lambda: stop-idle ─────────────────────────────────────────────────────────

resource "aws_lambda_function" "stop_idle" {
  function_name    = "${var.app_name}-bot-stop-idle"
  role             = aws_iam_role.bot_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.stop_idle.output_path
  source_code_hash = data.archive_file.stop_idle.output_base64sha256
  timeout          = 60
  memory_size      = 128

  environment {
    variables = {
      DYNAMODB_TABLE       = aws_dynamodb_table.game_servers.name
      ECS_CLUSTER_NAME     = local.cluster_name
      ECS_SERVICE_NAME     = local.service_name
      IDLE_TIMEOUT_MINUTES = tostring(var.idle_timeout_minutes)
    }
  }
}

# ── API Gateway HTTP API ──────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "bot" {
  name          = "${var.app_name}-bot"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "interactions" {
  api_id                 = aws_apigatewayv2_api.bot.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.interactions.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.bot.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.interactions.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.bot.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.interactions.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot.execution_arn}/*/*"
}

# ── EventBridge: auto-stop idle servers every 15 minutes ─────────────────────

resource "aws_cloudwatch_event_rule" "stop_idle" {
  name                = "${var.app_name}-bot-stop-idle"
  description         = "Auto-stop idle Death Tank servers"
  schedule_expression = "rate(15 minutes)"
}

resource "aws_cloudwatch_event_target" "stop_idle" {
  rule      = aws_cloudwatch_event_rule.stop_idle.name
  target_id = "StopIdleLambda"
  arn       = aws_lambda_function.stop_idle.arn
}

resource "aws_lambda_permission" "eventbridge_stop_idle" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stop_idle.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.stop_idle.arn
}
