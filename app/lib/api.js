import { getParticipant } from "./session";
import { sameOriginRequest } from "./request-origin";
export async function api(request, work) {
  try {
    if (
      request.method !== "GET" &&
      !sameOriginRequest(request)
    )
      return Response.json(
        { error: "허용되지 않은 요청입니다." },
        { status: 403 },
      );
    const participant = await getParticipant();
    if (!participant)
      return Response.json({ error: "다시 로그인해 주세요." }, { status: 401 });
    return await work(participant);
  } catch (error) {
    if (!error.status)
      console.error("[study] Request failed:", error.code || error.name);
    return Response.json(
      {
        error: error.status
          ? error.message
          : "데이터를 저장하지 못했습니다. 다시 시도해 주세요.",
      },
      { status: error.status || 503 },
    );
  }
}
