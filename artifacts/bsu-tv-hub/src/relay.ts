const RELAY_URL = "https://its-avctrl-bsu-av:3000/control";

export async function sendRelayCommand(tvHostname: string, action: string): Promise<void> {
  if (!tvHostname || tvHostname.trim() === "") {
    throw new Error("TV hostname is not configured. Open Admin Settings to set it.");
  }
  const body = {
    tv:        tvHostname.trim(),
    action,
    timestamp: Math.floor(Date.now() / 1000),
  };
  const res = await fetch(RELAY_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Relay server error: ${res.status} ${res.statusText}`);
  }
}
