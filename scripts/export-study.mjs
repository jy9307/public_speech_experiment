import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { database } from "../app/lib/db.js";
nextEnv.loadEnvConfig(process.cwd());
const includeTests = process.argv.includes("--include-tests");
const folder = resolve(
  process.argv.find((a, i) => i > 1 && !a.startsWith("--")) ||
    `exports/study-${new Date().toISOString().replaceAll(":", "-")}`,
);
await mkdir(folder, { recursive: true });
const filter = includeTests ? "true" : "NOT a.is_test";
try {
  const participants = (
    await database().query(
      `SELECT p.*,a.is_test FROM speech_experiment.participants p JOIN speech_experiment.assignments a ON a.participant_id=p.id WHERE ${filter} ORDER BY p.id`,
    )
  ).rows;
  await writeFile(
    `${folder}/participants.json`,
    JSON.stringify(participants, null, 2),
  );
  const metrics = (
    await database().query(
      `SELECT * FROM speech_experiment.round_metrics ${includeTests ? "" : "WHERE NOT is_test"} ORDER BY participant_id,number`,
    )
  ).rows;
  await writeFile(
    `${folder}/round_metrics.json`,
    JSON.stringify(metrics, null, 2),
  );
  for (const table of [
    "rounds",
    "responses",
    "response_revisions",
    "events",
    "screen_visits",
    "chat_messages",
    "recordings",
  ]) {
    const projection =
      table === "recordings"
        ? "d.round_id,d.mime_type,d.duration_ms,d.byte_size,d.recorded_at,d.storage_bucket,d.storage_path,d.storage_generation,d.sha256"
        : "d.*";
    const join =
      table === "rounds"
        ? "JOIN speech_experiment.assignments a ON a.participant_id=d.participant_id"
        : "JOIN speech_experiment.rounds r ON r.id=d.round_id JOIN speech_experiment.assignments a ON a.participant_id=r.participant_id";
    const rows = (
      await database().query(
        `SELECT ${projection} FROM speech_experiment.${table} d ${join} WHERE ${filter}`,
      )
    ).rows;
    await writeFile(`${folder}/${table}.json`, JSON.stringify(rows, null, 2));
  }
  await writeFile(
    `${folder}/manifest.json`,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        includeTests,
        participants: participants.length,
        note: "Recordings file contains metadata only; video originals are stored in Firebase Storage; legacy database videos may remain until migration.",
      },
      null,
      2,
    ),
  );
  console.log(`Exported ${participants.length} participants to ${folder}`);
} finally {
  await database().end();
}
