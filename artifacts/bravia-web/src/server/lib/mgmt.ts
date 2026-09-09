import crypto from "node:crypto";

/**
 * Auth for the management plane (device registration). Unlike the display
 * control plane -- which is authorised by source IP -- the management page is
 * reached from an arbitrary device (a phone) and edits PSKs, so it requires a
 * shared password (MGMT_PASSWORD), checked in constant time.
 *
 * If MGMT_PASSWORD is unset the management server does not start at all, so the
 * device registry is never editable without a credential.
 */

export function mgmtPassword(): string {
  return process.env["MGMT_PASSWORD"] ?? "";
}

export function mgmtEnabled(): boolean {
  return mgmtPassword().trim() !== "";
}

export function mgmtPort(): number {
  const raw = process.env["MGMT_PORT"];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8081;
}

export function checkMgmtPassword(candidate: string): boolean {
  const expected = mgmtPassword();
  if (expected.trim() === "") return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
