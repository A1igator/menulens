import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import { PostgresStore } from "../src/store.js";
import { LocationService, digest } from "../src/location.js";
import { fixtureMenus } from "../src/fixtures.js";
import { DAY, MINUTE } from "../src/domain.js";

test("Postgres migration and adapter implement pairing, monotonic fixes, deletion, caching, and budget reservations", async () => {
  const db = new PGlite();
  const sql = await readFile(
    new URL("../migrations/20261017200000_initial.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql); // Idempotent migration.
  const store = new PostgresStore("postgres://unused");
  const query = async (text: string, values?: unknown[]) => {
    const r = await db.query(text, values);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  store.pool = {
    query,
    connect: async () => ({ query, release() {} }),
    end: async () => db.close(),
  } as unknown as pg.Pool;
  let now = 1_800_000_000_000;
  const location = new LocationService(store, () => now);
  try {
    const pair = await location.start(),
      device = await location.claim(pair.pairingCode);
    await assert.rejects(location.claim(pair.pairingCode));
    await location.upload(device.deviceToken, {
      latitude: 37,
      longitude: -122,
      accuracy: 5,
      observedAt: now,
    });
    assert.equal((await location.status(pair.readHandle)).state, "ready");
    now += MINUTE;
    await location.upload(device.deviceToken, {
      latitude: 1,
      longitude: 1,
      accuracy: 1000,
      observedAt: now - 2 * MINUTE,
    });
    assert.equal((await location.currentFix(pair.readHandle)).latitude, 37);
    await store.putMenu(fixtureMenus[0]);
    assert.equal((await store.getMenu(fixtureMenus[0].id))?.dishes.length, 3);
    const id = await store.reserve("flow", 0.05, now, 0.1, 0.1);
    await store.finishReservation(id, "uncertain");
    await assert.rejects(store.reserve("flow", 0.06, now, 0.1, 0.1), /budget/);
    await store.finishReservation(id, "released");
    await store.reserve("second", 0.1, now, 0.1, 0.1);
    await assert.rejects(store.reserve("third", 0.01, now, 0.1, 0.1), /budget/);
    await location.stop(device.deviceToken);
    const record = await store.read(digest(pair.readHandle));
    assert.equal(record?.fix, null);
    assert.equal(record?.writeHash, null);
    const second = await location.start(),
      secondDevice = await location.claim(second.pairingCode);
    await location.upload(secondDevice.deviceToken, {
      latitude: 37,
      longitude: -122,
      accuracy: 5,
      observedAt: now,
    });
    now += 15 * MINUTE;
    await store.purge(now);
    assert.equal((await store.read(digest(second.readHandle)))?.fix, null);
    now += DAY;
    await store.purge(now);
    assert.equal(await store.read(digest(second.readHandle)), null);
  } finally {
    await store.close();
  }
});
