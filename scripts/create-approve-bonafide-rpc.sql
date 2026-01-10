-- Create an RPC function to atomically insert a bonafide approval and update the application
-- Requires running as a DB admin (e.g., Supabase SQL editor) so the function owner can be a privileged role

CREATE OR REPLACE FUNCTION public.approve_bonafide_application(
  p_application_id uuid,
  p_approver_id uuid,
  p_approver_role text,
  p_action text,
  p_remarks text
)
RETURNS TABLE(
  approval_id uuid,
  approver_id uuid,
  approver_role text,
  action text,
  remarks text,
  approval_created_at timestamptz,
  app_status text,
  current_approver_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app RECORD;
  v_student_id uuid;
  v_inserted_id uuid;
  v_has_advisor boolean;
  v_existing_action text;
  v_final_action text;
BEGIN
  -- Lock the application row to avoid races
  -- Disable row level security for the duration of this function so the
  -- function (running with the function owner's privileges) can update
  -- the application row atomically even if RLS would prevent a direct
  -- client-side update. This requires the function owner to be a privileged
  -- role (created by an admin in Supabase SQL editor).
  PERFORM set_config('row_security', 'off', true);

  SELECT * INTO v_app FROM bonafide_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  -- Check for existing approval by this role. If it exists, reuse it instead of erroring.
  -- This makes the RPC idempotent: if a PS was already recorded directly, calling the RPC
  -- will still advance the application row.
  SELECT ba.id, ba.action INTO v_inserted_id, v_existing_action FROM bonafide_approvals ba
  WHERE ba.application_id = p_application_id AND ba.approver_role = p_approver_role
  LIMIT 1;

  IF v_inserted_id IS NULL THEN
    -- Insert approval
    INSERT INTO bonafide_approvals (application_id, approver_id, approver_role, action, remarks)
    VALUES (p_application_id, p_approver_id, p_approver_role, p_action, p_remarks)
    RETURNING id INTO v_inserted_id;
    v_existing_action := NULL;
  END IF;

  -- Determine next application state
  -- Determine which action to use: prefer existing approval action if present, otherwise the provided p_action
  v_final_action := COALESCE(v_existing_action, p_action);

  IF v_final_action = 'rejected' THEN
    UPDATE bonafide_applications
    SET status = 'rejected', current_approver_level = 'completed', updated_at = now()
    WHERE id = p_application_id;
  ELSE
    -- For bonafide: mentor -> advisor -> hod -> ps
    IF p_approver_role = 'mentor' THEN
      SELECT advisor_id IS NOT NULL INTO v_has_advisor FROM students WHERE id = v_app.student_id;
      IF v_has_advisor THEN
        UPDATE bonafide_applications SET status = 'pending', current_approver_level = 'advisor', updated_at = now() WHERE id = p_application_id;
      ELSE
        UPDATE bonafide_applications SET status = 'pending', current_approver_level = 'hod', updated_at = now() WHERE id = p_application_id;
      END IF;
    ELSIF p_approver_role = 'advisor' THEN
      UPDATE bonafide_applications SET status = 'pending', current_approver_level = 'hod', updated_at = now() WHERE id = p_application_id;
    ELSIF p_approver_role = 'hod' THEN
      UPDATE bonafide_applications SET status = 'pending', current_approver_level = 'ps', updated_at = now() WHERE id = p_application_id;
    ELSIF p_approver_role = 'ps' THEN
      UPDATE bonafide_applications SET status = 'approved', current_approver_level = 'completed', updated_at = now() WHERE id = p_application_id;
    ELSE
      -- default to completing
      UPDATE bonafide_applications SET status = 'approved', current_approver_level = 'completed', updated_at = now() WHERE id = p_application_id;
    END IF;
  END IF;

  -- Return inserted approval and new application status
  RETURN QUERY
  SELECT a.id, a.approver_id, a.approver_role, a.action, a.remarks, a.created_at, b.status, b.current_approver_level
  FROM bonafide_approvals a
  JOIN bonafide_applications b ON b.id = p_application_id
  WHERE a.id = v_inserted_id;
END;
$$;

-- Note: create this function in the Supabase SQL editor as an admin. Because it's SECURITY DEFINER, it will execute with the privileges of the function owner (the DB role that created it). This allows the RPC to update the application row even when RLS would otherwise prevent a direct client-side update.
