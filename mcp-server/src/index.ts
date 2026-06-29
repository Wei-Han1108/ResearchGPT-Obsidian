import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerVaultTools } from "./tools.js";

const port = Number(process.env.PORT ?? "3000");
const vaultRoot = path.resolve(
  process.env.VAULT_ROOT ?? "D:\\docu\\ObsidianDoc\\ResearchGPT",
);
const accessToken = process.env.MCP_ACCESS_TOKEN ?? "";
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
if (accessToken.length < 32) {
  throw new Error("MCP_ACCESS_TOKEN must contain at least 32 characters.");
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function requestToken(req: Request): string {
  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }
  return typeof req.query.token === "string" ? req.query.token : "";
}

function authorize(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header("origin");
  if (origin && allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: "origin_not_allowed" });
    return;
  }
  if (!secureEqual(requestToken(req), accessToken)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

function createServer(): Server {
  const server = new Server(
    { name: "researchgpt-vault", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  registerVaultTools(server, vaultRoot);
  return server;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "researchgpt-vault-mcp" });
});

const transports = new Map<string, SSEServerTransport>();

app.get("/sse", authorize, async (_req, res) => {
  const messageEndpoint = `/sse`;
  const transport = new SSEServerTransport(messageEndpoint, res);
  transports.set(transport.sessionId, transport);

  transport.onclose = () => {
    transports.delete(transport.sessionId);
  };

  res.on("close", () => {
    transports.delete(transport.sessionId);
  });

  try {
    await createServer().connect(transport);
  } catch (error) {
    transports.delete(transport.sessionId);
    console.error("Failed to establish SSE session:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "sse_connection_failed" });
    }
  }
});

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId =
    typeof req.query.sessionId === "string" ? req.query.sessionId : "";

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "unknown_session" });
    return;
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error("Failed to handle MCP message:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "message_handling_failed" });
    }
  }
}

app.post("/messages", authorize, handleMcpPost);

// ChatGPT Developer Mode may POST back to /sse instead of /messages.
// Do not require token here because the sessionId was issued only after
// the authorized GET /sse connection succeeded.
app.post("/sse", handleMcpPost);

const httpServer = app.listen(port, "127.0.0.1", () => {
  console.log(`ResearchGPT MCP server listening on http://127.0.0.1:${port}`);
  console.log(`Vault root: ${vaultRoot}`);
});

async function shutdown(): Promise<void> {
  for (const transport of transports.values()) {
    await transport.close().catch(() => undefined);
  }
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
