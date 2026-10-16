import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { readFile } from "node:fs/promises";
import { database, transaction } from "../app/lib/db.js";
loadEnvConfig(process.cwd());
const path = process.argv[2];
if (!path)
  throw new Error("Usage: npm run db:assign -- path/to/assignments.csv");
const lines = (await readFile(path, "utf8")).trim().split(/\r?\n/);
const rows = lines
  .filter((line) => line.trim() && !line.startsWith("participant_id,"))
  .map((line) => {
    const [rawId, rawCondition, testFlag = "false", extra] = line
      .split(",")
      .map((x) => x.trim());
    const id = rawId.toLowerCase();
    const condition = {
      ctrl: "control",
      exp: "experiment",
      control: "control",
      experiment: "experiment",
    }[rawCondition];
    if (
      !/^[a-z0-9가-힣_-]{1,40}$/.test(id) ||
      !condition ||
      !["true", "false"].includes(testFlag) ||
      extra !== undefined
    )
      throw new Error("Invalid assignment row");
    return [id, condition, testFlag === "true"];
  });
if (new Set(rows.map((row) => row[0])).size !== rows.length)
  throw new Error("Duplicate participant IDs");
try {
  await transaction(async (client) => {
    for (const [id, condition, isTest] of rows) {
      const existing = await client.query(
        "SELECT condition FROM speech_experiment.participants WHERE id=$1",
        [id],
      );
      if (existing.rows[0] && existing.rows[0].condition !== condition)
        throw new Error("An enrolled participant cannot change condition");
      await client.query(
        "INSERT INTO speech_experiment.assignments(participant_id,condition,is_test) VALUES($1,$2,$3) ON CONFLICT(participant_id) DO UPDATE SET condition=EXCLUDED.condition,is_test=EXCLUDED.is_test",
        [id, condition, isTest],
      );
    }
  });
  console.log(`Imported ${rows.length} assignments`);
} finally {
  await database().end();
}
