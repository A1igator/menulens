import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { viewDataSchema } from "../src/view-data.js";

const client = new Client({ name: "menulens-phone-check", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(
    new URL("https://fast-pulse-1232h.run.mcp-use.com/mcp"),
  ),
);
try {
  const start = process.argv[2] === "start";
  const nearby = process.argv[2] === "nearby";
  const menu = process.argv[2] === "menu";
  const menuUrl = process.argv[3];
  const previous = start
    ? undefined
    : JSON.parse(await readFile("artifacts/phone-pairing.json", "utf8"));
  const response = await client.callTool({
    name: start ? "start_pairing" : menu ? "get_menu" : nearby ? "find_restaurants" : "get_location_status",
    arguments: start ? {} : menu ? {restaurantId:"ChIJZ-2Jug9_j4ARcS2_6s5KCNs",confirmed:true,originalRequest:"Retrieve the published menu for inspection.",...(menuUrl ? {menuUrl} : {})} : { readHandle: previous.readHandle },
  });
  const data = viewDataSchema.parse(response.structuredContent);
  if (response.isError)
    throw new Error(data.error?.message ?? "Phone check failed.");
  if (start) {
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/phone-pairing.json",
      JSON.stringify(data.pairing),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        pairingCode: data.pairing!.pairingCode,
        expiresAt: data.pairing!.expiresAt,
        mode: data.mode,
      }),
    );
  } else if (menu) {
    await writeFile("artifacts/palm-court-demo.json",JSON.stringify(data,null,2));
    console.log(JSON.stringify({restaurant:data.restaurant?.name,dishes:data.dishes?.length,sourceUrl:data.sourceUrl,note:data.note,costUsd:data.costUsd}));
  } else
    console.log(
      JSON.stringify(
        nearby
          ? {
              mode: data.mode,
              restaurants: data.restaurants,
              costUsd: data.costUsd,
            }
          : { mode: data.mode, location: data.location },
      ),
    );
} finally {
  await client.close();
}
