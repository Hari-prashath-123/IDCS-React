-- Create table to record blocked departments for grouped (ALL) electives
CREATE TABLE IF NOT EXISTS elective_blocked_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  elective_id uuid NOT NULL REFERENCES electives(id) ON DELETE CASCADE,
  department text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (elective_id, department)
);
