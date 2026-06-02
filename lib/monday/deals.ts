// Fetch enriched deal data from the Monday "Deals - new" board (9889817939).
// Used by the Closed Won webhook to populate a Brand Hub draft.
//
// Column IDs sourced from the board metadata (see scripts/_explore-monday-deals.mjs).

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_BOARD_BASE_URL = "https://nauticalnetwork.monday.com";

// Stable column IDs on the Deals - new board.
export const DEAL_COLUMNS = {
  bd:                "person",                    // BD / AE
  dealIdentifier:    "multiple_person_mkv5drtd",   // Deal Identifier (multi-person, for credit)
  oldOwner:          "text_mkv5ga43",              // Old Owner
  stage:             "status",                     // Pipeline stage
  rank:              "color_mm3a5n1x",             // Deal Rank tier
  closeDate:         "date4",                      // Close Date
  creationDate:      "date_mkv5ztgm",              // Creation Date
  dealValue:         "numeric_mkv5d5ew",           // Deal Value $
  closeProbability:  "numeric_mkv5gspy",           // Close Probability %
  dealType:          "color_mkv5rf69",             // One Time vs Recurring
  leadSource:        "color_mkv53nze",             // Lead Source
  brand:             "color_mkv5zej5",             // Brand
  primaryContact:    "board_relation_mkv5f97s",    // → Contacts board
  billingContact:    "board_relation_mm03baq9",    // → Contacts board
} as const;

// Contacts board columns (subset we care about for handoff).
export const CONTACT_COLUMNS = {
  email:   "email",
  phone:   "phone",
  company: "text",
} as const;

export type DealSnapshot = {
  itemId: string;
  itemName: string;
  url: string;
  bd: string | null;
  dealIdentifiers: string[];
  stage: string | null;
  dealType: "One Time" | "Recurring" | string | null;
  dealValue: number | null;
  closeDate: string | null;
  leadSource: string | null;
  primaryContact: ContactSnapshot | null;
  billingContact: ContactSnapshot | null;
};

export type ContactSnapshot = {
  itemId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
};

function token() {
  const t = process.env.MONDAY_API_TOKEN;
  if (!t) throw new Error("MONDAY_API_TOKEN is not set");
  return t;
}

async function mondayFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token(),
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Monday API HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors && body.errors.length > 0) {
    throw new Error(`Monday API: ${body.errors.map((e) => e.message).join("; ")}`);
  }
  if (!body.data) throw new Error("Monday API returned no data");
  return body.data;
}

/**
 * Pull a single deal row + its linked Primary/Billing Contact records so we
 * can populate a Brand Hub draft with everything we need in one go.
 */
export async function fetchDealSnapshot(itemId: string): Promise<DealSnapshot> {
  const dealsBoardId = process.env.MONDAY_BOARD_ID_DEALS;

  // 1) Deal item + column values
  const data = await mondayFetch<{
    items: Array<{
      id: string;
      name: string;
      board: { id: string } | null;
      column_values: Array<{ id: string; text: string | null; value: string | null }>;
    }>;
  }>(
    `query($ids: [ID!]) {
      items(ids: $ids) {
        id
        name
        board { id }
        column_values { id text value }
      }
    }`,
    { ids: [itemId] }
  );

  const item = data.items?.[0];
  if (!item) throw new Error(`Deal item ${itemId} not found`);

  const cv = new Map(item.column_values.map((c) => [c.id, c]));
  const boardId = item.board?.id ?? dealsBoardId;

  // Helpers
  const text = (id: string) => cv.get(id)?.text ?? null;
  const num = (id: string): number | null => {
    const v = cv.get(id)?.text;
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // board_relation columns store linked item IDs in `value` as JSON.
  const relatedIds = (id: string): string[] => {
    const raw = cv.get(id)?.value;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { linkedPulseIds?: Array<{ linkedPulseId: number | string }> };
      return (parsed.linkedPulseIds ?? []).map((p) => String(p.linkedPulseId));
    } catch {
      return [];
    }
  };
  // people columns: text is comma-joined names
  const peopleNames = (id: string): string[] => {
    const t = cv.get(id)?.text;
    if (!t) return [];
    return t.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const primaryContactId = relatedIds(DEAL_COLUMNS.primaryContact)[0] ?? null;
  const billingContactId = relatedIds(DEAL_COLUMNS.billingContact)[0] ?? null;

  // 2) Hydrate contact items if linked
  const contactIds = [primaryContactId, billingContactId].filter(Boolean) as string[];
  const contacts = contactIds.length > 0 ? await fetchContacts(contactIds) : new Map<string, ContactSnapshot>();

  return {
    itemId: item.id,
    itemName: item.name,
    url: boardId ? `${MONDAY_BOARD_BASE_URL}/boards/${boardId}/pulses/${item.id}` : `${MONDAY_BOARD_BASE_URL}/pulses/${item.id}`,
    bd: peopleNames(DEAL_COLUMNS.bd)[0] ?? null,
    dealIdentifiers: peopleNames(DEAL_COLUMNS.dealIdentifier),
    stage: text(DEAL_COLUMNS.stage),
    dealType: text(DEAL_COLUMNS.dealType),
    dealValue: num(DEAL_COLUMNS.dealValue),
    closeDate: text(DEAL_COLUMNS.closeDate),
    leadSource: text(DEAL_COLUMNS.leadSource),
    primaryContact: primaryContactId ? contacts.get(primaryContactId) ?? null : null,
    billingContact: billingContactId ? contacts.get(billingContactId) ?? null : null,
  };
}

async function fetchContacts(ids: string[]): Promise<Map<string, ContactSnapshot>> {
  const data = await mondayFetch<{
    items: Array<{
      id: string;
      name: string;
      column_values: Array<{ id: string; text: string | null }>;
    }>;
  }>(
    `query($ids: [ID!]) {
      items(ids: $ids) {
        id
        name
        column_values { id text }
      }
    }`,
    { ids }
  );

  const out = new Map<string, ContactSnapshot>();
  for (const it of data.items ?? []) {
    const cv = new Map(it.column_values.map((c) => [c.id, c.text]));
    out.set(it.id, {
      itemId: it.id,
      name: it.name,
      email: cv.get(CONTACT_COLUMNS.email) ?? null,
      phone: cv.get(CONTACT_COLUMNS.phone) ?? null,
      company: cv.get(CONTACT_COLUMNS.company) ?? null,
    });
  }
  return out;
}

/** Map "One Time" / "Recurring" deal type to brand engagement_type. */
export function mapDealTypeToEngagement(dealType: string | null): "retainer" | "project" | null {
  if (!dealType) return null;
  const t = dealType.toLowerCase();
  if (t.includes("recurring") || t.includes("retainer")) return "retainer";
  if (t.includes("one time") || t.includes("project")) return "project";
  return null;
}
