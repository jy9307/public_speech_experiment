import { clearAdmin, matchesAdminPassword, setAdmin } from "../../../lib/admin";
import { sameOriginRequest } from "../../../lib/request-origin";

export async function POST(request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "비밀번호를 확인해 주세요." }, { status: 400 }); }
  if (!matchesAdminPassword(body?.password)) return Response.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
  await setAdmin();
  return Response.json({ ok: true });
}

export async function DELETE(request) {
  if (!sameOriginRequest(request)) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  await clearAdmin();
  return Response.json({ ok: true });
}
