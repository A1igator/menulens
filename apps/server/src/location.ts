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
  async start(ownerId?: string) {
    const now = this.clock(),
      readHandle = secret();
    const pairingCode = Array.from(
      { length: 8 },
      () => ALPHABET[randomInt(ALPHABET.length)],
    ).join("");
    const session: Session = {
      id: randomUUID(),
      ...(ownerId ? {ownerId} : {}),
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
  private async session(handle?: string, ownerId?: string) {
    await this.store.purge(this.clock());
    if (!ownerId && !handle) throw new AppError("pairing_required", "This chat is not connected to a phone. Sign in to MenuLens to reuse your account's phone, or start pairing in this conversation. Never substitute a restaurant remembered from another chat.");
    const session = ownerId ? await this.store.readForOwner(ownerId) : await this.store.read(digest(handle!));
    if (!session)
      throw new AppError(
        "invalid_context",
        ownerId ? "No phone is paired to this MenuLens account. Start pairing once, then use the same account in any chat." : "This chat's phone connection is unavailable. Pair in this conversation or sign in for automatic reconnect.",
        401,
      );
    if (session.ownerId && session.ownerId !== ownerId)
      throw new AppError("authentication_required", "Sign in to the MenuLens account that owns this phone connection.",401);
    return session;
  }
  async status(handle?: string, ownerId?: string) {
    const s = await this.session(handle, ownerId),
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
  async currentFix(handle?: string, ownerId?: string): Promise<Fix> {
    const s = await this.session(handle, ownerId);
    if (s.state === "stopped" || s.state === "expired") throw new AppError("sharing_ended", "Phone sharing has stopped or reached its two-hour limit. Start a new pairing and explicitly enable sharing in the Android companion.");
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
