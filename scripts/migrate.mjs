import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { readFile } from "node:fs/promises";
import { database } from "../app/lib/db.js";
loadEnvConfig(process.cwd());
try {
  await database().query(
    await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"),
  );
  console.log("speech_experiment schema is ready");
} finally {
  await database().end();
}
