import "./sync-rubric.mjs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const engine = resolve("../pub_speak_engine");
const python =
  process.env.SPEECH_ENGINE_PYTHON ||
  (existsSync(`${engine}/.venv/bin/python`)
    ? `${engine}/.venv/bin/python`
    : "python3");
const children = [
  spawn(
    python,
    [
      "-m",
      "uvicorn",
      "main:app",
      "--app-dir",
      engine,
      "--env-file",
      `${engine}/.env`,
      "--host",
      "127.0.0.1",
      "--port",
      "8000",
    ],
    { stdio: "inherit" },
  ),
  spawn("npm", ["run", "worker"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev", "--", "--port", "3000"], { stdio: "inherit" }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop();
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`Service exited (${code})`);
      stop();
    }
  });
}
