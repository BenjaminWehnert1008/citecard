'use strict';

/*
 * House styles for journals and publishers. The first matching rule wins, so specific journals come
 * before whole publishers.
 *
 *   name       matched against the journal title
 *   publisher  matched against the publisher lineage reported by OpenAlex ("Cell Press | Elsevier BV")
 *   color      brand accent, used when the logo is black or missing. A coloured logo sets the accent itself.
 *   mark       how the journal name is typeset when no logo is available:
 *              { family: 'sans' | 'serif', weight: 600 | 700, lower, upper, tracking (em), accent }
 *   title      typeface of the paper title in "Journal style": 'serif' or 'sans' (default)
 *   qid        Wikidata item that holds the logo, for sources without an ISSN (preprint servers)
 *   logoFile   a Wikimedia Commons file name, to pin a logo by hand
 *
 * Colours and typefaces are approximations of each house style, picked by hand. Correct them here.
 */
const BRANDS = [
  /* preprint servers */
  { name: /^arxiv\b/i, qid: 'Q118398', color: '#b31b1b', title: 'serif' },
  { name: /^biorxiv\b/i, qid: 'Q19835482' },
  { name: /^medrxiv\b/i, qid: 'Q58465838' },
  { name: /^zenodo\b/i, qid: 'Q22661177' },

  /* Nature Portfolio */
  { name: /^(nature\b|npj\b|scientific (reports|data)$|communications (biology|chemistry|physics|materials|medicine|engineering|psychology|earth))/i,
    color: '#000000', mark: { family: 'serif', weight: 700, lower: true }, title: 'serif' },
  { publisher: /nature portfolio/i, color: '#000000', mark: { family: 'serif', weight: 700 }, title: 'serif' },

  /* Science family */
  { publisher: /american association for the advancement of science/i,
    color: '#c4161c', mark: { family: 'serif', weight: 700 } },

  /* Cell Press */
  { name: /^(cell|molecular cell|developmental cell|cancer cell|neuron|immunity|structure|current biology|joule|chem|matter|patterns|iscience|med|one earth)$|^cell (reports|metabolism|stem cell|systems|host|genomics|chemical biology)|^trends in /i,
    publisher: /cell press/i, color: '#007dbc', mark: { family: 'sans', weight: 700, accent: true } },

  /* medical weeklies */
  { name: /^(the )?lancet\b|^eclinicalmedicine$|^ebiomedicine$/i, mark: { family: 'serif', weight: 600, upper: true, tracking: 0.05 } },
  { name: /^(the )?new england journal of medicine$|^nejm\b/i, mark: { family: 'serif', weight: 600 }, title: 'serif' },
  { name: /^jama\b|^the journal of the american medical association$/i, color: '#d71635', mark: { family: 'serif', weight: 700 } },
  { name: /^(the )?bmj\b/i, publisher: /^bmj\b/i, color: '#2a6ebb', mark: { family: 'sans', weight: 700, accent: true } },

  /* societies and open-access publishers */
  { name: /^plos\b/i, mark: { family: 'sans', weight: 700 } },
  { name: /^physical review\b|^reviews of modern physics$/i, publisher: /american physical society/i,
    mark: { family: 'serif', weight: 700 }, title: 'serif' },
  { name: /^ieee\b/i, publisher: /institute of electrical and electronics engineers/i,
    color: '#00629b', mark: { family: 'sans', weight: 700 }, title: 'serif' },
  { publisher: /american chemical society/i, color: '#0039a6' },
  { publisher: /oxford university press/i, color: '#002147' },
  { publisher: /^mdpi\b|multidisciplinary digital publishing institute/i, title: 'serif' },

  /* large commercial publishers, after their better-known imprints above */
  { publisher: /elsevier/i, color: '#eb6500', title: 'serif' },
];
