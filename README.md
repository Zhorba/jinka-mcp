# Jinka MCP

Private MCP server for [Jinka](https://www.jinka.fr/) real-estate alerts.

The server exposes a Jinka account to MCP-compatible clients such as Codex, Claude Code, Claude Desktop, and future HTTP MCP clients. V1 is MCP-only and returns normalized JSON suitable for a later kanban dashboard.

## Requirements

- Node 22+
- A Jinka account

## Local Setup

```bash
npm install
cp .env.example .env
```

Fill `.env`:

```text
JINKA_EMAIL=you@example.com
JINKA_PASSWORD=your-password
JINKA_ACCESS_TOKEN=
JINKA_API_BASE_URL=https://api.jinka.fr/apiv2
JINKA_REQUEST_DELAY_MS=250
JINKA_ENABLE_WRITE_TOOLS=false
```

Use either `JINKA_ACCESS_TOKEN` or the `JINKA_EMAIL` / `JINKA_PASSWORD` pair. Accounts created with Google or email code login usually do not have a Jinka password; for those accounts, provide a Jinka API bearer token through `JINKA_ACCESS_TOKEN`.

Credentials are read from environment variables at runtime and are never written by this server.

## Passwordless Jinka Accounts

Jinka currently exposes Google, Apple, and email-code sign-in on the web app. Those flows do not provide a reusable password for `POST /apiv2/user/auth`.

For Google or email-code accounts, use an API bearer token from an authenticated Jinka session:

1. Sign in to Jinka in a browser.
2. Open the browser's network inspector and filter requests for `api.jinka.fr`.
3. Open a request such as `GET /apiv2/alert` or `GET /apiv2/alert/{alertId}/dashboard`.
4. Copy the request `Authorization` header value after `Bearer `.
5. Set that value as `JINKA_ACCESS_TOKEN`.

If the web app no longer sends `api.jinka.fr` bearer requests from the browser, this MCP needs a separate web-session auth adapter. Do not guess mutation or auth request shapes from an unauthenticated page.

## Stdio Transport

Use stdio for local CLI clients:

```bash
npm run mcp:stdio
```

Example MCP config:

```json
{
  "mcpServers": {
    "jinka": {
      "command": "npm",
      "args": ["run", "mcp:stdio"],
      "cwd": "/path/to/jinka-mcp",
      "env": {
        "JINKA_EMAIL": "${JINKA_EMAIL}",
        "JINKA_PASSWORD": "${JINKA_PASSWORD}",
        "JINKA_ACCESS_TOKEN": "${JINKA_ACCESS_TOKEN}",
        "JINKA_ENABLE_WRITE_TOOLS": "false"
      }
    }
  }
}
```

## Codex CLI

Register the local stdio server:

```bash
codex mcp add jinka \
  --env JINKA_ACCESS_TOKEN="<jinka-api-bearer-token>" \
  --env JINKA_ENABLE_WRITE_TOOLS="false" \
  -- /bin/sh -lc 'cd /path/to/jinka-mcp && npm run mcp:stdio'
```

Then restart Codex and ask for a Jinka tool call, for example:

```text
List my Jinka alerts.
```

## HTTP Transport

Set `MCP_API_KEY`, then:

```bash
npm run dev:http
```

The MCP endpoint is `POST /mcp` and requires:

```text
Authorization: Bearer <MCP_API_KEY>
```

## Tools

Read-only tools:

- `jinka_list_alerts`
- `jinka_get_alert_dashboard`
- `jinka_list_listings`
- `jinka_resolve_listing_link`
- `jinka_get_kanban`

Mutation tools:

- `jinka_report_expired_listing`

Mutation tools are only exposed when `JINKA_ENABLE_WRITE_TOOLS=true`. `jinka_report_expired_listing` requires `confirm: "REPORT_EXPIRED"` and calls Jinka's expired-ad reporting endpoint.

## Data Model

Listings are normalized into stable fields such as `id`, `alertId`, `source`, `rent`, `area`, `city`, `postalCode`, `createdAt`, `expiredAt`, `favorite`, `contacted`, `pricePerM2`, and status flags. Raw Jinka payloads are preserved under `raw` for inspection.

`jinka_get_kanban` groups listings into:

- unread / new
- read / active
- favorite
- contacted
- expired
- deleted

## Security

- Jinka credentials must be supplied through environment variables or the host MCP config.
- Credentials are not logged, stored, or committed by this server.
- HTTP transport requires `Authorization: Bearer <MCP_API_KEY>`.
- Mutation tools are opt-in and require explicit confirmation arguments.
- The project is not affiliated with Jinka or LouerAgile.

## Development

```bash
npm run typecheck
npm test
npm run build
```

Default tests use mocked Jinka responses and do not call live Jinka. Live smoke tests should remain behind `JINKA_LIVE_TESTS=1`.

## Source Notes

The initial API behavior was validated against the public Python wrapper [louistransfer/kajin](https://github.com/louistransfer/kajin), which documents:

- `POST /apiv2/user/auth`
- `GET /apiv2/alert`
- `GET /apiv2/alert/{alertId}/dashboard`
- `GET /alert_result_view_ad`
- `POST /apiv2/alert/{alertId}/abuses`
