import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import {
  AndroidImportance,
  requestPermissionsAsync,
  setNotificationChannelAsync,
} from "expo-notifications";
import Constants from "expo-constants";
import {
  TASK,
  getSession,
  saveSession,
  getDeliveryStatus,
  sendFix,
  stopSharing,
  validateServerUrl,
  type DeviceSession,
  type DeliveryStatus,
} from "../location-task";

async function loadSnapshot() {
  const stored = await getSession();
  if (stored && (stored.pendingStop || stored.expiresAt <= Date.now()))
    await stopSharing();
  else if (
    stored?.sharing &&
    !stored.pendingStop &&
    !(await Location.hasStartedLocationUpdatesAsync(TASK))
  )
    await saveSession({ ...stored, sharing: false });
  return { session: await getSession(), status: await getDeliveryStatus() };
}

async function freshPosition() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "GPS is taking too long. Move near a window or outside and try again.",
              ),
            ),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function Home() {
  const [baseUrl, setBaseUrl] = useState(process.env.EXPO_PUBLIC_API_URL ?? ""),
    [code, setCode] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [session, setSession] = useState<DeviceSession | null>(null),
    [status, setStatus] = useState<DeliveryStatus>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function applySnapshot(snapshot: {
    session: DeviceSession | null;
    status: DeliveryStatus;
  }) {
    setSession(snapshot.session);
    if (snapshot.session) setBaseUrl(snapshot.session.baseUrl);
    setStatus(snapshot.status);
  }
  async function sync() {
    applySnapshot(await loadSnapshot());
  }
  useEffect(() => {
    void loadSnapshot().then(applySnapshot);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadSnapshot().then(applySnapshot);
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active")
        void loadSnapshot().then(applySnapshot);
    }, 5000);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, []);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not complete this action.",
      );
    } finally {
      await sync();
      setBusy(false);
    }
  }
  async function pair() {
    const url = validateServerUrl(baseUrl);
    const response = await fetch(`${url}/api/pairing/claim`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.toUpperCase().replace(/[\s-]/g, "") }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "Pairing failed.");
    if (
      typeof data.deviceToken !== "string" ||
      typeof data.expiresAt !== "number"
    )
      throw new Error("The server returned an invalid pairing response.");
    await saveSession({
      baseUrl: url,
      deviceToken: data.deviceToken,
      expiresAt: data.expiresAt,
      sharing: false,
    });
    setCode("");
  }
  async function start() {
    if (Constants.appOwnership === "expo")
      throw new Error(
        "Background sharing requires a MenuLens development or preview APK. It cannot run in Expo Go.",
      );
    const current = await getSession();
    if (!current) throw new Error("Pair with ChatGPT first.");
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted)
      throw new Error(
        "Location permission was denied. You can enable it in Android settings.",
      );
    await setNotificationChannelAsync("menulens-sharing", {
      name: "MenuLens location sharing",
      importance: AndroidImportance.LOW,
      description:
        "Status for your explicitly enabled location-sharing session.",
    });
    const notifications = await requestPermissionsAsync();
    if (!notifications.granted)
      throw new Error(
        "Allow notifications so Android can show the active sharing indicator.",
      );
    const background = await Location.requestBackgroundPermissionsAsync();
    if (!background.granted)
      throw new Error(
        "Enable “Allow all the time” in Android location settings to share while using ChatGPT.",
      );
    try {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 60_000,
        distanceInterval: 0,
        deferredUpdatesInterval: 60_000,
        foregroundService: {
          notificationTitle: "MenuLens location sharing is active",
          notificationBody:
            "Tap to open MenuLens and stop sharing. Ends after two hours.",
          notificationColor: "#203f33",
          killServiceOnDestroy: true,
        },
      });
      await saveSession({ ...current, sharing: true });
      await sendFix(await freshPosition());
    } catch (e) {
      await saveSession({ ...current, sharing: false });
      if (await Location.hasStartedLocationUpdatesAsync(TASK))
        await Location.stopLocationUpdatesAsync(TASK);
      throw e;
    }
  }
  function confirmStart() {
    Alert.alert(
      "Share your location with MenuLens?",
      "MenuLens sends your latest GPS fix to your paired backend while you use ChatGPT. When you request nearby restaurants, the backend shares that fix with StableEnrich / Google Maps. Only the latest fix is kept. Sharing ends after two hours or when you stop.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Start sharing", onPress: () => void action(start) },
      ],
    );
  }
  const sharing = !!session?.sharing && !session.pendingStop;
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.brand}>m✳ MenuLens</Text>
        </View>
        <Text style={styles.title}>
          {sharing ? "You're connected." : "Connect to ChatGPT"}
        </Text>
        <Text style={styles.subtitle}>
          {sharing
            ? "Go back to ChatGPT. MenuLens will keep your location up to date."
            : "Use the pairing code from your MenuLens conversation."}
        </Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.dot, sharing && styles.liveDot]} />
            <Text style={styles.cardTitle}>
              {sharing
                ? "Location sharing is on"
                : session
                  ? "Phone paired"
                  : "Pair your phone"}
            </Text>
          </View>
          <Text style={styles.copy}>
            {sharing
              ? "Location sharing is on. You can stop anytime."
              : session
                ? session.pendingStop
                  ? "Location sharing is off. Reconnect to finish disconnecting."
                  : "Share location for up to two hours."
                : "Enter the eight-character code to connect."}
          </Text>
          {!session && (
            <>
              {(showDetails || !baseUrl) && (
                <>
                  <Text style={styles.label}>SERVER URL</Text>
                  <TextInput
                    style={styles.input}
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    placeholder="https://your-server.run.mcp-use.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    accessibilityLabel="MenuLens server URL"
                  />
                </>
              )}
              <Text style={styles.label}>PAIRING CODE</Text>
              <TextInput
                style={[styles.input, styles.code]}
                value={code}
                onChangeText={setCode}
                placeholder="ABCD EFGH"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                accessibilityLabel="Pairing code"
              />
              <Pressable
                style={styles.button}
                disabled={busy || code.replace(/[\s-]/g, "").length !== 8}
                onPress={() => void action(pair)}
              >
                <Text style={styles.buttonText}>Connect</Text>
              </Pressable>
            </>
          )}
          {session && !sharing && !session.pendingStop && (
            <Pressable
              style={styles.button}
              disabled={busy}
              onPress={confirmStart}
            >
              <Text style={styles.buttonText}>Share location</Text>
            </Pressable>
          )}
          {sharing && (
            <>
              <Text style={styles.shareUntil}>
                Ends at {new Date(session!.expiresAt).toLocaleTimeString()}
              </Text>
              {showDetails && (
                <Pressable
                  style={styles.button}
                  disabled={busy}
                  onPress={() =>
                    void action(async () => sendFix(await freshPosition()))
                  }
                >
                  <Text style={styles.buttonText}>Refresh location now</Text>
                </Pressable>
              )}
            </>
          )}
          {session && (
            <Pressable
              style={sharing ? styles.button : styles.secondary}
              disabled={busy}
              onPress={() => void action(stopSharing)}
            >
              <Text style={sharing ? styles.buttonText : styles.secondaryText}>
                {session.pendingStop
                  ? "Finish disconnecting"
                  : sharing
                    ? "Stop sharing"
                    : "Disconnect phone"}
              </Text>
            </Pressable>
          )}
          {busy && <ActivityIndicator style={styles.loader} color="#203f33" />}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowDetails(!showDetails)}
          accessibilityRole="button"
          accessibilityLabel={
            showDetails ? "Hide connection details" : "Show connection details"
          }
        >
          <Text style={styles.settings}>
            {showDetails ? "Hide details" : "Connection details"}
          </Text>
        </Pressable>
        {showDetails && (
          <>
            <View style={styles.delivery}>
              <Text style={styles.label}>LAST DELIVERY</Text>
              <Text style={styles.copy}>
                {status.sentAt
                  ? new Date(status.sentAt).toLocaleTimeString()
                  : "No location sent yet"}
                {status.accuracy !== undefined
                  ? ` · Accuracy ±${Math.round(status.accuracy)} m`
                  : ""}
              </Text>
              {status.message ? (
                <Text style={styles.copy}>{status.message}</Text>
              ) : null}
            </View>
            <Text style={styles.footnote}>
              No location history. No automatic paid searches. Your latest fix
              expires after 15 minutes without updates. Force-stopping the app
              stops background updates.
            </Text>
            <Pressable onPress={() => void Linking.openSettings()}>
              <Text style={styles.settings}>Android app settings ↗</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f6f0" },
  page: { padding: 25, paddingBottom: 45 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderColor: "#dce1d5",
  },
  brand: { fontSize: 23, fontWeight: "700", color: "#203f33" },
  android: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#7c896e",
  },
  kicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#6c7d5d",
    marginTop: 36,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.7,
    color: "#203f33",
    marginTop: 30,
  },
  italic: { fontStyle: "italic", color: "#7c9260" },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: "#6b776d",
    marginTop: 15,
    marginBottom: 27,
  },
  card: {
    backgroundColor: "#fffef9",
    borderWidth: 1,
    borderColor: "#dce1d5",
    borderRadius: 15,
    padding: 21,
  },
  row: { flexDirection: "row", gap: 9, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#a3ac97" },
  liveDot: { backgroundColor: "#668840" },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#203f33" },
  copy: { fontSize: 12, lineHeight: 19, color: "#6b776d", marginTop: 9 },
  label: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#7c896e",
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#dce1d5",
    borderRadius: 8,
    padding: 12,
    color: "#203f33",
    fontSize: 12,
  },
  code: {
    fontSize: 24,
    letterSpacing: 5,
    textAlign: "center",
    fontFamily: "monospace",
    paddingVertical: 16,
  },
  button: {
    backgroundColor: "#203f33",
    padding: 15,
    borderRadius: 9,
    marginTop: 18,
    alignItems: "center",
  },
  buttonText: { color: "#fffef9", fontSize: 12, fontWeight: "600" },
  secondary: {
    borderWidth: 1,
    borderColor: "#bdc8b1",
    padding: 14,
    borderRadius: 9,
    marginTop: 10,
    alignItems: "center",
  },
  secondaryText: { color: "#203f33", fontSize: 12, fontWeight: "600" },
  shareUntil: { fontSize: 12, color: "#7c896e", marginTop: 15 },
  loader: { marginTop: 15 },
  error: {
    color: "#9d5035",
    backgroundColor: "#f6e1d7",
    padding: 12,
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 15,
  },
  delivery: { padding: 10 },
  footnote: { fontSize: 10, lineHeight: 17, color: "#7c896e", marginTop: 23 },
  settings: { fontSize: 11, color: "#203f33", marginTop: 17 },
});
