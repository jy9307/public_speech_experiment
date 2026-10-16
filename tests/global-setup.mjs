import { startMockEngine } from "./mock-engine.mjs";
export default async function setup() {
  const server = await startMockEngine();
  return () => new Promise((resolve) => server.close(resolve));
}
