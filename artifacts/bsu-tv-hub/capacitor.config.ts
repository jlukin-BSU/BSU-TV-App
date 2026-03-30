import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "edu.bridgew.tvhub",
  appName: "BSU TV Hub",
  webDir: "dist/public",
  android: {
    backgroundColor: "#222222",
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
