// Feed content is untrusted. Everything here reduces it to plain text or a vetted URL.

export const SUMMARY_MAX = 300;

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  hellip: '…',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  times: '×',
  divide: '÷',
  laquo: '«',
  raquo: '»',
  eacute: 'é',
  egrave: 'è',
  aacute: 'á',
  agrave: 'à',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  ouml: 'ö',
  uuml: 'ü',
  auml: 'ä',
  ccedil: 'ç',
  szlig: 'ß',
  shy: '',
  zwj: '',
  zwnj: '',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
      if (code >= 0xd800 && code <= 0xdfff) return '';
      return String.fromCodePoint(code);
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const bareText = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "Related links" list items: most of the text is inside <a>. */
function isMostlyLinks(html: string): boolean {
  const all = bareText(html).length;
  if (all === 0) return true;
  let linked = 0;
  for (const m of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi)) linked += bareText(m[1]!).length;
  return linked / all >= 0.6;
}

/**
 * HTML → plain text. Never returns markup. Single-line by default; with `paragraphs`, block
 * boundaries become "\n" (still plain text) so a standfirst can be told apart from the body.
 */
export function htmlToText(html: string, { paragraphs = false } = {}): string {
  if (!html) return '';
  const br = paragraphs ? '\n' : ' ';
  let s = html
    .replace(/\s+/g, ' ') // source formatting whitespace is never a paragraph break
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|iframe|noscript|svg|object|template|figcaption)\b[\s\S]*?<\/\1\s*>/gi,
      ' ',
    )
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi, (li: string, inner: string) =>
      isMostlyLinks(inner) ? ' ' : li,
    )
    .replace(/<(br|hr)\b[^>]*>/gi, br)
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|td)\s*>/gi, br)
    .replace(/<[^>]*>/g, '');
  // Text may arrive double-encoded (&amp;lt;); decode, then strip any tags that surfaced.
  s = decodeEntities(s);
  if (/<[a-z/!][^>]*>/i.test(s)) s = decodeEntities(s.replace(/<[^>]*>/g, ''));
  return (
    s
      // eslint-disable-next-line no-control-regex -- deliberately stripping control characters
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
      .replace(/\p{Cf}/gu, '') // zero-width spaces, BOMs, soft hyphens
      .replace(paragraphs ? /[^\S\n]+/g : /\s+/g, ' ')
      .replace(/ ?\n\s*/g, '\n') // collapse runs of breaks (no-op when single-line)
      .trim()
  );
}

/** Cut at a word boundary and add an ellipsis. */
export function truncate(text: string, max = SUMMARY_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

// Lines feed generators add that aren't summaries (Hacker News, WordPress, Feedburner).
const BOILERPLATE = [
  /\bArticle URL:\s*\S+/gi,
  /\bComments URL:\s*\S+/gi,
  /\bPoints:\s*\d+/gi,
  /#\s*Comments:\s*\d+/gi,
  /The post .{1,200}? appeared first on .{1,120}?\.?$/i,
  /\bContinue reading\.*\s*$/i,
  /\bRead more\.*\s*$/i,
  /\[(…|\.\.\.)\]\s*$/,
  // Nature and other Springer journals: "Nature, Published online: 27 October 2026; doi:…"
  /[\w&.' -]{2,60}, Published online: [^;\n]{4,40};\s*doi:\s*\S+/gi,
];

/** Plain-text summary, ≤ 300 chars. Paragraph breaks survive as "\n" (see `splitDeck`). */
export function summarize(html: string, title: string): string {
  let text = htmlToText(html, { paragraphs: true });
  for (const re of BOILERPLATE) text = text.replace(re, ' ');
  text = text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim();
  if (!text || text.replace(/\n/g, ' ').toLowerCase() === title.toLowerCase()) return '';
  return truncate(text);
}

export function cleanTitle(raw: string): string {
  return truncate(htmlToText(raw), SUMMARY_MAX);
}

/** Only http(s) URLs survive. Relative URLs resolve against `base`. */
export function safeUrl(raw: string | undefined | null, base?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = decodeEntities(raw.trim());
  if (!trimmed) return undefined;
  try {
    const u = base ? new URL(trimmed, base) : new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (u.username || u.password) return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

export function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** First plausible <img src> in an HTML fragment, skipping tracking pixels. */
export function firstImageSrc(html: string): string | undefined {
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) continue;
    const w = /\swidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    const h = /\sheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1];
    if ((w && +w < 32) || (h && +h < 32)) continue;
    if (/feedburner|doubleclick|pixel|tracking|\/~r\/|stats\.|\.gif(\?|$)/i.test(src)) continue;
    return src;
  }
  return undefined;
}
