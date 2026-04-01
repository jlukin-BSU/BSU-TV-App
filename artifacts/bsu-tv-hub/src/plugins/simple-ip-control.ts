import { registerPlugin, Capacitor } from "@capacitor/core";

interface SimpleIpControlPlugin {
  sendCommand(opts: {
    tvAddress: string;
    port:      number;
    command:   string;
  }): Promise<{ success: boolean }>;
}

const NativeSics = registerPlugin<SimpleIpControlPlugin>("SimpleIpControl");

/**
 * Send a Sony Simple IP Control command over TCP.
 * Runs natively on Android; logs to console in browser/dev mode.
 *
 * @throws if tvAddress is empty, localhost, or 127.0.0.1
 */
export async function sendSicsCommand(
  tvAddress: string,
  port: number,
  command: string,
): Promise<void> {
  const addr = (tvAddress ?? "").trim();
  if (!addr) throw new Error("TV Address is not configured. Set it in Admin Settings → Simple IP Control.");
  if (addr === "localhost" || addr === "127.0.0.1")
    throw new Error("TV Address must not be localhost or 127.0.0.1. Enter the TV's network IP.");

  if (Capacitor.isNativePlatform()) {
    await NativeSics.sendCommand({ tvAddress: addr, port, command });
  } else {
    // Browser / Replit preview — just log so the UI flow is testable.
    console.log(`[SICS dev] ${addr}:${port} → ${command}`);
  }
}

/**
 * Sony Simple IP Control commands for the FW75BZ30L.
 *
 * HDMI 1/2 confirmed by user. AirPlay/Cast input numbers may need
 * verification by querying the TV with *SEINP?# over port 20060.
 * Screen Off (*POWR:0#) is standard across all Sony Simple IP models.
 */
export const SicsCommand = {
  HDMI1:   "*SCINP:3#",
  HDMI2:   "*SCINP:4#",
  AIRPLAY: "*SCINP:50#",  // Verify on TV: run *SEINP?# to list inputs
  CAST:    "*SCINP:51#",  // Verify on TV: run *SEINP?# to list inputs
  PWROFF:  "*POWR:0#",
} as const;

export type SicsCommandKey = keyof typeof SicsCommand;
