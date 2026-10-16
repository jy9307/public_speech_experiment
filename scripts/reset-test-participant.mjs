import nextEnv from "@next/env";
import { database, transaction } from "../app/lib/db.js";
nextEnv.loadEnvConfig(process.cwd());
const id = process.argv[2]?.trim().toLowerCase();
if (!id) throw new Error("Usage: npm run db:reset-test -- student01");
try {
  await transaction(async (client) => {
    const row = (
      await client.query(
        "SELECT is_test FROM speech_experiment.assignments WHERE participant_id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!row?.is_test) throw new Error("Only assigned test IDs may be reset");
    await client.query(
      "DELETE FROM speech_experiment.chat_messages WHERE round_id IN (SELECT id FROM speech_experiment.rounds WHERE participant_id=$1) AND role='assistant'",
      [id],
    );
    for (const table of [
      "chat_messages",
      "responses",
      "response_revisions",
      "screen_visits",
      "events",
      "recordings",
    ])
      await client.query(
        `DELETE FROM speech_experiment.${table} WHERE round_id IN (SELECT id FROM speech_experiment.rounds WHERE participant_id=$1)`,
        [id],
      );
    await client.query(
      "DELETE FROM speech_experiment.rounds WHERE participant_id=$1",
      [id],
    );
    await client.query(
      "DELETE FROM speech_experiment.participants WHERE id=$1",
      [id],
    );
  });
  console.log(`Reset test participant ${id}; condition assignment retained`);
} finally {
  await database().end();
}
