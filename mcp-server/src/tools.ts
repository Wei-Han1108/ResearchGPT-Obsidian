import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  appendVaultFile,
  listVaultFiles,
  readVaultFile,
  writeVaultFile,
} from "./vault.js";

type JsonRecord = Record<string, unknown>;

const errorProperties = {
  ok: { const: false },
  error: { type: "string" },
  message: { type: "string" },
} as const;

const tools: Tool[] = [
  {
    name: "list_vault_files",
    description:
      "List files exposed from the configured Obsidian vault. Blocked directories and files are omitted.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Vault-relative directory path. Defaults to the vault root.",
        },
        recursive: {
          type: "boolean",
          description: "Recurse into subdirectories. Defaults to true.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 200,
          description: "Maximum files to return. Defaults to 100.",
        },
        cursor: {
          type: "string",
          pattern: "^[0-9]+$",
          description: "Pagination cursor returned by a previous call.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      oneOf: [
        {
          type: "object",
          properties: {
            ok: { const: true },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  size: { type: "integer" },
                  modifiedAt: { type: "string" },
                },
                required: ["path", "size", "modifiedAt"],
                additionalProperties: false,
              },
            },
            nextCursor: { type: ["string", "null"] },
          },
          required: ["ok", "files", "nextCursor"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: errorProperties,
          required: ["ok", "error", "message"],
          additionalProperties: false,
        },
      ],
    },
  },
  {
    name: "read_vault_file",
    description: "Read one UTF-8 text file from the configured vault.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", minLength: 1 },
      },
      required: ["path"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      oneOf: [
        {
          type: "object",
          properties: {
            ok: { const: true },
            path: { type: "string" },
            content: { type: "string" },
            size: { type: "integer" },
            modifiedAt: { type: "string" },
          },
          required: ["ok", "path", "content", "size", "modifiedAt"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: errorProperties,
          required: ["ok", "error", "message"],
          additionalProperties: false,
        },
      ],
    },
  },
  {
    name: "write_vault_file",
    description:
      "Create a UTF-8 file in the vault, or overwrite an existing file only when overwrite=true.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", minLength: 1 },
        content: { type: "string" },
        overwrite: { type: "boolean", default: false },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      oneOf: [
        {
          type: "object",
          properties: {
            ok: { const: true },
            path: { type: "string" },
            message: { type: "string" },
          },
          required: ["ok", "path", "message"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: errorProperties,
          required: ["ok", "error", "message"],
          additionalProperties: false,
        },
      ],
    },
  },
  {
    name: "append_vault_file",
    description:
      "Append UTF-8 content to a vault file, creating the file and parent directories when needed.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", minLength: 1 },
        content: { type: "string" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      oneOf: [
        {
          type: "object",
          properties: {
            ok: { const: true },
            path: { type: "string" },
            message: { type: "string" },
          },
          required: ["ok", "path", "message"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: errorProperties,
          required: ["ok", "error", "message"],
          additionalProperties: false,
        },
      ],
    },
  },
];

function requiredString(args: JsonRecord, name: string): string {
  const value = args[name];
  if (typeof value !== "string") {
    throw new Error(`'${name}' must be a string.`);
  }
  return value;
}

function success(data: JsonRecord) {
  const structuredContent = { ok: true, ...data };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const structuredContent = {
    ok: false,
    error: "tool_error",
    message,
  };
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

export function registerVaultTools(server: Server, vaultRoot: string): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as JsonRecord;
    try {
      switch (request.params.name) {
        case "list_vault_files": {
          const result = await listVaultFiles(vaultRoot, {
            path: typeof args.path === "string" ? args.path : undefined,
            recursive:
              typeof args.recursive === "boolean" ? args.recursive : undefined,
            limit: typeof args.limit === "number" ? args.limit : undefined,
            cursor: typeof args.cursor === "string" ? args.cursor : undefined,
          });
          return success(result as unknown as JsonRecord);
        }
        case "read_vault_file": {
          const result = await readVaultFile(
            vaultRoot,
            requiredString(args, "path"),
          );
          return success(result as unknown as JsonRecord);
        }
        case "write_vault_file": {
          const result = await writeVaultFile(
            vaultRoot,
            requiredString(args, "path"),
            requiredString(args, "content"),
            args.overwrite === true,
          );
          return success(result as unknown as JsonRecord);
        }
        case "append_vault_file": {
          const result = await appendVaultFile(
            vaultRoot,
            requiredString(args, "path"),
            requiredString(args, "content"),
          );
          return success(result as unknown as JsonRecord);
        }
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error) {
      return failure(error);
    }
  });
}
