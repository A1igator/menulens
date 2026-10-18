import { test } from "node:test";
import assert from "node:assert/strict";
import server, { services } from "../index.js";
const request = (path: string, body: unknown, token?: string) =>
  server.app.request(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
test("HTTP endpoints enforce device authorization and return no-store responses", async () => {
  const denied = await request("/api/location", {
    latitude: 37,
    longitude: -122,
    accuracy: 10,
    observedAt: Date.now(),
  });
  assert.equal(denied.status, 401);
  const pair = await services.location.start();
  const claim = await request("/api/pairing/claim", { code: pair.pairingCode });
  assert.equal(claim.status, 200);
  assert.equal(claim.headers.get("Cache-Control"), "no-store");
  const { deviceToken } = (await claim.json()) as { deviceToken: string };
  assert.equal(
    (await request("/api/pairing/claim", { code: pair.pairingCode })).status,
    401,
  );
  const sent = await request(
    "/api/location",
    { latitude: 37, longitude: -122, accuracy: 10, observedAt: Date.now() },
    deviceToken,
  );
  assert.equal(sent.status, 200);
  assert.equal(
    (await services.location.status(pair.readHandle)).state,
    "ready",
  );
  assert.equal(
    (await request("/api/sharing/stop", {}, deviceToken)).status,
    200,
  );
  assert.equal(
    (await services.location.status(pair.readHandle)).state,
    "stopped",
  );
});
test("HTTP rejects oversized input and unexpected fields", async () => {
  const large = await request("/api/pairing/claim", {
    code: "A".repeat(100001),
  });
  assert.equal(large.status, 413);
  const invalid = await request("/api/pairing/claim", {
    code: "ABCDEFGH",
    extra: true,
  });
  assert.equal(invalid.status, 400);
});
test("fixture HTTP preview uses the same menu and dietary service", async () => {
  const response = await request("/api/fixture/menu", {
    restaurantId: "fixture:tacolicious",
    diets: ["vegan"],
    avoid: [],
  });
  assert.equal(response.status, 200);
  const data = (await response.json()) as {
    mode: string;
    dishes: { id: string; compatibility: { status: string }[] }[];
  };
  assert.equal(data.mode, "fixture");
  assert.equal(
    data.dishes.find((d) => d.id === "tc-verduras")?.compatibility[0].status,
    "supported by menu",
  );
  assert.equal(
    data.dishes.find((d) => d.id === "tc-mushroom")?.compatibility[0].status,
    "conflicts",
  );
});
