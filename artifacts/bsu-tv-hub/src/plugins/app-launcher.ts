import { registerPlugin } from "@capacitor/core";

export interface AppLauncherPlugin {
  launch(options: { packageName: string }): Promise<{
    success: boolean;
    packageName: string;
  }>;
  isInstalled(options: { packageName: string }): Promise<{
    installed: boolean;
  }>;
}

const AppLauncher = registerPlugin<AppLauncherPlugin>("AppLauncher");
export default AppLauncher;

export const OPTISIGNS_PACKAGE = "com.optisigns.playe1";
