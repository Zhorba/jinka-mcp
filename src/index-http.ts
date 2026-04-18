import { loadConfig } from "./config/env.js";
import { JinkaClient } from "./jinka/client.js";
import { createJinkaMcpServer } from "./mcp/server.js";
import { createHttpApp } from "./server/http.js";

async function main(): Promise<void> {
  const config = loadConfig({ requireMcpApiKey: true });
  const client = new JinkaClient(config.jinka);
  const app = createHttpApp({
    serviceName: "jinka-mcp",
    apiKey: config.mcpApiKey!,
    createServer: () =>
      createJinkaMcpServer({
        client,
        config: {
          enableWriteTools: config.jinka.enableWriteTools
        }
      })
  });

  const server = app.listen(config.port, () => {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "jinka-mcp listening",
        port: config.port
      })
    );
  });

  const shutdown = (): void => {
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
