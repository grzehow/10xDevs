export type Severity = "warning" | "minor" | "major" | "critical";
export type Weights = Record<Severity | "customer" | "service", number>;

export interface RankedTicket {
  rank: number;
  ticketId: string;
  severity: Severity;
  customers: number;
  services: number;
  score: number;
}

export type RankResult = { ok: true; tickets: RankedTicket[] } | { ok: false };

export const MAX_ROWS = 1000;
export const MAX_BYTES = 1_048_576;

const SEVERITY_RANK: Record<Severity, number> = { warning: 0, minor: 1, major: 2, critical: 3 };
const WEIGHT_KEYS = ["warning", "minor", "major", "critical", "customer", "service"] as const;
const HEADER = "ticket_id,severity,number_of_customers,number_of_services";
// Capped at 9 digits so a huge count can't overflow the score to Infinity.
const COUNT = /^\d{1,9}$/;

const isSeverity = (value: string): value is Severity => Object.hasOwn(SEVERITY_RANK, value);

export function parseWeights(rows: { key: string; value: unknown }[]): Weights | null {
  if (rows.length !== WEIGHT_KEYS.length) return null;
  const weights: Partial<Weights> = {};
  for (const { key, value } of rows) {
    const known = WEIGHT_KEYS.find((k) => k === key);
    if (!known || known in weights) return null;
    const num =
      typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (!Number.isFinite(num)) return null;
    weights[known] = num;
  }
  return weights as Weights;
}

export function rankTickets(csv: string, weights: Weights): RankResult {
  const lines = (csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv).split(/\r?\n/);
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  if (lines.length < 2 || lines.length > MAX_ROWS + 1) return { ok: false };
  const [header, ...rows] = lines.map((line) => line.split(",").map((cell) => cell.trim()));
  if (header.join(",") !== HEADER) return { ok: false };

  const seen = new Set<string>();
  const scored: (Omit<RankedTicket, "rank"> & { key: number })[] = [];
  for (const cells of rows) {
    if (cells.length !== 4) return { ok: false };
    const [ticketId, severity, customersRaw, servicesRaw] = cells as [string, string, string, string];
    if (!ticketId || seen.has(ticketId) || !isSeverity(severity)) return { ok: false };
    if (!COUNT.test(customersRaw) || !COUNT.test(servicesRaw)) return { ok: false };
    seen.add(ticketId);
    const customers = Number(customersRaw);
    const services = Number(servicesRaw);
    const score = weights[severity] + weights.customer * customers + weights.service * services;
    scored.push({ ticketId, severity, customers, services, score, key: Math.round(score * 1e9) });
  }

  scored.sort(
    (a, b) =>
      b.key - a.key ||
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      (a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0),
  );
  return { ok: true, tickets: scored.map(({ key: _key, ...ticket }, i) => ({ rank: i + 1, ...ticket })) };
}
