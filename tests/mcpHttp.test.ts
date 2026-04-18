import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createJinkaMcpServer } from "../src/mcp/server.js";
import { createHttpApp } from "../src/server/http.js";
import type { JinkaClient } from "../src/jinka/client.js";

function mockClient(overrides: Partial<JinkaClient> = {}): JinkaClient {
  return {
    listAlertsWithDashboardTotals: vi.fn().mockResolvedValue([{ id: "alert-1", name: "Paris" }]),
    listAlerts: vi.fn().mockResolvedValue([{ id: "alert-1", name: "Paris" }]),
    getAlertDashboard: vi.fn().mockResolvedValue({
      alertId: "alert-1",
      page: 1,
      filter: "all",
      pagination: { nbPages: 1, totals: { all: 0, read: 0, unread: 0, favorite: 0, contact: 0, deleted: 0 } },
      listings: []
    }),
    listListings: vi.fn().mockResolvedValue([]),
    resolveListingLink: vi.fn().mockResolvedValue({ alertId: "alert-1", listingId: "ad-1", url: "https://example.com" }),
    getKanban: vi.fn().mockResolvedValue({ generatedAt: "2026-04-18T00:00:00Z", alertIds: [], columns: [] }),
    reportExpiredListing: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    ...overrides
  } as unknown as JinkaClient;
}

async function listen(app: ReturnType<typeof createHttpApp>): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function serverUrl(server: http.Server): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("MCP HTTP integration", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      server = null;
    }
  });

  it("rejects missing and invalid bearer tokens", async () => {
    const app = createHttpApp({
      serviceName: "jinka-mcp",
      apiKey: "test-key",
      createServer: () => createJinkaMcpServer({ client: mockClient(), config: { enableWriteTools: false } })
    });
    server = await listen(app);
    const url = `${serverUrl(server)}/mcp`;

    await expect(fetch(url, { method: "POST", body: "{}" }).then((response) => response.status)).resolves.toBe(401);
    await expect(
      fetch(url, { method: "POST", headers: { Authorization: "Bearer wrong" }, body: "{}" }).then(
        (response) => response.status
      )
    ).resolves.toBe(401);
  });

  it("lists and calls tools through Streamable HTTP", async () => {
    const clientMock = mockClient();
    const app = createHttpApp({
      serviceName: "jinka-mcp",
      apiKey: "test-key",
      createServer: () => createJinkaMcpServer({ client: clientMock, config: { enableWriteTools: false } })
    });
    server = await listen(app);

    const client = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl(server)}/mcp`), {
      requestInit: {
        headers: {
          Authorization: "Bearer test-key"
        }
      }
    });

    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["jinka_list_alerts", "jinka_get_kanban"])
    );
    expect(tools.tools.map((tool) => tool.name)).not.toContain("jinka_report_expired_listing");

    const result = await client.callTool({
      name: "jinka_list_alerts",
      arguments: { includeDashboardTotals: true }
    });

    expect(result.structuredContent).toEqual({ alerts: [{ id: "alert-1", name: "Paris" }] });
    expect(clientMock.listAlertsWithDashboardTotals).toHaveBeenCalled();
    await transport.close();
  });

  it("exposes write tools only when enabled and requires confirmation", async () => {
    const clientMock = mockClient();
    const app = createHttpApp({
      serviceName: "jinka-mcp",
      apiKey: "test-key",
      createServer: () => createJinkaMcpServer({ client: clientMock, config: { enableWriteTools: true } })
    });
    server = await listen(app);

    const client = new Client({ name: "test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl(server)}/mcp`), {
      requestInit: {
        headers: {
          Authorization: "Bearer test-key"
        }
      }
    });

    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("jinka_report_expired_listing");

    const invalidResult = await client.callTool({
      name: "jinka_report_expired_listing",
      arguments: { alertId: "alert-1", listingId: "ad-1" }
    });
    const invalidContent = invalidResult.content as Array<{ type: string; text: string }>;
    expect(invalidResult.isError).toBe(true);
    expect(invalidContent[0]).toEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("Input validation error")
      })
    );

    const result = await client.callTool({
      name: "jinka_report_expired_listing",
      arguments: { alertId: "alert-1", listingId: "ad-1", confirm: "REPORT_EXPIRED" }
    });

    expect(result.structuredContent).toEqual({ result: { ok: true, status: 200 } });
    expect(clientMock.reportExpiredListing).toHaveBeenCalledWith({
      alertId: "alert-1",
      listingId: "ad-1",
      reason: "ad_link_404",
      confirm: "REPORT_EXPIRED"
    });
    await transport.close();
  });
});
