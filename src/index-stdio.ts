import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/env.js";
import { JinkaClient } from "./jinka/client.js";
import { createJinkaMcpServer } from "./mcp/server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new JinkaClient(config.jinka);
  const server = createJinkaMcpServer({
    client,
    config: {
      enableWriteTools: config.jinka.enableWriteTools
    }
  });

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
