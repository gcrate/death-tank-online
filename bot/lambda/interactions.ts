/**
 * interactions Lambda — Discord HTTP interaction endpoint.
 *
 * Receives all slash command interactions from API Gateway, verifies the
 * Ed25519 signature, and either handles the command synchronously (/status,
 * /stop, /help) or defers to start-server Lambda asynchronously (/start).
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import nacl from "tweetnacl";
import {
  DynamoDBClient,
  GetItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { ECSClient, UpdateServiceCommand, StopTaskCommand } from "@aws-sdk/client-ecs";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

// Discord interaction/response type constants
const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;

const dynamo = new DynamoDBClient({});
const ecs = new ECSClient({});
const lambda = new LambdaClient({});
const TABLE = process.env.DYNAMODB_TABLE!;
const SERVER_ID = process.env.SERVER_ID!;
const CLUSTER = process.env.ECS_CLUSTER_NAME!;
const SERVICE = process.env.ECS_SERVICE_NAME!;
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID!;
const START_SERVER_LAMBDA = process.env.START_SERVER_LAMBDA_NAME!;
const GAME_PORT = process.env.GAME_PORT ?? "80";

// Public key is not sensitive — read directly from env to avoid SSM latency on cold starts
const PUBLIC_KEY = Buffer.from(process.env.DISCORD_PUBLIC_KEY!, "hex");

function ok(body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function reply(content: string): APIGatewayProxyResultV2 {
  return ok({ type: CHANNEL_MESSAGE, data: { content } });
}

// ── /status ───────────────────────────────────────────────────────────────────

async function handleStatus(): Promise<APIGatewayProxyResultV2> {
  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { serverId: { S: SERVER_ID } } })
  );
  if (!Item) {
    return reply("No servers running. Use `/start` to spin one up.");
  }
  const item = unmarshall(Item);
  const started = new Date(item.startedAt as string);
  const mins = Math.floor((Date.now() - started.getTime()) / 60_000);
  return reply(
    [
      "🟢 **Server running**",
      `   IP: \`${item.ip}:8080\``,
      `   Started by: ${item.startedBy}`,
      `   Running for: ${mins} minute${mins === 1 ? "" : "s"}`,
      `   Join: http://${item.ip}:${GAME_PORT}`,
    ].join("\n")
  );
}

// ── /stop ─────────────────────────────────────────────────────────────────────

async function handleStop(): Promise<APIGatewayProxyResultV2> {
  const { Item } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { serverId: { S: SERVER_ID } } })
  );
  if (!Item) {
    return reply("No server is currently running.");
  }
  const item = unmarshall(Item);

  // Scale service to 0 (non-blocking — ECS drains the task in the background)
  await ecs.send(
    new UpdateServiceCommand({ cluster: CLUSTER, service: SERVICE, desiredCount: 0 })
  );

  // Also send explicit stop to the task for faster shutdown
  if (item.taskArn) {
    await ecs
      .send(
        new StopTaskCommand({
          cluster: CLUSTER,
          task: item.taskArn as string,
          reason: "Stopped via Discord /stop",
        })
      )
      .catch(() => {}); // task may already be stopped
  }

  await dynamo.send(
    new DeleteItemCommand({ TableName: TABLE, Key: { serverId: { S: SERVER_ID } } })
  );

  return reply("Server stopped. 🛑 Thanks for playing!");
}

// ── /start ────────────────────────────────────────────────────────────────────

async function handleStart(interaction: {
  token: string;
  channel_id: string;
  member?: { user?: { username?: string } };
  user?: { username?: string };
}): Promise<APIGatewayProxyResultV2> {
  const startedBy =
    interaction.member?.user?.username ?? interaction.user?.username ?? "unknown";

  // Async invoke — interactions Lambda returns immediately with a deferred response
  await lambda.send(
    new InvokeCommand({
      FunctionName: START_SERVER_LAMBDA,
      InvocationType: "Event",
      Payload: Buffer.from(
        JSON.stringify({
          applicationId: APPLICATION_ID,
          interactionToken: interaction.token,
          channelId: interaction.channel_id,
          startedBy,
        })
      ),
    })
  );

  // Discord will show a loading state while start-server Lambda works
  return ok({ type: DEFERRED_CHANNEL_MESSAGE });
}

// ── /help ─────────────────────────────────────────────────────────────────────

function handleHelp(): APIGatewayProxyResultV2 {
  return reply(
    [
      "**Death Tank Bot**",
      "",
      "`/start`  — Spin up the game server",
      "`/stop`   — Stop the running server",
      "`/status` — Check server status and IP",
      "`/help`   — Show this message",
    ].join("\n")
  );
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const sig = event.headers["x-signature-ed25519"];
  const ts = event.headers["x-signature-timestamp"];
  const body = event.body ?? "";

  if (!sig || !ts) {
    return { statusCode: 401, body: "Missing signature headers" };
  }

  const valid = nacl.sign.detached.verify(
    Buffer.from(ts + body),
    Buffer.from(sig, "hex"),
    PUBLIC_KEY
  );
  if (!valid) {
    return { statusCode: 401, body: "Invalid request signature" };
  }

  const interaction = JSON.parse(body) as {
    type: number;
    token: string;
    channel_id: string;
    data?: { name: string };
    member?: { user?: { username?: string } };
    user?: { username?: string };
  };

  if (interaction.type === PING) {
    return ok({ type: PONG });
  }

  if (interaction.type === APPLICATION_COMMAND) {
    switch (interaction.data?.name) {
      case "start":  return handleStart(interaction);
      case "stop":   return handleStop();
      case "status": return handleStatus();
      case "help":   return handleHelp();
      default:
        return reply(`Unknown command: \`${interaction.data?.name}\``);
    }
  }

  return { statusCode: 400, body: "Unknown interaction type" };
};
