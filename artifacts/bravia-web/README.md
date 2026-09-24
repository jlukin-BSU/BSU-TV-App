# bravia-web

Web replacement for the on-device Capacitor hub (`artifacts/bsu-tv-hub`). A single
Node service serves a control-panel page and issues Sony BRAVIA REST commands
directly to the display that asked for them.

Target hardware: Sony BRAVIA Professional Display **BZ30L**, Android OS, Pro mode.

## How it differs from the Android app

The old app ran *on* each display, so it knew which TV it was and could fire
Android intents locally. This one runs on a server and is loaded by many
displays at once, which changes three things:

| | Capacitor app | bravia-web |
|---|---|---|
| Which TV am I? | it *was* the TV | resolved from the request's **source IP** |
| Switch input | `TvInput` plugin | `setPlayContent` over Sony REST |
| Launch app | `AppLauncher` intent, by **package name** | `setActiveApp` over Sony REST, by **URI** |
| Screen off | `relay.ts` → relay server (`PWROFF`) | `setPowerSavingMode` over Sony REST |
| Per-TV settings | `localStorage` | server-side `devices.json` |

Three consequences worth knowing:

- **The relay server is gone.** No `its-avctrl-bsu-av:3000`, no `tvHostname` in
  `localStorage`. This service talks to displays itself.
- **`setActiveApp` needs a URI, not a package name.** The Sony API has no
  launch-by-package call, so the server calls `getApplicationList` on the
  display, matches the package name against the reported URIs, and caches the
  result per display for 10 minutes. Package names were carried over verbatim
  from the old app — see `src/shared/catalog.ts`.
- **Screen Off is `pictureOff`, not standby.** This page runs inside the
  display's own browser, so a real power-off (`setPowerStatus: false`) would
  kill the page along with the panel. `pictureOff` blanks the screen but leaves
  the display powered and reachable over IP, so it can be turned back on.
  A genuine power-off is available as a separate `poweroff` command, off by
  default.

**Not carried over:** the old `CAST` and `AIRPLAY` relay actions. There is no
documented Sony REST equivalent — casting is initiated from the phone or laptop,
not the display — so they would need a different mechanism rather than a guess.

## How a display is identified

Every request is attributed by its **source IP address**. There is no token, no
cookie, and no way for the client to name a display. The IP is looked up in
`devices.json` to get that display's Pre-Shared Key, and the command goes to
that display's address.

What makes this trustworthy is that the service is exposed **directly** — Node
binds the port itself, with no reverse proxy — so `req.ip` is the raw socket
peer. `trust proxy` is **off**, so a client-supplied `X-Forwarded-For` is
ignored and a display cannot forge its identity. (If a proxy is ever put in
front, set `TRUST_PROXY` and make the proxy *overwrite* `X-Forwarded-For` with
the real client address; append-style forwarding would reintroduce spoofing.)

There is no TLS. On the isolated AV VLAN nothing sensitive crosses the browser
leg — commands are authorized by source IP, and PSKs only ever travel
server→display (that Sony API is plain HTTP by design). See the note on HTTPS at
the end.

## Configure

```bash
cp devices.example.json devices.json
```

One entry per display. `devices.json` is gitignored — it holds the PSKs.

```json
{
  "dryRun": false,
  "displays": [
    {
      "ip": "10.20.30.41",
      "hostname": "bsu-av-tv-lib-101",
      "label": "Library 101",
      "psk": "the-displays-psk"
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `ip` | yes | The display's reserved/static address. This is its identity, so it must be unique. |
| `controlIp` | no | Where commands are sent. Defaults to `ip`. Only for bench testing — see below. |
| `hostname` | yes | Used in logs and error messages. |
| `label` | no | Shown in the page header. Defaults to `hostname`. |
| `psk` | yes | Per-display Pre-Shared Key. May be empty only when `dryRun` is on. |
| `dryRun` | no | Log the Sony call instead of sending it. |
| `inputs`, `apps`, `commands` | no | Per-display button overrides. Omit for catalog defaults. |

Startup fails loudly on a bad config — duplicate IPs, a malformed address, or a
missing PSK — rather than silently mis-routing a command.

### On each display

Settings → Network & Internet → Local network setup → IP control:

- Set **Authentication** to allow Pre-Shared Key, and set the key.
- Make sure IP control is enabled.
- Point the browser at the service: Settings → **Initial input source** → the
  HTML5/browser option, with the URL `https://display-control.example.edu/`.

