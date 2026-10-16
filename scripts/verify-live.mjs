import nextEnv from "@next/env";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { database } from "../app/lib/db.js";
nextEnv.loadEnvConfig(process.cwd());
const videoPath = process.argv[2];
const duration = Number(process.argv[3] || 25);
if (!videoPath || !Number.isFinite(duration) || duration <= 0)
  throw new Error(
    "Usage: npm run test:live -- /path/video.mp4 durationSeconds",
  );
const id = `qa_live_${randomUUID().slice(0, 8)}`;
await database().query(
  "INSERT INTO speech_experiment.assignments(participant_id,condition,is_test) VALUES($1,'experiment',true)",
  [id],
);
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto("http://localhost:3000");
  await page.getByLabel("참여자 아이디").fill(id);
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await page.waitForURL(/experiment$/);
  await page
    .getByRole("button", { name: "1번째 발표 시작", exact: true })
    .waitFor();
  const state = await (
    await page.request.get("http://localhost:3000/api/study")
  ).json();
  await page.request.post("http://localhost:3000/api/study", {
    data: { roundId: state.round.id, action: "start" },
  });
  // Imported QA footage uses synthetic timing metadata, never participant observations.
  const fixtureEndedAt = Date.now();
  const uploaded = await page.request.post(
    "http://localhost:3000/api/recording",
    {
      multipart: {
        roundId: state.round.id,
        durationMs: String(Math.round(duration * 1000)),
        recordingStartedAt: new Date(fixtureEndedAt-Math.round(duration*1000)).toISOString(),
        recordingEndedAt: new Date(fixtureEndedAt).toISOString(),
        uploadStartedAt: new Date().toISOString(),
        video: {
          name: "real-fixture.mp4",
          mimeType: "video/mp4",
          buffer: await readFile(videoPath),
        },
      },
    },
  );
  if (!uploaded.ok()) throw new Error("Upload failed");
  console.log(
    "Uploaded actual video to app/database; waiting for real engine",
    id,
  );
  const deadline = Date.now() + 15 * 60 * 1000;
  let latest;
  do {
    latest = await (
      await page.request.get("http://localhost:3000/api/study")
    ).json();
    if (latest.round.state === "analysis_failed")
      throw new Error(latest.round.analysis_error);
    if (latest.round.state === "sense") break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (Date.now() < deadline);
  if (latest.round.state !== "sense") throw new Error("Engine timed out");
  await page.reload();
  await page.getByLabel("내용 비교", { exact: true }).waitFor();
  await page
    .getByLabel("AI에게 보낼 메시지")
    .fill("이 피드백에서 어떤 발표 근거를 먼저 확인하면 좋을까요?");
  await page.getByRole("button", { name: "메시지 보내기" }).click();
  await page.locator(".chat-bubble.user").waitFor({ timeout: 65000 });
  const messages = (
    await database().query(
      "SELECT role,content,client_at,received_at FROM speech_experiment.chat_messages WHERE round_id=$1 ORDER BY received_at",
      [state.round.id],
    )
  ).rows;
  if (
    !messages.some((m) => m.role === "assistant") ||
    !messages.some((m) => m.role === "user")
  )
    throw new Error("Chat messages not persisted");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/live-engine-chat-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/live-engine-chat-mobile.png",
    fullPage: true,
  });
  await writeFile(
    "test-results/live-verification.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        roundId: state.round.id,
        participantId: id,
        feedbackAreas: latest.round.feedback.map((f) => f.categoryId),
        chatRoles: messages.map((m) => m.role),
        fixtureTimingMetadata: "synthetic imported QA fixture",
        actualEngine: true,
        actualGeminiChat: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: app → database → real engine → feedback UI → real chatbot → logged messages",
  );
} finally {
  if (browser) await browser.close();
  const { spawnSync } = await import("node:child_process");
  spawnSync("node", ["scripts/reset-test-participant.mjs", id], {
    stdio: "inherit",
  });
  await database().query(
    "DELETE FROM speech_experiment.assignments WHERE participant_id=$1",
    [id],
  );
  await database().end();
}
