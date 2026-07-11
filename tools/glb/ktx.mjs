/**
 * KTX-Software (toktx) auto-detection shared by the GLB optimizer and the
 * facade texture packer (doc 71 §2.1 — KTX2 is the enabler for the texture
 * VRAM budget; the founder installs KTX-Software separately and the pipeline
 * must upgrade itself automatically on the next run).
 *
 * Probe order:
 *   1. `toktx` on PATH
 *   2. C:\Program Files\KTX-Software\bin\toktx.exe   (default installer path)
 *   3. E:\ktx*\bin\toktx.exe and E:\ktx*\toktx.exe   (portable/manual unpack)
 *
 * Returns { bin, dir } (dir === null when resolved via PATH) or null.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

function works(bin) {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function findToktx() {
  // 0. Explicit override — set TOKTX_BIN to the full toktx.exe path.
  const override = process.env.TOKTX_BIN;
  if (override && existsSync(override) && works(override)) {
    return { bin: override, dir: dirname(override) };
  }
  if (works("toktx")) return { bin: "toktx", dir: null };

  const candidates = [
    "C:\\Program Files\\KTX-Software\\bin\\toktx.exe",
    // Founder's actual install (non-standard dir name, 2026-07-11).
    "E:\\New folder\\KTX-Software\\bin\\toktx.exe",
  ];
  try {
    // Any top-level dir on C:/E: that contains KTX-Software\bin\toktx.exe, plus
    // the old E:\ktx* portable layout — covers custom install folders.
    for (const root of ["C:\\", "E:\\"]) {
      for (const entry of readdirSync(root)) {
        candidates.push(join(root, entry, "KTX-Software", "bin", "toktx.exe"));
        if (/^ktx/i.test(entry)) {
          candidates.push(join(root, entry, "bin", "toktx.exe"));
          candidates.push(join(root, entry, "toktx.exe"));
        }
      }
    }
  } catch {
    /* drive unreadable — fine */
  }

  for (const c of candidates) {
    if (existsSync(c) && works(c)) return { bin: c, dir: dirname(c) };
  }
  return null;
}

/** Env for child processes that spawn `toktx` themselves (gltf-transform CLI):
 *  prepends the located KTX bin dir to PATH when it is not already on it. */
export function envWithToktx(found) {
  if (!found || !found.dir) return process.env;
  const sep = process.platform === "win32" ? ";" : ":";
  return { ...process.env, PATH: `${found.dir}${sep}${process.env.PATH ?? ""}` };
}
