import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** macOS native folder dialog via AppleScript. Returns null when cancelled. */
export async function pickFolderMac(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  const script = `
try
  set theFolder to choose folder with prompt "Select project folder"
  return POSIX path of theFolder
on error
  return ""
end try
`;
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    const p = stdout.trim().replace(/\/$/, "");
    return p || null;
  } catch {
    return null;
  }
}
