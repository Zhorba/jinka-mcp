import { loadConfig } from "../config/env.js";
import { JinkaApiError, JinkaClient } from "../jinka/client.js";

type AuthMode = "access-token" | "password";

async function main(): Promise<void> {
  const config = loadConfig();
  const authMode: AuthMode = config.jinka.accessToken ? "access-token" : "password";
  const client = new JinkaClient(config.jinka);
  const alerts = await client.listAlerts();

  console.log(
    JSON.stringify(
      {
        ok: true,
        authMode,
        alertCount: alerts.length,
        apiBaseUrl: config.jinka.apiBaseUrl
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message = formatAuthCheckError(error);
  console.error(message);
  process.exitCode = isAuthFailure(error) ? 2 : 1;
});

function formatAuthCheckError(error: unknown): string {
  if (error instanceof JinkaApiError) {
    if (error.details.status === 401 || error.details.status === 403) {
      const usingToken = Boolean(process.env.JINKA_ACCESS_TOKEN?.trim());
      if (usingToken) {
        return [
          "Jinka auth check failed: JINKA_ACCESS_TOKEN was rejected.",
          "Refresh the LA_API_TOKEN cookie from an authenticated Jinka browser session and update your environment or Keychain."
        ].join(" ");
      }

      return "Jinka auth check failed: JINKA_EMAIL/JINKA_PASSWORD was rejected.";
    }

    return `Jinka auth check failed: API returned HTTP ${error.details.status} for ${error.details.method} ${error.details.url}.`;
  }

  const message = error instanceof Error ? error.message : String(error);
  return `Jinka auth check failed: ${message}`;
}

function isAuthFailure(error: unknown): boolean {
  if (error instanceof JinkaApiError) {
    return error.details.status === 401 || error.details.status === 403;
  }

  if (error instanceof Error) {
    return error.message.includes("JINKA_ACCESS_TOKEN") || error.message.includes("JINKA_PASSWORD");
  }

  return false;
}
