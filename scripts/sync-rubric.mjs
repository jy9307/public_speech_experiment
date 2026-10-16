import { copyFile, readFile } from "node:fs/promises";
const source = new URL("../fdb_cat.json", import.meta.url);
const categories = JSON.parse(await readFile(source, "utf8"));
if (
  categories.length !== 3 ||
  categories.some(
    (c) =>
      !c.label ||
      !c.items?.length ||
      c.items.some(
        (i) =>
          !i.id ||
          !i.label ||
          !i.desc ||
          Object.keys(i.levels || {})
            .sort()
            .join(",") !== "1,2,3,4",
      ),
  )
)
  throw new Error("Invalid study rubric");
await copyFile(
  source,
  new URL("../../pub_speak_engine/fdb_cat.json", import.meta.url),
);
await copyFile(
  new URL("../speaking_materials.md", import.meta.url),
  new URL("../../pub_speak_engine/speaking_materials.md", import.meta.url),
);
console.log("Engine rubric and speaking materials synchronized");
