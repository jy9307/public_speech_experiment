import { Storage } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { OAuth2Client } from "google-auth-library";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const DEFAULT_STORAGE_BUCKET = "speech-evaluator-1a56c.firebasestorage.app";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function recordingPath(participantId, number, roundId, mimeType) {
  if (!/^[a-z0-9가-힣_-]{1,40}$/.test(participantId) || !Number.isInteger(number) || number < 1 || number > 5 || !UUID.test(roundId) || !["video/webm","video/mp4"].includes(mimeType)) throw new Error("Invalid recording identity");
  return `experiments/${participantId}/attempt_${number}/${roundId}.${mimeType === "video/mp4" ? "mp4" : "webm"}`;
}
export function storageFile(recording) {
  if (!globalThis.speechStorage) {
    let authClient;
    if (process.env.NODE_ENV !== "production" && process.env.FIREBASE_STORAGE_USE_GCLOUD === "true" && !process.env.STORAGE_EMULATOR_HOST) {
      authClient = new OAuth2Client();
      authClient.refreshHandler = async () => {
        const { stdout } = await promisify(execFile)("gcloud", ["config", "config-helper", "--force-auth-refresh", "--format=json"], { timeout: 30000, maxBuffer: 1024 * 1024 });
        const { credential } = JSON.parse(stdout);
        return { access_token: credential.access_token, expiry_date: Date.parse(credential.token_expiry) };
      };
    }
    globalThis.speechStorage = new Storage(authClient ? { authClient } : undefined);
  }
  return globalThis.speechStorage.bucket(recording.storage_bucket).file(recording.storage_path,
    recording.storage_generation ? { generation: recording.storage_generation } : undefined);
}
export async function storeRecording({ participantId, number, roundId, mimeType, bytes }) {
  const record = {
    storage_bucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET,
    storage_path: recordingPath(participantId, number, roundId, mimeType),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const file = storageFile(record);
  try {
    await file.save(bytes, { resumable: false, validation: "crc32c", preconditionOpts: { ifGenerationMatch: 0 }, metadata: {
      contentType: mimeType, cacheControl: "private, no-cache",
      metadata: { roundId, participantId, roundNumber: String(number), sha256: record.sha256 },
    } });
  } catch (error) {
    if (Number(error.code) !== 412) throw error;
    // A retry after a DB failure may find the immutable upload already present.
  }
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) !== bytes.length || metadata.metadata?.sha256 !== record.sha256 || metadata.metadata?.roundId !== roundId)
    throw new Error("Stored recording does not match upload");
  return { ...record, storage_generation: String(metadata.generation) };
}
export async function recordingBytes(recording) {
  if (!recording.storage_path) {
    if (!recording.video) throw new Error("Recording content is missing");
    return recording.video;
  }
  const [bytes] = await storageFile(recording).download();
  if (bytes.length !== Number(recording.byte_size) || (recording.sha256 && createHash("sha256").update(bytes).digest("hex") !== recording.sha256))
    throw new Error("Recording checksum mismatch");
  return bytes;
}
export function storageVideoStream(recording, { start, end, signal }) {
  const stream = storageFile(recording).createReadStream({ start, end, validation: false });
  const abort = () => stream.destroy();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  stream.once("close", () => signal?.removeEventListener("abort", abort));
  return Readable.toWeb(stream);
}
export async function deleteStoredRecording(recording) {
  if (!recording.storage_path) return;
  await storageFile(recording).delete({ ignoreNotFound: true, ifGenerationMatch: recording.storage_generation });
}
