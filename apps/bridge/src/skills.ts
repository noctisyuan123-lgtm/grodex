import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type SkillEntry = {
  name: string;
  description: string;
  source: string;
  dir: string;
};

function parseSkillFrontmatter(raw: string): {
  name?: string;
  description?: string;
} {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const block = m[1]!;
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  let description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (description?.startsWith('"') || description?.startsWith("'")) {
    description = description.replace(/^["']|["']$/g, "");
  } else if (description?.startsWith("|") || description?.startsWith(">")) {
    description = description.replace(/^[|>]-?\s*/, "");
  }
  if (!description || description === "|" || description === ">") {
    const multi = block.match(
      /^description:\s*[|>]-?\s*\n((?:[ \t]+.+\n?)+)/m
    );
    if (multi) {
      description = multi[1]!
        .split("\n")
        .map((l) => l.replace(/^[ \t]+/, ""))
        .join(" ")
        .trim();
    }
  }
  return { name, description };
}

/** Discover Grok / Claude / Cursor skills (name + short description). */
export function listSkills(cwd?: string): SkillEntry[] {
  const roots: { dir: string; source: string }[] = [
    { dir: path.join(os.homedir(), ".grok", "skills"), source: "user-grok" },
    { dir: path.join(os.homedir(), ".claude", "skills"), source: "user-claude" },
    { dir: path.join(os.homedir(), ".cursor", "skills"), source: "user-cursor" },
  ];
  if (cwd) {
    roots.unshift(
      { dir: path.join(cwd, ".grok", "skills"), source: "project-grok" },
      { dir: path.join(cwd, ".claude", "skills"), source: "project-claude" },
      { dir: path.join(cwd, ".cursor", "skills"), source: "project-cursor" }
    );
  }

  const byName = new Map<string, SkillEntry>();
  for (const { dir, source } of roots) {
    let entries: fs.Dirent[] = [];
    try {
      if (!fs.existsSync(dir)) continue;
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (["shell", "canvas", "statusline", "node_modules"].includes(ent.name)) {
        continue;
      }
      const skillDir = path.join(dir, ent.name);
      const md = path.join(skillDir, "SKILL.md");
      if (!fs.existsSync(md)) continue;
      try {
        const raw = fs.readFileSync(md, "utf8").slice(0, 8000);
        const fm = parseSkillFrontmatter(raw);
        const name = (fm.name || ent.name).trim();
        if (!name || byName.has(name)) continue;
        const description = (fm.description || "").slice(0, 160);
        byName.set(name, {
          name,
          description,
          source,
          dir: skillDir,
        });
      } catch {
        /* skip */
      }
    }
  }

  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}
