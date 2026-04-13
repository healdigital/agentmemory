import { createInterface } from "node:readline";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type RequestHandler = (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

// JSON-RPC 2.0 notifications are messages without an `id` field. The spec
// (and the MCP transport contract) requires the server to NOT send a
// response for notifications. Some clients tolerate spurious responses;
// stricter clients (e.g. Codex CLI) treat them as protocol violations and
// close the transport. See agentmemory#129.
function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined || req.id === null;
}

// Exported for unit tests so the line-handling logic is exercised
// independently of process.stdin / process.stdout.
export async function processLine(
  line: string,
  handler: RequestHandler,
  writeOut: (response: JsonRpcResponse) => void,
  writeErr: (msg: string) => void = (msg) => process.stderr.write(msg),
): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    writeOut({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    return;
  }

  const request = parsed as JsonRpcRequest;
  if (
    !request ||
    request.jsonrpc !== "2.0" ||
    typeof request.method !== "string"
  ) {
    if (request && (request as { id?: unknown }).id != null) {
      writeOut({
        jsonrpc: "2.0",
        id: (request as JsonRpcRequest).id as string | number,
        error: { code: -32600, message: "Invalid Request" },
      });
    }
    return;
  }

  const notification = isNotification(request);

  try {
    const result = await handler(request.method, request.params || {});
    if (notification) return;
    writeOut({
      jsonrpc: "2.0",
      id: request.id as string | number,
      result,
    });
  } catch (err) {
    if (notification) {
      writeErr(
        `[mcp-transport] notification handler error for ${request.method}: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
      return;
    }
    writeOut({
      jsonrpc: "2.0",
      id: request.id as string | number,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export function createStdioTransport(handler: RequestHandler): {
  start: () => void;
  stop: () => void;
} {
  let rl: ReturnType<typeof createInterface> | null = null;

  const writeResponse = (response: JsonRpcResponse) => {
    process.stdout.write(JSON.stringify(response) + "\n");
  };

  const onLine = (line: string) => processLine(line, handler, writeResponse);

  return {
    start() {
      rl = createInterface({ input: process.stdin });
      rl.on("line", onLine);
    },
    stop() {
      rl?.close();
      rl = null;
    },
  };
}
