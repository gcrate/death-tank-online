# Discord Game Server Bot — Build Spec

> On-demand multiplayer game server manager via Discord slash commands.
> Built specifically for **death-tank-online** but designed to be reusable for any ECS-hosted game.

---

## Overview

A Discord bot that lets members of a private Discord server spin up and tear down game servers on AWS ECS Fargate via slash commands. No web UI required — Discord handles auth (server membership = permission), and the bot posts server IPs back to the channel when ready.

The bot itself runs as AWS Lambda functions triggered by Discord's HTTP interaction webhook — no persistent bot process, no extra hosting costs.

---

## Repository Structure

This bot lives in a new top-level directory within the `death-tank-online` repo:

```
death-tank-online/
├── client/
├── server/
├── shared/
├── infra/                  # existing ECS/ECR/VPC Terraform (already built)
└── bot/
    ├── lambda/             # Lambda function handlers (TypeScript)
    │   ├── interactions.ts # Discord interaction endpoint (all slash commands)
    │   ├── start-server.ts # Async worker: spins up ECS task, polls for IP, notifies channel
    │   └── stop-idle.ts    # Scheduled: auto-stop servers idle > N minutes
    ├── infra/              # Terraform for bot-specific AWS resources
    │   ├── main.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── scripts/
    │   └── register-commands.ts   # One-time Discord slash command registration
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

---

## AWS Architecture

```
Discord → API Gateway (HTTP) → interactions Lambda
                                    ↓
                              DynamoDB (server state)
                                    ↓
                          ECS Fargate (game server task)
                                    ↓
                         Discord REST API (post IP back to channel)

EventBridge (schedule) → stop-idle Lambda → ECS stop + DynamoDB cleanup
```

### AWS Resources (managed by `bot/infra/`)

| Resource | Purpose |
|---|---|
| API Gateway HTTP API | Receives Discord interaction webhooks |
| Lambda: `interactions` | Handles slash commands, returns immediate Discord response |
| Lambda: `start-server` | Async worker invoked by interactions Lambda — starts ECS, polls for public IP, posts to Discord |
| Lambda: `stop-idle` | EventBridge scheduled rule, runs every 15 min, stops tasks idle > threshold |
| DynamoDB table: `game-servers` | Tracks running servers (task ARN, IP, started by, channel ID, last activity) |
| IAM roles | Lambda → ECS, DynamoDB, EC2 (describe network interfaces) |

The existing `infra/` Terraform (VPC, ECR, ECS cluster/service) is **not modified**. The bot `infra/` references it via Terraform remote state or data sources.

---

## Discord Slash Commands

### `/start`
Spins up a game server.

**Behavior:**
1. interactions Lambda immediately responds to Discord: `"Starting server... ⏳"`
2. Invokes `start-server` Lambda asynchronously (async invoke, not waiting)
3. `start-server` Lambda:
   - Checks DynamoDB — if a server is already running, post its IP instead of starting another
   - Calls ECS `run_task` (or sets desired count to 1 on the service)
   - Polls every 5 seconds (up to 3 minutes) for the task to reach RUNNING state and have a public IP
   - Writes entry to DynamoDB: `{ taskArn, ip, startedBy: username, channelId, startedAt, lastActivity }`
   - Posts follow-up message to Discord channel via REST: `"Server is up! Join at: 54.23.x.x:PORT 🎮"`
4. If timeout exceeded, posts error message to channel

**Options:** None required. Optionally `/start private` to skip posting IP publicly (DMs the requester instead).

---

### `/stop`
Stops the running game server.

**Behavior:**
1. Looks up running server in DynamoDB
2. If none running: `"No server is currently running."`
3. Stops ECS task (sets desired count to 0 or calls `stop_task`)
4. Deletes DynamoDB entry
5. Posts: `"Server stopped. 🛑 Thanks for playing!"`

**Permission:** Any Discord server member can stop (it's a trusted friend group).

---

### `/status`
Lists currently running servers.

**Behavior:**
- Queries DynamoDB for active entries
- If none: `"No servers running. Use /start to spin one up."`
- If running: Posts embed with IP, who started it, how long it's been running

Example response:
```
🟢 Server running
   IP: 54.23.x.x:3001
   Started by: Graham
   Running for: 23 minutes
   Join: http://54.23.x.x:3000
