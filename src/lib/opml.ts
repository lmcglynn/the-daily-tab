// OPML 1.0/2.0 import and export. Parsing uses fast-xml-parser so it runs in tests and workers.
import { XMLParser } from 'fast-xml-parser';
import { safeUrl } from './feed/text';
import type { Feed } from './types';

export interface OpmlFeed {
  url: string;
  title: string;
  siteUrl: string;
  category: string;
}

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => name === 'outline',
});

const attr = (n: Node, name: string) => {
  const v = n[`@_${name}`];
  return typeof v === 'string' ? v.trim() : '';
};

export function parseOpml(text: string, fallbackCategory = 'Imported'): OpmlFeed[] {
  const cleaned = text.replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i, '');
  let doc: Node;
  try {
    doc = parser.parse(cleaned) as Node;
  } catch {
    throw new Error('That file is not valid OPML.');
  }
  const opml = doc.opml as Node | undefined;
  const body = opml?.body as Node | undefined;
  if (!body) throw new Error('That file is not OPML (no <opml><body>).');

  const out: OpmlFeed[] = [];
  const seen = new Set<string>();
  const walk = (outlines: unknown, category: string) => {
    for (const o of (outlines as Node[] | undefined) ?? []) {
      const xmlUrl = safeUrl(attr(o, 'xmlUrl'));
      // Attribute text is plain text (rendered escaped), not HTML: only tidy whitespace.
      const label = (attr(o, 'title') || attr(o, 'text')).replace(/\s+/g, ' ').slice(0, 80);
      if (xmlUrl) {
        if (seen.has(xmlUrl)) continue;
        seen.add(xmlUrl);
        const declared = attr(o, 'category').split(',')[0]?.replace(/^\//, '').trim();
        out.push({
          url: xmlUrl,
          title: label || new URL(xmlUrl).hostname,
          siteUrl: safeUrl(attr(o, 'htmlUrl')) ?? new URL(xmlUrl).origin + '/',
          category: (category !== fallbackCategory ? category : declared) || fallbackCategory,
        });
      } else {
        // A folder: its children take its name as their section.
        walk(o.outline, label || category);
      }
    }
  };
  walk(body.outline, fallbackCategory);
  return out;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

export function toOpml(feeds: Feed[], sections: string[], title: string, now = new Date()): string {
  const groups = sections
    .map((s) => ({
      s,
      list: feeds.filter((f) => f.category === s).sort((a, b) => a.order - b.order),
    }))
    .filter((g) => g.list.length > 0);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${esc(title)}</title>`,
    `    <dateCreated>${now.toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>',
  ];
  for (const g of groups) {
    lines.push(`    <outline text="${esc(g.s)}" title="${esc(g.s)}">`);
    for (const f of g.list) {
      lines.push(
        `      <outline type="rss" text="${esc(f.title)}" title="${esc(f.title)}" xmlUrl="${esc(f.url)}" htmlUrl="${esc(f.siteUrl)}"/>`,
      );
    }
    lines.push('    </outline>');
  }
  lines.push('  </body>', '</opml>', '');
  return lines.join('\n');
}
