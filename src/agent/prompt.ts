import { readFile } from "node:fs/promises";

const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;

export async function loadSystemPrompt(path: string): Promise<string> {
  const raw = await readFile(path, "utf8");
  return raw.replace(FRONTMATTER, "").trim();
}
