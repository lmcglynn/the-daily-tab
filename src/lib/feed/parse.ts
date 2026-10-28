import { XMLParser } from 'fast-xml-parser';

export type FeedFormat = 'rss2' | 'atom' | 'rss1';

export interface ParsedEntry {
  guid?: string;
  title: string;
  link?: string;
  summaryHtml?: string;
  contentHtml?: string;
  imageUrl?: string;
  published?: string;
  author?: string;
}

export interface ParsedFeed {
  format: FeedFormat;
  title: string;
  siteUrl?: string;
  entries: ParsedEntry[];
}

export class FeedParseError extends Error {
  override name = 'FeedParseError';
}

type Node = Record<string, unknown>;

const ARRAY_TAGS = new Set([
  'item',
  'entry',
  'link',
  'atom:link',
  'author',
  'enclosure',
  'media:content',
  'media:thumbnail',
  'media:group',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

function text(v: unknown): string {
  const f = first(v);
  if (typeof f === 'string') return f.trim();
  if (typeof f === 'number' || typeof f === 'boolean') return String(f);
  if (isNode(f)) return text(f['#text']);
  return '';
}

/** All text leaves, for Atom type="xhtml" content which arrives as nested elements. */
function deepText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(deepText).join(' ');
  if (isNode(v)) {
    return Object.entries(v)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([, c]) => deepText(c))
      .join(' ');
  }
  return '';
}

const attr = (v: unknown, name: string): string | undefined => {
  const f = first(v);
  if (!isNode(f)) return undefined;
  const a = f[`@_${name}`];
  return typeof a === 'string' ? a : undefined;
};

export function parseFeed(xml: string): ParsedFeed {
  // Strip the BOM and any DTD: feeds never need internal entity declarations.
  const cleaned = (xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml)
    .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i, '')
    .trim();
  if (!cleaned.startsWith('<')) throw new FeedParseError('Response is not XML');
  let doc: Node;
  try {
    doc = parser.parse(cleaned) as Node;
  } catch (e) {
    throw new FeedParseError(`Malformed XML: ${(e as Error).message}`);
  }
  if (isNode(doc.rss)) return parseRss2(doc.rss);
  if (isNode(doc.feed)) return parseAtom(doc.feed);
  if (isNode(doc['rdf:RDF'])) return parseRss1(doc['rdf:RDF']);
  throw new FeedParseError('Not an RSS or Atom feed');
}

function parseRss2(rss: Node): ParsedFeed {
  const ch = (first(rss.channel) as Node | undefined) ?? {};
  return {
    format: 'rss2',
    title: text(ch.title),
    siteUrl: rssLink(ch) ?? atomLink(ch['atom:link'], 'alternate'),
    entries: arr(ch.item).filter(isNode).map(rssItem),
  };
}

function rssLink(n: Node): string | undefined {
  for (const l of arr(n.link)) {
    const t = text(l) || attr(l, 'href');
    if (t) return t;
  }
  return undefined;
}

function rssItem(it: Node): ParsedEntry {
  const guid = text(it.guid) || undefined;
  const permalink = attr(it.guid, 'isPermaLink') !== 'false';
  return {
    guid,
    title: text(it.title),
    link: rssLink(it) ?? (guid && permalink ? guid : undefined),
    summaryHtml: deepText(first(it.description)) || undefined,
    contentHtml: text(it['content:encoded']) || undefined,
    published: text(it.pubDate) || text(it['dc:date']) || text(it['a10:updated']) || undefined,
    author: text(it['dc:creator']) || text(it.author) || undefined,
    imageUrl: mediaImage(it),
  };
}

function atomLink(links: unknown, rel: string): string | undefined {
  const ls = arr(links).filter(isNode);
  const relOf = (l: Node) => attr(l, 'rel') ?? 'alternate';
  const match =
    ls.find((l) => relOf(l) === rel && (attr(l, 'type') ?? 'text/html').includes('html')) ??
    ls.find((l) => relOf(l) === rel);
  return match ? attr(match, 'href') : undefined;
}

function parseAtom(feed: Node): ParsedFeed {
  return {
    format: 'atom',
    title: deepText(first(feed.title)).trim(),
    siteUrl: atomLink(feed.link, 'alternate'),
    entries: arr(feed.entry)
      .filter(isNode)
      .map((e) => {
        const author = first(e.author);
        return {
          guid: text(e.id) || undefined,
          title: deepText(first(e.title)).trim(),
          link: atomLink(e.link, 'alternate'),
          summaryHtml: deepText(first(e.summary)) || undefined,
          contentHtml: deepText(first(e.content)) || undefined,
          published: text(e.published) || text(e.updated) || undefined,
          author: isNode(author) ? text(author.name) || undefined : undefined,
          imageUrl: mediaImage(e) ?? enclosureLink(e.link),
        };
      }),
  };
}

function enclosureLink(links: unknown): string | undefined {
  const l = arr(links)
    .filter(isNode)
    .find((l) => attr(l, 'rel') === 'enclosure' && (attr(l, 'type') ?? '').startsWith('image/'));
  return l ? attr(l, 'href') : undefined;
}

function parseRss1(rdf: Node): ParsedFeed {
  const ch = (first(rdf.channel) as Node | undefined) ?? {};
  return {
    format: 'rss1',
    title: text(ch.title),
    siteUrl: text(ch.link) || undefined,
    entries: arr(rdf.item)
      .filter(isNode)
      .map((it) => ({
        guid: attr(it, 'rdf:about') || text(it.link) || undefined,
        title: text(it.title) || text(it['dc:title']),
        link: text(it.link) || attr(it, 'rdf:about'),
        summaryHtml: text(it.description) || undefined,
        contentHtml: text(it['content:encoded']) || undefined,
        published:
          text(it['dc:date']) ||
          text(it['prism:publicationDate']) ||
          text(it['prism:coverDisplayDate']) ||
          undefined,
        author: text(it['dc:creator']) || undefined,
        imageUrl: mediaImage(it),
      })),
  };
}

const IMAGE_EXT = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;

/** Best image from Media RSS, enclosures or iTunes tags; prefers the widest. */
function mediaImage(n: Node): string | undefined {
  const found: { url: string; width: number }[] = [];
  const add = (v: unknown, requireImage: boolean) => {
    for (const m of arr(v).filter(isNode)) {
      const url = attr(m, 'url') ?? attr(m, 'href');
      if (!url) continue;
      const type = attr(m, 'type') ?? '';
      const medium = attr(m, 'medium') ?? '';
      const isImage = medium === 'image' || type.startsWith('image/') || IMAGE_EXT.test(url);
      if (requireImage && !isImage) {
        add(m['media:thumbnail'], false);
        continue;
      }
      found.push({ url, width: Number(attr(m, 'width')) || 0 });
    }
  };
  add(n['media:content'], true);
  add(n['media:thumbnail'], false);
  for (const g of arr(n['media:group']).filter(isNode)) {
    add(g['media:content'], true);
    add(g['media:thumbnail'], false);
  }
  add(n.enclosure, true);
  const itunes = attr(n['itunes:image'], 'href');
  if (itunes) found.push({ url: itunes, width: 0 });
  found.sort((a, b) => b.width - a.width);
  return found[0]?.url;
}
