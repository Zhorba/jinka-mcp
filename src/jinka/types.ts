export type JsonObject = Record<string, unknown>;

export type JinkaAlert = {
  id: string;
  name: string;
  userName: string | null;
  estimatedAdsPerDay: number | null;
  raw: JsonObject;
};

export type JinkaPaginationTotals = {
  all: number;
  read: number;
  unread: number;
  favorite: number;
  contact: number;
  deleted: number;
};

export type JinkaPagination = {
  page: number | null;
  nbPages: number;
  totals: JinkaPaginationTotals;
  raw: JsonObject;
};

export type JinkaListing = {
  id: string;
  alertId: string;
  source: string | null;
  sourceLabel: string | null;
  sourceLogo: string | null;
  sourceIsPartner: boolean | null;
  externalId: string | null;
  reference: string | null;
  searchType: string | null;
  ownerType: string | null;
  rent: number | null;
  rentMax: number | null;
  area: number | null;
  landArea: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  propertyType: string | null;
  buyType: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  furnished: boolean | null;
  description: string | null;
  imageUrls: string[];
  createdAt: string | null;
  expiredAt: string | null;
  sentAt: string | null;
  previousRent: number | null;
  previousRentAt: string | null;
  favorite: boolean;
  contacted: boolean;
  clickedAt: string | null;
  deletedAt: string | null;
  newRealEstate: boolean;
  pricePerM2: number | null;
  rentEvolution: number | null;
  geoCoords: string | null;
  webviewLink: string | null;
  status: {
    isExpired: boolean;
    isFavorite: boolean;
    isContacted: boolean;
    isRead: boolean;
    isUnread: boolean;
    isDeleted: boolean;
    isNew: boolean;
  };
  raw: JsonObject;
};

export type JinkaDashboard = {
  alertId: string;
  filter: string;
  page: number;
  pagination: JinkaPagination;
  listings: JinkaListing[];
  raw: JsonObject;
};

export type JinkaKanbanColumnId = "unread" | "read" | "favorite" | "contacted" | "expired" | "deleted";

export type JinkaKanbanCard = {
  id: string;
  alertId: string;
  title: string;
  source: string | null;
  city: string | null;
  postalCode: string | null;
  rent: number | null;
  area: number | null;
  landArea: number | null;
  pricePerM2: number | null;
  createdAt: string | null;
  expiredAt: string | null;
  webviewLink: string | null;
  resolvedLink?: string;
  status: JinkaListing["status"];
};

export type JinkaKanbanColumn = {
  id: JinkaKanbanColumnId;
  title: string;
  cards: JinkaKanbanCard[];
};

export type JinkaKanban = {
  generatedAt: string;
  alertIds: string[];
  columns: JinkaKanbanColumn[];
};

export type DashboardFilter = "all" | "read" | "unread" | "favorite" | "contact" | "deleted";
