import { mgmtPort } from "./lib/mgmt";

/**
 * The page switcher shared by the management and dashboard pages: a row of
 * pill links in the sticky header, the current page in crimson (same pattern
 * as the Globe project's manager pages).
 *
 * The two pages run on different ports, so links are built in the browser from
 * whatever host the page was opened on, plus the port the server is listening
 * on. Each page keeps its own PIN: switching pages may ask to sign in again.
 */

export function dashPort(): number {
  const raw = process.env["DASH_PORT"];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 8082;
}

type PageId = "registry" | "dashboard";

const PAGES: { id: PageId; label: string; port: () => number }[] = [
  { id: "registry", label: "Display registry", port: mgmtPort },
  { id: "dashboard", label: "Dashboard", port: dashPort },
];

export const pageNavCss = /* css */ `
  header { justify-content:flex-start; gap:.6rem 1rem; flex-wrap:wrap; border-bottom:2px solid var(--red); }
  header .spacer { flex:1; min-width:0; }
  nav.pages { display:flex; gap:6px; flex-wrap:wrap; }
  nav.pages a { display:inline-flex; align-items:center; min-height:36px; padding:0 13px; border-radius:8px; border:1px solid var(--line);
                color:var(--text); text-decoration:none; font-size:.85rem; background:#303030; white-space:nowrap; }
  nav.pages a:hover { border-color:var(--red); }
  nav.pages a.here { background:var(--red); border-color:var(--red); color:#fff; font-weight:600; }
`;

/** The nav markup plus the few lines that point each link at the right port. */
export function pageNavHtml(current: PageId): string {
  const links = PAGES.map((p) =>
    p.id === current
      ? `<a class="here" href="" aria-current="page">${p.label}</a>`
      : `<a href="/" data-port="${p.port()}">${p.label}</a>`,
  ).join("");
  return `<nav class="pages" aria-label="Pages">${links}</nav>
  <script>
    Array.prototype.forEach.call(document.querySelectorAll("nav.pages a[data-port]"), function (a) {
      a.href = location.protocol + "//" + location.hostname + ":" + a.getAttribute("data-port") + "/";
    });
  </script>`;
}
