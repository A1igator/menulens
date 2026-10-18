import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "MenuLens Companion",
  slug: "menulens-companion",
  owner: "aliabdoli123",
  extra: { eas: { projectId: "27f393d4-8ab8-4a91-af9e-e8a17a01e435" } },
  scheme: "menulens",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  platforms: ["android"],
  android: {
    package: "com.menulens.companion",
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "POST_NOTIFICATIONS",
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundColor: "#203f33",
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-notifications",
    [
      "expo-location",
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
  experiments: { typedRoutes: true },
};
export default config;