```

---

### `/help`
Posts a brief description of available commands.

---

## DynamoDB Schema

Table name: `game-servers` (configurable)  
Partition key: `serverId` (string, use game name + region e.g. `death-tank-us-east-1`)

```json
{
  "serverId": "death-tank-us-east-1",
  "taskArn": "arn:aws:ecs:...",
  "ip": "54.23.x.x",
  "port": 3001,
  "startedBy": "Graham",
  "channelId": "123456789",
  "startedAt": "2026-02-25T14:00:00Z",
  
}
```

---

## Auto-Stop (Idle Shutdown)

EventBridge rule triggers `stop-idle` Lambda every 15 minutes.

**Logic:**
- Scan DynamoDB for entries where `startedAt` is older than `IDLE_TIMEOUT_MINUTES` (default: 150 — 2.5 hours)
- For each: stop ECS task, delete DynamoDB entry, post to `channelId`: `"Server auto-stopped after 2.5 hours. Hope you had fun! 💤"`

No activity tracking — timeout is based on time since `/start` was called. Players are expected to `/stop` when done; auto-stop is just a safety net for forgotten servers.

---

## Configuration

All config via Lambda environment variables (set in Terraform):

| Variable | Description |
|---|---|
| `DISCORD_APPLICATION_ID` | Discord app ID |
| `DISCORD_PUBLIC_KEY` | For verifying webhook signatures |
| `DISCORD_BOT_TOKEN` | For posting follow-up messages |
| `ECS_CLUSTER_ARN` | Target ECS cluster |
| `ECS_SERVICE_NAME` | ECS service to scale (for desired count approach) |
| `ECS_TASK_DEFINITION` | Task definition ARN (for run_task approach) |
| `ECS_SUBNET_IDS` | Comma-separated subnet IDs for task networking |
| `ECS_SECURITY_GROUP_ID` | Security group for game server tasks |
| `GAME_PORT` | Port players connect to via browser (e.g. `3000` — nginx client) |
| `DYNAMODB_TABLE` | DynamoDB table name |
| `IDLE_TIMEOUT_MINUTES` | Auto-stop after this many minutes since start (default: `150` — 2.5 hours) |
| `AWS_REGION` | AWS region |

These values should be sourced from the existing `infra/` Terraform outputs where possible.

---

## ECS Task Start Strategy

Two options — implement the **scale service** approach as default since the existing infra uses it:

**Option A — Scale service (preferred, matches existing `start.sh`):**
```
aws ecs update-service --cluster X --service Y --desired-count 1
```
Poll `describe_tasks` until task is RUNNING and has a network interface with a public IP.

**Option B — Run task:**
```
aws ecs run_task --cluster X --task-definition Y --network-configuration ...
```
Useful if you want multiple simultaneous servers in future.

---

## Getting the Public IP

After ECS task reaches RUNNING state:
1. Call `ecs.describe_tasks` to get the task's ENI (Elastic Network Interface) attachment
2. Extract the `networkInterfaceId`
3. Call `ec2.describe_network_interfaces` with that ID
4. Extract `Association.PublicIp`

Lambda needs `ec2:DescribeNetworkInterfaces` IAM permission.

---

## Discord Webhook Verification

Discord requires verifying the `X-Signature-Ed25519` and `X-Signature-Timestamp` headers on every interaction using the app's public key. Use the `tweetnacl` npm package for Ed25519 verification. This must happen in the interactions Lambda before processing any command — Discord will send verification pings and will disable the endpoint if verification fails.

---

## Lambda: `interactions.ts` — Key Logic

```
1. Verify Discord signature — return 401 if invalid
2. If type === PING (1) — return { type: 1 } (pong)
3. If type === APPLICATION_COMMAND (2):
   a. Parse command name
   b. /status, /stop, /help — handle synchronously, return response immediately
   c. /start — invoke start-server Lambda async, return deferred response ({ type: 5 })
