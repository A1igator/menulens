import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  AppError,
  HOUR,
  MINUTE,
  fixInputSchema,
  type Fix,
  type Session,
} from "./domain.js";
import type { Store } from "./store.js";

export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export class LocationService {
  constructor(
    private store: Store,
    private clock = Date.now,
  ) {}
  async start() {
    const now = this.clock(),
      readHandle = secret();
    const pairingCode = Array.from(
      { length: 8 },
      () => ALPHABET[randomInt(ALPHABET.length)],
    ).join("");
    const session: Session = {
      id: randomUUID(),
      codeHash: digest(pairingCode),
      readHash: digest(readHandle),
      writeHash: null,
      pairExpires: now + 5 * MINUTE,
      shareExpires: null,
      state: "pending",
      fix: null,
      createdAt: now,
    };
    await this.store.create(session);
    return {
      readHandle,
      pairingCode,
      expiresAt: session.pairExpires,
      state: "pending" as const,
    };
  }
  async claim(code: string) {
    const deviceToken = secret(),
      now = this.clock(),
      expiresAt = now + 2 * HOUR;
    if (
      !(await this.store.claim(
        digest(code.toUpperCase().replace(/[\s-]/g, "")),
        digest(deviceToken),
        now,
        expiresAt,
      ))
    )
      throw new AppError(
        "invalid_pairing",
        "Pairing code is invalid, expired, or already used.",
        401,
      );
    return { deviceToken, expiresAt };
  }
  async upload(token: string, input: unknown) {
    const fix = fixInputSchema.parse(input),
      now = this.clock();
    if (fix.observedAt > now + MINUTE || fix.observedAt < now - 5 * MINUTE)
      throw new AppError("invalid_fix_time", "Send a fresh GPS fix.");
    if (
      !(await this.store.upload(
        digest(token),
        { ...fix, receivedAt: now },
        now,
      ))
    )
      throw new AppError(
        "sharing_ended",
        "Sharing has ended. Pair again to restart.",
        401,
      );
    return { accepted: true };
  }
  async stop(token: string) {
    await this.store.stop(digest(token));
    return { stopped: true };
  }
  private async session(handle: string) {
    await this.store.purge(this.clock());
    const session = await this.store.read(digest(handle));
    if (!session)
      throw new AppError(
        "invalid_context",
        "This location context is unavailable. Pair your phone again.",
        401,
      );
    return session;
  }
  async status(handle: string) {
    const s = await this.session(handle),
      now = this.clock();
    const state =
      s.state !== "sharing"
        ? s.state
        : !s.fix
          ? "waiting_for_fix"
          : now - s.fix.observedAt > 5 * MINUTE
            ? "stale"
            : s.fix.accuracy > 100
              ? "poor_accuracy"
              : "ready";
    return {
      state,
      updatedAt: s.fix?.observedAt ?? null,
      accuracyMetres: s.fix?.accuracy ?? null,
      expiresAt: s.shareExpires ?? s.pairExpires,
    };
  }
  async currentFix(handle: string): Promise<Fix> {
    const s = await this.session(handle);
    if (
      s.state !== "sharing" ||
      !s.fix ||
      this.clock() - s.fix.observedAt > 5 * MINUTE
    )
      throw new AppError(
        "location_unavailable",
        "Open the Android companion and refresh location, or search by restaurant name.",
      );
    if (s.fix.accuracy > 100)
      throw new AppError(
        "poor_accuracy",
        "GPS accuracy is too low to identify nearby restaurants. Refresh outside or search by name.",
      );
    return s.fix;
  }
}
