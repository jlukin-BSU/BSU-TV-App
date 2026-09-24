import net from "node:net";
import { logger } from "../lib/logger";
import type { Display } from "../lib/config";
import { DriverError } from "./types";
import type {
  Capability,
  DisplayDriver,
  PlayingContent,
  PowerStatus,
  ScreenState,
  VolumeInfo,
} from "./types";

/**
 * LG commercial display driver.
 *
 * Where Sony speaks JSON-RPC over HTTP, LG speaks a terse ASCII command set
 * documented in the owner's manual under "RS-232C", carried over TCP on the
 * control port. Commands look like:
 *
 *   (Command1)(Command2)( )(Set ID)( )(Data)(Cr)      e.g. "ka 01 01\r"
 *
 * and the panel answers:
 *
 *   (Command2)( )(Set ID)( )(OK|NG)(Data)x            e.g. "a 01 OK01x"
 *
 * Sending `FF` as the data reads the current value instead of setting it.
 *
 * These panels have no app platform -- the UR340C manual states plainly that
 * "Internet is not supported" and the network port is "for control purposes
 * only" -- so the driver does not declare the "apps" capability and app launch
 * falls to a streaming device.
 */

const DEFAULT_PORT = 9761;
const DEFAULT_TIMEOUT_MS = 5000;

function timeoutMs(): number {
  const raw = process.env["LG_TIMEOUT_MS"];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/** Two-character uppercase hex, as the protocol expects. */
function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Send one command and return the response data.
 *
 * A connection per command, matching the Sony driver's request-per-call shape.
 * These panels are not reliable about multiplexing a long-lived socket, and the
 * command rate here is a handful per interaction.
 */
function request(display: Display, cmd: string, data: string): Promise<string> {
  const target = display.targetIp;
  const setId = display.setId;
  const wire = `${cmd} ${hex2(setId)} ${data}\r`;

  if (display.dryRun) {
    logger.info(
      { display: display.hostname, target: target ?? "(unresolved)", wire: wire.trimEnd(), dryRun: true },
      "DRY RUN -- LG command not sent",
    );
    return Promise.resolve(dryRunResult(cmd));
  }

  if (!target) {
    return Promise.reject(
      new DriverError(
        `Could not resolve ${display.hostname} to an IP address. Check the display's DNS record / DHCP reservation, or set an IP override for it.`,
      ),
    );
  }

  return new Promise<string>((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = "";
    let settled = false;

    const done = (err: DriverError | null, value?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(value ?? "");
    };

    socket.setTimeout(timeoutMs());
    socket.on("timeout", () =>
      done(
        new DriverError(
          `${display.hostname} (${target}) did not respond within ${timeoutMs()}ms. Check the display is powered on and network control is enabled.`,
        ),
      ),
    );
    socket.on("error", (err) =>
      done(
        new DriverError(
          `Could not reach ${display.hostname} (${target}:${display.controlPort}): ${err.message}.`,
        ),
      ),
    );

    socket.on("data", (chunk) => {
      buffer += chunk.toString("ascii");
      // Responses are terminated by 'x'; wait for it rather than assuming one packet.
      if (!buffer.includes("x")) return;

      const reply = buffer.slice(0, buffer.indexOf("x") + 1);
      const parsed = /^\s*([a-z])\s+([0-9a-fA-F]{2})\s+(OK|NG)([0-9a-fA-F]*)x/.exec(reply);

      if (!parsed) {
        done(
          new DriverError(
            `${display.hostname} returned an unparseable reply to "${cmd}": ${JSON.stringify(reply)}.`,
          ),
        );
        return;
      }
      if (parsed[3] === "NG") {
        done(
          new DriverError(
            `${display.hostname} rejected "${cmd}" (NG${parsed[4] ?? ""}). The command may not apply to this model or input.`,
          ),
        );
        return;
      }
      done(null, (parsed[4] ?? "").toUpperCase());
    });

    socket.connect(display.controlPort ?? DEFAULT_PORT, target, () => {
      socket.write(wire, "ascii");
    });
  });
}

/** Plausible stand-in payloads so dry-run exercises the same code paths. */
function dryRunResult(cmd: string): string {
  if (cmd === "ka") return "01";
  if (cmd === "kf") return "1E"; // volume 30
  if (cmd === "ke") return "01"; // not muted
  if (cmd === "xb") return "90"; // HDMI 1
  return "00";
}

// ---- input mapping --------------------------------------------------------

/**
 * `xb` encodes the input as a byte: the high nibble is the input family and the
 * low nibble is which one. HDMI is family 9, so HDMI1..HDMI4 are 0x90..0x93.
 *
 * NOTE: `port` here is the HDMI number as labelled on the panel. That differs
 * from the Sony catalog, where "Wall HDMI 1" maps to physical port 3 because of
 * Sony's own numbering. Per-install input labelling belongs in the systems
 * schema; until that lands, an LG entry's ports are the panel's own HDMI
 * numbers.
 */
const HDMI_BASE = 0x90;
const HDMI_MAX_PORT = 4;

function hdmiCode(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > HDMI_MAX_PORT) {
    throw new DriverError(
      `HDMI ${port} is out of range for an LG panel; it exposes HDMI 1-${HDMI_MAX_PORT}.`,
    );
  }
  return hex2(HDMI_BASE + (port - 1));
}

