import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout";
import Loader from "../../components/Loader";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

interface Subject {
  id: string;
  subject_code: string;
  name: string;
  staff_id: string | null;
  year: number;
  section?: string;
  department: string;
  credits: number;
  mnemonic?: string;
  subject_type?: string;
}

export default function MySubjects() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [studentYear, setStudentYear] = useState<number | null>(null);
  const [studentSection, setStudentSection] = useState<string | null>(null);
  const [staffMap, setStaffMap] = useState<
    Record<string, { name?: string; email?: string }>
  >({});
  const [assignedElectivesByParent, setAssignedElectivesByParent] = useState<
    Record<string, any>
  >({});
  const [ttLoading, setTtLoading] = useState(false);
  const [ttError, setTtError] = useState<string | null>(null);
  const [timetable, setTimetable] = useState<
    Record<string, { subject_id: string | null }>
  >({});
  const [selectedDay, setSelectedDay] = useState<number>(1); // 1=Monday, 2=Tuesday, etc.
  const [selectedSaturdayDate, setSelectedSaturdayDate] = useState<string | null>(null);
  const [saturdaySlots, setSaturdaySlots] = useState<Record<number, any>>({});
  const [satLoading, setSatLoading] = useState(false);
  const initialView =
    searchParams.get("view") === "timetable" ? "timetable" : "subjects";
  const [view, setView] = useState<"subjects" | "timetable">(initialView);
  const computeCurrentSemester = () => {
    const m = new Date().getMonth();
    return m < 6 ? 1 : 2;
  };
  const [semester, setSemester] = useState<number>(computeCurrentSemester());

  useEffect(() => {
    if (!profile) return;

    const load = async () => {
      setLoading(true);
      try {
        // Determine student's year and section from `students` table
        const { data: studentRow, error: studErr } = await supabase
          .from("students")
          .select("year, section")
          .eq("id", profile.id)
          .maybeSingle();

        if (studErr) throw studErr;
        const year = studentRow?.year || null;
        const section = studentRow?.section || null;
        setStudentYear(year);
        setStudentSection(section);

        if (!profile.department || !year) {
          setSubjects([]);
          setLoading(false);
          return;
        }

        // Fetch subjects matching department, year and section
        const q = supabase
          .from("subjects")
          .select("*")
          .eq("department", profile.department) // Only fetch student's department, not ALL
          .eq("year", year)
          .order("subject_code", { ascending: true });
        if (section) q.or(`section.eq.${section},section.eq.ALL`);
        const { data: subjData, error: subjErr } = await q;

        if (subjErr) {
          console.warn(
            "Subjects read error (table may not exist):",
            subjErr.message || subjErr
          );
          setSubjects([]);
          setLoading(false);
          return;
        }

        const subs: Subject[] = (subjData || []) as Subject[];
        
        // Fetch parent subject IDs from electives table to identify which are parent containers
        const { data: electivesData } = await supabase
          .from('electives')
          .select('parent_subject_id');
        
        const parentSubjectIds = new Set(
          (electivesData || []).map((e: any) => e.parent_subject_id)
        );
        
        // Filter out parent elective subjects - subjects that are used as parents in electives table
        const filteredSubs = subs.filter(s => {
          // Hide subjects that are parent electives (used as parent_subject_id in electives table)
          if (parentSubjectIds.has(s.id)) {
            return false;
          }
          return true;
        });
        
        setSubjects(filteredSubs);

        // Fetch staff profiles used in the list
        const staffIds = Array.from(
          new Set(
            subs.filter((s) => s.staff_id).map((s) => s.staff_id as string)
          )
        );
        if (staffIds.length > 0) {
          const { data: staffProfiles } = await supabase
            .from("profiles")
            .select("id, name, email")
            .in("id", staffIds);

          const map: Record<string, { name?: string; email?: string }> = {};
          (staffProfiles || []).forEach((p: any) => {
            map[p.id] = { name: p.name, email: p.email };
          });
          setStaffMap(map);
        }

        // Fetch assigned subelectives for this student and append to the list
        try {
          const { data: assignedRows } = await supabase
            .from("student_electives")
            .select("elective_id")
            .eq("student_id", profile.id);
          const assignedIds = (assignedRows || [])
            .map((r: any) => r.elective_id)
            .filter(Boolean);
          if (assignedIds.length > 0) {
            const { data: electives } = await supabase
              .from("electives")
              .select("*")
              .in("id", assignedIds);
            if ((electives || []).length > 0) {
              const parentIds = Array.from(
                new Set((electives || []).map((e: any) => e.parent_subject_id))
              );
              const { data: parents } = await supabase
                .from("subjects")
                .select(
                  "id, name, subject_code, credits, staff_id, department, year, mnemonic"
                )
                .in("id", parentIds);
              const parentsMap: Record<string, any> = {};
              (parents || []).forEach((p: any) => (parentsMap[p.id] = p));

              const electiveSubjects: Subject[] = (electives || []).map(
                (e: any) => {
                  const parent = parentsMap[e.parent_subject_id];
                  return {
                    id: `elective-${e.id}`,
                    subject_code: e.course_code,
                    name:
                      e.sub_name ||
                      (parent ? `${parent.name} (elective)` : "Elective"),
                    staff_id: e.staff_id || (parent ? parent.staff_id : null),
                    year:
                      e.year || (parent ? parent.year : studentRow?.year || 0),
                    section: undefined,
                    department:
                      e.department ||
                      (parent ? parent.department : profile.department || ""),
                    credits:
                      e.credits != null
                        ? e.credits
                        : parent
                        ? parent.credits
                        : 0,
                    mnemonic: parent?.mnemonic || undefined,
                  } as Subject;
                }
              );

              // Append elective subjects to the main subjects list
              setSubjects((prev) => {
                // avoid duplicates by id
                const ids = new Set(prev.map((p) => p.id));
                const merged = [...prev];
                electiveSubjects.forEach((es) => {
                  if (!ids.has(es.id)) merged.push(es);
                });
                return merged;
              });

              // store mapping parent_subject_id -> { elective, parentName, parentCode } for quick lookup when rendering timetable
              const map: Record<string, any> = {};
              (electives || []).forEach((e: any) => {
                if (e.parent_subject_id) {
                  map[e.parent_subject_id] = {
                    elective: e,
                    parentName: parentsMap[e.parent_subject_id]?.name || null,
                    parentCode:
                      parentsMap[e.parent_subject_id]?.subject_code || null,
                  };
                }
              });
              setAssignedElectivesByParent(map);

              // also fetch staff profiles for elective staff
              const electiveStaffIds = Array.from(
                new Set(
                  (electiveSubjects || [])
                    .map((s) => s.staff_id)
                    .filter(Boolean)
                )
              );
              if (electiveStaffIds.length > 0) {
                const { data: electiveStaff } = await supabase
                  .from("profiles")
                  .select("id, name, email")
                  .in("id", electiveStaffIds as any[]);
                const map2: Record<string, { name?: string; email?: string }> =
                  {};
                (electiveStaff || []).forEach((p: any) => {
                  map2[p.id] = { name: p.name, email: p.email };
                });
                setStaffMap((prevMap) => ({ ...prevMap, ...map2 }));
              }
            }
          }
        } catch (e) {
          console.warn("Could not load assigned electives:", e);
        }
      } catch (err: any) {
        console.error("Error loading MySubjects:", err);
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [profile]);

  // Load timetable for student's department/year/section
  useEffect(() => {
    const loadTt = async () => {
      setTtError(null);
      setTimetable({});
      if (!profile?.department || !studentYear || !studentSection) return;
      setTtLoading(true);
      try {
        const { data, error } = await supabase
          .from("timetables")
          .select("day_of_week, period, subject_id")
          .eq("department", profile.department)
          .eq("year", studentYear)
          .eq("section", studentSection)
          .eq("semester", semester);
        if (error) throw error;
        const m: Record<string, { subject_id: string | null }> = {};
        (data || []).forEach((row: any) => {
          const key = `${row.day_of_week}-${row.period}`;
          m[key] = { subject_id: row.subject_id };
        });
        setTimetable(m);
      } catch (err: any) {
        console.error("Error loading timetable:", err);
        setTtError(err.message || String(err));
      } finally {
        setTtLoading(false);
      }
    };
    loadTt();
    // also attempt to load saturday timetable (read-only)
    loadSaturday();
  }, [profile?.department, studentYear, studentSection, semester]);

  const loadSaturday = async (dateStr?: string) => {
    try {
      if (!profile?.department || !studentYear || !studentSection) return;
      setSatLoading(true);
      const dayOfWeek = 6;
      const { data: satData, error: satErr } = await supabase
        .from("timetables")
        .select("period, subject_id")
        .eq("department", profile.department)
        .eq("year", studentYear)
        .eq("section", studentSection)
        .eq("semester", semester)
        .eq("day_of_week", dayOfWeek)
        .order("period", { ascending: true });
      if (satErr) throw satErr;

      const slots: Record<number, any> = {};
      const subjectIds: string[] = [];
      for (let p = 1; p <= 7; p++) slots[p] = null;
      (satData || []).forEach((r: any) => {
        slots[r.period] = r.subject_id || null;
        if (r.subject_id) subjectIds.push(r.subject_id);
      });

      const subjMap = new Map<string, any>();
      if (subjectIds.length > 0) {
        const { data: subs } = await supabase
          .from("subjects")
          .select("id, name, subject_code")
          .in("id", Array.from(new Set(subjectIds)) as string[]);
        (subs || []).forEach((s: any) => subjMap.set(s.id, s));
      }

      const slotsWithSubjects: Record<number, any> = {};
      for (let p = 1; p <= 7; p++) {
        const sid = slots[p];
        slotsWithSubjects[p] = sid ? subjMap.get(sid) || null : null;
      }
      setSaturdaySlots(slotsWithSubjects);
      if (dateStr) setSelectedSaturdayDate(dateStr);
    } catch (e: any) {
      console.error("Failed to load Saturday timetable (student):", e);
    } finally {
      setSatLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        {/* View Toggle Buttons */}
        <div className="mb-6 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setView("subjects")}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              view === "subjects"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            My Subjects
          </button>
          <button
            onClick={() => setView("timetable")}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              view === "timetable"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            My Timetable
          </button>
        </div>

        {loading ? (
          <Loader message="Loading subjects..." />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
            {error}
          </div>
        ) : (
          <>
            {/* Subjects View */}
            {view === "subjects" && (
              <div>
                {!profile?.department || !studentYear ? (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-center">
                    <p className="text-slate-500">
                      Your profile is missing department or year information.
                    </p>
                  </div>
                ) : subjects.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-center">
                    <p className="text-slate-500">
                      No subjects found for {profile.department} — Year{" "}
                      {studentYear}
                      {studentSection ? ` — Section ${studentSection}` : ""}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Desktop/tablet: table view */}
                    <div className="hidden md:block bg-white rounded-xl shadow-lg border border-slate-200 p-4 overflow-x-auto">
                      <table className="w-full text-sm min-w-[720px]">
                        <thead>
                          <tr className="text-left text-slate-600">
                            <th className="py-2 pr-3">Code</th>
                            <th className="py-2 pr-3">Name</th>
                            <th className="py-2 pr-3">Mnemonic</th>
                            <th className="py-2 pr-3">Credits</th>
                            <th className="py-2 pr-3">Section</th>
                            <th className="py-2">Staff</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subjects.map((s) => (
                            <tr key={s.id} className="border-t">
                              <td className="py-2 pr-3">{s.subject_code}</td>
                              <td className="py-2 pr-3">{s.name}</td>
                              <td className="py-2 pr-3">{s.mnemonic || "—"}</td>
                              <td className="py-2 pr-3">{s.credits}</td>
                              <td className="py-2 pr-3">{s.section || "—"}</td>
                              <td className="py-2">
                                {s.staff_id
                                  ? staffMap[s.staff_id]?.name ||
                                    staffMap[s.staff_id]?.email ||
                                    s.staff_id
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile: card list */}
                    <div className="md:hidden space-y-2">
                      {subjects.map((s) => (
                        <div
                          key={s.id}
                          className="bg-white rounded-lg shadow border border-slate-200 p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800">
                                {s.subject_code}
                              </span>
                              {s.mnemonic && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                                  {s.mnemonic}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                {s.credits} cr
                              </span>
                              {s.section && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                  {s.section}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 text-slate-700 text-sm font-medium truncate">
                            {s.name}
                          </p>
                          {s.staff_id && (
                            <p className="mt-1 text-xs text-slate-500 truncate">
                              {staffMap[s.staff_id]?.name ||
                                staffMap[s.staff_id]?.email ||
                                s.staff_id}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Timetable View */}
            {view === "timetable" && (
              <>
                {!studentSection ? (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-center text-slate-600">
                    Section information is missing; cannot load timetable.
                  </div>
                ) : ttLoading ? (
                  <Loader message="Loading timetable..." />
                ) : ttError ? (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
                    {ttError}
                  </div>
                ) : (
                  <>
                    {/* Day selector buttons (mobile only) */}
                    <div className="mb-4 flex flex-wrap gap-2 md:hidden">
                      {["MON", "TUE", "WED", "THU", "FRI"].map((day, di) => (
                        <button
                          key={day}
                          onClick={() => setSelectedDay(di + 1)}
                          className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                            selectedDay === di + 1
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>

                    {/* Desktop: full-week timetable table */}
                    <div className="hidden md:block bg-white rounded-xl shadow-lg border border-slate-200 p-4 overflow-x-auto mb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-600">
                            <th className="py-2 pr-3">Period</th>
                            {[
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                            ].map((d) => (
                              <th key={d} className="py-2 pr-3">
                                {d}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[1, 2, 3, 4, 5, 6, 7].map((p) => (
                            <tr key={`period-${p}`} className="border-t">
                              <td className="py-2 pr-3 w-28">Period {p}</td>
                              {[1, 2, 3, 4, 5].map((dayIdx) => {
                                const key = `${dayIdx}-${p}`;
                                const cell = timetable[key];
                                const parentId = cell?.subject_id;
                                const subj = parentId
                                  ? subjects.find((s) => s.id === parentId)
                                  : null;
                                const assigned = parentId
                                  ? assignedElectivesByParent[parentId]
                                  : null;
                                return (
                                  <td
                                    key={`${dayIdx}-${p}`}
                                    className="py-2 pr-3 align-top"
                                  >
                                    {subj ? (
                                      <div>
                                        {/* If this is a main elective, and the student has an assigned subelective for it, show the assigned subelective code/name */}
                                        {/* Always show the main elective (parent) info. Do not display subelective details here. */}
                                        <>
                                          <div className="text-sm font-medium text-slate-800">
                                            {subj.subject_type === 'elective' ? (subj.name) : (subj.mnemonic || subj.subject_code)}
                                          </div>
                                        </>
                                      </div>
                                    ) : assigned ? (
                                      <div>
                                        {/* Parent subject row not loaded; show main elective name from parent info if available */}
                                        <div className="text-sm font-medium text-slate-800">
                                          {assigned.parentName || assigned.parentCode || "Elective"}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 text-sm">
                                        No class
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Desktop: Saturday single-day view (read-only) */}
                    <div className="hidden md:block bg-white rounded-xl shadow-lg border border-slate-200 p-4 overflow-x-auto mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold">Saturday Timetable</h3>
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={selectedSaturdayDate || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) { setSelectedSaturdayDate(null); setSaturdaySlots({}); return; }
                              const d = new Date(v + 'T00:00:00');
                              if (d.getDay() !== 6) { alert('Please choose a Saturday date'); return; }
                              loadSaturday(v);
                            }}
                            className="border px-2 py-1 rounded"
                          />
                        </div>
                      </div>

                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="py-2 pr-3">Period</th>
                            <th className="py-2 pr-3">Subject</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[1,2,3,4,5,6,7].map((p) => (
                            <tr key={`sat-stu-${p}`} className="border-t">
                              <td className="py-2 pr-3 w-28">Period {p}</td>
                              <td className="py-2 pr-3">
                                {saturdaySlots[p] ? (
                                  <div>
                                    <div className="text-sm font-medium text-slate-800">
                                      {saturdaySlots[p].subject_type === 'elective' ? saturdaySlots[p].name : (saturdaySlots[p].mnemonic || saturdaySlots[p].subject_code || saturdaySlots[p].name)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-sm">No class</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Display selected day's timetable (mobile only) */}
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 md:hidden">
                      <h3 className="text-lg font-semibold text-slate-800 mb-4">
                        {
                          [
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                          ][selectedDay - 1]
                        }
                      </h3>
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                          const key = `${selectedDay}-${p}`;
                          const cell = timetable[key];
                          const parentId = cell?.subject_id;
                          const subj = parentId
                            ? subjects.find((s) => s.id === parentId)
                            : null;
                          const assigned = parentId
                            ? assignedElectivesByParent[parentId]
                            : null;
                          return (
                            <div
                              key={key}
                              className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                            >
                              <div className="flex-shrink-0 w-16 sm:w-20">
                                <span className="text-sm font-medium text-slate-700">
                                  Period {p}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                {subj ? (
                                  <div>
                                    <div className="text-sm sm:text-base font-medium text-slate-800">
                                      {subj.subject_type === 'elective' ? (subj.name) : (subj.mnemonic || subj.subject_code)}
                                    </div>
                                  </div>
                                ) : assigned ? (
                                  <div>
                                    <div className="text-sm sm:text-base font-medium text-slate-800">
                                      {assigned.parentName || assigned.parentCode || "Elective"}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-sm">
                                    No class scheduled
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Saturday Timetable (read-only for students) - mobile */}
                    <div className="mt-4 bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-4 md:hidden">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-slate-800">Saturday Timetable</h3>
                        <div>
                          <input
                            type="date"
                            value={selectedSaturdayDate || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) { setSelectedSaturdayDate(null); setSaturdaySlots({}); return; }
                              const d = new Date(v + 'T00:00:00');
                              if (d.getDay() !== 6) { alert('Please choose a Saturday date'); return; }
                              loadSaturday(v);
                            }}
                            className="border px-2 py-1 rounded"
                          />
                        </div>
                      </div>

                      {satLoading ? (
                        <div className="text-center py-6">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                          <p className="mt-3 text-sm text-slate-500">Loading Saturday timetable...</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {[1,2,3,4,5,6,7].map((p) => (
                            <div key={`sat-stu-mobile-${p}`} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                              <div className="text-sm font-medium">Period {p}</div>
                              <div className="min-w-0 flex-1 ml-4">
                                {saturdaySlots[p] ? (
                                  <div className="text-sm font-medium text-slate-800 truncate">
                                    {saturdaySlots[p].subject_type === 'elective' ? saturdaySlots[p].name : (saturdaySlots[p].mnemonic || saturdaySlots[p].subject_code || saturdaySlots[p].name)}
                                  </div>
                                ) : (
                                  <div className="text-sm text-slate-400">No class scheduled</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
