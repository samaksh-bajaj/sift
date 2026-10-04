import { documentSchema, type CapturedDocument } from './schemas';
import { normalizeUrl } from './utils';

// This function is serialized by chrome.scripting; keep it self-contained.
export function capturePage(
  relevance: string[] = [],
  hardLimit = 60000,
): CapturedDocument {
  if (!['http:', 'https:'].includes(location.protocol))
    throw new Error('This Chrome page cannot be saved. Open a webpage first.');
  const root = document.body.cloneNode(true) as HTMLElement;
  const originals = [document.body, ...document.body.querySelectorAll('*')];
  const copies = [root, ...root.querySelectorAll('*')];
  originals.forEach((el, i) => {
    const style = getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    )
      copies[i]?.remove();
  });
  root
    .querySelectorAll(
      'script,style,noscript,nav,footer,header,form,input,textarea,select,button,[contenteditable],[hidden],[aria-hidden="true"],iframe,[role="navigation"],[role="banner"],[id*="cookie" i],[class*="cookie" i],[class*="advert" i]',
    )
    .forEach((el) => el.remove());
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const text = (el: Element) => clean(el.textContent ?? '');
  const metadata: Record<string, string> = {};
  document
    .querySelectorAll<HTMLMetaElement>(
      'meta[property^="og:"],meta[name="description"]',
    )
    .forEach((m) => {
      const key = m.getAttribute('property') ?? m.name;
      if (Object.keys(metadata).length < 50)
        metadata[key.slice(0, 100)] = m.content.slice(0, 4000);
    });
  const jsonLd: unknown[] = [];
  document
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((el) => {
      try {
        if ((el.textContent?.length ?? 0) < 100000 && jsonLd.length < 20)
          jsonLd.push(JSON.parse(el.textContent ?? ''));
      } catch {
        /* Malformed site metadata is ignored. */
      }
    });
  const tables = [...root.querySelectorAll('table')]
    .slice(0, 30)
    .map((table) => ({
      headers: [...table.querySelectorAll('thead th')].slice(0, 100).map(text),
      rows: [...table.querySelectorAll('tr')]
        .slice(0, 200)
        .map((row) =>
          [...row.querySelectorAll('th,td')]
            .slice(0, 100)
            .map((c) => text(c).slice(0, 4000)),
        ),
    }));
  root.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
  root
    .querySelectorAll('h1,h2,h3,h4,p,li,dt,dd,tr,div,section,article')
    .forEach((el) => {
      el.prepend('\n');
      el.append('\n');
    });
  const lines = [
    ...new Set((root.textContent ?? '').split('\n').map(clean).filter(Boolean)),
  ];
  const originalLength = lines.join('\n').length;
  let chosen = lines;
  if (originalLength > hardLimit) {
    const terms = relevance
      .flatMap((r) => r.toLowerCase().split(/\W+/))
      .filter((t) => t.length > 2);
    const ranked = lines
      .map((line, index) => ({
        line,
        index,
        score: terms.reduce(
          (n, t) => n + (line.toLowerCase().includes(t) ? 1 : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    let used = 0;
    chosen = ranked
      .filter((r) => {
        if (used + r.line.length + 1 > hardLimit) return false;
        used += r.line.length + 1;
        return true;
      })
      .sort((a, b) => a.index - b.index)
      .map((r) => r.line);
    if (!chosen.length && lines[0]) chosen = [lines[0].slice(0, hardLimit)];
  }
  const rawCanonical = document.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  )?.href;
  const canonicalUrl =
    rawCanonical && /^https?:/.test(rawCanonical) ? rawCanonical : undefined;
  return {
    url: location.href,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    title: document.title.slice(0, 500),
    description: metadata.description,
    metadata,
    jsonLd,
    tables,
    cleanedText: chosen.join('\n').slice(0, hardLimit),
    wasTruncated: originalLength > hardLimit,
  };
}

export async function prepareDocument(
  input: unknown,
): Promise<{ document: CapturedDocument; hash: string }> {
  const parsed = documentSchema.parse(input);
  const document = {
    ...parsed,
    url: normalizeUrl(parsed.url),
    ...(parsed.canonicalUrl
      ? { canonicalUrl: normalizeUrl(parsed.canonicalUrl) }
      : {}),
  };
  const stable = JSON.stringify({
    title: document.title,
    metadata: Object.fromEntries(
      Object.entries(document.metadata).sort(([a], [b]) => a.localeCompare(b)),
    ),
    jsonLd: document.jsonLd,
    tables: document.tables,
    cleanedText: document.cleanedText,
  });
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(stable),
  );
  return {
    document,
    hash: [...new Uint8Array(bytes)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  };
}
