import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { viewDataSchema } from "../src/view-data.js";

const origin = "https://fast-pulse-1232h.run.mcp-use.com";
if (!process.argv.includes("--confirm-paid"))
  throw new Error(
    "Pass --confirm-paid: the named restaurant query can cost $0.02.",
  );
const client = new Client({
  name: "menulens-cloud-acceptance",
  version: "1.0.0",
});
const metrics: {
  tool: string;
  durationMs: number;
  costUsd: number;
  status: string;
}[] = [];
let deviceToken: string | undefined;
async function call(name: string, args: Record<string, unknown>) {
  const start = performance.now();
  const response = await client.callTool({ name, arguments: args });
  const data = viewDataSchema.parse(response.structuredContent);
  if (response.isError)
    throw new Error(data.error?.message ?? "Cloud tool failed.");
  metrics.push({
    tool: name,
    durationMs: Math.round(performance.now() - start),
    costUsd: data.costUsd ?? 0,
    status: data.status,
  });
  return data;
}
async function device(path: string, body: unknown, authenticated = false) {
  return fetch(`${origin}/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${deviceToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)),
  );
  if ((await client.listTools()).tools.length !== 5)
    throw new Error("Expected five tools.");
  const started = await call("start_pairing", {});
  if (started.mode !== "live")
    throw new Error("The final live deployment is not active yet.");
  const pairing = started.pairing!;
  const claimed = await device("pairing/claim", { code: pairing.pairingCode });
  if (!claimed.ok) throw new Error("Hosted pairing failed.");
  deviceToken = ((await claimed.json()) as { deviceToken: string }).deviceToken;
  if ((await device("pairing/claim", { code: pairing.pairingCode })).ok)
    throw new Error("Hosted code was reused.");
  // Public sample coordinates, not phone GPS. No nearby search is requested here.
  if (
    !(
      await device(
        "location",
        {
          latitude: 37.7765,
          longitude: -122.425,
          accuracy: 8,
          observedAt: Date.now(),
        },
        true,
      )
    ).ok
  )
    throw new Error("Hosted synthetic fix failed.");
  const status = await call("get_location_status", {
    readHandle: pairing.readHandle,
  });
  if (
    status.location?.state !== "ready" ||
    JSON.stringify(status).includes("latitude")
  )
    throw new Error("Location privacy/status failed.");
  const places = await call("find_restaurants", {
    query: "Souvla 517 Hayes Street San Francisco",
  });
  const chosen = places.restaurants?.find(
    (r) => r.id === "ChIJbTB3bKKAhYAR8Yqc6dEIMbQ",
  );
  if (!chosen) throw new Error("The named public sample was not returned.");
  const menu = await call("get_menu", {
    restaurantId: chosen.id,
    confirmed: true,
  });
  if (!menu.cached || menu.costUsd !== 0)
    throw new Error("The live sample cache was not used.");
  const explained = await call("explain_dishes", {
    menuId: menu.menuId,
    preferences: { diets: ["vegetarian"], avoid: ["sesame"] },
  });
  if (!explained.dishes?.length)
    throw new Error("No explained dishes returned.");
  await device("sharing/stop", {}, true);
  const stopped = await call("get_location_status", {
    readHandle: pairing.readHandle,
  });
  if (stopped.location?.state !== "stopped")
    throw new Error("Hosted revocation failed.");
  const resources = await client.listResources();
  const report = {
    success: true,
    mode: "live",
    origin,
    syntheticLocation: true,
    physicalPhoneVerified: false,
    dishes: explained.dishes.length,
    partialMenuNotice: explained.note,
    resourceCount: resources.resources.length,
    toolCalls: metrics.length,
    costUsd: metrics.reduce((s, m) => s + m.costUsd, 0),
    metrics,
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/cloud-demo.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (deviceToken) await device("sharing/stop", {}, true);
  await client.close();
}
