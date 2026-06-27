import { describe, expect, it } from "vitest";
import { buildKanban, normalizeListing } from "../src/jinka/normalize.js";

describe("kanban normalization", () => {
  it("groups listings into expected columns", () => {
    const listings = [
      normalizeListing({ id: "new", rent: 1000, area: 40, city: "Paris" }, "alert-1"),
      normalizeListing({ id: "read", clicked_at: "2026-04-18T10:00:00Z" }, "alert-1"),
      normalizeListing({ id: "fav", favorite: true }, "alert-1"),
      normalizeListing({ id: "contact", contacted: true }, "alert-1"),
      normalizeListing({ id: "expired", expired_at: "2026-04-18T10:00:00Z" }, "alert-1"),
      normalizeListing({ id: "deleted", deleted_at: "2026-04-18T10:00:00Z" }, "alert-1")
    ];

    const kanban = buildKanban(listings);
    const columns = Object.fromEntries(kanban.columns.map((column) => [column.id, column.cards.map((card) => card.id)]));

    expect(columns.unread).toEqual(["new", "fav", "contact"]);
    expect(columns.read).toEqual(["read"]);
    expect(columns.favorite).toEqual(["fav"]);
    expect(columns.contacted).toEqual(["contact"]);
    expect(columns.expired).toEqual(["expired"]);
    expect(columns.deleted).toEqual(["deleted"]);
  });

  it("keeps cards usable with sparse payloads", () => {
    const listing = normalizeListing({ id: "ad-1", landArea: "250" }, "alert-1");
    const kanban = buildKanban([listing]);

    expect(kanban.columns[0].cards[0]).toEqual(
      expect.objectContaining({
        id: "ad-1",
        url: "https://api.jinka.fr/alert_result_view_ad?ad=ad-1&alert_token=alert-1",
        title: "ad-1",
        price: null,
        rent: null,
        area: null,
        landArea: 250,
        pricePerM2: null
      })
    );
  });
});
