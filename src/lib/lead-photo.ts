// The lead's photo: the largest of the pictures its outlets carry. Feeds rarely say how big an
// image is, so the new tab measures them (a page can load any image; the background has no
// access to image hosts) and remembers the choice in storage.local, where the next tab finds it
// before its first paint.
import type { Item } from './types';

export const LEAD_PHOTO_KEY = 'leadPhoto';
/** Pictures measured per lead at most: its own and five other outlets'. */
const MAX_CANDIDATES = 6;

export interface LeadPhoto {
  /** The lead item it was chosen for. */
  itemId: string;
  url: string;
  /** The picture's shorter side, in pixels. */
  size: number;
  /** Every picture measured for this lead (broken ones too), so each is loaded only once. */
  tried: string[];
}

/** A picture's natural size, or 0 × 0 when it didn't load. */
export interface PhotoSize {
  url: string;
  width: number;
  height: number;
}

export function asLeadPhoto(v: unknown): LeadPhoto | null {
  const p = v as LeadPhoto | null | undefined;
  return p &&
    typeof p.itemId === 'string' &&
    typeof p.url === 'string' &&
    typeof p.size === 'number' &&
    Array.isArray(p.tried)
    ? p
    : null;
}

/**
 * The lead's own picture, then each other outlet's. A picture that other stories on the page
 * carry too is an outlet's stock image (a logo, a section graphic), not a photo of this story.
 */
export function leadPhotoCandidates(lead: Item, related: Item[], onPage: Iterable<Item>): string[] {
  const story = new Set([lead.id, ...related.map((i) => i.id)]);
  const stock = new Set<string>();
  for (const i of onPage) if (i.imageUrl && !story.has(i.id)) stock.add(i.imageUrl);
  const out: string[] = [];
  for (const i of [lead, ...related]) {
    const url = i.imageUrl;
    if (url && !stock.has(url) && !out.includes(url)) out.push(url);
  }
  return out.slice(0, MAX_CANDIDATES);
}

const forLead = (stored: LeadPhoto | null | undefined, leadId: string) =>
  stored?.itemId === leadId ? stored : null;

/** The remembered choice for this lead, if it's still one of its pictures. */
export function chosenLeadPhoto(
  stored: LeadPhoto | null | undefined,
  leadId: string,
  candidates: string[],
): string | undefined {
  const s = forLead(stored, leadId);
  return s && candidates.includes(s.url) ? s.url : undefined;
}

/** Pictures not yet measured for this lead; none when there's nothing to choose between. */
export function photosToMeasure(
  stored: LeadPhoto | null | undefined,
  leadId: string,
  candidates: string[],
): string[] {
  if (candidates.length < 2) return [];
  const tried = new Set(forLead(stored, leadId)?.tried ?? []);
  return candidates.filter((url) => !tried.has(url));
}

/**
 * Fold new measurements into the choice. A picture is as large as its shorter side: the lead's
 * box crops to roughly square, so a wide 1200 × 600 shows fewer pixels there than 900 × 900.
 * Ties go to the earlier candidate (the lead's own). Null while nothing has loaded.
 */
export function chooseLeadPhoto(
  stored: LeadPhoto | null | undefined,
  leadId: string,
  candidates: string[],
  measured: PhotoSize[],
): LeadPhoto | null {
  const prev = forLead(stored, leadId);
  const tried = [...new Set([...(prev?.tried ?? []), ...measured.map((m) => m.url)])];
  let best =
    prev && candidates.includes(prev.url) && prev.size > 0
      ? { url: prev.url, size: prev.size }
      : null;
  const order = (url: string) => candidates.indexOf(url);
  for (const m of measured) {
    const size = Math.min(m.width, m.height);
    if (size <= 0 || !candidates.includes(m.url)) continue;
    if (!best || size > best.size || (size === best.size && order(m.url) < order(best.url))) {
      best = { url: m.url, size };
    }
  }
  return best ? { itemId: leadId, url: best.url, size: best.size, tried } : null;
}
