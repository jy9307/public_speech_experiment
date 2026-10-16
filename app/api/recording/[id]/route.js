import { createHash } from "node:crypto";
import { api } from "../../../lib/api";
import { database } from "../../../lib/db";
import { assertStudy } from "../../../lib/study";
import { videoRange, videoStream } from "../../../lib/video-stream";
export const runtime = "nodejs";

async function recording(request, context, head = false) {
  return api(request, async (participant) => {
    const { id } = await context.params;
    assertStudy(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id), "회차를 확인해 주세요.", 400);
    // Ownership is checked on every request, including cache revalidation and HEAD.
    const row = (await database().query(
      `SELECT rec.mime_type,rec.byte_size,rec.recorded_at FROM speech_experiment.recordings rec
       JOIN speech_experiment.rounds r ON r.id=rec.round_id
       WHERE rec.round_id=$1 AND r.participant_id=$2`,
      [id, participant.id],
    )).rows[0];
    assertStudy(row, "영상이 없습니다.", 404);
    const size = Number(row.byte_size);
    const etag = `"${createHash("sha256").update(`${id}:${size}:${row.recorded_at.toISOString()}`).digest("hex")}"`;
    const modified = row.recorded_at.toUTCString();
    const headers = {
      "Content-Type": row.mime_type,
      "Accept-Ranges": "bytes",
      // Revalidate privately; a cached video must never bypass session ownership.
      "Cache-Control": "private, no-cache",
      "Vary": "Cookie",
      "ETag": etag,
      "Last-Modified": modified,
      "X-Accel-Buffering": "no",
    };
    const noneMatch = request.headers.get("if-none-match");
    if (noneMatch?.split(",").some((value) => value.trim() === "*" || value.trim().replace(/^W\//, "") === etag))
      return new Response(null, { status: 304, headers });

    const ifRange = request.headers.get("if-range");
    const matchesRange = !ifRange || ifRange === etag ||
      (Number.isFinite(Date.parse(ifRange)) && Date.parse(modified) <= Date.parse(ifRange));
    // HEAD describes the full representation and never queries its video bytes.
    const range = videoRange(head || !matchesRange ? null : request.headers.get("range"), size);
    if (!range) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    headers["Content-Length"] = String(range.end - range.start + 1);
    if (range.partial) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
    const body = head ? null : videoStream({
      ...range,
      signal: request.signal,
      read: async (offset, length) => (await database().query(
        "SELECT substring(video FROM $2::integer FOR $3::integer) AS video FROM speech_experiment.recordings WHERE round_id=$1",
        [id, offset + 1, length],
      )).rows[0].video,
    });
    return new Response(body, { status: range.partial ? 206 : 200, headers });
  });
}
export async function GET(request, context) { return recording(request, context); }
export async function HEAD(request, context) { return recording(request, context, true); }
