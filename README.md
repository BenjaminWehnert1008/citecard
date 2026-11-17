# CiteCard

Paste a DOI or a paper link and get a citation card for your slides. Every card has the same structure –
journal, year, title, authors, and the DOI and citation count as fine print – so citations from different
journals look alike and can be compared at a glance.

## Run it

Open `index.html` in a browser. There is nothing to install or build.

For development, or if copying to the clipboard is unavailable when the file is opened directly, serve the
folder and open <http://localhost:8765>:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

The project is a plain static site (`index.html` plus `assets/`), so it can be published on GitHub Pages
as it is. After publishing, set `SITE_URL` at the top of `assets/app.js`: in SVG exports the "CiteCard"
credit then links to the site.

## Input

One paper per line:

- a DOI (`10.1038/…`, `doi:…`, `https://doi.org/…`) or any publisher link that contains one
  (Science, PNAS, Springer, Wiley, ACS, PLOS, bioRxiv, medRxiv, …)
- arXiv (`https://arxiv.org/abs/1706.03762`, `arXiv:1706.03762`)
- PubMed links, `PMID: 32015508`, PMC IDs
- Nature and eLife links
- Elsevier, Cell and Lancet links (resolved through the PII in the link)
- a title as free text (best match, with alternatives to pick from)

Links without a recognisable identifier (Oxford Academic, MDPI, …) produce a message asking for the DOI
or the title.

A first visit shows one example card, the AlphaFold paper. It disappears as soon as you create your own.

## Output

- **Copy**, or a click on the card, puts it on the clipboard as a PNG.
- **PNG** saves it at 4×, 6× or 8× resolution (8× by default: a medium card is 4,320 px wide). The pixel density is written into the file so PowerPoint inserts
  it at the intended size.
- **SVG** saves it as a vector graphic. Text is stored as outlines, so it needs no installed fonts.
- **Copy all / Download all** stacks every card into one image.

**Edit** on a card corrects the title, authors, journal, year, citation count and its source, switches the
logo off, or overrides the accent colour.

**Customize** holds the few settings: card width, how many authors, title typeface, PNG resolution, and switches
for journal branding, uniform height, abbreviated journal names, the DOI, citations per year and the
"Generated with CiteCard" credit.

## Shared first and last authors

Papers often have several first authors who contributed equally, or several senior authors who jointly
supervised the work. CiteCard looks this up and keeps all of them on the card, marked `*` (shared first)
and `†` (shared last), with a note such as *(34 authors; \*18 shared first)*. When the list is too long for
the card, plain middle authors are dropped first; a very large group is shortened and its size given in
the note.

Neither OpenAlex nor Crossref records equal contribution. The information comes from the author notes of
the article in [PubMed Central](https://pmc.ncbi.nlm.nih.gov) (open-access papers and author manuscripts) or
from the EqualContrib flag in [PubMed](https://pubmed.ncbi.nlm.nih.gov). Papers in neither (most preprints,
many paywalled papers) get no marks; add them under **Edit** by putting `*` or `†` after a name.

## Journal branding

With *Journal logo and colours* on, a card shows:

- the journal's **logo**, looked up on Wikidata by ISSN (property P154) and loaded from Wikimedia Commons.
  Nothing is bundled with the tool. Journals without a logo there get their name set as a wordmark.
- an **accent colour**: taken from the logo if it has one, otherwise from the house style in
  `assets/brands.js`, otherwise the fallback accent.
- a **title typeface**: serif or sans, following the house style (*Title typeface* overrides it).

`assets/brands.js` is a short, hand-written list of house styles for well-known journals and publishers.
Its colours and typefaces are approximations; add or correct entries there.

Journal logos are trademarks of their publishers and are shown only to identify the journal.

## Data sources

- [OpenAlex](https://openalex.org): metadata, citation count, retraction status.
- [Crossref](https://www.crossref.org): author names split into given and family name, journal abbreviation,
  and a fallback when OpenAlex does not know a paper.
- [Wikidata](https://www.wikidata.org) and [Wikimedia Commons](https://commons.wikimedia.org): journal logos.
- [PubMed Central](https://pmc.ncbi.nlm.nih.gov) and [PubMed](https://pubmed.ncbi.nlm.nih.gov): shared first and last
  authors; [Europe PMC](https://europepmc.org) to find a paper's PMC id.

Citation counts differ between databases, which is why each card names its source and the month it was
retrieved. When a preprint has since been published, the card shows the published version and says so
underneath.

## Type

Cards are set in [Inter](https://rsms.me/inter/) and [Source Serif 4](https://github.com/adobe-fonts/source-serif);
the page itself uses [IBM Plex](https://www.ibm.com/plex/) Sans and Mono. All are under the SIL Open Font
License. The font files and [opentype.js](https://opentype.js.org) are loaded from the jsDelivr CDN. If the
card fonts cannot be loaded, the cards fall back to system fonts.

Cards and settings are kept in the browser (localStorage). There is no backend. The site is light only.

## License

The code is released under the [MIT License](LICENSE). That does not cover what the tool loads at runtime:
journal logos remain trademarks of their publishers, and the fonts are under the SIL Open Font License.
