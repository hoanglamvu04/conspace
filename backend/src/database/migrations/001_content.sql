-- Sprint 1 taxonomy and editorial model, confined to the dedicated CONSPACE DB.
-- The migration runner creates the conspace schema and tracks checksums.
CREATE TABLE conspace.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  bio text,
  verified boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conspace.niches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  group_type text NOT NULL CHECK (group_type IN ('design', 'construction')),
  code text UNIQUE,
  construction_group text,
  summary text NOT NULL DEFAULT '',
  source_ref text,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT niche_source_before_activation CHECK (NOT is_active OR source_ref IS NOT NULL),
  CONSTRAINT niche_design_not_construction CHECK (group_type <> 'design' OR construction_group IS NULL)
);

CREATE TABLE conspace.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  excerpt text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  cover_image_url text,
  author_id uuid NOT NULL REFERENCES conspace.authors(id) ON DELETE RESTRICT,
  audience_role text CHECK (audience_role IN ('homeowner', 'architect', 'contractor')),
  content_type text NOT NULL DEFAULT 'EDITORIAL'
    CHECK (content_type IN ('REFERENCE', 'NON_FICTION', 'FICTIONALIZED', 'FIELD_CASE', 'Q_AND_A', 'REGULATION', 'EDITORIAL')),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED')),
  approved_by uuid REFERENCES conspace.authors(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT published_article_requires_approval CHECK (
    status <> 'PUBLISHED'
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE TABLE conspace.article_niches (
  article_id uuid NOT NULL REFERENCES conspace.articles(id) ON DELETE CASCADE,
  niche_id uuid NOT NULL REFERENCES conspace.niches(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, niche_id)
);

CREATE TABLE conspace.article_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES conspace.articles(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  url text,
  citation text,
  UNIQUE (article_id, position)
);

CREATE TABLE conspace.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL CHECK (length(btrim(term)) > 0),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  definition text NOT NULL CHECK (length(btrim(definition)) > 0),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  reviewed_by uuid REFERENCES conspace.authors(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT published_term_requires_review CHECK (
    status <> 'PUBLISHED'
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND source_ref IS NOT NULL)
  )
);

CREATE TABLE conspace.term_niches (
  term_id uuid NOT NULL REFERENCES conspace.terms(id) ON DELETE CASCADE,
  niche_id uuid NOT NULL REFERENCES conspace.niches(id) ON DELETE CASCADE,
  PRIMARY KEY (term_id, niche_id)
);

-- Indexed access paths for published-only reads, cross-links and term lookup.
CREATE INDEX articles_public_page_idx
  ON conspace.articles (published_at DESC, id DESC)
  WHERE status = 'PUBLISHED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL;
CREATE INDEX articles_role_page_idx
  ON conspace.articles (audience_role, published_at DESC, id DESC)
  WHERE status = 'PUBLISHED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL;
CREATE INDEX article_niches_niche_article_idx ON conspace.article_niches (niche_id, article_id);
CREATE INDEX article_sources_order_idx ON conspace.article_sources (article_id, position);
CREATE INDEX niches_public_group_idx ON conspace.niches (group_type, sort_order, name) WHERE is_active;
CREATE INDEX terms_public_term_idx ON conspace.terms (lower(term) text_pattern_ops)
  WHERE status = 'PUBLISHED' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL;
CREATE INDEX terms_search_idx ON conspace.terms USING gin
  (to_tsvector('simple'::regconfig, term || ' ' || definition))
  WHERE status = 'PUBLISHED' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL;
CREATE INDEX term_niches_niche_term_idx ON conspace.term_niches (niche_id, term_id);
