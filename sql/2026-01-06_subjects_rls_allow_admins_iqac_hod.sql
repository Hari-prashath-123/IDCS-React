-- Enable RLS and allow admins or IQAC HOD to manage subjects
ALTER TABLE IF EXISTS public.subjects ENABLE ROW LEVEL SECURITY;

-- Create policies only when missing (older Postgres doesn't support CREATE POLICY IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'subjects' AND p.policyname = 'allow_admins_or_iqac_hod_select'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "allow_admins_or_iqac_hod_select" ON public.subjects
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND (
              pr.role = 'admin' OR (pr.role = 'hod' AND upper(coalesce(pr.department, '')) = 'IQAC')
            )
          )
        );
    $pol$;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'subjects' AND p.policyname = 'allow_admins_or_iqac_hod_insert'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "allow_admins_or_iqac_hod_insert" ON public.subjects
        FOR INSERT
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND (
              pr.role = 'admin' OR (pr.role = 'hod' AND upper(coalesce(pr.department, '')) = 'IQAC')
            )
          )
          AND (
            -- If group_name is ALL, department must be 'ALL'; otherwise department must be NULL
            (upper(coalesce(group_name, '')) = 'ALL' AND department = 'ALL')
            OR (upper(coalesce(group_name, '')) <> 'ALL' AND department IS NULL)
          )
        );
    $pol$;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'subjects' AND p.policyname = 'allow_admins_or_iqac_hod_update'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "allow_admins_or_iqac_hod_update" ON public.subjects
        FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND (
              pr.role = 'admin' OR (pr.role = 'hod' AND upper(coalesce(pr.department, '')) = 'IQAC')
            )
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND (
              pr.role = 'admin' OR (pr.role = 'hod' AND upper(coalesce(pr.department, '')) = 'IQAC')
            )
          )
          AND (
            -- For updates, enforce same rule on the new row: department must be 'ALL' when group_name is ALL; otherwise department NULL
            (upper(coalesce(group_name, '')) = 'ALL' AND department = 'ALL')
            OR (upper(coalesce(group_name, '')) <> 'ALL' AND department IS NULL)
          )
        );
    $pol$;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'subjects' AND p.policyname = 'allow_admins_or_iqac_hod_delete'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "allow_admins_or_iqac_hod_delete" ON public.subjects
        FOR DELETE
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND (
              pr.role = 'admin' OR (pr.role = 'hod' AND upper(coalesce(pr.department, '')) = 'IQAC')
            )
          )
        );
    $pol$;
  END IF;
END$$;

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_subjects_group_name ON public.subjects(group_name);
