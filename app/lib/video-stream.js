// Bound database reads and open-ended browser requests independently of video size.
export const VIDEO_READ_BYTES = 256 * 1024;
export const VIDEO_RANGE_BYTES = 1024 * 1024;

export function videoRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : Math.min(size - 1, start + VIDEO_RANGE_BYTES - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    end = Math.min(end, size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end, partial: true };
}

export function videoStream({ start, end, read, signal }) {
  let offset = start, cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      if (cancelled) return;
      if (signal?.aborted || offset > end) {
        controller.close();
        return;
      }
      const length = Math.min(VIDEO_READ_BYTES, end - offset + 1);
      try {
        const data = await read(offset, length);
        // A cancelled request may still have one database read in flight.
        if (cancelled) return;
        if (signal?.aborted) { controller.close(); return; }
        if (data.length !== length) throw new Error("Incomplete recording range");
        offset += data.length;
        controller.enqueue(data);
        if (offset > end) controller.close();
      } catch (error) {
        if (!cancelled) controller.error(error);
      }
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
}
