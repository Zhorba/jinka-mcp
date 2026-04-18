import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { JinkaClient } from "../jinka/client.js";
import { dashboardFilters } from "../jinka/normalize.js";
import { toolResult, withToolErrors } from "./result.js";

export type JinkaMcpConfig = {
  enableWriteTools: boolean;
};

export type JinkaMcpContext = {
  client: JinkaClient;
  config: JinkaMcpConfig;
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true
};

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true
};

const filterSchema = z.enum(dashboardFilters);
const listingIdSchema = z.string().min(1);
const alertIdSchema = z.string().min(1);
const maxPagesSchema = z.number().int().min(1).max(100).default(5);

export function createJinkaMcpServer(context: JinkaMcpContext): McpServer {
  const server = new McpServer(
    {
      name: "jinka-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  registerTools(server, context);
  return server;
}

function registerTools(server: McpServer, context: JinkaMcpContext): void {
  server.registerTool(
    "jinka_list_alerts",
    {
      title: "List Jinka alerts",
      description: "List Jinka alerts for the configured account. Dashboard totals can be included.",
      inputSchema: {
        includeDashboardTotals: z.boolean().default(true)
      },
      annotations: readOnlyAnnotations
    },
    withToolErrors(async (args) => {
      const alerts = args.includeDashboardTotals
        ? await context.client.listAlertsWithDashboardTotals()
        : await context.client.listAlerts();
      return toolResult(`Fetched ${alerts.length} Jinka alert(s).`, { alerts });
    })
  );

  server.registerTool(
    "jinka_get_alert_dashboard",
    {
      title: "Get Jinka alert dashboard",
      description: "Get one paginated Jinka alert dashboard page.",
      inputSchema: {
        alertId: alertIdSchema,
        page: z.number().int().min(1).default(1),
        filter: filterSchema.default("all")
      },
      annotations: readOnlyAnnotations
    },
    withToolErrors(async (args) => {
      const dashboard = await context.client.getAlertDashboard(args);
      return toolResult(`Fetched dashboard page ${dashboard.page} for alert ${dashboard.alertId}.`, { dashboard });
    })
  );

  server.registerTool(
    "jinka_list_listings",
    {
      title: "List Jinka listings",
      description: "List normalized Jinka listings across one alert or all alerts.",
      inputSchema: {
        alertId: alertIdSchema.optional(),
        filter: filterSchema.default("all"),
        maxPagesPerAlert: maxPagesSchema
      },
      annotations: readOnlyAnnotations
    },
    withToolErrors(async (args) => {
      const listings = await context.client.listListings(args);
      return toolResult(`Fetched ${listings.length} Jinka listing(s).`, { listings });
    })
  );

  server.registerTool(
    "jinka_resolve_listing_link",
    {
      title: "Resolve Jinka listing link",
      description: "Follow Jinka's ad redirect endpoint to get the source listing URL.",
      inputSchema: {
        alertId: alertIdSchema,
        listingId: listingIdSchema
      },
      annotations: readOnlyAnnotations
    },
    withToolErrors(async (args) => {
      const link = await context.client.resolveListingLink(args.alertId, args.listingId);
      return toolResult(`Resolved listing ${args.listingId}.`, { link });
    })
  );

  server.registerTool(
    "jinka_get_kanban",
    {
      title: "Get Jinka kanban data",
      description: "Build dashboard-ready kanban columns from Jinka listings.",
      inputSchema: {
        alertId: alertIdSchema.optional(),
        filter: filterSchema.default("all"),
        maxPagesPerAlert: maxPagesSchema,
        includeResolvedLinks: z.boolean().default(false)
      },
      annotations: readOnlyAnnotations
    },
    withToolErrors(async (args) => {
      const kanban = await context.client.getKanban(args);
      const cardCount = kanban.columns.reduce((count, column) => count + column.cards.length, 0);
      return toolResult(`Built Jinka kanban with ${cardCount} card(s).`, { kanban });
    })
  );

  if (context.config.enableWriteTools) {
    server.registerTool(
      "jinka_report_expired_listing",
      {
        title: "Report expired Jinka listing",
        description: "Report a listing as expired through Jinka's confirmed abuses endpoint.",
        inputSchema: {
          alertId: alertIdSchema,
          listingId: listingIdSchema,
          reason: z.string().min(1).default("ad_link_404"),
          confirm: z.literal("REPORT_EXPIRED")
        },
        annotations: writeAnnotations
      },
      withToolErrors(async (args) => {
        const result = await context.client.reportExpiredListing(args);
        return toolResult(`Reported listing ${args.listingId} as expired.`, { result });
      })
    );
  }
}