function portFromCode(code: string): number | null {
  const value = Number.parseInt(code, 16);
  if (Number.isNaN(value)) return null;
  if (value < HDMI_BASE || value > HDMI_BASE + HDMI_MAX_PORT - 1) return null;
  return value - HDMI_BASE + 1;
}

// ---- capabilities ---------------------------------------------------------

async function getPowerStatus(display: Display): Promise<PowerStatus> {
  const data = await request(display, "ka", "FF");
  if (data === "01") return "active";
  if (data === "00") return "standby";
  return "unknown";
}

async function setPower(display: Display, on: boolean): Promise<void> {
  await request(display, "ka", on ? "01" : "00");
}

async function getVolume(display: Display): Promise<VolumeInfo | null> {
  const [volumeData, muteData] = await Promise.all([
    request(display, "kf", "FF"),
    request(display, "ke", "FF"),
  ]);

  const volume = Number.parseInt(volumeData, 16);
  if (Number.isNaN(volume)) return null;

  return {
    volume,
    // Counter-intuitive, and straight from the manual: for `ke`, 00 is "volume
    // mute ON" and 01 is "mute OFF". Inverting this is an easy bug.
    mute: muteData === "00",
    min: 0,
    max: 100,
  };
}

async function setVolume(display: Display, volume: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(volume)));
  await request(display, "kf", hex2(clamped));
}

/**
 * LG has no relative volume command, so read-modify-write. Sony does this in
 * one call; here the round trip is unavoidable.
 */
async function stepVolume(display: Display, delta: number): Promise<void> {
  const current = await getVolume(display);
  if (!current) {
    throw new DriverError(`${display.hostname} did not report its volume, so it cannot be stepped.`);
  }
  await setVolume(display, current.volume + delta);
}

async function setMute(display: Display, mute: boolean): Promise<void> {
  // See getVolume: 00 mutes, 01 unmutes.
  await request(display, "ke", mute ? "00" : "01");
}

async function setInput(display: Display, port: number): Promise<void> {
  await request(display, "xb", hdmiCode(port));
}

async function setScreenState(display: Display, kind: ScreenState): Promise<void> {
  if (kind === "standby") {
    await request(display, "ka", "00");
    return;
  }
  // `kd` is Screen Mute: 01 blanks the panel, 00 restores it. The set stays
  // powered and reachable either way, which is what "Screen Off" wants.
  await request(display, "kd", kind === "pictureOff" ? "01" : "00");
}

async function getPlayingContent(display: Display): Promise<PlayingContent | null> {
  const data = await request(display, "xb", "FF");
  const port = portFromCode(data);
  if (port === null) {
    // A non-HDMI source (tuner, RGB) or an unrecognised code. Report it rather
    // than pretending nothing is playing.
    return { uri: `lgInput:${data}`, title: `Input ${data}`, source: "lgInput" };
  }
  // Shaped like Sony's so the dashboard's existing label logic keeps working.
  return { uri: `extInput:hdmi?port=${port}`, title: `HDMI ${port}`, source: "extInput:hdmi" };
}

export const lgDriver: DisplayDriver = {
  id: "lg-commercial",
  requiresPsk: false,
  supports: new Set<Capability>(["power", "input", "volume", "mute", "screen"]),

  getPowerStatus,
  setPower,
  getVolume,
  setVolume,
  stepVolume,
  setMute,
  setInput,
  setScreenState,
  getPlayingContent,
  // No `apps`: these panels have no app platform. appSourceFor() therefore
  // resolves to "streamer" for them with nothing to configure.
};
