import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function speakingMaterials() {
  const text = await readFile(resolve(process.cwd(), "speaking_materials.md"), "utf8");
  if (!text.trim()) throw new Error("Speaking materials are empty");
  return { source: "speaking_materials.md", text, sha256: createHash("sha256").update(text).digest("hex") };
}
