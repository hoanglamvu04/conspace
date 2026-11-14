-- Phase-1 private Connection intake from IA v1.0.
-- Public needs are never listed. Contact data is encrypted before persistence.
CREATE TABLE conspace.connection_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_type text NOT NULL CHECK (intake_type IN ('PROJECT','ARCHITECT','CONTRACTOR','JOIN')),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 20 AND 5000),
  region text CHECK (region IS NULL OR length(btrim(region)) BETWEEN 2 AND 160),
  niche_id uuid REFERENCES conspace.niches(id) ON DELETE SET NULL,
  contact_ciphertext bytea NOT NULL,
  contact_iv bytea NOT NULL,
  contact_auth_tag bytea NOT NULL,
  status text NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED','IN_REVIEW','CLOSED','REJECTED')),
  moderation_note text CHECK (moderation_note IS NULL OR length(moderation_note) <= 2000),
  updated_by_user_id uuid REFERENCES conspace.cms_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX connection_intakes_status_created_idx
  ON conspace.connection_intakes (status, created_at DESC);
CREATE INDEX connection_intakes_type_created_idx
  ON conspace.connection_intakes (intake_type, created_at DESC);
CREATE INDEX connection_intakes_niche_idx
  ON conspace.connection_intakes (niche_id)
  WHERE niche_id IS NOT NULL;
