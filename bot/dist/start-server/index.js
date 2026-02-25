"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lambda/start-server.ts
var start_server_exports = {};
__export(start_server_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(start_server_exports);
var import_client_ecs = require("@aws-sdk/client-ecs");
var import_client_ec2 = require("@aws-sdk/client-ec2");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_util_dynamodb = require("@aws-sdk/util-dynamodb");
var import_client_ssm = require("@aws-sdk/client-ssm");
var ecs = new import_client_ecs.ECSClient({});
var ec2 = new import_client_ec2.EC2Client({});
var dynamo = new import_client_dynamodb.DynamoDBClient({});
var ssm = new import_client_ssm.SSMClient({});
var CLUSTER = process.env.ECS_CLUSTER_NAME;
var SERVICE = process.env.ECS_SERVICE_NAME;
var TABLE = process.env.DYNAMODB_TABLE;
var SERVER_ID = process.env.SERVER_ID;
var GAME_PORT = process.env.GAME_PORT ?? "3000";
var cachedBotToken;
async function getBotToken() {
  if (cachedBotToken) return cachedBotToken;
  const { Parameter } = await ssm.send(
    new import_client_ssm.GetParameterCommand({ Name: "/death-tank-bot/discord-bot-token", WithDecryption: true })
  );
  cachedBotToken = Parameter.Value;
  return cachedBotToken;
}
async function postFollowUp(applicationId, token, content) {
  const botToken = await getBotToken();
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${token}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${botToken}`
      },
      body: JSON.stringify({ content })
    }
  );
  if (!res.ok) {
    console.error(`Discord follow-up failed: ${res.status} ${await res.text()}`);
  }
}
async function getPublicIp(taskArn) {
  const { tasks } = await ecs.send(
    new import_client_ecs.DescribeTasksCommand({ cluster: CLUSTER, tasks: [taskArn] })
  );
  const task = tasks?.[0];
  if (!task || task.lastStatus !== "RUNNING") return void 0;
  const eniAttachment = task.attachments?.find(
    (a) => a.type === "ElasticNetworkInterface"
  );
  const eniId = eniAttachment?.details?.find(
    (d) => d.name === "networkInterfaceId"
  )?.value;
  if (!eniId) return void 0;
  const { NetworkInterfaces } = await ec2.send(
    new import_client_ec2.DescribeNetworkInterfacesCommand({ NetworkInterfaceIds: [eniId] })
  );
  return NetworkInterfaces?.[0]?.Association?.PublicIp;
}
var handler = async (event) => {
  const { applicationId, interactionToken, channelId, startedBy } = event;
  const { Item: existing } = await dynamo.send(
    new import_client_dynamodb.GetItemCommand({ TableName: TABLE, Key: { serverId: { S: SERVER_ID } } })
  );
  if (existing) {
    const item = (0, import_util_dynamodb.unmarshall)(existing);
    await postFollowUp(
      applicationId,
      interactionToken,
      `Server is already running! Join at: http://${item.ip}:${GAME_PORT} \u{1F3AE}`
    );
    return;
  }
  await ecs.send(
    new import_client_ecs.UpdateServiceCommand({ cluster: CLUSTER, service: SERVICE, desiredCount: 1 })
  );
  const MAX_POLLS = 36;
  const POLL_MS = 5e3;
  let ip;
  let taskArn;
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const { taskArns } = await ecs.send(
      new import_client_ecs.ListTasksCommand({ cluster: CLUSTER, serviceName: SERVICE })
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
      "\u274C Server failed to start within 3 minutes. Check ECS logs."
    );
    return;
  }
  await dynamo.send(
    new import_client_dynamodb.PutItemCommand({
      TableName: TABLE,
      Item: (0, import_util_dynamodb.marshall)({
        serverId: SERVER_ID,
        taskArn,
        ip,
        port: parseInt(GAME_PORT, 10),
        startedBy,
        channelId,
        startedAt: (/* @__PURE__ */ new Date()).toISOString()
      })
    })
  );
  await postFollowUp(
    applicationId,
    interactionToken,
    `Server is up! Join at: http://${ip}:${GAME_PORT} \u{1F3AE}`
  );
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
