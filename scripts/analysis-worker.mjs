import nextEnv from "@next/env";
import { database } from "../app/lib/db.js";
import { processAnalysis } from "../app/lib/analysis.js";
nextEnv.loadEnvConfig(process.cwd());
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
console.log("Durable analysis worker running");
while (!stopping) {
  try {
    const jobs = (
      await database().query(
        "SELECT id FROM speech_experiment.rounds WHERE state='analyzing' AND (analysis_claim IS NULL OR analysis_started_at<now()-interval '20 minutes') ORDER BY recording_ended_at LIMIT 2",
      )
    ).rows;
    await Promise.all(jobs.map((job) => processAnalysis(job.id)));
  } catch {
    console.error("[worker] Database unavailable; retrying");
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 3000));
}
await database().end();
