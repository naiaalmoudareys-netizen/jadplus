/**
 * The partner's proposed rate card (S9, P1; ADR 0025): the lines the office edits as text, turned into the
 * body the API accepts (rateCardChangeBody), and each line compared with today's price. A change starts at
 * least 60 days after it is sent; the API checks again, including the 12-month price freeze.
 */
import {
  RATE_CHANGE_NOTICE_DAYS,
  addDays,
  rateCardChangeBody,
  type RateCardChangeBody,
  type RateLine,
} from '@jadplus/shared';

export interface DraftLine {
  readonly key: string;
  readonly serviceCode: string;
  readonly item: string;
  readonly unit: string;
  /** As typed, in AED ("120" or "95.50"). */
  readonly price: string;
}

/** Fils (whole numbers) as an AED amount to type: 12050 → "120.50", 12000 → "120". */
export function filsToInput(amount: number): string {
  return amount % 100 === 0 ? String(amount / 100) : (amount / 100).toFixed(2);
}

/** The draft starts from the current card's lines (or one empty line). */
export function draftFrom(lines: readonly RateLine[], newKey: () => string): DraftLine[] {
  if (lines.length === 0) return [emptyLine(newKey())];
  return lines.map((l) => ({
    key: newKey(),
    serviceCode: l.serviceCode,
    item: l.item,
    unit: l.unit,
    price: filsToInput(l.priceFils),
  }));
}

export function emptyLine(key: string): DraftLine {
  return { key, serviceCode: 'maintenance', item: '', unit: 'per_job', price: '' };
}

/** The earliest day a new card can start (S9: 60 days' notice). */
export function earliestStart(today: string): string {
  return addDays(today, RATE_CHANGE_NOTICE_DAYS);
}

export type DraftResult =
  { readonly ok: true; readonly body: RateCardChangeBody } | { readonly ok: false; readonly problem: string };

/** The draft as the API body, or the first problem in plain words. */
export function draftBody(effectiveFrom: string, lines: readonly DraftLine[], today: string): DraftResult {
  if (effectiveFrom < earliestStart(today)) {
    return {
      ok: false,
      problem: `A new rate card can start ${String(RATE_CHANGE_NOTICE_DAYS)} days from today at the earliest.`,
    };
  }
  const items = lines.map((l) => ({
    serviceCode: l.serviceCode,
    item: l.item.trim(),
    unit: l.unit,
    priceAed: l.price.trim() === '' ? Number.NaN : Number(l.price),
  }));
  const bad = items.findIndex((i) => !Number.isFinite(i.priceAed) || i.priceAed <= 0);
  if (bad !== -1) return { ok: false, problem: `Line ${String(bad + 1)}: give a price in AED.` };
  const parsed = rateCardChangeBody.safeParse({ effectiveFrom, items });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const line = issue?.path[1];
    const where = typeof line === 'number' ? `Line ${String(line + 1)}: ` : '';
    return { ok: false, problem: `${where}${issue?.message ?? 'Check the lines.'}` };
  }
  return { ok: true, body: parsed.data };
}

/** How a proposed price compares with today's: "New", "Same", "+10 %", "−5 %". */
export function priceChange(proposedFils: number, currentFils: number | null): string {
  if (currentFils === null) return 'New';
  if (proposedFils === currentFils || currentFils === 0) return 'Same';
  const pct = Math.round(((proposedFils - currentFils) * 100) / currentFils);
  if (pct === 0) return proposedFils > currentFils ? 'Up < 1 %' : 'Down < 1 %';
  return pct > 0 ? `+${String(pct)} %` : `−${String(-pct)} %`;
}

/** What a draft line costs on the current card (same service, unit and item), in fils; null when it is new. */
export function currentPriceFils(line: DraftLine, current: readonly RateLine[]): number | null {
  const item = line.item.trim().toLowerCase();
  return (
    current.find(
      (c) => c.serviceCode === line.serviceCode && c.unit === line.unit && c.item.toLowerCase() === item,
    )?.priceFils ?? null
  );
}

/** The change column of the editor: "+10 %", "New", or "—" while the price is not a number. */
export function draftChange(line: DraftLine, current: readonly RateLine[]): string {
  const price = Number(line.price);
  if (line.price.trim() === '' || !Number.isFinite(price)) return '—';
  return priceChange(Math.round(price * 100), currentPriceFils(line, current));
}
