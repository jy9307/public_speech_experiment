import { api } from "../../lib/api";
import { loadStudy, transition } from "../../lib/study";
export async function GET(request) {
  return api(request, async (p) => Response.json(await loadStudy(p.id)));
}
export async function POST(request) {
  return api(request, async (p) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "요청을 확인해 주세요." }, { status: 400 });
    }
    await transition(p.id, body.roundId, body.action);
    return Response.json(await loadStudy(p.id));
  });
}
