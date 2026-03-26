import { registerPlugin } from "@capacitor/core";

export interface AppLauncherPlugin {
  launch(options: { packageName: string }): Promise<{
    success: boolean;
    packageName: string;
  }>;
  launchUri(options: { uri: string }): Promise<{
    success: boolean;
    uri: string;
  }>;
  isInstalled(options: { packageName: string }): Promise<{
    installed: boolean;
  }>;
}

const AppLauncher = registerPlugin<AppLauncherPlugin>("AppLauncher");
export default AppLauncher;

export const OPTISIGNS_PACKAGE = "com.optisigns.playe1";

export const XFINITY_INTENT_URI =
  "intent://com.xfinity.cloudtvr#Intent;scheme=xfinity;package=com.xfinity.cloudtvr;end";
