import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { viewDataSchema } from "../src/view-data.js";

const base = process.env.SERVER_URL ?? "http://localhost:3000";
const health = (await fetch(`${base}/health`).then((r) => r.json())) as {
  mode: string;
};
if (health.mode !== "fixture")
  throw new Error(
    "This repeatable demo only runs against fixture mode; it must never make paid calls.",
  );
const client = new Client({ name: "menulens-headless-demo", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
const metrics: {
  tool: string;
  durationMs: number;
  costUsd: number;
  status: string;
}[] = [];
async function call(name: string, args: Record<string, unknown>) {
  const start = performance.now(),
    result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`Tool ${name} failed`);
  const data = viewDataSchema.parse(result.structuredContent);
  metrics.push({
    tool: name,
    durationMs: Math.round(performance.now() - start),
    costUsd: data.costUsd ?? 0,
    status: data.status,
  });
  return data;
}
try {
  const tools = await client.listTools();
  if (tools.tools.length !== 5) throw new Error("Expected five focused tools.");
  const paired = await call("start_pairing", {}),
    pairing = paired.pairing!;
  const claim = await fetch(`${base}/api/pairing/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: pairing.pairingCode }),
  });
  if (!claim.ok) throw new Error("Device pairing failed");
  const device = (await claim.json()) as { deviceToken: string };
  // Synthetic test coordinates. They are never sent to a third-party provider in fixture mode.
  const upload = await fetch(`${base}/api/location`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${device.deviceToken}`,
    },
    body: JSON.stringify({
      latitude: 37.77,
      longitude: -122.41,
      accuracy: 8,
      observedAt: Date.now(),
    }),
  });
  if (!upload.ok) throw new Error("Synthetic location upload failed");
  const status = await call("get_location_status", {
    readHandle: pairing.readHandle,
  });
  if (
    status.location?.state !== "ready" ||
    JSON.stringify(status).includes("latitude")
  )
    throw new Error("Location state or privacy check failed");
  const nearby = await call("find_restaurants", {
    readHandle: pairing.readHandle,
  });
  for (const restaurant of nearby.restaurants!) {
    const menu = await call("get_menu", {
      restaurantId: restaurant.id,
      confirmed: true,
    });
    const explained = await call("explain_dishes", {
      menuId: menu.menuId,
      preferences: { diets: ["vegetarian"], avoid: ["sesame"] },
    });
    if (!explained.dishes?.length) throw new Error("No dishes returned");
  }
  await fetch(`${base}/api/sharing/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${device.deviceToken}`,
    },
    body: "{}",
  });
  if (
    (await call("get_location_status", { readHandle: pairing.readHandle }))
      .location?.state !== "stopped"
  )
    throw new Error("Revocation did not take effect");
  const report = {
    mode: "fixture",
    success: true,
    restaurants: nearby.restaurants!.length,
    toolCalls: metrics.length,
    totalCostUsd: metrics.reduce((n, x) => n + x.costUsd, 0),
    totalDurationMs: metrics.reduce((n, x) => n + x.durationMs, 0),
    metrics,
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/headless-demo.json",
    JSON.stringify(report, null, 2),
  );
  console.info(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
