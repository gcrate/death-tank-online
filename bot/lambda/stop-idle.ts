/**
 * stop-idle Lambda — EventBridge scheduled rule, runs every 15 minutes.
 *
 * Scans DynamoDB for server records older than IDLE_TIMEOUT_MINUTES and
 * stops them. Posts a notification to the originating Discord channel.
 */
import {
  ECSClient,
  UpdateServiceCommand,
  StopTaskCommand,
} from "@aws-sdk/client-ecs";
import {
  DynamoDBClient,
  ScanCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ecs = new ECSClient({});
const dynamo = new DynamoDBClient({});
const ssm = new SSMClient({});

const CLUSTER = process.env.ECS_CLUSTER_NAME!;
const SERVICE = process.env.ECS_SERVICE_NAME!;
const TABLE = process.env.DYNAMODB_TABLE!;
const IDLE_TIMEOUT_MINUTES = parseInt(process.env.IDLE_TIMEOUT_MINUTES ?? "150", 10);

let cachedBotToken: string | undefined;

async function getBotToken(): Promise<string> {
  if (cachedBotToken) return cachedBotToken;
  const { Parameter } = await ssm.send(
    new GetParameterCommand({ Name: "/death-tank-bot/discord-bot-token", WithDecryption: true })
  );
  cachedBotToken = Parameter!.Value!;
  return cachedBotToken;
}

async function postToChannel(channelId: string, content: string): Promise<void> {
  const token = await getBotToken();
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    console.error(`Discord post failed: ${res.status} ${await res.text()}`);
  }
}

export const handler = async (): Promise<void> => {
  const { Items = [] } = await dynamo.send(new ScanCommand({ TableName: TABLE }));

  const cutoff = Date.now() - IDLE_TIMEOUT_MINUTES * 60_000;

  for (const raw of Items) {
    const item = unmarshall(raw);
    const startedAt = new Date(item.startedAt as string).getTime();
    if (startedAt > cutoff) continue;

    console.log(`Auto-stopping idle server: ${item.serverId} (started ${item.startedAt})`);

    // Scale service to 0
    await ecs
      .send(new UpdateServiceCommand({ cluster: CLUSTER, service: SERVICE, desiredCount: 0 }))
      .catch((e) => console.error("UpdateService failed:", e));

    // Explicitly stop the task for immediate effect
    if (item.taskArn) {
      await ecs
        .send(
          new StopTaskCommand({
            cluster: CLUSTER,
            task: item.taskArn as string,
            reason: "Auto-stopped: idle timeout",
          })
        )
        .catch(() => {}); // task may already be stopped
    }

    // Remove DynamoDB record
    await dynamo.send(
      new DeleteItemCommand({
        TableName: TABLE,
        Key: { serverId: { S: item.serverId as string } },
      })
    );

    // Notify Discord channel
    await postToChannel(
      item.channelId as string,
      `Server auto-stopped after ${IDLE_TIMEOUT_MINUTES} minutes. Hope you had fun! 💤`
    );
  }
};
