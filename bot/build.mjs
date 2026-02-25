// Bundles each Lambda handler into dist/<name>/index.js
// The bot/infra/ Terraform uses archive_file to zip these before deploying.
// Run: npm run build
import { build } from "esbuild";
import { mkdirSync } from "fs";

const handlers = ["interactions", "start-server", "stop-idle"];

for (const name of handlers) {
  mkdirSync(`dist/${name}`, { recursive: true });

  await build({
    entryPoints: [`lambda/${name}.ts`],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: `dist/${name}/index.js`,
    // Externalize AWS SDK — provided by the Lambda Node 20 runtime
    external: ["@aws-sdk/*"],
  });

  console.log(`✓ dist/${name}/index.js`);
}

console.log("\nNext: cd bot/infra && terraform apply");
