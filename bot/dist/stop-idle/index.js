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

// lambda/stop-idle.ts
var stop_idle_exports = {};
__export(stop_idle_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(stop_idle_exports);
var import_client_ecs = require("@aws-sdk/client-ecs");
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_util_dynamodb = require("@aws-sdk/util-dynamodb");
var import_client_ssm = require("@aws-sdk/client-ssm");
var ecs = new import_client_ecs.ECSClient({});
var dynamo = new import_client_dynamodb.DynamoDBClient({});
var ssm = new import_client_ssm.SSMClient({});
var CLUSTER = process.env.ECS_CLUSTER_NAME;
var SERVICE = process.env.ECS_SERVICE_NAME;
var TABLE = process.env.DYNAMODB_TABLE;
var IDLE_TIMEOUT_MINUTES = parseInt(process.env.IDLE_TIMEOUT_MINUTES ?? "150", 10);
var cachedBotToken;
async function getBotToken() {
  if (cachedBotToken) return cachedBotToken;
  const { Parameter } = await ssm.send(
    new import_client_ssm.GetParameterCommand({ Name: "/death-tank-bot/discord-bot-token", WithDecryption: true })
  );
  cachedBotToken = Parameter.Value;
  return cachedBotToken;
}
async function postToChannel(channelId, content) {
  const token = await getBotToken();
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${token}`
    },
    body: JSON.stringify({ content })
  });
  if (!res.ok) {
    console.error(`Discord post failed: ${res.status} ${await res.text()}`);
  }
}
var handler = async () => {
  const { Items = [] } = await dynamo.send(new import_client_dynamodb.ScanCommand({ TableName: TABLE }));
  const cutoff = Date.now() - IDLE_TIMEOUT_MINUTES * 6e4;
  for (const raw of Items) {
    const item = (0, import_util_dynamodb.unmarshall)(raw);
    const startedAt = new Date(item.startedAt).getTime();
    if (startedAt > cutoff) continue;
    console.log(`Auto-stopping idle server: ${item.serverId} (started ${item.startedAt})`);
    await ecs.send(new import_client_ecs.UpdateServiceCommand({ cluster: CLUSTER, service: SERVICE, desiredCount: 0 })).catch((e) => console.error("UpdateService failed:", e));
    if (item.taskArn) {
      await ecs.send(
        new import_client_ecs.StopTaskCommand({
          cluster: CLUSTER,
          task: item.taskArn,
          reason: "Auto-stopped: idle timeout"
        })
      ).catch(() => {
      });
    }
    await dynamo.send(
      new import_client_dynamodb.DeleteItemCommand({
        TableName: TABLE,
        Key: { serverId: { S: item.serverId } }
      })
    );
    await postToChannel(
      item.channelId,
      `Server auto-stopped after ${IDLE_TIMEOUT_MINUTES} minutes. Hope you had fun! \u{1F4A4}`
    );
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
