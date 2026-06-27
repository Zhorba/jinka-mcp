import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP stdio integration", () => {
  it("starts the stdio server and lists read-only tools without live Jinka calls", async () => {
    const client = new Client({ name: "stdio-smoke-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["./node_modules/tsx/dist/cli.mjs", "src/index-stdio.ts"],
      cwd: process.cwd(),
      env: {
        JINKA_ACCESS_TOKEN: "test-token",
        JINKA_ENABLE_WRITE_TOOLS: "false",
        JINKA_REQUEST_DELAY_MS: "0",
        PATH: process.env.PATH ?? ""
      },
      stderr: "pipe"
    });

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);

      expect(toolNames).toEqual(
        expect.arrayContaining([
          "jinka_list_alerts",
          "jinka_get_alert_dashboard",
          "jinka_list_listings",
          "jinka_resolve_listing_link",
          "jinka_get_kanban"
        ])
      );
      expect(toolNames).not.toContain("jinka_report_expired_listing");
    } finally {
      await transport.close();
    }
  });
});
