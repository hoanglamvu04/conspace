# Frontend QA — Information Architecture & Editorial Governance v1.0

## Automated checks

Run from the repository root:
- npm test --prefix frontend
- npm run build --prefix frontend

The frontend test suite covers:
- API URL allowlisting for feed, books, chapters, field notes, questions and search.
- A Vite localhost smoke test for all canonical and legacy public route families.
- Anonymous Q&A JSON submission and API error envelopes.
- Reader cookie restore, one-year persistence and all-lens visibility.
- Exact v1.0 niche layer mapping, empty unpublished slots and preservation of open layers when switching lenses.
- Canonical book chapter paths and chapter labels.
- Primary routes, legacy aliases, architecture-area routes, contact route, sitemap and robots rules.
- CMS ADMIN least-privilege UI and explicit Backend grant precedence.

## Manual localhost smoke checklist

1. Start Backend and Frontend using the repository's documented local development commands.
2. Open / at desktop width. Verify the three reader choices are visible in the first screen and the existing architectural drawing remains visible. No carousel should appear.
3. Select each reader choice. Verify the URL does not change and the conspace_reader cookie changes. Reload and verify the selected choice is restored.
4. Open /ngach, select an architecture area and verify its canonical URL is /mang/:slug. Open a construction niche and verify /ngach/:slug.
5. On a construction niche, verify all three role disclosures appear on one URL. The selected lens opens by default. Open another lens, switch the reader, and verify the previously opened lens remains open.
6. Open /tu-sach. Verify book labels and chapter counts come from /api/v1/books. Open a book and verify only published chapters are listed. Open a chapter and verify previous/next links only reference published chapters.
7. Open /hien-truong. Verify only published, anonymized records appear. Open a case and verify cost is hidden unless a source is present.
8. Open /hoi-dap, send an anonymous question, and verify success only after the API accepts it. Verify the phone field is absent from the request unless private reply is explicitly selected.
9. Open /tra-nhanh, search a term, and verify results come from /api/v1/search. Verify /tra-cuu and /tu-dien remain functional aliases.
10. Sign in to CMS as each role. ADMIN must see system modules and read-only articles only; EDITOR can author; TECHNICAL_REVIEWER can perform technical review; EDITOR_IN_CHIEF can perform chief review and publication actions.
11. Check mobile widths, keyboard focus, details/summary keyboard behavior, form labels, loading/empty/error states, canonical tags and sitemap/robots files.

## Release boundaries

- Do not deploy to the VPS as part of this task.
- Do not publish draft or scheduled content.
- Do not seed placeholder articles, field cases, questions, costs, views or chapter bodies.
- Frontend-only role hiding does not replace required Backend permission enforcement.
