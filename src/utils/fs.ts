import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeFileSafe(path: string, data: Buffer | string, overwrite: boolean): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (!overwrite && (await exists(path))) {
    throw new Error(`Refusing to overwrite existing file: ${path}`);
  }
  await writeFile(path, data);
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function resolveInsideCwd(path: string): string {
  return resolve(process.cwd(), path);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "asset";
}

export function withTimestamp(name: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${slugify(name)}-${stamp}`;
}
