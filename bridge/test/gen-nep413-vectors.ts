import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildVectors } from "./nep413-cases.js";

const out = fileURLToPath(new URL("./fixtures/nep413-vectors.json", import.meta.url));
writeFileSync(out, JSON.stringify(buildVectors(), null, 2) + "\n");
console.log(`wrote ${out}`);
