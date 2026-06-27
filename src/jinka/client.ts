import { setTimeout as sleep } from "node:timers/promises";
import {
  buildKanban,
  isDashboardFilter,
  normalizeAlert,
  normalizeListing,
  normalizePagination
} from "./normalize.js";
import type {
  DashboardFilter,
  JinkaAlert,
  JinkaDashboard,
  JinkaKanban,
  JinkaListing
} from "./types.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<ResponseLike>;

type ResponseLike = {
  ok: boolean;
  status: number;
  url: string;
  headers?: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type JinkaClientConfig = {
  email?: string;
  password?: string;
  accessToken?: string;
  apiBaseUrl?: string;
  requestDelayMs?: number;
  timeoutMs?: number;
  fetch?: FetchLike;
};

export type ListListingsOptions = {
  alertId?: string;
  filter?: DashboardFilter;
  maxPagesPerAlert?: number;
  resolveUrls?: boolean;
};

export class JinkaApiError extends Error {
  constructor(
    message: string,
    readonly details: {
      status: number;
      method: string;
      url: string;
      responseBody?: unknown;
    }
  ) {
    super(message);
    this.name = "JinkaApiError";
  }
}

export class JinkaClient {
  private readonly apiBaseUrl: string;
  private readonly apiOrigin: string;
  private readonly fetchImpl: FetchLike;
  private readonly requestDelayMs: number;
  private readonly timeoutMs: number;
  private readonly configuredAccessToken: string | null;
  private accessToken: string | null = null;
  private lastRequestAt = 0;

  constructor(private readonly config: JinkaClientConfig) {
    this.apiBaseUrl = trimTrailingSlash(config.apiBaseUrl ?? "https://api.jinka.fr/apiv2");
    this.apiOrigin = new URL(this.apiBaseUrl).origin;
    this.fetchImpl = config.fetch ?? fetch;
    this.requestDelayMs = config.requestDelayMs ?? 250;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.configuredAccessToken = normalizeAccessToken(config.accessToken);
    this.accessToken = this.configuredAccessToken;
  }

  async listAlerts(): Promise<JinkaAlert[]> {
    const data = await this.requestJson("GET", "/alert");
    if (!Array.isArray(data)) {
      throw new Error("Unexpected Jinka alert response.");
    }
    return data.map(normalizeAlert);
  }

  async listAlertsWithDashboardTotals(): Promise<Array<JinkaAlert & { dashboard: JinkaDashboard }>> {
    const alerts = await this.listAlerts();
    const enriched = [];
    for (const alert of alerts) {
      const dashboard = await this.getAlertDashboard({ alertId: alert.id, page: 1, filter: "all" });
      enriched.push({ ...alert, dashboard });
    }
    return enriched;
  }

  async getAlertDashboard(options: {
    alertId: string;
    page?: number;
    filter?: DashboardFilter;
  }): Promise<JinkaDashboard> {
    const page = options.page ?? 1;
    const filter = options.filter ?? "all";
    const data = await this.requestJson("GET", `/alert/${encodeURIComponent(options.alertId)}/dashboard`, {
      filter,
      page: String(page)
    });
    const record = asRecord(data);
    const ads = Array.isArray(record.ads) ? record.ads : [];
    return {
      alertId: options.alertId,
      filter,
      page,
      pagination: normalizePagination(record.pagination),
      listings: ads.map((listing) => normalizeListing(listing, options.alertId)),
      raw: record
    };
  }

  async listListings(options: ListListingsOptions = {}): Promise<JinkaListing[]> {
    const filter = options.filter ?? "all";
    if (!isDashboardFilter(filter)) {
      throw new Error(`Unsupported dashboard filter: ${filter}`);
    }

    const alertIds = options.alertId ? [options.alertId] : (await this.listAlerts()).map((alert) => alert.id);
    const listings: JinkaListing[] = [];
    const maxPagesPerAlert = options.maxPagesPerAlert ?? 5;

    for (const alertId of alertIds) {
      const first = await this.getAlertDashboard({ alertId, page: 1, filter });
      listings.push(...first.listings);
      const pageCount = Math.min(first.pagination.nbPages, maxPagesPerAlert);
      for (let page = 2; page <= pageCount; page += 1) {
        const dashboard = await this.getAlertDashboard({ alertId, page, filter });
        listings.push(...dashboard.listings);
      }
    }

    const deduped = dedupeById(listings);

    if (options.resolveUrls) {
      for (const listing of deduped) {
        try {
          const resolved = await this.resolveListingLink(listing.alertId, listing.id);
          listing.sourceUrl = resolved.url;
        } catch {
          // resolution failure leaves sourceUrl null
        }
      }
    }

    return deduped;
  }

  async resolveListingLink(alertId: string, listingId: string): Promise<{ listingId: string; alertId: string; url: string }> {
    const url = new URL(`${this.apiOrigin}/alert_result_view_ad`);
    url.searchParams.set("ad", listingId);
    url.searchParams.set("alert_token", alertId);

    const response = await this.rawFetch(url.toString(), {
      method: "GET",
      headers: this.apiHeaders()
    });

    if (!response.ok) {
      throw await this.toApiError("GET", url.toString(), response);
    }

    return {
      listingId,
      alertId,
      url: response.url || url.toString()
    };
  }

  async getKanban(options: ListListingsOptions & { includeResolvedLinks?: boolean } = {}): Promise<JinkaKanban> {
    const listings = await this.listListings(options);
    const resolvedLinks = new Map<string, string>();

    if (options.includeResolvedLinks) {
      for (const listing of listings) {
        const resolved = await this.resolveListingLink(listing.alertId, listing.id);
        resolvedLinks.set(listing.id, resolved.url);
      }
    }

    return buildKanban(listings, resolvedLinks);
  }

  async reportExpiredListing(options: {
    alertId: string;
    listingId: string;
    reason?: string;
  }): Promise<{ ok: true; status: number }> {
    const body = new URLSearchParams({
      ad_id: options.listingId,
      reason: options.reason ?? "ad_link_404"
    });
    const response = await this.requestRaw("POST", `/alert/${encodeURIComponent(options.alertId)}/abuses`, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    if (!response.ok) {
      throw await this.toApiError("POST", `/alert/${options.alertId}/abuses`, response);
    }

    return { ok: true, status: response.status };
  }

  private async authenticate(): Promise<void> {
    if (this.configuredAccessToken) {
      this.accessToken = this.configuredAccessToken;
      return;
    }

    if (!this.config.email || !this.config.password) {
      throw new Error("Jinka authentication requires JINKA_ACCESS_TOKEN or both JINKA_EMAIL and JINKA_PASSWORD.");
    }

    const authUrl = `${this.apiBaseUrl}/user/auth`;
    const body = new URLSearchParams({
      email: this.config.email,
      password: this.config.password
    });
    const response = await this.rawFetch(authUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://www.jinka.fr",
        "User-Agent": defaultUserAgent
      },
      body
    });

    if (!response.ok) {
      throw await this.toApiError("POST", authUrl, response);
    }

    const data = asRecord(await response.json());
    const token = data.access_token;
    if (typeof token !== "string" || token.length === 0) {
      throw new Error("Jinka authentication response did not include access_token.");
    }
    this.accessToken = token;
  }

  private async requestJson(method: string, path: string, query?: Record<string, string>): Promise<unknown> {
    const response = await this.requestRaw(method, path, { query });
    if (!response.ok) {
      throw await this.toApiError(method, path, response);
    }
    return response.json();
  }

  private async requestRaw(
    method: string,
    path: string,
    options: {
      query?: Record<string, string>;
      body?: BodyInit;
      headers?: Record<string, string>;
      retryAuth?: boolean;
    } = {}
  ): Promise<ResponseLike> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const url = new URL(`${this.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await this.rawFetch(url.toString(), {
      method,
      headers: {
        ...this.apiHeaders(),
        ...options.headers
      },
      body: options.body
    });

    if (
      (response.status === 401 || response.status === 403) &&
      options.retryAuth !== false &&
      !this.configuredAccessToken
    ) {
      this.accessToken = null;
      await this.authenticate();
      return this.requestRaw(method, path, { ...options, retryAuth: false });
    }

    return response;
  }

  private async rawFetch(url: string, init: RequestInit): Promise<ResponseLike> {
    await this.waitForPace();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      this.lastRequestAt = Date.now();
    }
  }

  private async waitForPace(): Promise<void> {
    if (this.requestDelayMs <= 0 || this.lastRequestAt === 0) return;
    const elapsed = Date.now() - this.lastRequestAt;
    const waitMs = this.requestDelayMs - elapsed;
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  private apiHeaders(): Record<string, string> {
    return {
      "Accept": "application/json",
      "Accept-Language": "fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3",
      "Authorization": `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "Origin": "https://www.jinka.fr",
      "User-Agent": defaultUserAgent
    };
  }

  private webHeaders(): Record<string, string> {
    return {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
      "User-Agent": defaultUserAgent
    };
  }

  private async toApiError(method: string, url: string, response: ResponseLike): Promise<JinkaApiError> {
    const contentType = response.headers?.get("content-type") ?? "";
    let responseBody: unknown;
    try {
      responseBody = contentType.includes("application/json") ? await response.json() : await response.text();
    } catch {
      responseBody = undefined;
    }
    return new JinkaApiError(`Jinka API error: HTTP ${response.status}`, {
      status: response.status,
      method,
      url,
      responseBody
    });
  }
}

const defaultUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.190 Safari/537.36";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeAccessToken(value?: string): string | null {
  const token = value?.trim();
  if (!token) return null;
  return token.replace(/^Bearer\s+/i, "").trim() || null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } as Record<string, unknown> : {};
}

function dedupeById(listings: JinkaListing[]): JinkaListing[] {
  const seen = new Set<string>();
  const deduped: JinkaListing[] = [];
  for (const listing of listings) {
    if (seen.has(listing.id)) continue;
    seen.add(listing.id);
    deduped.push(listing);
  }
  return deduped;
}
