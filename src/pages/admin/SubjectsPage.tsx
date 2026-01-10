import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { supabase } from "../../lib/supabase";
import Loader from "../../components/Loader";
import { useAuth } from "../../contexts/AuthContext";

interface SubjectRow {
  id: string;
  subject_code: string;
  name: string;
  staff_id: string | null;
  year: number;
  section?: string;
  department: string;
  credits: number;
  subject_type?: string | null;
  mnemonic?: string | null;
  parent_subject_id?: string | null;
}

export default function SubjectsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<
    Array<{ id: string; name: string; email: string; department: string }>
  >([]);
  const [yearsForDept, setYearsForDept] = useState<number[]>([1, 2, 3, 4]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [, setError] = useState<string | null>(null);

  // form state
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectMnemonic, setSubjectMnemonic] = useState("");
  // Deprecated: we now assign staff per-section via staffBySection
  // const [subjectStaff, setSubjectStaff] = useState('');
  const [subjectYear, setSubjectYear] = useState<number>(1);
  const [subjectDept, setSubjectDept] = useState("");
  const [subjectSection, setSubjectSection] = useState("A");
  const [subjectCredits, setSubjectCredits] = useState<number>(3);
  const [subjectType, setSubjectType] = useState<"core" | "elective">("core");
  const [subElectives, setSubElectives] = useState<
    Array<{
      course_code: string;
      staff_id: string | null;
      credits?: number;
      sub_name?: string;
    }>
  >([]);
  const [sectionsForDeptYear, setSectionsForDeptYear] = useState<string[]>([]);
  const [staffBySection, setStaffBySection] = useState<Record<string, string>>(
    {}
  );
  const [manualSections, setManualSections] = useState<string[]>([
    subjectSection,
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editYearsForDept, setEditYearsForDept] = useState<number[]>([
    1, 2, 3, 4,
  ]);
  const [editForm, setEditForm] = useState<SubjectRow | null>(null);

  // Filter state for existing subjects table
  const [filterDepartment, setFilterDepartment] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");

  useEffect(() => {
    if (!profile) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        // departments from profiles
        const { data: pData } = await supabase
          .from("profiles")
          .select("department")
          .not("department", "is", null);
        const deps = Array.from(
          new Set((pData || []).map((d: any) => d.department))
        )
          .filter(Boolean)
          .sort();
        setDepartments(deps as string[]);

        // staff profiles (non-students)
        const { data: sData } = await supabase
          .from("profiles")
          .select("id, name, email, department")
          .neq("role", "student")
          .order("name", { ascending: true });
        setStaffProfiles(sData || []);

        // load existing subjects if table exists
        try {
          const { data: subjData, error: subjErr } = await supabase
            .from("subjects")
            .select("*")
            .order("department", { ascending: true })
            .order("year", { ascending: true })
            .order("subject_code", { ascending: true });
          if (subjErr) {
            // table might not exist yet; ignore and continue
            console.warn(
              "Subjects table read error (maybe not created):",
              subjErr.message || subjErr
            );
            setSubjects([]);
          } else {
            setSubjects(subjData || []);
          }
        } catch (e) {
          console.warn("Subjects fetch failed (likely no table):", e);
          setSubjects([]);
        }
      } catch (err: any) {
        console.error("Error fetching subjects page data:", err);
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile]);

  useEffect(() => {
    // fetch years for selected department from 'years' table if available
    const fetchYears = async () => {
      if (!subjectDept) return setYearsForDept([1, 2, 3, 4]);
      try {
        const { data } = await supabase
          .from("years")
          .select("year_number")
          .eq("department", subjectDept)
          .order("year_number", { ascending: true });
        if (data && data.length > 0) {
          setYearsForDept(data.map((d: any) => d.year_number));
          if (!data.find((d: any) => d.year_number === subjectYear)) {
            setSubjectYear(data[0].year_number);
          }
        } else {
          setYearsForDept([1, 2, 3, 4]);
        }
      } catch (e) {
        setYearsForDept([1, 2, 3, 4]);
      }
    };
    fetchYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectDept]);

  // Fetch sections for the selected department+year from students table
  useEffect(() => {
    const fetchSections = async () => {
      if (!subjectDept || !subjectYear) return setSectionsForDeptYear([]);
      try {
        const { data } = await supabase
          .from("students")
          .select("section")
          .eq("department", subjectDept)
          .eq("year", subjectYear)
          .order("section", { ascending: true });

        const secs = Array.from(
          new Set(((data || []) as any[]).map((r: any) => r.section))
        ).filter(Boolean) as string[];
        if (secs.length === 0) {
          // fallback to the single section state
          setSectionsForDeptYear([]);
        } else {
          setSectionsForDeptYear(secs);
          // initialize staffBySection entries if not present
          setStaffBySection((prev) => {
            const next = { ...prev };
            for (const s of secs) {
              if (!next[s]) next[s] = "";
            }
            return next;
          });
        }
      } catch (e) {
        console.warn("Failed to fetch sections for department/year:", e);
        setSectionsForDeptYear([]);
      }
    };

    fetchSections();
  }, [subjectDept, subjectYear]);

  const handleCreateSubject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Only admins may create subjects per DB RLS policy
    if (!profile || (profile.role && profile.role !== "admin")) {
      setError("Only admins can create subjects.");
      alert("Only admins can create subjects.");
      return;
    }
    // For electives: subject code is optional for the main elective (we store course codes on subelectives)
    if (subjectType === "core") {
      if (!subjectCode.trim() || !subjectName.trim() || !subjectDept.trim())
        return setError("Code, name and department are required");
    } else {
      if (!subjectName.trim() || !subjectDept.trim())
        return setError("Name and department are required for electives");
    }
    setSubmitting(true);
    setError(null);
    try {
      const sectionsToCreate =
        subjectType === "elective"
          ? []
          : sectionsForDeptYear.length > 0
          ? sectionsForDeptYear
          : manualSections.length > 0
          ? manualSections
          : [subjectSection.trim() || "A"];

      // Check for existing subjects with same code/department/year to avoid unique-constraint errors
      const code = subjectCode.trim().toUpperCase();
      const dept = subjectDept;
      const yr = subjectYear;

      let toCreate: string[] = [];
      if (subjectType !== "elective") {
        const { data: existingRows, error: existingErr } = await supabase
          .from("subjects")
          .select("section")
          .eq("subject_code", code)
          .eq("department", dept)
          .eq("year", yr);

        if (existingErr) {
          console.warn(
            "Could not check existing subjects before insert:",
            existingErr
          );
        }

        const existingSections = (existingRows || [])
          .map((r: any) => r.section)
          .filter(Boolean) as string[];
        toCreate = sectionsToCreate.filter(
          (s) => !existingSections.includes(s)
        );

        if (toCreate.length === 0) {
          // Nothing to insert — all requested sections already exist for this subject/year/department
          const msg =
            existingSections.length > 0
              ? `Subject ${code} already exists for department ${dept} year ${yr} (sections: ${existingSections.join(
                  ", "
                )}).`
              : `Subject ${code} already exists for department ${dept} year ${yr}.`;
          setError(msg);
          alert(
            msg +
              " If you expect per-section subjects, check the DB unique constraints (section may not be included)."
          );
          setSubmitting(false);
          return;
        }

        if (toCreate.length < sectionsToCreate.length) {
          alert(
            `Some sections were skipped because they already exist: ${sectionsToCreate
              .filter((s) => existingSections.includes(s))
              .join(", ")}`
          );
        }
      } else {
        // electives do not create per-section rows
        toCreate = [];
      }

      if (subjectType === "elective") {
        // Create a main elective subject stored in `subjects` (no course code required for main)
        const mainObj: any = {
          subject_code: null,
          name: subjectName.trim(),
          mnemonic: subjectMnemonic.trim() || null,
          staff_id: null,
          year: yr,
          // mark as a top-level elective record (use non-null value to satisfy DB constraints)
          section: "ALL",
          department: dept,
          credits: subjectCredits,
          subject_type: "elective",
        };

        const { data: mainData, error: mainErr } = await supabase
          .from("subjects")
          .insert([mainObj])
          .select()
          .single();
        if (mainErr) throw mainErr;

        // Note: per-section rows are not created for electives (no section-wise staff)

        // Insert subelectives into `electives` table. Subelectives have course_code, a single assigned staff, credits, department and year.
        const electiveObjs = (subElectives || []).map((se) => ({
          parent_subject_id: mainData.id,
          course_code: se.course_code.trim().toUpperCase(),
          staff_id: se.staff_id || null,
          sub_name:
            se.sub_name && se.sub_name.trim()
              ? se.sub_name.trim()
              : `${subjectName.trim()} - ${se.course_code
                  .trim()
                  .toUpperCase()}`,
          credits: se.credits != null ? Number(se.credits) : subjectCredits,
          department: dept,
          year: yr,
        }));

        if (electiveObjs.length > 0) {
          const { error: electErr } = await supabase
            .from("electives")
            .insert(electiveObjs);
          if (electErr) throw electErr;
        }

        // Reload or prepend mainData to local subjects list
        setSubjects((s) => [mainData as any, ...s]);
      } else {
        const insertObjs: any[] = toCreate.map((sec) => ({
          subject_code: code,
          name: subjectName.trim(),
          mnemonic: subjectMnemonic.trim() || null,
          // Always use per-section staff assignment; if none chosen, it will be null
          staff_id: staffBySection[sec] || null,
          year: yr,
          section: sec,
          department: dept,
          credits: subjectCredits,
          subject_type: subjectType,
        }));

        const { data, error } = await supabase
          .from("subjects")
          .insert(insertObjs)
          .select();
        if (error) throw error;
        setSubjects((s) => [...(data || []), ...s]);
      }
      setSubjectCode("");
      setSubjectName("");
      setSubjectYear(1);
      setSubjectDept("");
      setSubjectSection("A");
      setSubjectCredits(3);
      setSubjectType("core");
      setSubElectives([]);
      setManualSections(subjectType === "elective" ? [] : ["A"]);
      alert("Subject created successfully");
    } catch (err: any) {
      console.error("Error creating subject:", err);
      // Supabase errors often have ``message`` and ``details`` or ``hint`` fields
      const msg = err?.message || err?.error || String(err);
      const details = err?.details ? `\nDetails: ${err.details}` : "";
      setError(msg + details);
      alert(`Failed to create subject: ${msg}${details}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Open edit modal with selected row
  const openEdit = async (row: SubjectRow) => {
    setEditError(null);
    // Ensure section string
    const withSection: SubjectRow = {
      ...row,
      section: row.section || "A",
      subject_type: row.subject_type || "core",
    };
    setEditForm(withSection);
    setEditing(true);
    // Load years for this department
    try {
      if (withSection.department) {
        const { data } = await supabase
          .from("years")
          .select("year_number")
          .eq("department", withSection.department)
          .order("year_number", { ascending: true });
        if (data && data.length > 0) {
          setEditYearsForDept(data.map((d: any) => d.year_number));
        } else {
          setEditYearsForDept([1, 2, 3, 4]);
        }
      } else {
        setEditYearsForDept([1, 2, 3, 4]);
      }
    } catch {
      setEditYearsForDept([1, 2, 3, 4]);
    }
  };

  const closeEdit = () => {
    setEditing(false);
    setEditForm(null);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editForm) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      // Validate required fields
      // Note: Parent elective subjects don't need subject_code
      const isParentElective = editForm.subject_type === 'elective' && !editForm.parent_subject_id;
      
      if (!isParentElective && (!editForm.subject_code || !editForm.subject_code.trim())) {
        setEditError('Subject code is required');
        setSavingEdit(false);
        return;
      }
      if (!editForm.name || !editForm.name.trim()) {
        setEditError('Subject name is required');
        setSavingEdit(false);
        return;
      }

      const code = editForm.subject_code ? editForm.subject_code.trim().toUpperCase() : null;
      const dept = editForm.department;
      const yr = Number(editForm.year);
      const sec = (editForm.section || "A").trim();

      // Check for unique conflict with other rows (only if subject_code exists)
      if (code) {
        const { data: conflictRows, error: conflictErr } = await supabase
          .from("subjects")
          .select("id")
          .eq("subject_code", code)
          .eq("department", dept)
          .eq("year", yr)
          .eq("section", sec);
        if (!conflictErr) {
          const exists = (conflictRows || []).some(
            (r: any) => r.id !== editForm.id
          );
          if (exists) {
            setEditError(
              `Another subject with the same Code/Dept/Year/Section already exists.`
            );
            setSavingEdit(false);
            return;
          }
        }
      }

      const updateObj = {
        subject_code: code,
        name: editForm.name.trim(),
        mnemonic: editForm.mnemonic?.trim() || null,
        staff_id: editForm.staff_id || null,
        year: yr,
        section: sec,
        department: dept,
        credits:
          editForm.credits != null && !Number.isNaN(Number(editForm.credits))
            ? Number(editForm.credits)
            : 3,
        subject_type: editForm.subject_type || "core",
        updated_at: new Date().toISOString(),
      } as const;

      const { data: updated, error } = await supabase
        .from("subjects")
        .update(updateObj)
        .eq("id", editForm.id)
        .select()
        .single();
      if (error) throw error;

      // Handle staff_timetables synchronization when staff assignment changes
      const oldSubject = subjects.find((s) => s.id === editForm.id);
      const oldStaffId = oldSubject?.staff_id;
      const newStaffId = editForm.staff_id || null;

      // If staff was changed or cleared, delete only the staff_timetables entries
      // that correspond to timetable slots for THIS subject. Previously we
      // deleted all entries for the old staff in the class (dept/year/section),
      // which removed entries belonging to other subjects taught by the same
      // staff. To avoid that, fetch timetables rows for this subject and remove
      // only those day/period entries for the old staff.
      if (oldStaffId && oldStaffId !== newStaffId) {
        try {
          const { data: slots, error: slotsErr } = await supabase
            .from("timetables")
            .select("day_of_week, period, subject_id")
            .eq("subject_id", editForm.id)
            .eq("department", dept)
            .eq("year", yr)
            .eq("section", sec);

          if (!slotsErr && slots && slots.length > 0) {
            // Delete only the old staff entries for the exact day/periods
            for (const slot of slots) {
              await supabase
                .from("staff_timetables")
                .delete()
                .eq("staff_id", oldStaffId)
                .eq("day_of_week", slot.day_of_week)
                .eq("period", slot.period);
            }

            // If a new staff was assigned, create/update staff_timetables rows
            // for the new staff for the same day/period slots so the new staff
            // receives those assignments. Use upsert to avoid duplicates.
            if (newStaffId) {
              const newRows: Array<any> = slots.map((slot: any) => ({
                staff_id: newStaffId,
                department: dept,
                year: yr,
                section: sec,
                day_of_week: slot.day_of_week,
                period: slot.period,
                subject_id: slot.subject_id || editForm.id,
              }));
              if (newRows.length > 0) {
                await supabase
                  .from("staff_timetables")
                  .upsert(newRows, {
                    onConflict: "staff_id,day_of_week,period",
                  });
              }
            }
          } else {
            // No timetable slots found for this subject — avoid broad deletion
            console.warn(
              "No timetable slots found for subject",
              editForm.id,
              "— skipping staff_timetables cleanup to avoid deleting unrelated entries"
            );
          }
        } catch (e) {
          console.error(
            "Failed to clean up staff_timetables for old staff:",
            e
          );
        }
      }

      setSubjects((prev) =>
        prev.map((s) => (s.id === editForm.id ? (updated as any) : s))
      );
      closeEdit();
    } catch (err: any) {
      console.error("Error updating subject:", err);
      setEditError(err.message || String(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteSubject = async (id: string) => {
    if (
      !confirm(
        "Delete this subject? This will remove the subject (and its subelectives if any)."
      )
    )
      return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
      setSubjects((prev) => prev.filter((s) => s.id !== id));
      alert("Subject deleted");
    } catch (err: any) {
      console.error("Failed to delete subject:", err);
      alert("Failed to delete subject. Check console for details.");
    } finally {
      setSubmitting(false);
    }
  };

  // ------- Subelectives management -------
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [modalParentId, setModalParentId] = useState<string | null>(null);
  const [modalParentName, setModalParentName] = useState<string>("");
  const [modalSubElectives, setModalSubElectives] = useState<Array<any>>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subEditId, setSubEditId] = useState<string | null>(null);
  const [subEditForm, setSubEditForm] = useState<{
    course_code: string;
    sub_name?: string;
    staff_id?: string | null;
    credits?: number;
  }>({
    course_code: "",
    sub_name: "",
    staff_id: null,
    credits: subjectCredits,
  });

  const loadSubElectives = async (parentId: string) => {
    setSubLoading(true);
    try {
      const { data, error } = await supabase
        .from("electives")
        .select(
          "id, course_code, sub_name, staff_id, credits, department, year"
        )
        .eq("parent_subject_id", parentId)
        .order("course_code", { ascending: true });
      if (error) throw error;
      setModalSubElectives((data || []) as any);
    } catch (e) {
      console.error("Failed to load subelectives", e);
      setModalSubElectives([]);
    } finally {
      setSubLoading(false);
    }
  };

  const openSubModal = async (parentId: string, parentName: string) => {
    setModalParentId(parentId);
    setModalParentName(parentName || "");
    setSubModalOpen(true);
    await loadSubElectives(parentId);
  };

  const closeSubModal = () => {
    setSubModalOpen(false);
    setModalParentId(null);
    setModalSubElectives([]);
    setSubEditId(null);
  };

  const saveSubEdit = async () => {
    if (!modalParentId) return;
    try {
      if (subEditId) {
        // Validate required fields
        if (!subEditForm.course_code || !subEditForm.course_code.trim()) {
          alert('Course code is required');
          return;
        }

        const updateObj = {
          course_code: subEditForm.course_code.trim(),
          sub_name: subEditForm.sub_name?.trim() || null,
          staff_id: subEditForm.staff_id || null,
          credits:
            subEditForm.credits != null &&
            !Number.isNaN(Number(subEditForm.credits))
              ? Number(subEditForm.credits)
              : null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from("electives")
          .update(updateObj)
          .eq("id", subEditId);
        if (error) throw error;
        await loadSubElectives(modalParentId);
        setSubEditId(null);
      }
    } catch (e) {
      console.error("Failed to save subelective edit", e);
      alert("Failed to save subelective. See console for details.");
    }
  };

  const deleteSub = async (id: string) => {
    if (!confirm("Delete this subelective?")) return;
    try {
      const { error } = await supabase.from("electives").delete().eq("id", id);
      if (error) throw error;
      if (modalParentId) await loadSubElectives(modalParentId);
    } catch (e) {
      console.error("Failed to delete subelective", e);
      alert("Failed to delete subelective. See console for details.");
    }
  };

  const addSub = async () => {
    if (!modalParentId) return;
    try {
      const payload = {
        parent_subject_id: modalParentId,
        course_code: subEditForm.course_code.trim(),
        sub_name: subEditForm.sub_name?.trim() || null,
        staff_id: subEditForm.staff_id || null,
        credits:
          subEditForm.credits != null &&
          !Number.isNaN(Number(subEditForm.credits))
            ? Number(subEditForm.credits)
            : subjectCredits,
        department:
          subjects.find((s) => s.id === modalParentId)?.department || "",
        year: subjects.find((s) => s.id === modalParentId)?.year || subjectYear,
        created_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("electives").insert([payload]);
      if (error) throw error;
      if (modalParentId) await loadSubElectives(modalParentId);
      setSubEditForm({
        course_code: "",
        sub_name: "",
        staff_id: null,
        credits: subjectCredits,
      });
    } catch (e) {
      console.error("Failed to add subelective", e);
      alert("Failed to add subelective. See console for details.");
    }
  };

  // ------- Assign students to a subelective -------
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignSubId, setAssignSubId] = useState<string | null>(null);
  const [assignStudentsList, setAssignStudentsList] = useState<Array<any>>([]);
  const [assignedStudentIds, setAssignedStudentIds] = useState<
    Record<string, boolean>
  >({});
  const [assignLoading, setAssignLoading] = useState(false);

  const openAssignModal = async (sub: any) => {
    setAssignSubId(sub.id);
    setAssignModalOpen(true);
    setAssignLoading(true);
    try {
      // If the subelective's department is 'ALL', fetch students from all departments
      // (but still restrict to the elective's year). Otherwise fetch only students
      // from the specific department.
      let profQuery = supabase
        .from("profiles")
        .select("id")
        .eq("role", "student");
      if (sub.department && sub.department !== "ALL") {
        profQuery = profQuery.eq("department", sub.department);
      }
      const { data: profs } = await profQuery;
      const ids = (profs || []).map((p: any) => p.id);
      let students: any[] = [];
      if (ids.length) {
        const { data: stu } = await supabase
          .from("students")
          .select("id, reg_no, roll_no, year, section")
          .in("id", ids)
          .eq("year", sub.year);
        students = (stu || []).map((r: any) => ({
          id: r.id,
          reg_no: r.reg_no,
          roll_no: r.roll_no,
          year: r.year,
          section: r.section,
        }));
      }
      setAssignStudentsList(students);

      const { data: assigned } = await supabase
        .from("student_electives")
        .select("student_id")
        .eq("elective_id", sub.id);
      const map: Record<string, boolean> = {};
      (assigned || []).forEach((a: any) => (map[a.student_id] = true));
      setAssignedStudentIds(map);
    } catch (e) {
      console.error("Failed to load students for assignment", e);
      setAssignStudentsList([]);
    } finally {
      setAssignLoading(false);
    }
  };

  const toggleAssign = (studentId: string) => {
    setAssignedStudentIds((p) => ({ ...p, [studentId]: !p[studentId] }));
  };

  const saveAssignments = async () => {
    if (!assignSubId) return;
    setAssignLoading(true);
    try {
      const { data: existing } = await supabase
        .from("student_electives")
        .select("student_id")
        .eq("elective_id", assignSubId);
      const existingIds = new Set(
        (existing || []).map((e: any) => e.student_id)
      );

      const toInsert: Array<any> = [];
      const toDelete: Array<string> = [];

      assignStudentsList.forEach((s) => {
        const should = !!assignedStudentIds[s.id];
        const isExisting = existingIds.has(s.id);
        if (should && !isExisting)
          toInsert.push({ student_id: s.id, elective_id: assignSubId });
        if (!should && isExisting) toDelete.push(s.id);
      });

      if (toInsert.length) {
        const { error } = await supabase
          .from("student_electives")
          .insert(toInsert);
        if (error) throw error;
      }
      if (toDelete.length) {
        for (const sid of toDelete) {
          await supabase
            .from("student_electives")
            .delete()
            .eq("student_id", sid)
            .eq("elective_id", assignSubId);
        }
      }

      alert("Assignments saved");
      setAssignModalOpen(false);
    } catch (e) {
      console.error("Failed to save assignments", e);
      alert("Failed to save assignments. See console for details.");
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800">Subjects</h1>
          <p className="text-slate-600 mt-1">
            Create and manage subjects by department and year
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <h3 className="text-lg font-medium mb-3">Create Subject</h3>
          <form onSubmit={handleCreateSubject} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Type</label>
              <select value={subjectType} onChange={(e) => setSubjectType(e.target.value as any)} className="w-full px-3 py-2 border rounded">
                <option value="core">Core</option>
                <option value="elective">Elective</option>
              </select>
            </div>

            {subjectType === 'core' ? (
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Subject Code *
                </label>
                <input
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., CS101"
                />
              </div>
            ) : (
              <div>

                <label className="block text-sm text-slate-600 mb-1">
                  Subject Code (not required for main elective)
                </label>
                <input
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Optional for main elective"
                />
              </div>
            )}

            {subjectType === "elective" && (
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-600 mb-1">
                  Subelectives (course code + staff)
                </label>
                <div className="space-y-2">
                  {subElectives.length === 0 && (
                    <div className="text-sm text-slate-500">
                      No subelectives added. Add at least one if required.
                    </div>
                  )}
                  {subElectives.map((se, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        value={se.course_code}
                        onChange={(e) =>
                          setSubElectives((p) => {
                            const n = [...p];
                            n[idx].course_code = e.target.value;
                            return n;
                          })
                        }
                        placeholder="Course code (e.g., EL101)"
                        className="px-3 py-2 border rounded w-40"
                      />
                      <input
                        value={se.sub_name || ""}
                        onChange={(e) =>
                          setSubElectives((p) => {
                            const n = [...p];
                            n[idx].sub_name = e.target.value;
                            return n;
                          })
                        }
                        placeholder="Sub name (optional)"
                        className="px-3 py-2 border rounded flex-1"
                      />
                      <select
                        value={se.staff_id || ""}
                        onChange={(e) =>
                          setSubElectives((p) => {
                            const n = [...p];
                            n[idx].staff_id = e.target.value || null;
                            return n;
                          })
                        }
                        className="px-3 py-2 border rounded w-64"
                      >
                        <option value="">— No staff assigned —</option>
                        {staffProfiles.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.email}
                          </option>
                        ))}
                      </select>
                      {/* Sub-elective credits are inherited from main elective; no per-subelective credit input shown */}
                      <button
                        type="button"
                        onClick={() =>
                          setSubElectives((p) => p.filter((_, i) => i !== idx))
                        }
                        className="px-2 py-1 border rounded"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setSubElectives((p) => [
                          ...p,
                          { course_code: "", staff_id: null, sub_name: "" },
                        ])
                      }
                      className="px-3 py-2 bg-gray-100 rounded border"
                    >
                      Add subelective
                    </button>
                  </div>
                </div>
              </div>
            )}


            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Name *
              </label>
              <input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                placeholder="e.g., Introduction to Programming"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Mnemonic
              </label>
              <input
                value={subjectMnemonic}
                onChange={(e) => setSubjectMnemonic(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                placeholder="e.g., CS, AI, ML"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Department *
              </label>
              <select
                value={subjectDept}
                onChange={(e) => setSubjectDept(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">— Select department —</option>
                {subjectType === "elective" && (
                  <option value="ALL">ALL (All Departments)</option>
                )}
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Year *
              </label>
              <select
                value={subjectYear}
                onChange={(e) => setSubjectYear(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded"
              >
                {yearsForDept.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Credits</label>
              <input type="number" min={0} max={10} value={subjectCredits} onChange={(e) => setSubjectCredits(Number(e.target.value))} className="w-full px-3 py-2 border rounded" />
            </div>

            {subjectType !== 'elective' && (
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-600 mb-1">Sections / Staff Assignment</label>

                {sectionsForDeptYear.length > 0 ? (
                  <div className="space-y-2">
                    {sectionsForDeptYear.map((sec) => (
                      <div key={sec} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-slate-700">
                          Section {sec}
                        </div>
                        <select
                          value={staffBySection[sec] || ""}
                          onChange={(e) =>
                            setStaffBySection((p) => ({
                              ...p,
                              [sec]: e.target.value,
                            }))
                          }
                          className="flex-1 px-3 py-2 border rounded"
                        >
                          <option value="">— No staff assigned —</option>
                          {staffProfiles.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} — {s.email}{" "}
                              {s.department ? `(${s.department})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <input
                        value={subjectSection}
                        onChange={(e) => setSubjectSection(e.target.value)}
                        className="px-3 py-2 border rounded w-40"
                        placeholder="Section (e.g., A)"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const sec = subjectSection.trim();
                          if (!sec) return;
                          setManualSections((p) =>
                            p.includes(sec) ? p : [...p, sec]
                          );
                          setStaffBySection((p) => ({ ...p, [sec]: "" }));
                          setSubjectSection("");
                        }}
                        className="px-3 py-2 bg-gray-100 rounded border"
                      >
                        Add section
                      </button>
                    </div>

                    {manualSections.length === 0 ? (
                      <div className="text-sm text-slate-500">
                        No sections added yet. Add a section above.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {manualSections.map((sec) => (
                          <div key={sec} className="flex items-center gap-3">
                            <div className="w-24 text-sm text-slate-700">
                              Section {sec}
                            </div>
                            <select
                              value={staffBySection[sec] || ""}
                              onChange={(e) =>
                                setStaffBySection((p) => ({
                                  ...p,
                                  [sec]: e.target.value,
                                }))
                              }
                              className="flex-1 px-3 py-2 border rounded"
                            >
                              <option value="">— No staff assigned —</option>
                              {staffProfiles.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} — {s.email}{" "}
                                  {s.department ? `(${s.department})` : ""}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setManualSections((p) =>
                                  p.filter((x) => x !== sec)
                                );
                                setStaffBySection((p) => {
                                  const n = { ...p };
                                  delete n[sec];
                                  return n;
                                });
                              }}
                              className="px-2 py-1 border rounded text-sm"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}


            <div className="md:col-span-2 flex items-center gap-3 mt-2">
              <button
                type="submit"
                disabled={submitting}
                className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {submitting ? "Creating..." : "Create Subject"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubjectCode("");
                  setSubjectName("");
                  setSubjectMnemonic("");
                  setSubjectYear(1);
                  setSubjectDept("");
                  setSubjectSection("A");
                  setSectionsForDeptYear([]);
                  setStaffBySection({});
                  setSubjectCredits(3);
                  setSubjectType("core");
                  setManualSections(["A"]);
                }}
                className="py-2 px-4 border rounded"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-3">Existing Subjects</h3>
          {loading ? (
            <Loader message="Loading subjects..." />
          ) : subjects.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-center">
              No subjects found
            </div>
          ) : (
            <>
              {(() => {
                // Apply filters
                let filteredSubjects = subjects;
                if (filterDepartment) {
                  filteredSubjects = filteredSubjects.filter(
                    (s) => s.department === filterDepartment
                  );
                }
                if (filterYear) {
                  filteredSubjects = filteredSubjects.filter(
                    (s) => s.year === Number(filterYear)
                  );
                }

                return (
                  <>
                    {/* Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm text-slate-600 mb-1">
                            Filter by Department
                          </label>
                          <select
                            value={filterDepartment}
                            onChange={(e) =>
                              setFilterDepartment(e.target.value)
                            }
                            className="w-full px-3 py-2 border rounded"
                          >
                            <option value="">All Departments</option>
                            {departments.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm text-slate-600 mb-1">
                            Filter by Year
                          </label>
                          <select
                            value={filterYear}
                            onChange={(e) => setFilterYear(e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                          >
                            <option value="">All Years</option>
                            <option value="1">Year 1</option>
                            <option value="2">Year 2</option>
                            <option value="3">Year 3</option>
                            <option value="4">Year 4</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => {
                              setFilterDepartment("");
                              setFilterYear("");
                            }}
                            className="px-4 py-2 border rounded hover:bg-slate-50"
                          >
                            Clear Filters
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Desktop / tablet: table view */}
                    <div className="hidden md:block bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-600">
                              <th className="py-2">Code</th>
                              <th className="py-2">Name</th>
                              <th className="py-2">Mnemonic</th>
                              <th className="py-2">Dept</th>
                              <th className="py-2">Year</th>
                              <th className="py-2">Section</th>
                              <th className="py-2">Credits</th>
                              <th className="py-2">Type</th>
                              <th className="py-2">Staff</th>
                              <th className="py-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSubjects.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={10}
                                  className="py-4 text-center text-slate-500"
                                >
                                  No subjects match the selected filters
                                </td>
                              </tr>
                            ) : (
                              filteredSubjects.map((s) => (
                                <tr key={s.id} className="border-t">
                                  <td className="py-2">{s.subject_code}</td>
                                  <td className="py-2">{s.name}</td>
                                  <td className="py-2">{s.mnemonic || "—"}</td>
                                  <td className="py-2">{s.department}</td>
                                  <td className="py-2">{s.year}</td>
                                  <td className="py-2">{s.section || "—"}</td>
                                  <td className="py-2">{s.credits}</td>
                                  <td className="py-2">
                                    {s.subject_type || "core"}
                                  </td>
                                  <td className="py-2">
                                    {staffProfiles.find(
                                      (p) => p.id === s.staff_id
                                    )?.name || "—"}
                                  </td>
                                  <td className="py-2">
                                    <button
                                      type="button"
                                      onClick={() => openEdit(s)}
                                      className="px-3 py-1 rounded border hover:bg-slate-50"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteSubject(s.id)}
                                      className="ml-2 px-3 py-1 rounded border text-red-600 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                    {s.subject_type === "elective" && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openSubModal(s.id, s.name)
                                          }
                                          className="ml-2 px-3 py-1 rounded border bg-white hover:bg-slate-50"
                                        >
                                          sub
                                        </button>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Mobile: stacked card view */}
                    <div className="md:hidden space-y-3">
                      {filteredSubjects.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center text-slate-500">
                          No subjects match the selected filters
                        </div>
                      ) : (
                        filteredSubjects.map((s) => (
                          <div
                            key={s.id}
                            className="bg-white rounded-xl shadow-sm border border-slate-200 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-slate-800">
                                  {s.name}{" "}
                                  {s.subject_code ? (
                                    <span className="text-xs text-slate-500">
                                      — {s.subject_code}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {s.mnemonic
                                    ? `Mnemonic: ${s.mnemonic} • `
                                    : ""}
                                  {s.department} • Year {s.year} • Section{" "}
                                  {s.section || "—"}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Credits: {s.credits ?? "—"} •{" "}
                                  {s.subject_type || "core"}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Staff:{" "}
                                  {staffProfiles.find(
                                    (p) => p.id === s.staff_id
                                  )?.name || "—"}
                                </div>
                              </div>
                              <div className="flex-shrink-0 flex flex-col items-end">
                                <button
                                  onClick={() => openEdit(s)}
                                  className="px-2 py-1 text-xs rounded border mb-2"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteSubject(s.id)}
                                  className="px-2 py-1 text-xs rounded border text-red-600 mb-2"
                                >
                                  Delete
                                </button>
                                {s.subject_type === "elective" && (
                                  <>
                                    <button
                                      onClick={() => openSubModal(s.id, s.name)}
                                      className="px-2 py-1 text-xs rounded border mb-2"
                                    >
                                      sub
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>

        {editing && editForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Edit Subject</h3>
                <button
                  onClick={closeEdit}
                  className="px-2 py-1 border rounded"
                >
                  Close
                </button>
              </div>
              {editError && (
                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded">
                  {editError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Subject Code
                  </label>
                  <input
                    value={editForm.subject_code}
                    onChange={(e) =>
                      setEditForm({ ...editForm, subject_code: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Name
                  </label>
                  <input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Mnemonic
                  </label>
                  <input
                    value={editForm.mnemonic || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, mnemonic: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                    placeholder="e.g., CS, AI, ML"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Department
                  </label>
                  <select
                    value={editForm.department}
                    onChange={async (e) => {
                      const dept = e.target.value;
                      setEditForm({ ...editForm, department: dept });
                      try {
                        const { data } = await supabase
                          .from("years")
                          .select("year_number")
                          .eq("department", dept)
                          .order("year_number", { ascending: true });
                        if (data && data.length > 0) {
                          setEditYearsForDept(
                            data.map((d: any) => d.year_number)
                          );
                          if (
                            !data.find(
                              (d: any) => d.year_number === editForm.year
                            )
                          ) {
                            setEditForm((prev) =>
                              prev
                                ? ({
                                    ...prev,
                                    year: data[0].year_number,
                                  } as SubjectRow)
                                : prev
                            );
                          }
                        } else {
                          setEditYearsForDept([1, 2, 3, 4]);
                        }
                      } catch {
                        setEditYearsForDept([1, 2, 3, 4]);
                      }
                    }}
                    className="w-full px-3 py-2 border rounded"
                  >
                    {editForm.subject_type === "elective" && (
                      <option value="ALL">ALL (All Departments)</option>
                    )}
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Year
                  </label>
                  <select
                    value={editForm.year}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        year: Number(e.target.value) as any,
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                  >
                    {editYearsForDept.map((y) => (
                      <option key={y} value={y}>
                        Year {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Section
                  </label>
                  <input
                    value={editForm.section || ""}
                    onChange={(e) =>
                      setEditForm({ ...editForm, section: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Credits
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={editForm.credits}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        credits: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">
                    Type
                  </label>
                  <select
                    value={editForm.subject_type || "core"}
                    onChange={(e) =>
                      setEditForm({ ...editForm, subject_type: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="core">Core</option>
                    <option value="elective">Elective</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-600 mb-1">
                    Staff
                  </label>
                  <select
                    value={editForm.staff_id || ""}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        staff_id: e.target.value || null,
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">— No staff assigned —</option>
                    {staffProfiles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.email}{" "}
                        {s.department ? `(${s.department})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 justify-end mt-4">
                <button
                  onClick={closeEdit}
                  className="px-4 py-2 border rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Subelectives modal */}
        {subModalOpen && modalParentId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-3xl p-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">
                  Subelectives for: {modalParentName}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={closeSubModal}
                    className="px-3 py-1 border rounded"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="mb-3">
                <div className="text-sm text-slate-600">
                  Add a new subelective (course code, optional name, assign
                  staff, credits).
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2">
                  <input
                    value={subEditForm.course_code}
                    onChange={(e) =>
                      setSubEditForm((p) => ({
                        ...p,
                        course_code: e.target.value,
                      }))
                    }
                    placeholder="Course code"
                    className="px-3 py-2 border rounded"
                  />
                  <input
                    value={subEditForm.sub_name}
                    onChange={(e) =>
                      setSubEditForm((p) => ({
                        ...p,
                        sub_name: e.target.value,
                      }))
                    }
                    placeholder="Sub name (optional)"
                    className="px-3 py-2 border rounded"
                  />
                  <select
                    value={subEditForm.staff_id || ""}
                    onChange={(e) =>
                      setSubEditForm((p) => ({
                        ...p,
                        staff_id: e.target.value || null,
                      }))
                    }
                    className="px-3 py-2 border rounded"
                  >
                    <option value="">— No staff assigned —</option>
                    {staffProfiles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.email}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={subEditForm.credits ?? ""}
                      onChange={(e) =>
                        setSubEditForm((p) => ({
                          ...p,
                          credits: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        }))
                      }
                      className="px-3 py-2 border rounded w-full"
                      placeholder="Credits"
                    />
                    <button
                      onClick={addSub}
                      className="px-3 py-2 bg-blue-600 text-white rounded"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-2">
                {subLoading ? (
                  <div className="p-4 text-sm text-slate-600">
                    Loading subelectives...
                  </div>
                ) : modalSubElectives.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">
                    No subelectives found.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-600">
                        <th className="py-2">Course Code</th>
                        <th className="py-2">Name</th>
                        <th className="py-2">Credits</th>
                        <th className="py-2">Staff</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalSubElectives.map((se) => (
                        <tr key={se.id} className="border-t">
                          <td className="py-2">{se.course_code}</td>
                          <td className="py-2">{se.sub_name || "—"}</td>
                          <td className="py-2">{se.credits ?? "—"}</td>
                          <td className="py-2">
                            {staffProfiles.find((p) => p.id === se.staff_id)
                              ?.name || "—"}
                          </td>
                          <td className="py-2">
                            <button
                              onClick={() => {
                                setSubEditId(se.id);
                                setSubEditForm({
                                  course_code: se.course_code || "",
                                  sub_name: se.sub_name || "",
                                  staff_id: se.staff_id || null,
                                  credits: se.credits ?? subjectCredits,
                                });
                              }}
                              className="px-3 py-1 rounded border"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteSub(se.id)}
                              className="ml-2 px-3 py-1 rounded border text-red-600"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => openAssignModal(se)}
                              className="ml-2 px-3 py-1 rounded border bg-white hover:bg-slate-50"
                            >
                              Assign
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Assign modal for subelective */}
              {assignModalOpen && assignSubId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-4 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">Assign students</h3>
                      <button
                        onClick={() => setAssignModalOpen(false)}
                        className="px-2 py-1 border rounded"
                      >
                        Close
                      </button>
                    </div>
                    {assignLoading ? (
                      <Loader message="Loading students..." />
                    ) : (
                      <div>
                        <div className="text-sm text-slate-600 mb-2">
                          Select students from the department/year to assign to
                          this subelective.
                        </div>
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {assignStudentsList.map((st) => (
                            <div
                              key={st.id}
                              className="flex items-center justify-between gap-2 p-2 border rounded"
                            >
                              <div>
                                <div className="font-medium">
                                  {st.reg_no} — {st.roll_no}
                                </div>
                                <div className="text-xs text-slate-600">
                                  Year {st.year} • Section {st.section}
                                </div>
                              </div>
                              <div>
                                <input
                                  type="checkbox"
                                  checked={!!assignedStudentIds[st.id]}
                                  onChange={() => toggleAssign(st.id)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            onClick={() => setAssignModalOpen(false)}
                            className="px-3 py-2 border rounded"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveAssignments}
                            className="px-3 py-2 bg-blue-600 text-white rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {subEditId && (
                <div className="mt-4">
                  <h4 className="font-medium">Edit Subelective</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-2">
                    <input
                      value={subEditForm.course_code}
                      onChange={(e) =>
                        setSubEditForm((p) => ({
                          ...p,
                          course_code: e.target.value,
                        }))
                      }
                      placeholder="Course code"
                      className="px-3 py-2 border rounded"
                    />
                    <input
                      value={subEditForm.sub_name}
                      onChange={(e) =>
                        setSubEditForm((p) => ({
                          ...p,
                          sub_name: e.target.value,
                        }))
                      }
                      placeholder="Sub name (optional)"
                      className="px-3 py-2 border rounded"
                    />
                    <select
                      value={subEditForm.staff_id || ""}
                      onChange={(e) =>
                        setSubEditForm((p) => ({
                          ...p,
                          staff_id: e.target.value || null,
                        }))
                      }
                      className="px-3 py-2 border rounded"
                    >
                      <option value="">— No staff assigned —</option>
                      {staffProfiles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.email}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={subEditForm.credits ?? ""}
                        onChange={(e) =>
                          setSubEditForm((p) => ({
                            ...p,
                            credits: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          }))
                        }
                        className="px-3 py-2 border rounded w-full"
                        placeholder="Credits"
                      />
                      <button
                        onClick={saveSubEdit}
                        className="px-3 py-2 bg-blue-600 text-white rounded"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setSubEditId(null);
                          setSubEditForm({
                            course_code: "",
                            sub_name: "",
                            staff_id: null,
                            credits: subjectCredits,
                          });
                        }}
                        className="px-3 py-2 border rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
