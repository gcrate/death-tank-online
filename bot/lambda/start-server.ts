/**
 * start-server Lambda — async worker invoked by interactions Lambda.
 *
 * Scales the ECS service to desiredCount=1, polls until the task is RUNNING
 * with a public IP, writes the server record to DynamoDB, then posts a
 * follow-up message to Discord with the join URL.
 */
import {
  ECSClient,
  UpdateServiceCommand,
  ListTasksCommand,
  DescribeTasksCommand,
} from "@aws-sdk/client-ecs";
import {
  EC2Client,
  DescribeNetworkInterfacesCommand,
} from "@aws-sdk/client-ec2";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ecs = new ECSClient({});
const ec2 = new EC2Client({});
const dynamo = new DynamoDBClient({});
const ssm = new SSMClient({});

const CLUSTER = process.env.ECS_CLUSTER_NAME!;
const SERVICE = process.env.ECS_SERVICE_NAME!;
const TABLE = process.env.DYNAMODB_TABLE!;
const SERVER_ID = process.env.SERVER_ID!;
const GAME_PORT = process.env.GAME_PORT ?? "3000";

let cachedBotToken: string | undefined;

async function getBotToken(): Promise<string> {
  if (cachedBotToken) return cachedBotToken;
  const { Parameter } = await ssm.send(
    new GetParameterCommand({ Name: "/death-tank-bot/discord-bot-token", WithDecryption: true })
  );
  cachedBotToken = Parameter!.Value!;
  return cachedBotToken;
}

// Posts a follow-up message to the deferred interaction response.
// Discord allows editing the deferred response for 15 minutes after the interaction.
async function postFollowUp(
  applicationId: string,
  token: string,
  content: string
): Promise<void> {
  const botToken = await getBotToken();
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${token}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${botToken}`,
      },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) {
    console.error(`Discord follow-up failed: ${res.status} ${await res.text()}`);
  }
}

// Resolves the public IP of a running ECS task via its ENI attachment.
async function getPublicIp(taskArn: string): Promise<string | undefined> {
  const { tasks } = await ecs.send(
    new DescribeTasksCommand({ cluster: CLUSTER, tasks: [taskArn] })
  );
  const task = tasks?.[0];
  if (!task || task.lastStatus !== "RUNNING") return undefined;

  const eniAttachment = task.attachments?.find(
    (a) => a.type === "ElasticNetworkInterface"
  );
  const eniId = eniAttachment?.details?.find(
    (d) => d.name === "networkInterfaceId"
  )?.value;
  if (!eniId) return undefined;

  const { NetworkInterfaces } = await ec2.send(
    new DescribeNetworkInterfacesCommand({ NetworkInterfaceIds: [eniId] })
  );
  return NetworkInterfaces?.[0]?.Association?.PublicIp;
}

export const handler = async (event: {
  applicationId: string;
  interactionToken: string;
  channelId: string;
  startedBy: string;
}): Promise<void> => {
  const { applicationId, interactionToken, channelId, startedBy } = event;

  // Check whether a server is already running
  const { Item: existing } = await dynamo.send(
    new GetItemCommand({ TableName: TABLE, Key: { serverId: { S: SERVER_ID } } })
  );
  if (existing) {
    const item = unmarshall(existing);
    await postFollowUp(
      applicationId,
      interactionToken,
      `Server is already running! Join at: http://${item.ip}:${GAME_PORT} 🎮`
    );
    return;
  }

  // Scale service up
  await ecs.send(
    new UpdateServiceCommand({ cluster: CLUSTER, service: SERVICE, desiredCount: 1 })
  );

  // Poll until RUNNING + public IP, up to 3 minutes (36 × 5 s)
  const MAX_POLLS = 36;
  const POLL_MS = 5_000;
  let ip: string | undefined;
  let taskArn: string | undefined;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    const { taskArns } = await ecs.send(
      new ListTasksCommand({ cluster: CLUSTER, serviceName: SERVICE })
    );
    if (!taskArns || taskArns.length === 0) continue;

    taskArn = taskArns[0];
    ip = await getPublicIp(taskArn);
    if (ip) break;
  }

  if (!ip || !taskArn) {
    await postFollowUp(
      applicationId,
      interactionToken,
      "❌ Server failed to start within 3 minutes. Check ECS logs."
    );
    return;
  }

  // Persist server record
  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: marshall({
        serverId: SERVER_ID,
        taskArn,
        ip,
        port: parseInt(GAME_PORT, 10),
        startedBy,
        channelId,
        startedAt: new Date().toISOString(),
      }),
    })
  );

  await postFollowUp(
    applicationId,
    interactionToken,
    `Server is up! Join at: http://${ip}:${GAME_PORT} 🎮`
  );
};
