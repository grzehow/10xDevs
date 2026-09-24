// PostToolUse(Write|Edit) hook: run Prettier on the one file Claude just wrote.
//
// Deliberately does NOT shell out through jq/xargs: an empty extracted path makes
// `prettier --write` fall through to the entire repository. Every early return here
// exits 0 so a formatting failure never blocks an edit.
//
// Skips .claude/ because @przeprogramowani/10x-cli tracks those files by SHA-256
// content hash, and reformatting one makes the next `10x` sync report a conflict.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const file = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path;
if (typeof file !== "string" || file.trim() === "") process.exit(0);

const repo = process.cwd();
const rel = relative(repo, resolve(repo, file)).replaceAll("\\", "/");
if (rel === "" || rel.startsWith("../") || rel.startsWith(".claude/")) process.exit(0);

const prettier = resolve(repo, "node_modules", "prettier", "bin", "prettier.cjs");
spawnSync(process.execPath, [prettier, "--ignore-unknown", "--write", rel], { stdio: "ignore" });
process.exit(0);
