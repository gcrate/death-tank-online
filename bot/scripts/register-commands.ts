/**
 * One-time script to register (or overwrite) Discord slash commands globally.
 *
 * Usage:
 *   DISCORD_APPLICATION_ID=xxx DISCORD_BOT_TOKEN=xxx npm run register
 */
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error("Error: DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must be set.");
  process.exit(1);
}

const commands = [
  {
    name: "start",
    description: "Spin up the Death Tank game server",
  },
  {
    name: "stop",
    description: "Stop the running game server",
  },
  {
    name: "status",
    description: "Check if the game server is running and show the IP",
  },
  {
    name: "help",
    description: "Show available bot commands",
  },
];

async function main(): Promise<void> {
  const url = `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;

  console.log(`Registering ${commands.length} commands for application ${APPLICATION_ID}...`);

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${BOT_TOKEN}`,
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed: ${res.status} ${text}`);
    process.exit(1);
  }

  const data = (await res.json()) as Array<{ name: string; id: string }>;
  console.log("Registered commands:");
  for (const cmd of data) {
    console.log(`  /${cmd.name}  (id: ${cmd.id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
