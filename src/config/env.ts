import "dotenv/config";

export type RuntimeConfig = {
  port: number;
  mcpApiKey?: string;
  jinka: {
    email: string;
    password: string;
    apiBaseUrl: string;
    requestDelayMs: number;
    enableWriteTools: boolean;
    timeoutMs: number;
  };
};

export function loadConfig(options: { requireMcpApiKey?: boolean } = {}): RuntimeConfig {
  const email = requiredEnv("JINKA_EMAIL");
  const password = requiredEnv("JINKA_PASSWORD");
  const mcpApiKey = process.env.MCP_API_KEY?.trim();

  if (options.requireMcpApiKey && !mcpApiKey) {
    throw new Error("MCP_API_KEY is required for HTTP transport.");
  }

  return {
    port: readIntEnv("PORT", 3000),
    mcpApiKey,
    jinka: {
      email,
      password,
      apiBaseUrl: process.env.JINKA_API_BASE_URL?.trim() || "https://api.jinka.fr/apiv2",
      requestDelayMs: readIntEnv("JINKA_REQUEST_DELAY_MS", 250),
      enableWriteTools: readBoolEnv("JINKA_ENABLE_WRITE_TOOLS", false),
      timeoutMs: readIntEnv("JINKA_TIMEOUT_MS", 30000)
    }
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`${name} must be a boolean.`);
}
