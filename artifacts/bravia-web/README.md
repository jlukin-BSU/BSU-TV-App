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

Two pieces make this trustworthy, and both matter:

1. The service binds to **127.0.0.1** only (`HOST`), so nginx is the sole way in.
2. nginx **overwrites** `X-Forwarded-For` with `$remote_addr` rather than
   appending to it, and Express trusts only the loopback hop
   (`app.set("trust proxy", "loopback")`).

If you skip either one, a display can forge an `X-Forwarded-For` header and
impersonate another display. Anything that can reach port 8080 directly is
trusted, so do not expose it.

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

## API

All routes except `/api/healthz` and `/api/whoami` require the caller's IP to be
registered.

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/healthz` | — | Liveness. Open. |
| GET | `/api/whoami` | — | Resolved source IP. Open. |
| GET | `/api/config` | — | Which display this is, and its buttons. |
| POST | `/api/input` | `{"inputId":"hdmi1"}` | Switch HDMI input. |
| POST | `/api/app` | `{"appId":"youtube"}` | Launch an app. |
| POST | `/api/command` | `{"commandId":"screenoff"}` | Screen off / on / power off. |
| GET | `/api/apps` | — | Raw installed-app list. |

Failures from a display come back as `502` with a human-readable `message` — a
wrong PSK, an unreachable display, and a Sony-level rejection are distinguished,
because Sony returns HTTP 200 with an `error` tuple in the body and that is easy
to mistake for success.

## Deploy (Ubuntu 22.04)

Build on the NUC, or build elsewhere and copy `dist/`.

```bash
sudo useradd --system --home /opt/bravia-web --shell /usr/sbin/nologin bravia
```

```bash
sudo mkdir -p /opt/bravia-web /etc/bravia-web
```

Copy `dist/` to `/opt/bravia-web/`, then the config:

```bash
sudo cp devices.json /etc/bravia-web/devices.json
```

```bash
sudo chown root:bravia /etc/bravia-web/devices.json && sudo chmod 640 /etc/bravia-web/devices.json
```

Create `/etc/bravia-web/bravia-web.env` from `.env.example` (set
`DEVICES_CONFIG=/etc/bravia-web/devices.json`), then:

```bash
sudo cp deploy/bravia-web.service /etc/systemd/system/bravia-web.service
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now bravia-web
```

```bash
sudo systemctl status bravia-web && sudo journalctl -u bravia-web -f
```

The unit runs as `bravia` with `ProtectSystem=strict` and a read-only filesystem;
nothing is written at runtime, and `devices.json` is read once at startup.

### nginx + Let's Encrypt

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

```bash
sudo cp deploy/nginx-bravia-web.conf /etc/nginx/sites-available/bravia-web
```

Replace `display-control.example.edu` with the real FQDN, then:

```bash
sudo ln -s /etc/nginx/sites-available/bravia-web /etc/nginx/sites-enabled/
```

```bash
sudo certbot --nginx -d display-control.example.edu
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Two things to keep in mind:

- **TLS 1.2 stays enabled.** The BZ30L's built-in browser does not reliably
  negotiate TLS 1.3, and a 1.3-only config shows up as a blank page with no
  useful error. The supplied config allows 1.2 and 1.3.
- **The displays must resolve the certificate's FQDN to the NUC's VLAN
  address.** If the AV VLAN has no inbound path from the internet, HTTP-01 will
  not validate — use `certbot --dns-<provider>` for a DNS-01 challenge, and
  point internal DNS at the NUC (split-horizon).

## Layout

```
src/shared/catalog.ts    inputs, apps and commands — shared by server and UI
src/server/lib/config.ts devices.json loading and validation
src/server/lib/bravia.ts Sony REST client, dry-run, package→URI resolution
src/server/lib/ip.ts     source-IP normalisation
src/server/middlewares/  device resolution from source IP
src/server/routes/       /api/*
src/web/                 the page the displays load
deploy/                  systemd unit and nginx site
```

To add a button, edit `src/shared/catalog.ts` — the server validates against the
same list the UI renders from, so the two cannot drift. Get the package name from
`/api/apps` on a real display.