4. Return appropriate InteractionResponse
```

---

## Lambda: `start-server.ts` — Key Logic

```
1. Check DynamoDB for existing running server
   - If found: post follow-up to Discord with existing IP, exit
2. Update ECS service desired count to 1
3. Poll loop (max 36 iterations × 5s = 3 min):
   a. describe_tasks for the service
   b. If task RUNNING + has ENI → get public IP via describe_network_interfaces
   c. Break on success
4. On success:
   a. Write to DynamoDB
   b. POST to Discord follow-up URL with server IP and join link
5. On timeout:
   a. POST to Discord follow-up URL with error message
```

---

## Terraform (`bot/infra/`)

Should create:
- API Gateway HTTP API with `$default` route → interactions Lambda
- Lambda functions (interactions, start-server, stop-idle) with appropriate IAM roles
- DynamoDB table
- EventBridge scheduled rule for stop-idle
- SSM Parameter Store entries for secrets (Discord tokens) — Lambda reads at runtime
- Outputs: API Gateway invoke URL (used for Discord webhook registration)

Reference existing infra outputs (local state):
```hcl
data "terraform_remote_state" "infra" {
  backend = "local"
  config = {
    path = "../infra/terraform.tfstate"
  }
}
```

---

## Setup & Deployment Steps

### 1. Create Discord Application
- Go to https://discord.com/developers/applications
- Create new application → Bot → copy token
- Enable "applications.commands" scope
- Add bot to your Discord server with that scope

### 2. Configure Secrets
```bash
# Store in SSM Parameter Store (Terraform can create these as placeholders)
aws ssm put-parameter --name /death-tank-bot/discord-bot-token --value "YOUR_TOKEN" --type SecureString
aws ssm put-parameter --name /death-tank-bot/discord-public-key --value "YOUR_KEY" --type SecureString
```

### 3. Deploy Infrastructure
```bash
cd bot/infra
terraform init
terraform apply
# Note the API Gateway URL in outputs
```

### 4. Register Slash Commands
```bash
cd bot
npm install
DISCORD_APPLICATION_ID=xxx DISCORD_BOT_TOKEN=xxx npx ts-node scripts/register-commands.ts
```

### 5. Set Discord Interaction Endpoint
- In Discord Developer Portal → your app → General Information
- Set "Interactions Endpoint URL" to the API Gateway URL from step 3

---

## Tech Stack

- **Runtime:** Node.js 20.x (TypeScript, compiled to JS for Lambda)
- **Discord signature verification:** `tweetnacl`
- **AWS SDK:** `@aws-sdk/client-ecs`, `@aws-sdk/client-ec2`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-lambda`
- **Build:** `esbuild` for bundling Lambda handlers
- **IaC:** Terraform

---

## Death Tank Specific Notes

- ECS cluster, service, and task definition names come from `infra/` Terraform outputs
- Players connect via browser to port `3000` (nginx serving the client)
- The client connects directly to the ECS task's public IP — no load balancer
- Subnets must be public subnets with `auto-assign public IP` enabled (already the case in existing infra)
- Security group must allow inbound TCP on game port from `0.0.0.0/0` (already the case)

---

## Future / Optional Enhancements

- `/start private` — DMs the IP instead of posting to channel
- Activity heartbeat from game server to extend idle timer when players are active
- Support multiple simultaneous servers (run_task instead of scale service)
- `/invite @user` — add someone to allowed list (stretch goal)
- Split into standalone reusable repo with death-tank as example implementation