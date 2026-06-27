import type {
  DashboardFilter,
  JinkaAlert,
  JinkaKanban,
  JinkaKanbanCard,
  JinkaKanbanColumn,
  JinkaListing,
  JinkaPagination
} from "./types.js";

export const dashboardFilters = ["all", "read", "unread", "favorite", "contact", "deleted"] as const;

export function normalizeAlert(raw: unknown): JinkaAlert {
  const record = asRecord(raw);
  const id = stringify(record.id);
  return {
    id,
    name: stringify(record.name, id),
    userName: nullableString(record.user_name),
    estimatedAdsPerDay: nullableNumber(record.estimated_ads_per_day),
    raw: record
  };
}

export function normalizePagination(raw: unknown): JinkaPagination {
  const record = asRecord(raw);
  const totals = asRecord(record.totals);
  return {
    page: nullableNumber(record.page),
    nbPages: nullableNumber(record.nbPages) ?? nullableNumber(record.nb_pages) ?? 1,
    totals: {
      all: nullableNumber(totals.all) ?? 0,
      read: nullableNumber(totals.read) ?? 0,
      unread: nullableNumber(totals.unread) ?? 0,
      favorite: nullableNumber(totals.favorite) ?? 0,
      contact: nullableNumber(totals.contact) ?? 0,
      deleted: nullableNumber(totals.deleted) ?? 0
    },
    raw: record
  };
}

export function normalizeListing(raw: unknown, alertId: string): JinkaListing {
  const record = asRecord(raw);
  const id = stringify(record.id);
  const rent = nullableNumber(record.rent);
  const previousRent = nullableNumber(record.previous_rent);
  const area = nullableNumber(record.area);
  const latitude = nullableNumber(record.lat);
  const longitude = nullableNumber(record.lng);
  const clickedAt = nullableString(record.clicked_at);
  const deletedAt = nullableString(record.deleted_at) ?? nullableString(record.deletedAt);
  const expiredAt = nullableString(record.expired_at);
  const favorite = toBoolean(record.favorite);
  const contacted = toBoolean(record.contacted) || toBoolean(record.contact);
  const newRealEstate = toBoolean(record.new_real_estate);

  return {
    id,
    alertId,
    source: nullableString(record.source),
    sourceLabel: nullableString(record.source_label),
    sourceLogo: nullableString(record.source_logo),
    sourceIsPartner: nullableBoolean(record.source_is_partner),
    externalId: nullableString(record.external_id) ?? nullableString(record.externalId),
    reference: nullableString(record.reference),
    searchType: nullableString(record.search_type),
    ownerType: nullableString(record.owner_type),
    rent,
    rentMax: nullableNumber(record.rent_max),
    area,
    landArea: nullableNumber(record.land_area) ?? nullableNumber(record.landArea),
    rooms: nullableNumber(record.room),
    bedrooms: nullableNumber(record.bedroom),
    floor: nullableNumber(record.floor),
    propertyType: nullableString(record.type),
    buyType: nullableString(record.buy_type),
    city: nullableString(record.city),
    postalCode: nullableString(record.postal_code),
    latitude,
    longitude,
    furnished: nullableBoolean(record.furnished),
    description: nullableString(record.description),
    imageUrls: normalizeImages(record.images),
    createdAt: nullableString(record.created_at),
    expiredAt,
    sentAt: nullableString(record.sendDate) ?? nullableString(record.send_date),
    previousRent,
    previousRentAt: nullableString(record.previous_rent_at),
    favorite,
    contacted,
    clickedAt,
    deletedAt,
    newRealEstate,
    pricePerM2: rent !== null && area && area > 0 ? round(rent / area) : null,
    rentEvolution: rent !== null && previousRent !== null ? previousRent - rent : null,
    geoCoords: latitude !== null && longitude !== null ? `${latitude}, ${longitude}` : null,
    webviewLink: nullableString(record.webview_link),
    status: {
      isExpired: expiredAt !== null,
      isFavorite: favorite,
      isContacted: contacted,
      isRead: clickedAt !== null,
      isUnread: clickedAt === null,
      isDeleted: deletedAt !== null || toBoolean(record.deleted),
      isNew: newRealEstate || clickedAt === null
    },
    raw: record
  };
}

export function buildKanban(listings: JinkaListing[], resolvedLinks: Map<string, string> = new Map()): JinkaKanban {
  const columns: JinkaKanbanColumn[] = [
    { id: "unread", title: "Unread / New", cards: [] },
    { id: "read", title: "Read / Active", cards: [] },
    { id: "favorite", title: "Favorite", cards: [] },
    { id: "contacted", title: "Contacted", cards: [] },
    { id: "expired", title: "Expired", cards: [] },
    { id: "deleted", title: "Deleted", cards: [] }
  ];
  const byId = new Map(columns.map((column) => [column.id, column]));

  for (const listing of listings) {
    const card = toKanbanCard(listing, resolvedLinks.get(listing.id));
    if (listing.status.isDeleted) {
      byId.get("deleted")?.cards.push(card);
      continue;
    }
    if (listing.status.isExpired) {
      byId.get("expired")?.cards.push(card);
      continue;
    }
    if (listing.status.isContacted) byId.get("contacted")?.cards.push(card);
    if (listing.status.isFavorite) byId.get("favorite")?.cards.push(card);
    if (listing.status.isUnread) byId.get("unread")?.cards.push(card);
    else byId.get("read")?.cards.push(card);
  }

  return {
    generatedAt: new Date().toISOString(),
    alertIds: [...new Set(listings.map((listing) => listing.alertId))],
    columns
  };
}

export function isDashboardFilter(value: string): value is DashboardFilter {
  return dashboardFilters.includes(value as DashboardFilter);
}

function toKanbanCard(listing: JinkaListing, resolvedLink?: string): JinkaKanbanCard {
  const titleParts = [
    listing.propertyType,
    listing.rooms ? `${listing.rooms}p` : null,
    listing.area ? `${listing.area}m2` : null,
    listing.city
  ].filter(Boolean);

  return {
    id: listing.id,
    alertId: listing.alertId,
    title: titleParts.length > 0 ? titleParts.join(" - ") : listing.id,
    source: listing.sourceLabel ?? listing.source,
    city: listing.city,
    postalCode: listing.postalCode,
    rent: listing.rent,
    area: listing.area,
    landArea: listing.landArea,
    pricePerM2: listing.pricePerM2,
    createdAt: listing.createdAt,
    expiredAt: listing.expiredAt,
    webviewLink: listing.webviewLink,
    ...(resolvedLink ? { resolvedLink } : {}),
    status: listing.status
  };
}

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const record = asRecord(item);
      return nullableString(record.url) ?? nullableString(record.src);
    })
    .filter((item): item is string => Boolean(item));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } as Record<string, unknown> : {};
}

function stringify(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function nullableString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  }
  return null;
}

function toBoolean(value: unknown): boolean {
  return nullableBoolean(value) ?? false;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