## Run locally

```bash
pnpm install
```

Build and start:

```bash
pnpm --filter @workspace/bravia-web run build && pnpm --filter @workspace/bravia-web run start
```

Defaults to `PORT=8080`, `HOST=127.0.0.1`, config at `./devices.json`.

For UI work, run the server and Vite side by side — Vite proxies `/api` to 8080:

```bash
pnpm --filter @workspace/bravia-web run dev:server
```

```bash
pnpm --filter @workspace/bravia-web exec vite
```

Note that when you hit the dev server from your own machine, your source IP is
loopback — add a `127.0.0.1` entry to `devices.json` (the example file has one)
or you will get a `403 unknown_display`.

## Testing without a display

Three options, in increasing bluntness:

1. Mark one entry `"dryRun": true`.
2. Set the file-level `"dryRun": true` for every display.
3. Set `BRAVIA_DRY_RUN=1`, which forces dry-run regardless of the file. This
   also relaxes the "PSK must be present" check, so a config full of blank keys
   still starts.

Dry-run logs the exact URL and JSON body that would have been sent and returns a
plausible `getApplicationList` response, so app-URI resolution is exercised too.

## Testing from your desk against a real display

In production `ip` is both the identity and the target: the display that asks is
the display that acts. That makes a bench test awkward, since a request from
your laptop carries your laptop's address.

`controlIp` splits the two. Put your workstation's address in `ip` and the
display's in `controlIp`:

```json
{
  "ip": "10.20.30.200",
  "controlIp": "10.20.30.41",
  "hostname": "bench-test",
  "psk": "the-displays-psk"
}
```

Now loading the page from your laptop drives the real panel. Delete the entry
before going live — leave it in and that workstation keeps control of that
display.

Useful probes:

```bash
curl -s localhost:8080/api/healthz
```

```bash
curl -s localhost:8080/api/whoami
```

`/api/whoami` reports the IP the server resolved and whether it is registered —
the first thing to check when nginx is in the way.

```bash
curl -s localhost:8080/api/apps
```

`/api/apps` returns the display's real `getApplicationList` output. Use it to
find the correct package name when adding an app to the catalog.

## Admin panel

A per-display admin panel lets you show/hide tiles, reorder them, and toggle
"return to signage when idle". It is **launched by a hidden gesture**, not a
visible button:

- **On a TV remote:** press **D-pad Up five times** while on the top row.
- **On a keyboard (testing):** the same (ArrowUp ×5 at the top row), or **Esc
  ×5**. Clicking the BSU logo five times also works.

There is **no password**. The protection is that only a **registered display
IP** can reach the app at all (an unknown IP gets 403 before anything), and the
launch is deliberately obscure. On the controlled AV VLAN that network position
is the auth — configuring is gated by *where you are*, not a credential.
Displays never enter anything; they just load the page and issue commands
authorized by their source IP.

Edits are stored in a separate `overrides.json` (path `ADMIN_OVERRIDES`, default
beside `devices.json`), keyed by hostname. It holds **no secrets** and is never
`devices.json`, so the PSK file is never rewritten by the app. `loadConfig`
stays the provisioning source; admin edits merge on top per request, and a
hidden tile also cannot be driven through the control API.

## API

