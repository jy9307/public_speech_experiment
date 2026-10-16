import test from "node:test";
import assert from "node:assert/strict";
import { recordingPath, recordingBytes } from "../app/lib/recording-storage.js";
const id = "c61e4efd-adec-4fa1-878d-64cd7ed1d075";
test("recording folders use the assigned participant and round and reject path escapes", () => {
  assert.equal(recordingPath("student01", 2, id, "video/webm"), `experiments/student01/attempt_2/${id}.webm`);
  for (const participant of ["../student01", "student01/other", "student01%2fother"])
    assert.throws(() => recordingPath(participant, 2, id, "video/webm"));
  for (const number of [0, 6, 1.5]) assert.throws(() => recordingPath("student01", number, id, "video/mp4"));
});
test("legacy database recordings remain readable until their verified migration", async () => {
  const video = Buffer.from([0, 255, 31, 8]);
  assert.equal(await recordingBytes({ video }), video);
  await assert.rejects(recordingBytes({}), /missing/);
});
