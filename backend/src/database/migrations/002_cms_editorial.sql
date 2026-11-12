-- CONSPACE CMS + editorial workflow. Applied only after 001_content.sql.
-- This migration extends the isolated conspace schema; it never enables PostGIS
-- or touches the hola_maps / x_hub databases.

CREATE TABLE IF NOT EXISTS conspace.cms_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  role text NOT NULL CHECK (role IN ('ADMIN','EDITOR','TECHNICAL_REVIEWER','EDITOR_IN_CHIEF')),
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_user_email_lowercase CHECK (email = lower(email))
);

CREATE TABLE IF NOT EXISTS conspace.cms_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES conspace.cms_users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  ip_hash char(64),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS cms_sessions_user_expiry_idx
  ON conspace.cms_sessions (user_id, expires_at);
CREATE INDEX IF NOT EXISTS cms_sessions_expiry_idx
  ON conspace.cms_sessions (expires_at);

CREATE TABLE IF NOT EXISTS conspace.auth_login_rate_limits (
  ip_hash char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  blocked_until timestamptz
);

ALTER TABLE conspace.authors
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS authors_user_id_unique_idx
  ON conspace.authors (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE conspace.articles
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requires_chief_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitivity_assessed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitivity_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

ALTER TABLE conspace.articles DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE conspace.articles
  ADD CONSTRAINT articles_status_check CHECK (
    status IN (
      'DRAFT','IN_REVIEW','SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW',
      'APPROVED','SCHEDULED','PUBLISHED','NEEDS_CHANGES','REJECTED',
      'WITHDRAWN','ARCHIVED'
    )
  );
ALTER TABLE conspace.articles
  ADD CONSTRAINT articles_schedule_requires_approval CHECK (
    status NOT IN ('SCHEDULED','PUBLISHED')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS conspace.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conspace.article_tags (
  article_id uuid NOT NULL REFERENCES conspace.articles(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES conspace.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX IF NOT EXISTS article_tags_tag_article_idx
  ON conspace.article_tags (tag_id, article_id);

CREATE TABLE IF NOT EXISTS conspace.article_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES conspace.articles(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  snapshot jsonb NOT NULL,
  change_reason text,
  created_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, version_no)
);
CREATE INDEX IF NOT EXISTS article_revisions_history_idx
  ON conspace.article_revisions (article_id, version_no DESC);

CREATE TABLE IF NOT EXISTS conspace.audit_logs (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_history_idx
  ON conspace.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_history_idx
  ON conspace.audit_logs (actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conspace.workflow_events (
  id bigserial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  action text NOT NULL,
  reason text,
  actor_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workflow_events_entity_history_idx
  ON conspace.workflow_events (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conspace.editorial_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('ARTICLE','TERM','QUESTION_ANSWER')),
  entity_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('TECHNICAL','EDITOR_IN_CHIEF')),
  decision text NOT NULL CHECK (decision IN ('APPROVED','REQUEST_CHANGES','REJECTED')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  reviewer_user_id uuid NOT NULL REFERENCES conspace.cms_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editorial_reviews_entity_history_idx
  ON conspace.editorial_reviews (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conspace.niche_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0),
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE conspace.niches
  ADD COLUMN IF NOT EXISTS niche_group_id uuid REFERENCES conspace.niche_groups(id) ON DELETE RESTRICT;
ALTER TABLE conspace.niches
  ADD CONSTRAINT construction_niche_requires_group CHECK (
    group_type <> 'construction' OR NOT is_active OR niche_group_id IS NOT NULL
  );
CREATE INDEX IF NOT EXISTS niches_group_order_idx
  ON conspace.niches (niche_group_id, sort_order, name);

CREATE OR REPLACE FUNCTION conspace.enforce_niche_group_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(19027, 2);
  SELECT count(*) INTO current_count FROM conspace.niche_groups
    WHERE id IS DISTINCT FROM NEW.id;
  IF current_count >= 5 THEN
    RAISE EXCEPTION 'CONSPACE supports at most five construction groups'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS niche_group_capacity_trigger ON conspace.niche_groups;
CREATE TRIGGER niche_group_capacity_trigger
  BEFORE INSERT ON conspace.niche_groups
  FOR EACH ROW EXECUTE FUNCTION conspace.enforce_niche_group_capacity();

CREATE OR REPLACE FUNCTION conspace.enforce_niche_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(19027, 3);
  SELECT count(*) INTO current_count FROM conspace.niches
    WHERE group_type = NEW.group_type AND id IS DISTINCT FROM NEW.id;
  IF NEW.group_type = 'design' AND current_count >= 8 THEN
    RAISE EXCEPTION 'CONSPACE supports exactly eight documented design categories'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.group_type = 'construction' AND current_count >= 30 THEN
    RAISE EXCEPTION 'CONSPACE supports at most thirty construction niches'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS niche_capacity_trigger ON conspace.niches;
CREATE TRIGGER niche_capacity_trigger
  BEFORE INSERT OR UPDATE OF group_type ON conspace.niches
  FOR EACH ROW EXECUTE FUNCTION conspace.enforce_niche_capacity();

CREATE TABLE IF NOT EXISTS conspace.niche_template_blocks (
  section_no smallint PRIMARY KEY CHECK (section_no BETWEEN 1 AND 12),
  block_key text NOT NULL UNIQUE,
  title text NOT NULL,
  source_description text NOT NULL
);
CREATE TABLE IF NOT EXISTS conspace.niche_template_layers (
  audience_role text NOT NULL CHECK (audience_role IN ('homeowner','architect','contractor')),
  section_no smallint NOT NULL REFERENCES conspace.niche_template_blocks(section_no) ON DELETE CASCADE,
  PRIMARY KEY (audience_role, section_no)
);
CREATE TABLE IF NOT EXISTS conspace.niche_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_id uuid NOT NULL REFERENCES conspace.niches(id) ON DELETE CASCADE,
  section_no smallint NOT NULL REFERENCES conspace.niche_template_blocks(section_no) ON DELETE RESTRICT,
  audience_role text CHECK (audience_role IN ('homeowner','architect','contractor')),
  content text NOT NULL DEFAULT '',
  source_ref text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED')),
  updated_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (niche_id, section_no, audience_role)
);
CREATE UNIQUE INDEX IF NOT EXISTS niche_sections_nulls_not_distinct_idx
  ON conspace.niche_sections (niche_id, section_no, audience_role) NULLS NOT DISTINCT;

INSERT INTO conspace.niche_template_blocks (section_no, block_key, title, source_description) VALUES
  (1,'scope','Ngách này làm gì / không làm — ai làm','Cẩm nang 5.xx'),
  (2,'sequence','Vị trí trong trình tự công trường · vào việc khi nào','Cẩm nang 5.xx'),
  (3,'market_demand','Nhu cầu thị trường — ai cần, khi nào, quy mô điển hình','Viết mới'),
  (4,'pricing','Cấu trúc giá · n câu phải hỏi','Cẩm nang 5.xx'),
  (5,'low_price','Rẻ hơn mặt bằng 20% thì cắt ở đâu','Viết mới'),
  (6,'industry_dark_side','Mặt trái ngành — thủ thuật và cơ chế vì sao nó tồn tại','Viết mới'),
  (7,'homeowner_pain','Nỗi đau chủ nhà','Cẩm nang 5.xx'),
  (8,'contractor_pain','Nỗi đau nhà thầu ngách này','Cẩm nang 5.xx'),
  (9,'conflicts','Điểm giao và xung đột · ai thường thua','Cẩm nang 5.xx'),
  (10,'mitigation','Giải pháp — chặn được ở mốc nào, bằng cách gì','Viết mới'),
  (11,'checklist','Dấu hiệu người biết việc / nên tránh · checklist nghiệm thu · bảo hành','Cẩm nang 5.xx'),
  (12,'field_notes','Ghi chép công trường','Cần chủ bút kể')
ON CONFLICT (section_no) DO NOTHING;

INSERT INTO conspace.niche_template_layers (audience_role, section_no) VALUES
  ('homeowner',1),('homeowner',3),('homeowner',4),('homeowner',5),('homeowner',7),('homeowner',11),
  ('contractor',1),('contractor',6),('contractor',8),('contractor',9),('contractor',10),
  ('architect',2),('architect',9),('architect',10)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS conspace.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  audience_role text NOT NULL CHECK (audience_role IN ('homeowner','architect','contractor')),
  content_label text NOT NULL CHECK (content_label IN ('REFERENCE','NON_FICTION','FICTIONALIZED')),
  content_label_vi text NOT NULL,
  expected_chapter_count smallint NOT NULL CHECK (expected_chapter_count > 0),
  source_ref text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO conspace.books (slug,title,audience_role,content_label,content_label_vi,expected_chapter_count,source_ref) VALUES
  ('cam-nang-kien-truc-hoa-lac','Cẩm nang Kiến trúc Hòa Lạc','homeowner','REFERENCE','Tài liệu tra cứu',9,'CONSPACE Brief 03/09/2026, page 6; CONSPACE Web specification 03/09/2026, page 2'),
  ('phan-nha-thau-xay-dung','Phận nhà thầu xây dựng','contractor','NON_FICTION','Phi hư cấu',24,'CONSPACE Brief 03/09/2026, page 6; CONSPACE Web specification 03/09/2026, page 2'),
  ('quan-quanh-kts','Quẩn quanh KTS','architect','FICTIONALIZED','Tự sự, có hư cấu',25,'CONSPACE Brief 03/09/2026, page 6; CONSPACE Web specification 03/09/2026, page 2')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS conspace.book_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES conspace.books(id) ON DELETE RESTRICT,
  chapter_no smallint NOT NULL CHECK (chapter_no > 0),
  display_label text NOT NULL,
  title text,
  article_id uuid UNIQUE REFERENCES conspace.articles(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, chapter_no)
);
INSERT INTO conspace.book_chapters (book_id,chapter_no,display_label)
SELECT b.id, seq.n,
  CASE WHEN b.slug = 'cam-nang-kien-truc-hoa-lac'
    THEN 'Phần ' || seq.n::text ELSE 'Chương ' || seq.n::text END
FROM conspace.books b
CROSS JOIN LATERAL generate_series(1,b.expected_chapter_count) AS seq(n)
ON CONFLICT (book_id,chapter_no) DO NOTHING;

CREATE TABLE IF NOT EXISTS conspace.field_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL UNIQUE REFERENCES conspace.articles(id) ON DELETE CASCADE,
  phenomenon text NOT NULL CHECK (length(btrim(phenomenon)) > 0),
  root_cause text NOT NULL CHECK (length(btrim(root_cause)) > 0),
  intervention_point text NOT NULL CHECK (length(btrim(intervention_point)) > 0),
  repair_cost_amount numeric(18,2),
  repair_cost_currency char(3) NOT NULL DEFAULT 'VND',
  repair_cost_source text,
  unit_anonymized boolean NOT NULL DEFAULT false,
  address_anonymized boolean NOT NULL DEFAULT false,
  photo_rights_confirmed boolean NOT NULL DEFAULT false,
  anonymization_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_note_cost_requires_source CHECK (
    repair_cost_amount IS NULL OR (repair_cost_amount >= 0 AND repair_cost_source IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS conspace.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  sha256 char(64) NOT NULL,
  category text NOT NULL CHECK (category IN ('IMAGE','DOCUMENT')),
  alt_text text,
  uploaded_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  rights_confirmed boolean NOT NULL DEFAULT false,
  rights_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS media_assets_active_idx
  ON conspace.media_assets (created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS conspace.article_media (
  article_id uuid NOT NULL REFERENCES conspace.articles(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES conspace.media_assets(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'INLINE' CHECK (role IN ('COVER','INLINE','SOURCE_DOCUMENT')),
  position integer NOT NULL DEFAULT 0,
  caption text,
  PRIMARY KEY (article_id, media_id)
);
CREATE TABLE IF NOT EXISTS conspace.field_note_media (
  field_note_id uuid NOT NULL REFERENCES conspace.field_notes(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES conspace.media_assets(id) ON DELETE RESTRICT,
  position integer NOT NULL DEFAULT 0,
  caption text,
  PRIMARY KEY (field_note_id, media_id)
);

CREATE TABLE IF NOT EXISTS conspace.reader_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  guessed_niche_id uuid REFERENCES conspace.niches(id) ON DELETE SET NULL,
  request_private_reply boolean NOT NULL DEFAULT false,
  contact_ciphertext bytea,
  contact_iv bytea,
  contact_auth_tag bytea,
  status text NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED','IN_REVIEW','ANSWERED','PUBLISHED','REJECTED','ARCHIVED')),
  moderation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_contact_requires_request CHECK (
    request_private_reply OR
    (contact_ciphertext IS NULL AND contact_iv IS NULL AND contact_auth_tag IS NULL)
  ),
  CONSTRAINT private_contact_is_complete CHECK (
    (contact_ciphertext IS NULL AND contact_iv IS NULL AND contact_auth_tag IS NULL)
    OR (contact_ciphertext IS NOT NULL AND contact_iv IS NOT NULL AND contact_auth_tag IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS reader_questions_queue_idx
  ON conspace.reader_questions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS conspace.reader_question_media (
  question_id uuid NOT NULL REFERENCES conspace.reader_questions(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES conspace.media_assets(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  PRIMARY KEY (question_id, media_id),
  UNIQUE (question_id, position)
);

CREATE TABLE IF NOT EXISTS conspace.question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL UNIQUE REFERENCES conspace.reader_questions(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  related_article_id uuid REFERENCES conspace.articles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW','APPROVED','PUBLISHED','NEEDS_CHANGES','REJECTED')),
  requires_chief_review boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES conspace.cms_users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT published_answer_requires_approval CHECK (
    status <> 'PUBLISHED' OR (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND published_at IS NOT NULL)
  )
);

ALTER TABLE conspace.terms DROP CONSTRAINT IF EXISTS terms_status_check;
ALTER TABLE conspace.terms
  ADD CONSTRAINT terms_status_check CHECK (
    status IN ('DRAFT','IN_REVIEW','SUBMITTED','TECHNICAL_REVIEW','APPROVED','PUBLISHED','NEEDS_CHANGES','REJECTED','ARCHIVED')
  );
ALTER TABLE conspace.question_answers
  ADD COLUMN IF NOT EXISTS sensitivity_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sensitivity_assessed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL;

ALTER TABLE conspace.terms
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
CREATE INDEX IF NOT EXISTS terms_editorial_queue_idx
  ON conspace.terms (status, updated_at DESC);

