import { registerPlugin } from "@capacitor/core";

export interface ScreenOffPlugin {
  powerOff(options: { ip: string; psk: string }): Promise<{
    success: boolean;
    statusCode: number;
  }>;
  /** Switch the active HDMI input via the Sony REST API (avContent/setPlayContent). */
  switchHdmi(options: { ip: string; psk: string; port: number }): Promise<{
    success: boolean;
    statusCode: number;
  }>;
  testConnection(options: { ip: string; psk: string }): Promise<{
    success: boolean;
    statusCode: number;
  }>;
}

const ScreenOff = registerPlugin<ScreenOffPlugin>("ScreenOff");
export default ScreenOff;

const IP_KEY  = "sony_tv_ip";
const PSK_KEY = "sony_tv_psk";

export function loadScreenOffConfig(): { ip: string; psk: string } {
  return {
    ip:  localStorage.getItem(IP_KEY)  ?? "127.0.0.1",
    psk: localStorage.getItem(PSK_KEY) ?? "",
  };
}

export function saveScreenOffConfig(ip: string, psk: string) {
  localStorage.setItem(IP_KEY,  ip);
  localStorage.setItem(PSK_KEY, psk);
}
