import {
  decodeEntities,
  firstImageSrc,
  htmlToText,
  safeUrl,
  summarize,
  truncate,
} from '@/lib/feed/text';

describe('htmlToText', () => {
  it('strips tags, scripts and styles and collapses whitespace', () => {
    expect(
      htmlToText(
        '<p>Hello <b>world</b></p>\n<script>alert(1)</script><style>p{}</style><p>Two</p>',
      ),
    ).toBe('Hello world Two');
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToText('Caf&eacute; &amp; bar &#8212; &#x2019;s &nbsp;ok')).toBe(
      'Café & bar — ’s ok',
    );
  });

  it('handles double-encoded markup without leaking tags', () => {
    expect(htmlToText('&lt;p&gt;Escaped &lt;b&gt;bold&lt;/b&gt;&lt;/p&gt;')).toBe('Escaped bold');
  });

  it('drops figure captions', () => {
    expect(htmlToText('<figure><figcaption>Photo: X</figcaption></figure><p>Body</p>')).toBe(
      'Body',
    );
  });

  it('drops link-only list items (promos, related links)', () => {
    const html =
      '<p>Standfirst.</p><ul><li><p><a href="/live">Follow our live blog for updates</a></p></li><li>A real point with <a href="/x">a link</a> inside it.</li></ul><p>Body.</p>';
    expect(htmlToText(html)).toBe('Standfirst. A real point with a link inside it. Body.');
  });

  it('never returns angle-bracket markup', () => {
    const out = htmlToText('<img src=x onerror=alert(1)><a href="javascript:x">click</a>');
    expect(out).toBe('click');
    expect(out).not.toMatch(/[<>]/);
  });
});

describe('decodeEntities', () => {
  it('leaves unknown entities and drops invalid code points', () => {
    expect(decodeEntities('&bogus; &#0; &#xD800;')).toBe('&bogus;  ');
  });
});

describe('truncate', () => {
  it('cuts at a word boundary with an ellipsis', () => {
    const text = 'word '.repeat(100).trim();
    const out = truncate(text, 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('word…')).toBe(true);
  });

  it('leaves short text alone', () => {
    expect(truncate('short', 50)).toBe('short');
  });
});

describe('summarize', () => {
  it('limits summaries to about 300 characters', () => {
    expect(
      summarize(`<p>${'Long sentence here. '.repeat(40)}</p>`, 'T').length,
    ).toBeLessThanOrEqual(300);
  });

  it('keeps paragraph breaks as plain newlines, ignoring source formatting whitespace', () => {
    const html = '<p>Standfirst without a full stop</p>\n\n<p>Body  text\n continues.</p>';
    expect(summarize(html, 'T')).toBe('Standfirst without a full stop\nBody text continues.');
    expect(htmlToText(html)).toBe('Standfirst without a full stop Body text continues.');
  });

  it('removes Hacker News boilerplate', () => {
    const html =
      '<p>Article URL: <a href="https://x">https://x</a></p><p>Comments URL: <a>https://y</a></p><p>Points: 3</p><p># Comments: 0</p>';
    expect(summarize(html, 'Title')).toBe('');
  });

  it('removes journal "Published online; doi" boilerplate', () => {
    const html =
      '<p>Nature, Published online: 27 October 2026; <a href="https://doi.org/x">doi:10.1038/s41586-026-11302-z</a></p>A chemical defence against phage infection';
    expect(summarize(html, 'Author Correction: A chemical defence against phage infection')).toBe(
      'A chemical defence against phage infection',
    );
  });

  it('returns empty when the summary repeats the title', () => {
    expect(summarize('<p>Same title</p>', 'Same Title')).toBe('');
  });
});

describe('safeUrl', () => {
  it('allows only http and https', () => {
    expect(safeUrl('https://a.example/x')).toBe('https://a.example/x');
    expect(safeUrl('http://a.example/x')).toBe('http://a.example/x');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('data:text/html,hi')).toBeUndefined();
    expect(safeUrl('  JAVASCRIPT:alert(1)')).toBeUndefined();
    expect(safeUrl('ftp://a.example/')).toBeUndefined();
  });

  it('resolves relative and protocol-relative URLs against a base', () => {
    expect(safeUrl('/a/b', 'https://site.example/feed')).toBe('https://site.example/a/b');
    expect(safeUrl('//cdn.example/i.jpg', 'https://site.example/')).toBe(
      'https://cdn.example/i.jpg',
    );
  });

  it('rejects credentials in URLs and garbage', () => {
    expect(safeUrl('https://user:pw@a.example/')).toBeUndefined();
    expect(safeUrl('not a url')).toBeUndefined();
    expect(safeUrl('')).toBeUndefined();
  });
});

describe('firstImageSrc', () => {
  it('skips tracking pixels', () => {
    expect(
      firstImageSrc('<img src="https://x/p.gif" width="1"><img src="https://x/real.jpg">'),
    ).toBe('https://x/real.jpg');
  });
});
