import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";

export const TASK = "menulens-background-location";
const SESSION = "menulens-session",
  STATUS = "menulens-status";
export type DeviceSession = {
  baseUrl: string;
  deviceToken: string;
  expiresAt: number;
  sharing: boolean;
  pendingStop?: boolean;
};
export type DeliveryStatus = {
  sentAt?: number;
  accuracy?: number;
  message?: string;
};
export async function getSession(): Promise<DeviceSession | null> {
  const value = await SecureStore.getItemAsync(SESSION);
  return value ? JSON.parse(value) : null;
}
export async function saveSession(value: DeviceSession) {
  await SecureStore.setItemAsync(SESSION, JSON.stringify(value));
}
export async function getDeliveryStatus(): Promise<DeliveryStatus> {
  const value = await SecureStore.getItemAsync(STATUS);
  return value ? JSON.parse(value) : {};
}
async function saveStatus(value: DeliveryStatus) {
  await SecureStore.setItemAsync(STATUS, JSON.stringify(value));
}
export function validateServerUrl(input: string) {
  const url = new URL(input.trim());
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(__DEV__ && url.protocol === "http:"))
  )
    throw new Error(
      "Use the HTTPS origin of your MenuLens server, without a path.",
    );
  return url.origin;
}
export async function post(
  session: DeviceSession,
  path: string,
  body: unknown,
) {
  return fetch(`${session.baseUrl}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.deviceToken}`,
    },
    body: JSON.stringify(body),
  });
}
export async function stopSharing() {
  // Local collection stops before any network operation, including when offline.
  if (await Location.hasStartedLocationUpdatesAsync(TASK))
    await Location.stopLocationUpdatesAsync(TASK);
  const session = await getSession();
  if (!session) return;
  const stopped = { ...session, sharing: false, pendingStop: true };
  await saveSession(stopped);
  try {
    const response = await post(stopped, "/api/sharing/stop", {});
    if (!response.ok) throw new Error("Could not confirm server deletion.");
    await SecureStore.deleteItemAsync(SESSION);
    await saveStatus({ message: "Sharing stopped. Server location deleted." });
  } catch {
    await saveStatus({
      message:
        "Collection stopped on this phone. Server deletion will retry when you reopen the app; the last fix also expires automatically.",
    });
  }
}
export async function sendFix(location: Location.LocationObject) {
  const session = await getSession();
  if (!session) return;
  if (session.pendingStop) {
    await stopSharing();
    return;
  }
  if (!session.sharing) return;
  if (session.expiresAt <= Date.now()) {
    await stopSharing();
    return;
  }
  // Old queued OS fixes are dropped. We never persist or replay a location history.
  if (
    location.timestamp < Date.now() - 5 * 60_000 ||
    location.coords.accuracy === null
  )
    return;
  try {
    const response = await post(session, "/api/location", {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      observedAt: Math.round(location.timestamp),
    });
    if (response.status === 401) {
      await stopSharing();
      return;
    }
    if (!response.ok) throw new Error("Upload failed");
    await saveStatus({
      sentAt: Date.now(),
      accuracy: location.coords.accuracy,
      message:
        "Location delivered. Return to ChatGPT and ask for nearby restaurants.",
    });
  } catch {
    await saveStatus({
      message:
        "Location was not delivered. Check your connection; the next fresh fix will retry.",
    });
  }
}
// Defined at module scope and imported by the root layout before any screen mounts.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TASK,
  async ({ data, error }) => {
    if (error) {
      await saveStatus({
        message:
          "Android paused location updates. Reopen MenuLens and check location permissions.",
      });
      return;
    }
    const latest = data?.locations?.reduce<Location.LocationObject | undefined>(
      (a, b) => (!a || b.timestamp > a.timestamp ? b : a),
      undefined,
    );
    if (latest) await sendFix(latest);
  },
);
