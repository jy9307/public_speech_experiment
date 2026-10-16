import { api } from "../../lib/api";
import { storeEvents } from "../../lib/events";
export async function POST(request) {
  return api(request, async (p) => {
    const text = await request.text();
    if (text.length > 500000)
      return Response.json(
        { error: "기록 크기가 너무 큽니다." },
        { status: 413 },
      );
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return Response.json({ error: "기록을 확인해 주세요." }, { status: 400 });
    }
    await storeEvents(p, data.events);
    return Response.json({ saved: true });
  });
}
