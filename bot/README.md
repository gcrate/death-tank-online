# Death Tank Bot

Discord slash command bot that manages the Death Tank game server on AWS ECS Fargate.

## Commands

| Command | Action |
|---|---|
| `/start` | Spin up the ECS game server, post IP when ready |
| `/stop` | Stop the running server immediately |
| `/status` | Show IP, uptime, and who started the server |
| `/help` | List commands |

## Setup

### 1. Create a Discord Application

1. Go to https://discord.com/developers/applications → **New Application**
2. Under **Bot**, copy the bot token
3. Under **OAuth2**, add the bot to your server with the `applications.commands` scope

### 2. Install dependencies and build

```bash
cd bot
npm install
npm run build        # outputs dist/{interactions,start-server,stop-idle}/index.js
```

### 3. Deploy infrastructure

```bash
cd bot/infra
terraform init
terraform apply -var="discord_application_id=YOUR_APP_ID"
```

Note the `api_gateway_url` output. Terraform creates placeholder SSM parameters for the Discord secrets — overwrite them with real values next.

### 4. Set secrets in SSM Parameter Store

```bash
aws ssm put-parameter \
  --name /death-tank-bot/discord-bot-token \
  --value "YOUR_BOT_TOKEN" \
  --type SecureString --overwrite

aws ssm put-parameter \
  --name /death-tank-bot/discord-public-key \
  --value "YOUR_PUBLIC_KEY" \
  --type SecureString --overwrite
```

The public key is in **General Information** on the Discord Developer Portal.

### 5. Register slash commands

```bash
cd bot
DISCORD_APPLICATION_ID=xxx DISCORD_BOT_TOKEN=xxx npm run register
```

### 6. Set the interactions endpoint

In the Discord Developer Portal → **General Information** → **Interactions Endpoint URL**, paste the `api_gateway_url` from step 4.

Discord will send a PING to verify the endpoint. Once verified, the bot is live.

## Architecture

```
Discord → API Gateway ($default) → interactions Lambda (sync, <3 s)
                                         |
                              /start: async invoke
                                         ↓
                               start-server Lambda (polls ECS up to 3 min)
                                         ↓
                              DynamoDB game-servers table
                                         ↓
                               Discord follow-up message

EventBridge (every 15 min) → stop-idle Lambda → ECS stop + DynamoDB cleanup
```

## Infra reference

The `bot/infra/` Terraform reads the existing `infra/terraform.tfstate` via
`terraform_remote_state` to get the ECS cluster and service names. It looks
up the VPC subnet and security group by their `Name` tags (`death-tank-public`,
`death-tank-task`). The existing `infra/` is not modified.

## Re-deploying after code changes

```bash
cd bot && npm run build
cd bot/infra && terraform apply -var="discord_application_id=YOUR_APP_ID"
```
