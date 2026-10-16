import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { database, transaction } from "./db";
const COOKIE = "speech-participant";
export function normalizeId(input) {
  const id = typeof input === "string" ? input.trim().toLowerCase() : "";
  return /^[a-z0-9가-힣_-]{1,40}$/.test(id) ? id : null;
}
export async function enrollParticipant(input) {
  const id = normalizeId(input);
  if (!id) return null;
  return transaction(async (client) => {
    const assignment = (
      await client.query(
        "SELECT condition,is_test FROM speech_experiment.assignments WHERE participant_id=$1 FOR SHARE",
        [id],
      )
    ).rows[0];
    if (!assignment) return null;
    await client.query(
      "INSERT INTO speech_experiment.participants(id,condition) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET last_seen_at=now()",
      [id, assignment.condition],
    );
    await client.query(
      "INSERT INTO speech_experiment.rounds(id,participant_id,number) VALUES($1,$2,1) ON CONFLICT(participant_id,number) DO NOTHING",
      [randomUUID(), id],
    );
    return { id, group: assignment.condition, isTest: assignment.is_test };
  });
}
function signature(value) {
  if (!process.env.SESSION_SECRET)
    throw new Error("SESSION_SECRET is required");
  return createHmac("sha256", process.env.SESSION_SECRET)
    .update(value)
    .digest("hex");
}
export async function setParticipant(participant) {
  const value = `${participant.id}:${Date.now() + 12 * 60 * 60 * 1000}`;
  (await cookies()).set(COOKIE, `${value}.${signature(value)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}
export async function getParticipant() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [value, mac, extra] = raw.split(".");
  if (
    extra ||
    !mac ||
    !/^[a-f0-9]{64}$/.test(mac) ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(signature(value)))
  )
    return null;
  const [id, expiry] = value.split(":");
  if (!(Number(expiry) > Date.now()) || !normalizeId(id)) return null;
  const row = (
    await database().query(
      "SELECT p.id,p.condition,a.is_test FROM speech_experiment.participants p JOIN speech_experiment.assignments a ON a.participant_id=p.id WHERE p.id=$1",
      [id],
    )
  ).rows[0];
  return row ? { id: row.id, group: row.condition, isTest: row.is_test } : null;
}
export async function clearParticipant() {
  (await cookies()).delete(COOKIE);
}
