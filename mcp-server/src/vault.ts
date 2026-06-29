import { constants } from "node:fs";
import {
  access,
  appendFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const BLOCKED_SEGMENTS = new Set([
  ".git",
  ".obsidian",
  "mcp-server",
  "node_modules",
  ".env",
]);

const MAX_READ_BYTES = 2 * 1024 * 1024;

export interface VaultFile {
  path: string;
  size: number;
  modifiedAt: string;
}

export interface ListFilesOptions {
  path?: string;
  recursive?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListFilesResult {
  files: VaultFile[];
  nextCursor: string | null;
}

export interface ReadFileResult {
  path: string;
  content: string;
  size: number;
  modifiedAt: string;
}

export interface MutationResult {
  path: string;
  message: string;
}

function comparable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(comparable(root), comparable(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function splitSegments(value: string): string[] {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");
}

function assertRelativeInput(input: string): void {
  if (input.includes("\0")) {
    throw new Error("Path contains a null byte.");
  }
  if (path.isAbsolute(input) || /^[a-zA-Z]:/.test(input)) {
    throw new Error("Absolute paths are not allowed.");
  }
}

function assertNoBlockedSegments(relativePath: string): void {
  for (const segment of splitSegments(relativePath)) {
    if (BLOCKED_SEGMENTS.has(segment.toLowerCase())) {
      throw new Error(`Access to '${segment}' is blocked.`);
    }
  }
}

async function exists(value: string): Promise<boolean> {
  try {
    await access(value, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertNoSymlinkComponents(
  root: string,
  relativePath: string,
): Promise<void> {
  let current = root;
  for (const segment of splitSegments(relativePath)) {
    if (segment === "..") {
      continue;
    }
    current = path.join(current, segment);
    if (!(await exists(current))) {
      break;
    }
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      throw new Error("Symbolic links and junctions are not allowed.");
    }
  }
}

async function resolveVaultPath(
  vaultRoot: string,
  inputPath: string,
  allowMissing: boolean,
): Promise<{ absolutePath: string; relativePath: string }> {
  const requested = inputPath.trim() || ".";
  assertRelativeInput(requested);
  assertNoBlockedSegments(requested);

  const root = path.resolve(vaultRoot);
  const absolutePath = path.resolve(root, requested);
  if (!isInside(root, absolutePath)) {
    throw new Error("Path escapes the configured vault root.");
  }

  const relativePath = path.relative(root, absolutePath);
  assertNoBlockedSegments(relativePath);
  await assertNoSymlinkComponents(root, relativePath);

  const realRoot = await realpath(root);
  if (await exists(absolutePath)) {
    const realCandidate = await realpath(absolutePath);
    if (!isInside(realRoot, realCandidate)) {
      throw new Error("Resolved path escapes the configured vault root.");
    }
  } else if (!allowMissing) {
    throw new Error("Path does not exist.");
  } else {
    let ancestor = path.dirname(absolutePath);
    while (!(await exists(ancestor))) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        throw new Error("No valid parent directory exists.");
      }
      ancestor = parent;
    }
    const realAncestor = await realpath(ancestor);
    if (!isInside(realRoot, realAncestor)) {
      throw new Error("Parent path escapes the configured vault root.");
    }
  }

  return { absolutePath, relativePath };
}

function portablePath(value: string): string {
  return value.split(path.sep).join("/");
}

function isBlockedName(name: string): boolean {
  return BLOCKED_SEGMENTS.has(name.toLowerCase());
}

async function collectFiles(
  vaultRoot: string,
  absoluteDirectory: string,
  recursive: boolean,
  output: VaultFile[],
): Promise<void> {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (isBlockedName(entry.name) || entry.isSymbolicLink()) {
      continue;
    }

    const absoluteEntry = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        await collectFiles(vaultRoot, absoluteEntry, true, output);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const info = await stat(absoluteEntry);
    output.push({
      path: portablePath(path.relative(vaultRoot, absoluteEntry)),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
    });
  }
}

export async function listVaultFiles(
  vaultRoot: string,
  options: ListFilesOptions,
): Promise<ListFilesResult> {
  const requestedPath = options.path ?? ".";
  const { absolutePath } = await resolveVaultPath(
    vaultRoot,
    requestedPath,
    false,
  );
  const directoryInfo = await stat(absolutePath);
  if (!directoryInfo.isDirectory()) {
    throw new Error("The requested path is not a directory.");
  }

  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const offset = options.cursor === undefined ? 0 : Number(options.cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("Cursor must be a non-negative integer string.");
  }

  const files: VaultFile[] = [];
  await collectFiles(
    path.resolve(vaultRoot),
    absolutePath,
    options.recursive ?? true,
    files,
  );
  files.sort((left, right) => left.path.localeCompare(right.path));

  const page = files.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    files: page,
    nextCursor: nextOffset < files.length ? String(nextOffset) : null,
  };
}

export async function readVaultFile(
  vaultRoot: string,
  requestedPath: string,
): Promise<ReadFileResult> {
  const { absolutePath, relativePath } = await resolveVaultPath(
    vaultRoot,
    requestedPath,
    false,
  );
  const info = await stat(absolutePath);
  if (!info.isFile()) {
    throw new Error("The requested path is not a file.");
  }
  if (info.size > MAX_READ_BYTES) {
    throw new Error(`File exceeds the ${MAX_READ_BYTES}-byte read limit.`);
  }

  const content = await readFile(absolutePath, "utf8");
  if (content.includes("\0")) {
    throw new Error("Binary files are not supported.");
  }

  return {
    path: portablePath(relativePath),
    content,
    size: info.size,
    modifiedAt: info.mtime.toISOString(),
  };
}

export async function writeVaultFile(
  vaultRoot: string,
  requestedPath: string,
  content: string,
  overwrite: boolean,
): Promise<MutationResult> {
  const { absolutePath, relativePath } = await resolveVaultPath(
    vaultRoot,
    requestedPath,
    true,
  );
  const targetExists = await exists(absolutePath);
  if (targetExists) {
    const info = await stat(absolutePath);
    if (!info.isFile()) {
      throw new Error("The requested path is not a file.");
    }
    if (!overwrite) {
      throw new Error("File already exists; set overwrite=true to replace it.");
    }
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, {
    encoding: "utf8",
    flag: targetExists ? "w" : "wx",
  });

  return {
    path: portablePath(relativePath),
    message: targetExists ? "File overwritten." : "File created.",
  };
}

export async function appendVaultFile(
  vaultRoot: string,
  requestedPath: string,
  content: string,
): Promise<MutationResult> {
  const { absolutePath, relativePath } = await resolveVaultPath(
    vaultRoot,
    requestedPath,
    true,
  );
  if (await exists(absolutePath)) {
    const info = await stat(absolutePath);
    if (!info.isFile()) {
      throw new Error("The requested path is not a file.");
    }
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await appendFile(absolutePath, content, { encoding: "utf8" });
  return {
    path: portablePath(relativePath),
    message: "Content appended.",
  };
}
