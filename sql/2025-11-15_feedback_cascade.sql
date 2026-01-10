-- Add ON DELETE CASCADE for feedback tables so deleting a form removes its questions/responses
-- Run this migration with psql or your DB tool. It may fail if constraint names differ; adapt names accordingly.

BEGIN;

-- Drop existing FK constraints if they exist (names may vary in your DB)
ALTER TABLE IF EXISTS feedback_questions DROP CONSTRAINT IF EXISTS feedback_questions_form_id_fkey;
ALTER TABLE IF EXISTS feedback_responses DROP CONSTRAINT IF EXISTS feedback_responses_form_id_fkey;

-- Add foreign keys with ON DELETE CASCADE
ALTER TABLE IF EXISTS feedback_questions
  ADD CONSTRAINT feedback_questions_form_id_fkey FOREIGN KEY (form_id) REFERENCES feedback_forms(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS feedback_responses
  ADD CONSTRAINT feedback_responses_form_id_fkey FOREIGN KEY (form_id) REFERENCES feedback_forms(id) ON DELETE CASCADE;

COMMIT;
