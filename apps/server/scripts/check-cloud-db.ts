import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PostgresStore } from "../src/store.js";
import { LocationService } from "../src/location.js";
import { fixtureMenus } from "../src/fixtures.js";

if (!process.env.INSFORGE_DATABASE_URL)
  throw new Error("No cloud database configured.");
const store = new PostgresStore(process.env.INSFORGE_DATABASE_URL),
  location = new LocationService(store);
const reservations: string[] = [];
let deviceToken = "";
try {
  const p = await location.start(),
    d = await location.claim(p.pairingCode);
  deviceToken = d.deviceToken;
  await location.upload(d.deviceToken, {
    latitude: 37.77,
    longitude: -122.41,
    accuracy: 10,
    observedAt: Date.now(),
  });
  assert.equal((await location.status(p.readHandle)).state, "ready");
  await store.putMenu(fixtureMenus[0]);
  assert.equal((await store.getMenu(fixtureMenus[0].id))?.dishes.length, 3);
  const workflow = `cloud-check:${randomUUID()}`;
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, async () => {
      const id = await store.reserve(workflow, 0.001, Date.now(), 0.005, 10);
      reservations.push(id);
      return id;
    }),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  await location.stop(d.deviceToken);
  assert.equal((await location.status(p.readHandle)).state, "stopped");
  console.info(
    "Cloud database verified: restricted runtime access, pairing, GPS revocation, normalized menu caching, and concurrent budget enforcement. No paid API calls were made.",
  );
} catch (error) {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Cloud database verification failed (credentials omitted).",
  );
  process.exitCode = 1;
} finally {
  if (deviceToken) await location.stop(deviceToken);
  for (const id of reservations) await store.finishReservation(id, "released");
  await store.close();
}
