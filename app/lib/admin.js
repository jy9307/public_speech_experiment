import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "speech-admin";

function signature(value) {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required");
  return createHmac("sha256", process.env.SESSION_SECRET).update(`admin:${value}`).digest("hex");
}

export async function isAdmin() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [value, mac, extra] = raw.split(".");
  if (extra || !value || !mac || !/^[a-f0-9]{64}$/.test(mac)) return false;
  const expected = signature(value);
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  return Number(value) > Date.now();
}

export async function setAdmin() {
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
  (await cookies()).set(COOKIE, `${expiry}.${signature(expiry)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}

export async function clearAdmin() {
  (await cookies()).delete(COOKIE);
}

export function matchesAdminPassword(input) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof input !== "string") return false;
  const actualBytes = Buffer.from(input);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
