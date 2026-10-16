export function sameOriginRequest(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const expected = process.env.STUDY_APP_ORIGIN || new URL(request.url).origin;
  return origin === new URL(expected).origin;
}
