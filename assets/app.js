'use strict';

/* ════════════════════════ helpers ════════════════════════ */
const $ = s => document.querySelector(s);
const LS = {
  get(k, fallback){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const count = (s, c) => s.split(c).length - 1;
const r2 = v => Math.round(v * 100) / 100;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
function clean(s){
  const doc = new DOMParser().parseFromString(String(s ?? ''), 'text/html');
  return doc.body.textContent.replace(/\s+/g, ' ').trim();
}

/* colour maths */
const isHex = h => /^#[0-9a-f]{6}$/i.test(h || '');
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, p) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * p)); };
function lum(h){
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Pull a colour towards the text colour until it is legible on the background.
function readable(color, bg, ink, min = 4.5){
  let c = color;
  for (let i = 0; i < 14 && contrast(c, bg) < min; i++) c = mix(c, ink, 0.16);
  return c;
}
function rgb2hsl(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
/* ════════════════════════ options ════════════════════════ */
const DEFAULTS = { width: 540, face: 'journal', nAuth: 99, scale: 3, accent: '#27303d',
                   branding: true, uniform: false, abbrev: false, perYear: false, topBadge: false, showDoi: true, credit: true };
const opts = { ...DEFAULTS, ...LS.get('citecard.v2.opts', {}) };

/* Address of the published tool. In SVG exports it becomes the link behind "CiteCard" in the credit line. */
const SITE_URL = 'https://benjaminwehnert1008.github.io/citecard/';

/* ════════════════════════ input → identifier ════════════════════════ */
function cleanDoi(s){
  let d = s.split(/[?#&]/)[0];
  d = d.replace(/[.,;:'"\]}]+$/, '');
  while (d.endsWith(')') && count(d, ')') > count(d, '(')) d = d.slice(0, -1);
  if (d.endsWith('>') && !d.includes('<')) d = d.slice(0, -1);
  d = d.replace(/\/(full|abstract|pdf|epdf|pdfdirect|fulltext|full-text|meta|html|figures|references|metrics)$/i, '');
  d = d.replace(/\.(pdf|html?)$/i, '');
  if (/^10\.1101\//.test(d)) d = d.replace(/v\d+(\.[a-z-]+)*$/i, '').replace(/\.(full|abstract)$/i, '');
  return d;
}

function parseInput(raw){
  let s = raw.trim();
  try { s = decodeURIComponent(s); } catch {}
  let m;
  const ARX = '([a-z.-]+\\/\\d{7}|\\d{4}\\.\\d{4,5})';
  if ((m = s.match(new RegExp('arxiv\\.org\\/(?:abs|pdf|html)\\/' + ARX, 'i'))) || (m = s.match(new RegExp('^arxiv:\\s*' + ARX + '(?:v\\d+)?$', 'i'))))
    return { kind: 'doi', id: '10.48550/arxiv.' + m[1] };
  if ((m = s.match(/\b10\.\d{4,9}\/[^\s"']+/)))
    return { kind: 'doi', id: cleanDoi(m[0]) };
  if ((m = s.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i)) || (m = s.match(/ncbi\.nlm\.nih\.gov\/pubmed\/(\d+)/i)) ||
      (m = s.match(/^pmid:?\s*(\d+)$/i)) || (m = s.match(/^(\d{5,9})$/)))
    return { kind: 'pmid', id: m[1] };
  if ((m = s.match(/\bPMC\d+\b/i)))
    return { kind: 'pmcid', id: m[0].toUpperCase() };
  if ((m = s.match(/openalex\.org\/(?:works\/)?(W\d+)/i)) || (m = s.match(/^(W\d{6,})$/i)))
    return { kind: 'openalex', id: m[1].toUpperCase() };
  if ((m = s.match(/nature\.com\/articles\/([\w.-]+)/i)))
    return { kind: 'doi', id: '10.1038/' + m[1].replace(/\.pdf$/i, '') };
  if ((m = s.match(/elifesciences\.org\/(?:articles|reviewed-preprints)\/(\d+)/i)))
    return { kind: 'doi', id: '10.7554/eLife.' + m[1] };
  // Elsevier / Cell / Lancet links carry a PII instead of a DOI
  if ((m = s.match(/\/pii\/([SB][\dX()-]{14,})/i)) || (m = s.match(/\/(?:PII)?(S\d{4}-?\d{3}[\dX]\(\d{2}\)\d{5}-[\dX])/i)))
    return { kind: 'pii', id: m[1].replace(/[^0-9A-Z]/gi, '').toUpperCase() };
  if (/^(https?:\/\/|www\.)\S+$/i.test(s)) return { kind: 'url' };
  return { kind: 'search', q: s };
}

/* ════════════════════════ metadata sources ════════════════════════ */
const OA = 'https://api.openalex.org/works';
const CR = 'https://api.crossref.org/works';
class UserError extends Error {}

async function getJSON(url){
  let r;
  const fail = (msg, retry) => Object.assign(new UserError(msg), { retry });
  try {
    r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
  } catch {
    throw fail('The data source could not be reached. Are you online?', true);   // also how a blocked 429 shows up
  }
  if (r.status === 404) return null;
  if (r.status === 429) throw fail('Too many requests in a short time. Wait a moment and try again.', true);
  if (!r.ok) throw fail(`The data source answered with error ${r.status}.`, r.status >= 500);
  return r.json();
}

// Every API gets its own lane: a few requests at a time, a short gap between them, and a retry when the
// service says "too many requests". Crossref's anonymous pool accepts only one request at a time.
function lane(concurrency, gap){
  let active = 0;
  const waiting = [];
  const next = () => { if (active < concurrency && waiting.length){ active++; waiting.shift()(); } };
  return async url => {
    await new Promise(ok => { waiting.push(ok); next(); });
    try {
      for (let attempt = 0; ; attempt++){
        try { return await getJSON(url); }
        catch (e) { if (attempt >= 2 || !e.retry) throw e; await sleep(900 * (attempt + 1)); }
      }
    } finally {
      setTimeout(() => { active--; next(); }, gap);
    }
  };
}
const openalex = lane(3, 150), crossref = lane(1, 120), wiki = lane(2, 120);

const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'da', 'dos', 'das', 'du', 'la', 'le',
                           'ten', 'ter', 'te', 'bin', 'ibn', 'al', 'el', 'zu', 'zur', 'af', 'av']);
function splitName(s){
  if (s.includes(',')){
    const [family, ...given] = s.split(',');
    return { family: family.trim(), given: given.join(' ').trim() };
  }
  const t = s.split(' ').filter(Boolean);
  if (t.length < 2) return { family: s, given: '' };
  let i = t.length - 1;
  while (i > 1 && PARTICLES.has(t[i - 1].toLowerCase())) i--;
  return { family: t.slice(i).join(' '), given: t.slice(0, i).join(' ') };
}
const initials = given => (given.match(/\p{L}[\p{L}\p{M}'’]*/gu) || [])
  .map(x => x.length <= 3 && x === x.toUpperCase() ? x : x[0].toUpperCase()).join('');   // "AJ" is already initials
// "Jumper J" – spaces inside one name are non-breaking so a name never wraps apart
const fmtName = a => (a.lit ?? `${a.family} ${initials(a.given || '')}`).trim().replace(/ /g, ' ');
const tidyTitle = s => s.replace(/([^.])\.$/, '$1');
const isIssn = s => /^\d{4}-\d{3}[\dX]$/i.test(s || '');

// The byline as printed ("Hu, Edward J.") beats OpenAlex's canonical profile name ("J. Edward Hu"),
// but only when it is unambiguously "Family, Given".
function oaAuthor(a){
  const raw = clean(a.raw_author_name || ''), profile = clean(a.author?.display_name || '');
  const parts = raw.split(',').map(x => x.trim());
  const rawOk = parts.length === 2 && parts[0] && parts[1] && !/^(ph\.?d|m\.?d|m\.?sc|jr|sr|ii|iii)\.?$/i.test(parts[1]);
  return splitName(rawOk ? raw : profile || raw);
}

function fromOpenAlex(w){
  const src = w.primary_location?.source;
  let journal = clean(src?.display_name || '');
  if (src?.type === 'repository') journal = journal.replace(/\s*\([^)]*\)$/, '');   // "arXiv (Cornell University)"
  const retracted = !!w.is_retracted;
  let title = clean(w.display_name || w.title || '');
  if (retracted) title = title.replace(/^(retracted( article)?|withdrawn)\s*:\s*/i, '');
  const pct = w.citation_normalized_percentile || {};
  const doi = (w.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  return {
    key: (doi || w.id || '').toLowerCase(), doi,
    title: tidyTitle(title),
    authors: (w.authorships || []).map(oaAuthor).filter(a => a.family),
    journal, journalShort: '',
    issns: [...new Set([src?.issn_l, ...(src?.issn || [])].filter(isIssn))],
    publisher: [...new Set([src?.host_organization_name, ...(src?.host_organization_lineage_names || [])].filter(Boolean))].join(' | '),
    year: w.publication_year || '', date: w.publication_date || '',
    cites: typeof w.cited_by_count === 'number' ? w.cited_by_count : null, citeSource: 'OpenAlex',
    top1: !!pct.is_in_top_1_percent, top10: !!pct.is_in_top_10_percent,
    preprint: w.type === 'preprint', retracted, fetched: Date.now(), note: '',
  };
}

const crAuthors = m => (m.author || [])
  .map(a => a.family ? { family: clean(a.family), given: clean(a.given || '') } : { lit: clean(a.name || '') })
  .filter(a => a.family || a.lit);
const crVenue = m => clean(m['container-title']?.[0] || m.institution?.[0]?.name || m.publisher || '');
const crYear = m => (m.issued || m.published || m.created)?.['date-parts']?.[0]?.[0] || '';

function fromCrossref(m){
  return {
    key: (m.DOI || '').toLowerCase(), doi: m.DOI || '',
    title: tidyTitle(clean(m.title?.[0] || '')),
    authors: crAuthors(m), journal: crVenue(m), journalShort: clean(m['short-container-title']?.[0] || ''),
    issns: (m.ISSN || []).filter(isIssn), publisher: clean(m.publisher || ''),
    year: crYear(m), date: '',
    cites: typeof m['is-referenced-by-count'] === 'number' ? m['is-referenced-by-count'] : null, citeSource: 'Crossref',
    top1: false, top10: false, preprint: m.type === 'posted-content', retracted: false, fetched: Date.now(), note: '',
  };
}

// Crossref has the author names split into given/family and the journal abbreviation.
function mergeCrossref(d, m){
  const ca = crAuthors(m);
  if (ca.length && ca.length >= d.authors.length) d.authors = ca;
  d.journalShort = clean(m['short-container-title']?.[0] || '');
  if (!d.journal) d.journal = crVenue(m);
  if (!d.issns.length) d.issns = (m.ISSN || []).filter(isIssn);
  if (!d.publisher) d.publisher = clean(m.publisher || '');
  if (!d.year) d.year = crYear(m);
  if (!d.title) d.title = tidyTitle(clean(m.title?.[0] || ''));
  if (m.type === 'posted-content') d.preprint = true;
}
const inCrossref = doi => doi && !/^10\.48550\//i.test(doi);   // arXiv DOIs are registered with DataCite
async function enrich(d){
  if (!inCrossref(d.doi)) return;
  try {
    const j = await crossref(`${CR}/${encodeURIComponent(d.doi)}`);
    if (j?.message) mergeCrossref(d, j.message);
  } catch {}
}

async function resolve(raw){
  let p = parseInput(raw);

  if (p.kind === 'search'){
    const j = await openalex(`${OA}?search=${encodeURIComponent(p.q)}&per-page=5`);
    const recs = (j?.results || []).map(fromOpenAlex);
    if (!recs.length) throw new UserError('No paper found with this title.');
    await enrich(recs[0]);
    return { data: recs[0], alts: recs.slice(1) };
  }
  if (p.kind === 'pii'){
    const j = await crossref(`${CR}?filter=alternative-id:${p.id}&rows=1`);
    const doi = j?.message?.items?.[0]?.DOI;
    if (!doi) throw new UserError('No DOI could be found for this link. Enter the DOI or the title of the paper instead.');
    p = { kind: 'doi', id: doi };
  }
  if (p.kind === 'url')
    throw new UserError('This link does not contain a DOI. Enter the DOI or the title of the paper instead.');

  const oaUrl = p.kind === 'doi' ? `${OA}/https://doi.org/${encodeURIComponent(p.id).replace(/%2F/gi, '/')}`
              : p.kind === 'openalex' ? `${OA}/${p.id}`
              : `${OA}/${p.kind}:${p.id}`;
  const [oa, cr] = await Promise.allSettled([
    openalex(oaUrl),
    p.kind === 'doi' && inCrossref(p.id) ? crossref(`${CR}/${encodeURIComponent(p.id)}`) : null,
  ]);
  const w = oa.status === 'fulfilled' ? oa.value : null;
  const m = cr.status === 'fulfilled' ? cr.value?.message : null;

  if (w){
    const d = fromOpenAlex(w);
    if (p.kind === 'doi' && d.doi && d.doi.toLowerCase() !== p.id.toLowerCase()){
      // e.g. a bioRxiv DOI whose paper has since appeared in a journal
      d.note = `You entered ${p.id}. OpenAlex lists this work under its published version, ${d.doi}, so the card shows that version.`;
      await enrich(d);
    } else {
      if (p.kind === 'doi') d.doi = p.id;
      if (m) mergeCrossref(d, m); else if (p.kind !== 'doi') await enrich(d);
    }
    return { data: d, alts: [] };
  }
  if (m){
    const d = fromCrossref(m);
    d.note = 'Not found in OpenAlex. Metadata and citation count come from Crossref.';
    return { data: d, alts: [] };
  }
  if (oa.status === 'rejected') throw oa.reason;
  throw new UserError('No paper found for this identifier. Is the DOI correct?');
}

/* ════════════════════════ journal branding ════════════════════════ */
function brandFor(d){
  const name = d.journal || '', pub = d.publisher || '';
  return BRANDS.find(b => (b.name && b.name.test(name)) || (b.publisher && b.publisher.test(pub))) || {};
}

/* Logos come from Wikidata (property P154) and are served by Wikimedia Commons. Nothing is bundled. */
const LOGO_TTL = 30 * 864e5;
const logoIndex = LS.get('citecard.v2.logos', {});     // key → { file, url, t } | { none: 1, t }
const logoJobs = new Map();                             // key → Promise<{ file, url } | null>
const logoImages = new Map();                           // url → Promise<processed logo | null>

function lookupLogo(d){
  const brand = brandFor(d);
  const key = brand.logoFile ? 'file:' + brand.logoFile : brand.qid || d.issns.slice().sort().join(',');
  if (!key) return Promise.resolve(null);
  const hit = logoIndex[key];
  if (hit && Date.now() - hit.t < LOGO_TTL) return Promise.resolve(hit.none ? null : hit);
  if (!logoJobs.has(key)) logoJobs.set(key, (async () => {
    let file = brand.logoFile || '';
    if (!file){
      const where = brand.qid ? `VALUES ?j { wd:${brand.qid} }`
                              : `VALUES ?issn { ${d.issns.map(i => `"${i}"`).join(' ')} } ?j wdt:P236 ?issn .`;
      const q = `SELECT ?logo WHERE { ${where} ?j wdt:P154 ?logo . } LIMIT 1`;
      const j = await wiki(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`);
      const v = j?.results?.bindings?.[0]?.logo?.value || '';
      file = decodeURIComponent(v.split('/Special:FilePath/')[1] || '');
    }
    let meta = { none: 1, t: Date.now() };
    if (file){
      const j = await wiki('https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|mime' +
                              `&iiurlwidth=960&format=json&origin=*&titles=${encodeURIComponent('File:' + file)}`);
      const ii = Object.values(j?.query?.pages || {})[0]?.imageinfo?.[0];
      const url = ii?.thumburl || ii?.url;
      if (url && /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(ii.mime || '')) meta = { file, url, t: Date.now() };
    }
    logoIndex[key] = meta;
    LS.set('citecard.v2.logos', logoIndex);
    return meta.none ? null : meta;
  })().catch(() => null));
  return logoJobs.get(key);
}

function loadLogo(url){
  if (!logoImages.has(url)) logoImages.set(url, (async () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    return processLogo(img);
  })().catch(() => null));
  return logoImages.get(url);
}

/* Trim the margins, drop a white backdrop and read the brand colour. */
function processLogo(img){
  const s = Math.min(1, 640 / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
  const full = document.createElement('canvas');
  full.width = w; full.height = h;
  const ctx = full.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const im = ctx.getImageData(0, 0, w, h), px = im.data;
  const paper = i => px[i + 3] > 245 && px[i] > 236 && px[i + 1] > 236 && px[i + 2] > 236;

  // 1. an opaque white backdrop (JPEGs, flattened PNGs): clear it from the edges inwards
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(p => p * 4);
  if (corners.every(paper)){
    const seen = new Uint8Array(w * h), stack = [];
    const push = p => { if (!seen[p] && paper(p * 4)){ seen[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++){ push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++){ push(y * w); push(y * w + w - 1); }
    while (stack.length){
      const p = stack.pop(), x = p % w;
      px[p * 4 + 3] = 0;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < w * (h - 1)) push(p + w);
    }
  }

  // 2. bounding box of what is left, and the dominant saturated hue
  let x0 = w, y0 = h, x1 = -1, y1 = -1, ink = 0, tinted = 0;
  const bins = Array.from({ length: 36 }, () => [0, 0, 0, 0]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = (y * w + x) * 4, a = px[i + 3];
    if (a < 14) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (a < 128) continue;
    ink++;
    const [hue, sat, lig] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
    if (sat < 0.3 || lig < 0.1 || lig > 0.82) continue;
    tinted++;
    const b = bins[Math.min(35, Math.floor(hue / 10))], wgt = sat * (1 - Math.abs(lig - 0.5));
    b[0] += wgt; b[1] += px[i] * wgt; b[2] += px[i + 1] * wgt; b[3] += px[i + 2] * wgt;
  }
  if (x1 < 0) return null;
  let color = null;
  if (tinted > ink * 0.03){
    let best = 0;
    const score = i => bins[(i + 35) % 36][0] + bins[i][0] + bins[(i + 1) % 36][0];
    for (let i = 1; i < 36; i++) if (score(i) > score(best)) best = i;
    const sum = [0, 0, 0, 0];
    for (const i of [(best + 35) % 36, best, (best + 1) % 36]) bins[i].forEach((v, n) => { sum[n] += v; });
    color = hex([sum[1] / sum[0], sum[2] / sum[0], sum[3] / sum[0]]);
  }

  // 3. crop to what is left
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  ctx.putImageData(im, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = bw; canvas.height = bh;
  canvas.getContext('2d').drawImage(full, x0, y0, bw, bh, 0, 0, bw, bh);
  return { w: bw, h: bh, color, canvas, url: canvas.toDataURL('image/png') };
}

/* ════════════════════════ type: outlines from bundled fonts ════════════════════════
   Text is drawn as vector outlines, so a card looks the same on every computer and the SVG needs no
   installed fonts. If the fonts cannot be loaded, system fonts and live <text> are used instead. */
const FONT_CDN = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts';
const FONT_URLS = {
  'sans-400': `${FONT_CDN}/inter@0.4.2/400Regular/Inter_400Regular.ttf`,
  'sans-600': `${FONT_CDN}/inter@0.4.2/600SemiBold/Inter_600SemiBold.ttf`,
  'sans-700': `${FONT_CDN}/inter@0.4.2/700Bold/Inter_700Bold.ttf`,
  'serif-600': `${FONT_CDN}/source-serif-4@0.4.2/600SemiBold/SourceSerif4_600SemiBold.ttf`,
  'serif-700': `${FONT_CDN}/source-serif-4@0.4.2/700Bold/SourceSerif4_700Bold.ttf`,
};
const SYSTEM_FONT = { sans: `"Helvetica Neue", Helvetica, Arial, sans-serif`, serif: `Georgia, "Times New Roman", serif` };
const FONTS = {};
const fontsReady = Promise.all(Object.entries(FONT_URLS).map(async ([key, url]) => {
  try {
    if (!window.opentype) return;
    const r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined });
    if (r.ok) FONTS[key] = opentype.parse(await r.arrayBuffer());
  } catch {}
}));
const outlined = () => !!(FONTS['sans-400'] && FONTS['sans-600'] && FONTS['sans-700']);
const fontOf = st => outlined() ? FONTS[`${st.family}-${st.weight}`] || FONTS[`sans-${st.weight}`] || FONTS['sans-600'] : null;
const S = (family, weight, size, tracking = 0) => ({ family, weight, size, tracking });

// A glyph missing from the chosen face (rare symbols) is borrowed from another loaded face.
function runs(s, font){
  const out = [];
  for (const ch of s){
    let f = font;
    if (ch !== ' ' && font.charToGlyphIndex(ch) === 0)
      f = Object.values(FONTS).find(a => a.charToGlyphIndex(ch) > 0) || font;
    const last = out[out.length - 1];
    if (last && last.font === f) last.text += ch; else out.push({ font: f, text: ch });
  }
  return out;
}

const mctx = document.createElement('canvas').getContext('2d');
const widths = new Map();
function tw(s, st){
  s = s.replace(/ /g, ' ');
  const font = fontOf(st), key = `${font ? 'o' : 's'}${st.family}${st.weight}|${s}`;
  let unit = widths.get(key);
  if (unit === undefined){
    if (font){
      try { unit = runs(s, font).reduce((a, r) => a + r.font.getAdvanceWidth(r.text, 1), 0); }
      catch { unit = s.length * 0.55; }
    } else {
      mctx.font = `${st.weight} 100px ${SYSTEM_FONT[st.family]}`;
      unit = mctx.measureText(s).width / 100;
    }
    if (widths.size > 20000) widths.clear();
    widths.set(key, unit);
  }
  return unit * st.size + st.tracking * st.size * s.length;
}

function drawText(out, x, y, s, st, fill){
  s = s.replace(/ /g, ' ');
  const font = fontOf(st);
  if (font){
    try {
      const o = st.tracking ? { letterSpacing: st.tracking } : undefined;
      let d = '', cx = x;
      for (const r of runs(s, font)){
        d += r.font.getPath(r.text, cx, y, st.size, o).toPathData(2);
        cx += r.font.getAdvanceWidth(r.text, st.size, o);
      }
      if (d) out.push(`<path d="${d}" fill="${fill}"/>`);
      return;
    } catch {}
  }
  out.push(`<text x="${r2(x)}" y="${r2(y)}" font-family="${esc(SYSTEM_FONT[st.family])}" font-size="${r2(st.size)}" font-weight="${st.weight}"` +
           (st.tracking ? ` letter-spacing="${r2(st.tracking * st.size)}"` : '') + ` fill="${fill}">${esc(s)}</text>`);
}

function cut(s, st, maxW){                      // always ends in an ellipsis
  let t = s;
  while (t.length > 1 && tw(t + '…', st) > maxW) t = t.slice(0, -1);
  return t.replace(/[\s ,.;:(–-]+$/, '') + '…';
}
const ellipsize = (s, st, maxW) => tw(s, st) <= maxW ? s : cut(s, st, maxW);

function wrap(s, st, maxW, maxLines){
  const space = tw(' ', st), lines = [];
  let cur = '', curW = 0;
  for (let w of s.split(/ +/).filter(Boolean)){
    let ww = tw(w, st);
    if (cur && curW + space + ww <= maxW){ cur += ' ' + w; curW += space + ww; continue; }
    if (cur){ lines.push(cur); cur = ''; curW = 0; }
    while (ww > maxW && w.length > 1){           // a single word wider than the card
      let n = w.length - 1;
      while (n > 1 && tw(w.slice(0, n), st) > maxW) n--;
      lines.push(w.slice(0, n)); w = w.slice(n); ww = tw(w, st);
    }
    cur = w; curW = ww;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines){
    lines[maxLines - 1] = cut(lines[maxLines - 1] + ' ' + lines[maxLines], st, maxW);
    lines.length = maxLines;
  }
  return lines;
}

/* ════════════════════════ the card ════════════════════════ */
function authorLines(d, o, st, maxW, maxLines){
  const names = d.authors.map(fmtName), n = names.length;
  if (!n) return [];
  let N = Math.min(o.nAuth, n);
  for (;;){
    const s = n <= N + 1 ? names.join(', ')
                         : `${names.slice(0, N).join(', ')}, … ${names[n - 1]} (${n} authors)`;
    if (N <= 1 || wrap(s, st, maxW, 99).length <= maxLines) return wrap(s, st, maxW, maxLines);
    N--;                                        // drop leading names until the line budget holds
  }
}

function citesPerYear(d){
  if (d.cites == null) return null;
  const pub = d.date ? new Date(d.date) : d.year ? new Date(Number(d.year), 6, 1) : null;
  if (!pub || isNaN(pub)) return null;
  const years = (d.fetched - pub) / 31557600000;
  return years >= 1 ? Math.round(d.cites / years) : null;
}

function buildCard(d, o, logo){
  const W = o.width, k = W / 540;
  const C = { bg: '#ffffff', fg: '#12141a', muted: '#566070', faint: '#8d949f', line: '#e7e9ee', border: '#dcdfe5', pill: '#eff1f4' };
  const brand = o.branding ? brandFor(d) : {};
  const mark = o.branding && !d.noLogo && logo ? logo : null;
  const accent = (isHex(d.color) && d.color) || (o.branding && (mark?.color || brand.color)) || (isHex(o.accent) ? o.accent : DEFAULTS.accent);
  const accentText = readable(accent, C.bg, C.fg);
  const ruleColor = contrast(accent, C.bg) < 1.35 ? accentText : accent;
  const serifTitle = o.face === 'serif' || (o.face === 'journal' && brand.title === 'serif');

  const R = 9 * k, rule = 3 * k, padX = 18 * k;
  const x0 = padX, xr = W - padX, cw = xr - x0;
  const out = [];
  const text = (x, y, s, st, fill) => drawText(out, x, y, s, st, fill);
  const mid = (cy, st) => cy + st.size * 0.36;          // baseline that centres capitals on cy

  /* masthead: journal logo or wordmark on the left, year (and status) on the right */
  let y = rule + 12 * k;
  const mh = 24 * k, cy = y + mh / 2;
  let px = xr;
  if (d.year){
    const st = S('sans', 600, 12.5 * k), s = String(d.year);
    px -= tw(s, st);
    text(px, mid(cy, st), s, st, C.fg);
    px -= 9 * k;
  }
  const pills = [];
  if (d.retracted) pills.push({ s: 'RETRACTED', bg: '#b3261e', fg: '#ffffff' });
  if (d.preprint) pills.push({ s: 'PREPRINT', bg: C.pill, fg: C.muted });
  if (o.topBadge && !d.retracted && (d.top1 || d.top10))
    pills.push({ s: `TOP ${d.top1 ? 1 : 10}%`, bg: mix(accent, C.bg, 0.9), fg: accentText });
  const pst = S('sans', 700, 8.5 * k, 0.045), ph = 16 * k, ppad = 6.5 * k;
  for (let i = pills.length - 1; i >= 0; i--){
    const p = pills[i], pw = tw(p.s, pst) - pst.tracking * pst.size + 2 * ppad;
    px -= pw;
    out.push(`<rect x="${r2(px)}" y="${r2(cy - ph / 2)}" width="${r2(pw)}" height="${r2(ph)}" rx="${r2(ph / 2)}" fill="${p.bg}"/>`);
    text(px + ppad, mid(cy, pst), p.s, pst, p.fg);
    px -= 5 * k;
  }
  const markMax = px - 8 * k - x0;
  const journal = (o.abbrev && d.journalShort) || d.journal || '';
  let image = '', logoBox = null;
  if (mark){
    // logos differ wildly in shape: give each roughly the same area, within a height and width limit
    const ratio = mark.w / mark.h, maxH = mh, maxW = Math.min(markMax, cw * 0.5);
    let lw = Math.sqrt(2200 * k * k * ratio), lh = lw / ratio;
    if (lh > maxH){ lh = maxH; lw = lh * ratio; }
    if (lh < 11 * k){ lh = 11 * k; lw = lh * ratio; }
    if (lw > maxW){ lw = maxW; lh = lw / ratio; }
    logoBox = { x: x0, y: cy - lh / 2, w: lw, h: lh, canvas: mark.canvas };
    image = `<image x="${r2(logoBox.x)}" y="${r2(logoBox.y)}" width="${r2(lw)}" height="${r2(lh)}" preserveAspectRatio="none" xlink:href="${mark.url}"/>`;
  } else if (journal){
    const m = { family: 'sans', weight: 700, tracking: 0, ...(brand.mark || {}) };
    const name = m.lower ? journal.toLowerCase() : m.upper ? journal.toUpperCase() : journal;
    const st = S(m.family, m.weight, (m.family === 'serif' ? 17 : 15.5) * k, m.tracking || (m.family === 'sans' ? -0.012 : 0));
    while (st.size > 11.5 * k && tw(name, st) > markMax) st.size -= 0.5 * k;
    text(x0, mid(cy, st), ellipsize(name, st, markMax), st, m.accent ? accentText : C.fg);
  }
  y += mh + 10 * k;

  /* title */
  const tst = serifTitle ? S('serif', 600, 17.5 * k) : S('sans', 600, 16.5 * k, -0.012);
  const lhT = tst.size * 1.26, maxT = o.uniform ? 2 : 4;
  const tl = wrap(d.title || 'Untitled', tst, cw, maxT);
  tl.forEach((s, i) => text(x0, y + tst.size * 0.8 + i * lhT, s, tst, C.fg));
  y += (o.uniform ? maxT * 17.5 * k * 1.26 : tl.length * lhT) + 3 * k;     // uniform: same block for serif and sans

  /* authors */
  const ast = S('sans', 400, 11.5 * k), lhA = ast.size * 1.42, maxA = o.uniform ? 1 : 2;
  const al = authorLines(d, o, ast, cw, maxA);
  al.forEach((s, i) => text(x0, y + ast.size * 0.88 + i * lhA, s, ast, C.muted));
  y += (o.uniform ? maxA : al.length) * lhA + 9 * k;

  /* fine print: DOI and citation count on the left, credit on the right. It is there for whoever looks for it. */
  out.push(`<rect x="${r2(x0)}" y="${r2(y)}" width="${r2(cw)}" height="${r2(Math.max(1, k))}" fill="${C.line}"/>`);
  y += 8.5 * k;
  const fst = S('sans', 400, 9.5 * k), base = y + fst.size * 0.8, gap = 5 * k;
  let cites = '';
  if (d.cites != null){
    cites = `${Number(d.cites).toLocaleString('en-US')} ${d.cites === 1 ? 'citation' : 'citations'}`;
    const py = o.perYear ? citesPerYear(d) : null;
    if (py != null) cites += `, ≈ ${py.toLocaleString('en-US')} per year`;
    const when = new Date(d.fetched).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const src = [d.citeSource, when].filter(Boolean).join(', ');
    if (src) cites += ` (${src})`;
  }
  const doi = o.showDoi && d.doi ? 'doi.org/' + d.doi : '';
  const dot = '·', dotW = tw(dot, fst) + 2 * gap;
  const lead = 'Generated with ', name = 'CiteCard', nameW = tw(name, fst), leadW = tw(lead, fst);
  const need = (doi ? tw(doi, fst) : 0) + (doi && cites ? dotW : 0) + (cites ? tw(cites, fst) : 0);
  // the credit gives way first: drop its lead-in, then let the DOI shorten
  const shortCredit = o.credit && need + 16 * k + leadW + nameW > cw;
  let right = xr;
  if (o.credit){
    right -= nameW;
    if (SITE_URL) out.push(`<a xlink:href="${esc(SITE_URL)}" target="_blank">`);
    text(right, base, name, fst, C.faint);
    out.push(`<rect x="${r2(right)}" y="${r2(base + 1.6 * k)}" width="${r2(nameW)}" height="${r2(0.55 * k)}" fill="${C.faint}"/>`);
    if (SITE_URL) out.push('</a>');
    if (!shortCredit){ right -= leadW; text(right, base, lead, fst, C.faint); }
    right -= 16 * k;
  }
  let fx = x0;
  if (doi){
    const room = right - x0 - (cites ? dotW + tw(cites, fst) : 0);
    if (room > 60 * k){
      const s = ellipsize(doi, fst, room);
      text(fx, base, s, fst, accentText);
      fx += tw(s, fst);
      if (cites){ text(fx + gap, base, dot, fst, C.faint); fx += dotW; }
    }
  }
  if (cites) text(fx, base, ellipsize(cites, fst, right - fx), fst, C.muted);
  y += fst.size + 10.5 * k;

  const H = Math.ceil(y);
  const xl = R - Math.sqrt(Math.max(0, R * R - (R - rule) ** 2));      // where the top rule meets the rounded corner
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<title>${esc([d.title, journal, d.year].filter(Boolean).join(' · '))}</title>` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${r2(R)}" fill="${C.bg}" stroke="${C.border}"/>` +
    `<path d="M${r2(xl)} ${r2(rule)}A${r2(R)} ${r2(R)} 0 0 1 ${r2(R)} 0H${r2(W - R)}A${r2(R)} ${r2(R)} 0 0 1 ${r2(W - xl)} ${r2(rule)}Z" fill="${ruleColor}"/>`;
  return { svg: head + image + out.join('') + '</svg>', base: head + out.join('') + '</svg>', logoBox, W, H, accent };
}

/* ════════════════════════ export ════════════════════════ */
// The logo is painted separately: some browsers rasterise an SVG before its embedded image has decoded.
async function toCanvas(card, scale){
  const url = URL.createObjectURL(new Blob([card.base], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = () => fail(new Error('The card could not be rendered')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.round(card.W * scale); c.height = Math.round(card.H * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const b = card.logoBox;
    if (b) ctx.drawImage(b.canvas, b.x * scale, b.y * scale, b.w * scale, b.h * scale);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes){ let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
// Writes the pixel density into the PNG so PowerPoint inserts the file at its intended physical size.
function withDpi(png, dpi){
  if (String.fromCharCode(...png.subarray(12, 16)) !== 'IHDR') return png;
  const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer), ppm = Math.round(dpi / 0.0254);
  dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const res = new Uint8Array(png.length + 21);
  res.set(png.subarray(0, 33)); res.set(chunk, 33); res.set(png.subarray(33), 54);
  return res;
}
async function canvasToPng(canvas, scale){
  const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
  return new Blob([withDpi(new Uint8Array(await blob.arrayBuffer()), 96 * scale)], { type: 'image/png' });
}
const cardPng = card => toCanvas(card, opts.scale).then(c => canvasToPng(c, opts.scale));

async function allPng(){
  const scale = opts.scale, gap = 10 * scale, cs = [];
  for (const it of items) if (it.card) cs.push(await toCanvas(it.card, scale));
  const c = document.createElement('canvas');
  c.width = Math.max(...cs.map(x => x.width));
  c.height = cs.reduce((a, x) => a + x.height, 0) + gap * (cs.length - 1);
  const ctx = c.getContext('2d');
  let y = 0;
  for (const x of cs){ ctx.drawImage(x, 0, y); y += x.height + gap; }
  return canvasToPng(c, scale);
}

function toast(msg, bad){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('bad', !!bad);
  el.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('on'), bad ? 4200 : 2400);
}
async function copyPng(promise, done){
  try {
    if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error('unsupported');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': promise })]);
    done();
  } catch {
    toast('Copying is not available in this browser. Download the PNG instead.', true);
  }
}
function download(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function fileName(d){
  const first = d.authors[0];
  const parts = [first?.family || first?.lit || 'paper', d.year, (d.journalShort || d.journal || '').split(/\s+/).slice(0, 3).join('-')];
  return parts.filter(Boolean).join('_').normalize('NFKD').replace(/[^\w-]+/g, '').toLowerCase() || 'citation';
}

/* ════════════════════════ page ════════════════════════ */
const results = $('#results');
const calm = !document.documentElement.classList.contains('motion');     // the visitor prefers reduced motion
const items = [];            // in the order shown: { raw, el, data, alts, logo, card, url, example }
let typeReady = false;       // cards are drawn once the fonts have loaded (or failed)
const EXAMPLES = ['10.1038/s41586-021-03819-2', '10.1073/pnas.1611835114', 'https://arxiv.org/abs/1706.03762'];

function save(){
  LS.set('citecard.v2.items', items.filter(i => i.data && !i.example).map(i => ({ raw: i.raw, data: i.data, alts: i.alts })));
}

function syncShelf(){
  const done = items.filter(i => i.data).length, examples = items.length > 0 && items.every(i => i.example);
  $('#shelf').hidden = items.length === 0;
  $('#again').hidden = items.length > 0;
  $('#shelfLabel').textContent = examples ? 'Examples' : done === 1 ? '1 card' : `${done} cards`;
  $('#shelfNote').hidden = !examples;
  $('#bulk').hidden = done < 2;
}

function refresh(item){
  if (!item.data || !typeReady) return;
  item.card = buildCard(item.data, opts, item.logo);
  if (item.url) URL.revokeObjectURL(item.url);
  item.url = URL.createObjectURL(new Blob([item.card.svg], { type: 'image/svg+xml;charset=utf-8' }));
  const img = item.el.querySelector('.shot img');
  img.src = item.url; img.width = item.card.W; img.height = item.card.H;
  img.alt = `Citation card: ${item.data.title}`;
}

async function attachLogo(item){
  const d = item.data;
  if (!d || item.logo || !opts.branding) return;
  const meta = await lookupLogo(d);
  const logo = meta && await loadLogo(meta.url);
  if (logo && item.data === d){ item.logo = logo; refresh(item); }
}

function remove(item){
  if (item.url) URL.revokeObjectURL(item.url);
  item.el.remove();
  items.splice(items.indexOf(item), 1);
  save(); syncShelf();
}

function plainRow(item, cls, html){
  item.el.className = 'item ' + cls;
  item.el.innerHTML = `<div class="plain">${html}</div>`;
  item.el.querySelector('code').textContent = item.raw;
}

function showError(item, e){
  if (!(e instanceof UserError)) console.error(e);
  plainRow(item, 'error', '<p class="err"></p><code></code>');
  item.el.querySelector('.err').textContent = e instanceof UserError ? e.message : 'Something went wrong while fetching this paper.';
  const b = document.createElement('button');
  b.className = 'quiet'; b.type = 'button'; b.textContent = 'Dismiss';
  b.onclick = () => remove(item);
  item.el.querySelector('.plain').append(b);
}

function stamp(item){
  const el = item.el.querySelector('.stamp');
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  $('#live').textContent = `Copied the card for ${item.data.title}.`;
}

function mount(item){
  item.el.className = 'item';
  item.el.innerHTML = `
    <figure class="figure">
      <button class="shot" type="button" data-act="copy" title="Click to copy"><img alt="" draggable="false"></button>
      <span class="stamp" aria-hidden="true">Copied</span>
    </figure>
    <div class="bar">
      <button class="solid" type="button" data-act="copy">Copy</button>
      <button type="button" data-act="png">PNG</button>
      <button type="button" data-act="svg">SVG</button>
      <button type="button" data-act="edit" aria-expanded="false">Edit</button>
      <span class="spacer"></span>
      <button class="quiet" type="button" data-act="remove">Remove</button>
    </div>
    <p class="note" hidden></p>
    <div class="alts" hidden></div>
    <form class="edit" hidden>
      <label class="w6">Title<input name="ttl"></label>
      <label class="w6">Authors, comma-separated, as they should appear<input name="auth"></label>
      <label class="w3">Journal<input name="jrn"></label>
      <label class="w1">Year<input name="yr" inputmode="numeric"></label>
      <label class="w1">Citations<input name="cit" inputmode="numeric"></label>
      <label class="w1">Source<input name="src"></label>
      <div class="w6 brandrow">
        <label class="check"><input type="checkbox" name="logo"><span>Journal logo</span></label>
        <label class="swatch">Accent <input type="color" name="col"></label>
        <button class="quiet" type="button" data-act="autocolor">Use journal colour</button>
      </div>
    </form>`;
  const d = item.data, el = item.el, form = el.querySelector('form');
  item.logo = null;

  if (d.note){ const n = el.querySelector('.note'); n.textContent = d.note; n.hidden = false; }
  if (item.alts.length){
    const box = el.querySelector('.alts');
    box.hidden = false;
    box.append('Found by title search. Did you mean a different paper?');
    item.alts.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'link';
      b.textContent = `${a.title} (${[a.journal, a.year].filter(Boolean).join(' ')})`;
      b.onclick = async () => {
        item.alts = item.alts.filter(x => x !== a).concat(item.data);
        item.data = a;
        await enrich(a);
        mount(item); save();
      };
      box.append(b);
    });
  }

  el.onclick = ev => {
    const hit = ev.target.closest('[data-act]'), act = hit?.dataset.act;
    if (act === 'remove') return remove(item);
    if (!act || !item.card) return;
    if (act === 'copy') copyPng(cardPng(item.card), () => stamp(item));
    if (act === 'png') cardPng(item.card).then(b => download(b, fileName(item.data) + '.png'));
    if (act === 'svg') download(new Blob([item.card.svg], { type: 'image/svg+xml' }), fileName(item.data) + '.svg');
    if (act === 'autocolor'){ item.data.color = ''; refresh(item); form.elements.col.value = item.card.accent; keep(item); }
    if (act === 'edit'){
      form.hidden = !form.hidden;
      hit.setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden){
        const f = form.elements, x = item.data;
        f.ttl.value = x.title; f.auth.value = x.authors.map(a => fmtName(a).replace(/ /g, ' ')).join(', ');
        f.jrn.value = (opts.abbrev && x.journalShort) || x.journal; f.yr.value = x.year;
        f.cit.value = x.cites ?? ''; f.src.value = x.citeSource;
        f.logo.checked = !x.noLogo; f.col.value = item.card.accent;
        f.ttl.focus();
      }
    }
  };
  form.onsubmit = ev => ev.preventDefault();
  form.oninput = ev => {
    const t = ev.target, v = t.value.trim(), x = item.data;
    switch (t.name){
      case 'ttl': x.title = v; break;
      case 'auth': x.authors = v.split(/\s*[,;]\s*/).filter(Boolean).map(lit => ({ lit })); break;
      case 'jrn': x.journal = v; x.journalShort = ''; break;
      case 'yr': x.year = v; break;
      case 'cit': x.cites = v === '' || isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))); break;
      case 'src': x.citeSource = v; break;
      case 'logo': x.noLogo = !t.checked; break;
      case 'col': x.color = v; break;
    }
    refresh(item); keep(item);
  };
  refresh(item);
  attachLogo(item);
  deal(item);
}

// A card arrives from above, as if dealt from the input. Before the opening has finished, CSS holds it back.
function deal(item, n = 0){
  if (calm || !item.data || !document.body.classList.contains('ready')) return;
  item.el.style.animationDelay = `${Math.min(n, 5) * 110}ms`;
  item.el.classList.remove('in'); void item.el.offsetWidth; item.el.classList.add('in');
}

// An example the visitor has worked on becomes one of their own cards.
function keep(item){
  item.example = false;
  save(); syncShelf();
}

function newItem(raw, example, before){
  const item = { raw, el: document.createElement('article'), data: null, alts: [], logo: null, card: null, url: null, example: !!example };
  const at = before ? items.indexOf(before) : -1;
  if (at < 0){ items.push(item); results.append(item.el); }
  else { items.splice(at, 0, item); results.insertBefore(item.el, before.el); }
  return item;
}

async function add(raw, example, before){
  const item = newItem(raw, example, before);
  plainRow(item, 'pending', 'Looking up <code></code>');
  syncShelf();
  try {
    const { data, alts } = await resolve(raw);
    const dup = items.find(i => i !== item && i.data && i.data.key && i.data.key === data.key);
    if (dup){
      remove(item);
      dup.el.classList.remove('flash'); void dup.el.offsetWidth; dup.el.classList.add('flash');
      dup.el.addEventListener('animationend', () => dup.el.classList.remove('flash'), { once: true });
      dup.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    item.data = data; item.alts = alts;
    mount(item);
  } catch (e) {
    if (example) return remove(item);            // an example that fails is simply not shown
    showError(item, e);
  }
  save(); syncShelf();
}

function grow(){
  const box = $('#input');
  box.style.height = 'auto';
  box.style.height = Math.min(box.scrollHeight, 220) + 'px';
}

function submit(){
  const box = $('#input');
  const lines = box.value.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 25);
  if (!lines.length){ box.focus(); return; }
  box.value = ''; grow();
  items.filter(i => i.example).forEach(remove);
  const first = items[0];                        // new cards go on top, in the order they were entered
  lines.forEach(raw => add(raw, false, first));
}

$('#go').onclick = submit;
$('#input').addEventListener('input', grow);
$('#input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing){ e.preventDefault(); submit(); }
});
$('#again').onclick = () => EXAMPLES.forEach(raw => add(raw, true));
$('#clear').onclick = () => { [...items].forEach(remove); };
$('#copyAll').onclick = () => {
  const n = items.filter(i => i.card).length;
  copyPng(allPng(), () => toast(`Copied ${n} cards as one image.`));
};
$('#dlAll').onclick = () => allPng().then(b => download(b, 'citations.png'));
$('#customize').onclick = e => {
  const drawer = $('#drawer');
  drawer.hidden = !drawer.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!drawer.hidden));
};

document.querySelectorAll('[data-opt]').forEach(el => {
  const key = el.dataset.opt;
  if (el.type === 'checkbox') el.checked = !!opts[key];
  else if (el.type === 'radio') el.checked = String(opts[key]) === el.value;
  else el.value = String(opts[key]);
  el.addEventListener(el.type === 'color' ? 'input' : 'change', () => {
    if (el.type === 'radio' && !el.checked) return;
    opts[key] = el.type === 'checkbox' ? el.checked : typeof DEFAULTS[key] === 'number' ? Number(el.value) : el.value;
    LS.set('citecard.v2.opts', opts);
    items.forEach(refresh);
    if (key === 'branding' && opts.branding) items.forEach(attachLogo);
  });
});

const saved = LS.get('citecard.v2.items', []).filter(s => s?.data);
for (const s of saved){
  const item = newItem(s.raw || '');
  item.data = { issns: [], publisher: '', ...s.data }; item.alts = s.alts || [];
  mount(item);
}
if (!saved.length) EXAMPLES.forEach(raw => add(raw, true));     // a first visit shows what the tool makes
syncShelf();
fontsReady.then(() => { typeReady = true; items.forEach(refresh); });

/* ════════════════════════ the opening ════════════════════════
   The headline types itself, then the cards are dealt. While only the examples are on the page, the headline
   keeps retyping its last word (DOI, link, title) and the input shows a matching sample, so it is plain that
   any of the three works. Once the visitor has cards of their own, it settles and keeps still. */
const KINDS = [
  { word: 'DOI.', sample: '10.1038/s41586-021-03819-2' },
  { word: 'link.', sample: 'https://arxiv.org/abs/1706.03762' },
  { word: 'title.', sample: 'Attention is all you need' },
];
const caret = document.createElement('i');
caret.className = 'caret';

async function typeInto(el, text, ms){
  el.after(caret); caret.classList.add('busy');
  for (const ch of text){ el.textContent += ch; await sleep(ms + Math.random() * ms * 0.7); }
  caret.classList.remove('busy');
}
async function eraseFrom(el, ms){
  el.after(caret); caret.classList.add('busy');
  while (el.textContent){ el.textContent = el.textContent.slice(0, -1); await sleep(ms); }
}
async function typeSample(text){
  const box = $('#input');
  for (let n = 1; n <= text.length; n++){ box.placeholder = text.slice(0, n); await sleep(12); }
}

async function opening(){
  if (calm) return;
  const lead = $('#lead'), kind = $('#kind'), second = $('#second');
  const words = [lead, kind, second].map(el => el.textContent);
  for (const el of [lead, kind, second]) el.textContent = '';
  $('h1').classList.add('typing');
  await sleep(220);
  await typeInto(lead, words[0], 30);
  await typeInto(kind, words[1], 30);
  await sleep(170);
  await typeInto(second, words[2], 30);
  await sleep(140);
  kind.after(caret);                            // back to the word that will change
}

async function retype(){
  const kind = $('#kind'), box = $('#input');
  let shown = 0;
  const show = async n => {
    shown = n;
    await eraseFrom(kind, 30);
    await typeInto(kind, KINDS[n].word, 45);
    await typeSample(KINDS[n].sample);
  };
  for (;;){
    await sleep(2800);
    if (document.hidden || document.activeElement === box || box.value) continue;      // never while someone is typing
    const browsing = items.length > 0 && items.every(it => it.example);
    if (browsing) await show((shown + 1) % KINDS.length);
    else if (shown) await show(0);
  }
}

Promise.all([opening().catch(() => {}), fontsReady]).then(() => {
  document.body.classList.add('ready');
  items.forEach(deal);
  if (!calm) retype();
});
