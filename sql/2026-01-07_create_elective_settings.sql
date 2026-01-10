-- Migration: create elective_settings table used to store floating start/stop times per year
CREATE TABLE IF NOT EXISTS public.elective_settings (
  setting_key text NOT NULL,
  setting_value text,
  year integer,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (setting_key, year)
);

CREATE INDEX IF NOT EXISTS idx_elective_settings_year ON public.elective_settings(year);
