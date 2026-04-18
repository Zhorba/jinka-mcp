import { describe, expect, it, vi } from "vitest";
import { JinkaApiError, JinkaClient } from "../src/jinka/client.js";

type MockResponseOptions = {
  status?: number;
  url?: string;
  contentType?: string;
};

function jsonResponse(data: unknown, options: MockResponseOptions = {}) {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: options.url ?? "",
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? (options.contentType ?? "application/json") : null)
    },
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

function textResponse(text: string, options: MockResponseOptions = {}) {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: options.url ?? "",
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? (options.contentType ?? "text/html") : null)
    },
    json: async () => JSON.parse(text),
    text: async () => text
  };
}

function createClient(fetchMock: ReturnType<typeof vi.fn>) {
  return new JinkaClient({
    email: "user@example.com",
    password: "secret",
    requestDelayMs: 0,
    fetch: fetchMock as never
  });
}

describe("JinkaClient", () => {
  it("authenticates and lists alerts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-1" }))
      .mockResolvedValueOnce(
        jsonResponse([{ id: 123, name: "Paris", user_name: "Anas", estimated_ads_per_day: 4 }])
      );
    const client = createClient(fetchMock);

    const alerts = await client.listAlerts();

    expect(alerts).toEqual([
      expect.objectContaining({
        id: "123",
        name: "Paris",
        userName: "Anas",
        estimatedAdsPerDay: 4
      })
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.jinka.fr/apiv2/user/auth",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams)
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.jinka.fr/apiv2/alert",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token-1" })
      })
    );
  });

  it("throws structured errors for failed auth", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "bad credentials" }, { status: 401 }));
    const client = createClient(fetchMock);

    await expect(client.listAlerts()).rejects.toBeInstanceOf(JinkaApiError);
  });

  it("fetches and normalizes an alert dashboard page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          pagination: { nbPages: 2, totals: { all: 2, read: 1, unread: 1, favorite: 1, contact: 0, deleted: 0 } },
          ads: [
            {
              id: "ad-1",
              source: "seloger",
              source_label: "SeLoger",
              rent: 1200,
              area: 40,
              room: 2,
              city: "Paris",
              postal_code: "75011",
              favorite: true,
              clicked_at: "2026-04-18T10:00:00Z"
            }
          ]
        })
      );
    const client = createClient(fetchMock);

    const dashboard = await client.getAlertDashboard({ alertId: "alert-1", page: 1, filter: "all" });

    expect(dashboard.pagination.nbPages).toBe(2);
    expect(dashboard.listings[0]).toEqual(
      expect.objectContaining({
        id: "ad-1",
        alertId: "alert-1",
        sourceLabel: "SeLoger",
        pricePerM2: 30,
        status: expect.objectContaining({ isFavorite: true, isRead: true, isUnread: false })
      })
    );
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.jinka.fr/apiv2/alert/alert-1/dashboard?filter=all&page=1");
  });

  it("lists listings across dashboard pages and deduplicates ids", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          pagination: { nbPages: 2, totals: {} },
          ads: [{ id: "ad-1", rent: 1000 }]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pagination: { nbPages: 2, totals: {} },
          ads: [{ id: "ad-1", rent: 1000 }, { id: "ad-2", rent: 1100 }]
        })
      );
    const client = createClient(fetchMock);

    const listings = await client.listListings({ alertId: "alert-1", maxPagesPerAlert: 2 });

    expect(listings.map((listing) => listing.id)).toEqual(["ad-1", "ad-2"]);
  });

  it("resolves listing links through the redirect endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(textResponse("", { url: "https://source.example/ad-1" }));
    const client = createClient(fetchMock);

    const link = await client.resolveListingLink("alert-1", "ad-1");

    expect(link.url).toBe("https://source.example/ad-1");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.jinka.fr/alert_result_view_ad?ad=ad-1&alert_token=alert-1"
    );
  });

  it("reports expired listings through the confirmed abuses endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-1" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = createClient(fetchMock);

    const result = await client.reportExpiredListing({ alertId: "alert-1", listingId: "ad-1" });

    expect(result).toEqual({ ok: true, status: 200 });
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://api.jinka.fr/apiv2/alert/alert-1/abuses");
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams)
      })
    );
    expect(String(fetchMock.mock.calls[1][1].body)).toBe("ad_id=ad-1&reason=ad_link_404");
  });

  it("refreshes auth once after an expired token response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-1" }))
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "token-2" }))
      .mockResolvedValueOnce(jsonResponse([]));
    const client = createClient(fetchMock);

    const alerts = await client.listAlerts();

    expect(alerts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1].headers).toEqual(expect.objectContaining({ Authorization: "Bearer token-2" }));
  });
});
