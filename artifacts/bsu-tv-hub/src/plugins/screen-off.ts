import { registerPlugin } from "@capacitor/core";

/**
 * TvExit plugin — provides three DISTINCT exit paths so Sony Pro Mode
 * can later map each one to the appropriate hardware action:
 *
 *   exitToHdmi1   → Sony Pro Mode maps to: switch to Wall HDMI 1
 *   exitToHdmi2   → Sony Pro Mode maps to: switch to Wall HDMI 2
 *   exitToScreenOff → Sony Pro Mode maps to: display off
 *
 * All methods currently just move the app to the background.
 * No Sony REST API calls are made here.
 */
export interface ScreenOffPlugin {
  exitToHdmi1(): Promise<void>;
  exitToHdmi2(): Promise<void>;
  exitToScreenOff(): Promise<void>;
}

const ScreenOff = registerPlugin<ScreenOffPlugin>("ScreenOff");
export default ScreenOff;
