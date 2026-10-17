import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

// Public artifact identifies the actually published build; no environment dump or secrets.
const commit = process.env.COMMIT_REF || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("Invalid build revision");
await writeFile(new URL("../dist/build-info.json", import.meta.url), JSON.stringify({ product: "NODUS", commit }));
