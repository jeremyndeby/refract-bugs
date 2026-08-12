# Refract Bugs

Static, read-only public bug tracker for Refract. It deliberately mirrors the
structure and visual language of the public Refract Roadmap while exposing only
two views: Open and Fixed.

## Frozen data contract

`bugs.schema.json` is the stable version-2 public contract. `bugs.fixture.json`
contains twenty realistic, author-free records. During Part 1, `bugs.json` is an
exact copy of that fixture so GitHub Pages can exercise the complete UI before
the private exporter exists.

Each record contains only its public bug ID, title, body, dates, state, tags,
unique reactor count, the shared `/topbugs` score, reaction counts, comment
count, seven-day activity, author-free comments, and local image paths. There
is no author or username field. Team comments use
only `is_team: true` and render a generic `TEAM` badge.

`score` is producer-owned: the Part 2 exporter must import and call the same
shared scoring module as `/topbugs`, never a copied or reimplemented formula,
using `TOPBUGS_REACTION_WEIGHT`,
`TOPBUGS_COMMENTER_WEIGHT`, and `TOPBUGS_HALF_LIFE_DAYS`. The public site does
not recalculate it; its Popularity sort consumes the emitted value directly, so
one configuration change affects `/topbugs` and this site together.
The synthetic fixture scores are representative contract values, not live
`/topbugs` output.

`reactions` uses the Roadmap shape: `{ "emoji": "💜", "count": 12 }`, with
optional `negative: true`; custom emoji may use `{ "name", "id" }` in place of
the Unicode string. The site renders the same three-pill row and overflow count
as Roadmap. It never hotlinks a custom emoji: without a local public asset, the
safe `:name:` fallback is shown.

The shared validator rejects individual entries containing email or token
patterns, unknown fields, inconsistent status dates, or non-local image URLs.
Valid entries continue publishing unless more than 5% or more than 20 entries
are rejected; either threshold blocks the publication. Producers must serialize
the value returned by `sanitizeBugDataset()`, never the unfiltered input, so a
rejected line cannot remain accessible in the served JSON.

## Local verification

Run `npm test` and `npm run validate`, then serve this directory over HTTP. The
site has no build step and is deployed directly from the `main` branch with
GitHub Pages. The intended custom domain is `bugs.getrefract.app`; its `CNAME`
file must be added only after that DNS name exists, so the working Pages URL
does not redirect to an unresolved host.

The Part 2 exporter will replace only `bugs.json` and the local files below
`assets/bugs/`; changing the contract requires coordinated updates on both
sides.
