-- Allow niche section decisions to be recorded in the common editorial review ledger.
ALTER TABLE conspace.editorial_reviews
  DROP CONSTRAINT IF EXISTS editorial_reviews_entity_type_check;
ALTER TABLE conspace.editorial_reviews
  ADD CONSTRAINT editorial_reviews_entity_type_check
  CHECK(entity_type IN ('ARTICLE','TERM','QUESTION_ANSWER','NICHE_SECTION','ARCHITECTURAL_SECTION'));
