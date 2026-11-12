-- Incremental, no data deletion. PostgreSQL 16, dedicated conspace schema.
-- Search indexes are partial: draft/private content is not indexed for public queries.
CREATE INDEX IF NOT EXISTS cms_articles_public_search_idx
ON conspace.articles USING gin (
  to_tsvector('simple'::regconfig, title || ' ' || excerpt || ' ' || body)
) WHERE status='PUBLISHED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS cms_niches_public_search_idx
ON conspace.niches USING gin (
  to_tsvector('simple'::regconfig, name || ' ' || summary)
) WHERE is_active=true;

CREATE INDEX IF NOT EXISTS cms_field_notes_public_search_idx
ON conspace.field_notes USING gin (
  to_tsvector('simple'::regconfig, phenomenon || ' ' || root_cause)
) WHERE unit_anonymized=true AND address_anonymized=true AND photo_rights_confirmed=true;

CREATE INDEX IF NOT EXISTS cms_articles_due_schedule_idx
ON conspace.articles (scheduled_at, id)
WHERE status='SCHEDULED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS cms_book_chapters_article_idx
ON conspace.book_chapters(article_id) WHERE article_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cms_field_notes_article_idx
ON conspace.field_notes(article_id);

CREATE INDEX IF NOT EXISTS cms_question_answers_published_idx
ON conspace.question_answers(published_at DESC,question_id)
WHERE status='PUBLISHED' AND approved_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cms_niche_sections_public_idx
ON conspace.niche_sections(niche_id,section_no,audience_role)
WHERE status='PUBLISHED';

-- Prevent two simultaneously active identical scheduled releases from trampling
-- each other by allowing the worker to claim rows with SKIP LOCKED.