All routes except `/api/healthz`, `/api/whoami` and `/api/weather` require the
caller's IP to be registered — that includes the `/api/admin/*` routes.

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/healthz` | — | Liveness. Open. |
| GET | `/api/whoami` | — | Resolved source IP. Open. |
| GET | `/api/weather` | — | Cached weather for the header. Open. |
| GET | `/api/config` | — | Which display this is, its ordered tiles, autoSignage. |
| POST | `/api/input` | `{"inputId":"hdmi1"}` | Switch HDMI input. |
| POST | `/api/app` | `{"appId":"youtube"}` | Launch an app. |
| POST | `/api/command` | `{"commandId":"screenoff"}` | Screen off / on / power off. |
| GET | `/api/apps` | — | Raw installed-app list. |
| GET | `/api/admin/settings` | — | Editable settings for this display. |
| PUT | `/api/admin/settings` | `{enabled,order,autoSignage}` | Save this display's settings. |

Failures from a display come back as `502` with a human-readable `message` — a
wrong PSK, an unreachable display, and a Sony-level rejection are distinguished,
because Sony returns HTTP 200 with an `error` tuple in the body and that is easy
to mistake for success.

## Deploy (Ubuntu, no nginx, no cert)

The service runs directly as the `its` user from the repo clone, binding port 80
itself (via `CAP_NET_BIND_SERVICE`), so displays load `http://its-avctrl-bsu-av/`
with no port in the URL. There is no reverse proxy and no TLS.

Build on the NUC (see the repo-level notes: Node 20 + pnpm in `~/.local`), then:

```bash
sudo mkdir -p /etc/bravia-web
```

Put the real config outside the repo (holds PSKs):

```bash
sudo cp ~/BSU-TV-App/artifacts/bravia-web/devices.json /etc/bravia-web/devices.json && sudo chmod 640 /etc/bravia-web/devices.json
```

Create `/etc/bravia-web/bravia-web.env` from `.env.example` (`PORT=80`,
`HOST=0.0.0.0`, `DEVICES_CONFIG=/etc/bravia-web/devices.json`,
`ADMIN_OVERRIDES=/etc/bravia-web/overrides.json`), then install and start:

```bash
sudo cp ~/BSU-TV-App/artifacts/bravia-web/deploy/bravia-web.service /etc/systemd/system/bravia-web.service
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now bravia-web
```

```bash
sudo systemctl status bravia-web && sudo journalctl -u bravia-web -f
```

Updating later is `git pull` + rebuild + `sudo systemctl restart bravia-web` —
no file copying.

### If HTTPS turns out to be required

Nothing here needs TLS, and the displays' identity/commands don't either. The
only thing that could force it is Sony's "Initial input source" URL loader
refusing a plain `http://` URL — verify by pointing one display at
`http://its-avctrl-bsu-av/`. If it must be HTTPS, put nginx in front for TLS,
set `TRUST_PROXY=loopback` and `HOST=127.0.0.1` `PORT=8080`, and use a **DNS-01**
Let's Encrypt challenge with split-horizon DNS (an isolated AV VLAN usually
can't validate HTTP-01). Keep TLS 1.2 enabled — the BZ30L browser may not
negotiate 1.3.

## Layout

```
src/shared/catalog.ts     inputs, apps, commands + tile model — shared by server and UI
src/server/lib/config.ts  devices.json loading and validation
src/server/lib/settings.ts admin overrides store + effective-config merge
src/server/lib/bravia.ts  Sony REST client, dry-run, package→URI resolution
src/server/lib/weather.ts server-side weather (cached)
src/server/lib/ip.ts      source-IP normalisation
src/server/middlewares/   device resolution from source IP
src/server/routes/        /api/* (control + admin)
src/web/                  the page the displays load
deploy/                   systemd unit
```

To add a button, edit `src/shared/catalog.ts` — the server validates against the
same list the UI renders from, so the two cannot drift. Get the package name from
`/api/apps` on a real display.
