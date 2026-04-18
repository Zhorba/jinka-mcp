import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { JinkaApiError } from "../jinka/client.js";

export function toolResult(summary: string, structuredContent: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent
  };
}

export function toolError(error: unknown): CallToolResult {
  if (error instanceof JinkaApiError) {
    return {
      isError: true,
      content: [{ type: "text", text: `Jinka API error: HTTP ${error.details.status}` }],
      structuredContent: {
        error: {
          type: "jinka_api_error",
          ...error.details
        }
      }
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: {
      error: {
        type: "internal_error",
        message
      }
    }
  };
}

export function withToolErrors<Args>(
  handler: (args: Args) => Promise<CallToolResult>
): (args: Args) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (error) {
      return toolError(error);
    }
  };
}
