-- Niche section editorial workflow: additive, dedicated CONSPACE schema only.
-- The v1.0 public API must never expose a section merely because status says PUBLISHED.
-- Approval, publication time, source and author identity are stored independently.

ALTER TABLE conspace.niche_sections
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS technical_reviewed_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS technical_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS chief_reviewed_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chief_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS sensitivity_assessed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitivity_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_chief_review boolean NOT NULL DEFAULT false;

ALTER TABLE conspace.architectural_sections
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS technical_reviewed_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS technical_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS chief_reviewed_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS chief_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS sensitivity_assessed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitivity_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_chief_review boolean NOT NULL DEFAULT false;

UPDATE conspace.niche_sections SET created_by_user_id=updated_by_user_id
WHERE created_by_user_id IS NULL AND updated_by_user_id IS NOT NULL;
UPDATE conspace.architectural_sections SET created_by_user_id=updated_by_user_id
WHERE created_by_user_id IS NULL AND updated_by_user_id IS NOT NULL;

UPDATE conspace.niche_sections
SET status='DRAFT',updated_at=now()
WHERE status IN ('APPROVED','PUBLISHED') AND
  (approved_by_user_id IS NULL OR approved_at IS NULL OR
   (status='PUBLISHED' AND (published_at IS NULL OR published_by_user_id IS NULL OR source_ref IS NULL OR btrim(source_ref)='')));
UPDATE conspace.architectural_sections
SET status='DRAFT',updated_at=now()
WHERE status IN ('APPROVED','PUBLISHED') AND
  (approved_by_user_id IS NULL OR approved_at IS NULL OR
   (status='PUBLISHED' AND (published_at IS NULL OR published_by_user_id IS NULL OR source_ref IS NULL OR btrim(source_ref)='')));

ALTER TABLE conspace.niche_sections DROP CONSTRAINT IF EXISTS niche_sections_status_check;
ALTER TABLE conspace.niche_sections ADD CONSTRAINT niche_sections_status_check
  CHECK(status IN ('DRAFT','SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW','APPROVED','PUBLISHED','NEEDS_CHANGES','REJECTED','IN_REVIEW'));
ALTER TABLE conspace.architectural_sections DROP CONSTRAINT IF EXISTS architectural_sections_status_check;
ALTER TABLE conspace.architectural_sections ADD CONSTRAINT architectural_sections_status_check
  CHECK(status IN ('DRAFT','SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW','APPROVED','PUBLISHED','NEEDS_CHANGES','REJECTED','IN_REVIEW'));

ALTER TABLE conspace.niche_sections DROP CONSTRAINT IF EXISTS niche_sections_publish_requires_approval;
ALTER TABLE conspace.niche_sections ADD CONSTRAINT niche_sections_publish_requires_approval
  CHECK(status <> 'PUBLISHED' OR
    (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND published_by_user_id IS NOT NULL AND published_at IS NOT NULL AND source_ref IS NOT NULL AND btrim(source_ref)<>'')) NOT VALID;
ALTER TABLE conspace.architectural_sections DROP CONSTRAINT IF EXISTS architectural_sections_publish_requires_approval;
ALTER TABLE conspace.architectural_sections ADD CONSTRAINT architectural_sections_publish_requires_approval
  CHECK(status <> 'PUBLISHED' OR
    (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND published_by_user_id IS NOT NULL AND published_at IS NOT NULL AND source_ref IS NOT NULL AND btrim(source_ref)<>'')) NOT VALID;

CREATE INDEX IF NOT EXISTS niche_sections_review_queue_idx
  ON conspace.niche_sections(status,submitted_at) WHERE status IN ('SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW');
CREATE INDEX IF NOT EXISTS architectural_sections_review_queue_idx
  ON conspace.architectural_sections(status,submitted_at) WHERE status IN ('SUBMITTED','TECHNICAL_REVIEW','EDITOR_IN_CHIEF_REVIEW');
CREATE INDEX IF NOT EXISTS niche_sections_public_verified_idx
  ON conspace.niche_sections(niche_id,section_no,audience_role,published_at)
  WHERE status='PUBLISHED' AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS architectural_sections_public_verified_idx
  ON conspace.architectural_sections(niche_id,section_no,published_at)
  WHERE status='PUBLISHED' AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL;
