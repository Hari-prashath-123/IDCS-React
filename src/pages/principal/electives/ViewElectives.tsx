import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import { Users, List, Download, X, Check, Trash } from "lucide-react";
import * as XLSX from 'xlsx';

interface Elective {
  id: string;
  sub_name: string;
  course_code: string;
  parent_subject_id: string;
  staff_id: string;
  year: number;
  department: string;
  group?: string;
  student_count?: number;
  parent_subject?: {
    name: string;
    subject_code: string;
    department: string;
  };
  staff?: {
    name: string;
  };
    blocked_departments?: Array<{ department: string }>;
}

interface Student {
  name: string;
  register_number: string;
  department: string;
  student_elective_id?: string;
  current_elective_id?: string;
}

export default function ViewElectives() {
  const { profile } = useAuth();
  const isIQACHOD = profile?.role === 'hod' && profile?.department === 'IQAC';

  const [electives, setElectives] = useState<Elective[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<number | "all">("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterParent, setFilterParent] = useState<string>("all");
  const [parentOptions, setParentOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [showStudentList, setShowStudentList] = useState(false);
  const [selectedElective, setSelectedElective] = useState<Elective | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [availableSubElectives, setAvailableSubElectives] = useState<Elective[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({}); // key: student_elective_id -> new elective id
  const [savingChange, setSavingChange] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchElectives();
    fetchDepartments();
  }, [filterYear, filterDepartment, filterGroup, filterParent]);

  const fetchDepartments = async () => {
    const { data, error } = await supabase
      .from("subjects")
      .select("department")
      .order("department");

    if (!error && data) {
      const uniqueDepts = [...new Set(data.map((d) => d.department))];
      setDepartments(uniqueDepts);
    }
  };

  const fetchStudents = async (elective: Elective) => {
    setSelectedElective(elective);
    setShowStudentList(true);
    setLoadingStudents(true);
    try {
      // Build list of available sub-electives for this parent subject
      const subs = (electives || []).filter(e => e.parent_subject_id === elective.parent_subject_id && e.year === elective.year);
      setAvailableSubElectives(subs);

      // Fetch student_electives rows for this elective (id + student_id)
      const { data, error } = await supabase
        .from('student_electives')
        .select('id, student_id, elective_id')
        .eq('elective_id', elective.id);

      if (error) throw error;

      const seRows = data || [];
      console.log('Student electives rows:', seRows);

      if (seRows.length === 0) {
        setStudents([]);
        return;
      }

      const studentIds = seRows.map((r: any) => r.student_id);

      // Get reg_no from students table
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, reg_no, course_name')
        .in('id', studentIds);

      // Get names and department from profiles table
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, department')
        .in('id', studentIds);

      if ((studentsError && profilesError) || (!studentsData && !profilesData)) {
        console.error('Error fetching data:', { studentsError, profilesError });
        setStudents([]);
      } else {
        // Merge data from both tables and include student_elective row id
        const studentList = seRows.map((row: any) => {
          const student = studentsData?.find((s: any) => s.id === row.student_id);
          const profile = profilesData?.find((p: any) => p.id === row.student_id);

          return {
            name: profile?.name || 'N/A',
            register_number: student?.reg_no || 'N/A',
            department: profile?.department || student?.course_name || 'N/A',
            student_elective_id: row.id,
              current_elective_id: row.elective_id,
          } as any;
        }).sort((a: any, b: any) => a.name.localeCompare(b.name));

        setStudents(studentList as any);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      alert('Failed to fetch student list: ' + (error as Error).message);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleSelectChange = (studentElectiveId: string, newElectiveId: string) => {
    setPendingChanges((prev) => ({ ...prev, [studentElectiveId]: newElectiveId }));
  };

  const savePendingChange = async (studentElectiveId: string) => {
    const newElectiveId = pendingChanges[studentElectiveId];
    if (!newElectiveId) return;
    setSavingChange((s) => ({ ...s, [studentElectiveId]: true }));
    try {
      // Find student row to get current elective
      const studentRow: any = (students as any[]).find(s => s.student_elective_id === studentElectiveId);
      const oldElectiveId = studentRow?.current_elective_id;

      // Call server-side RPC to move student atomically (locks rows and checks seats)
      const { data: rpcData, error: rpcError } = await supabase.rpc('move_student_elective', {
        p_student_elective_id: studentElectiveId,
        p_to_elective_id: newElectiveId,
        p_admin_id: profile?.id || null,
      });

      if (rpcError) throw rpcError;
      if (rpcData && rpcData.success === false) {
        throw new Error(rpcData.error || 'Move failed');
      }

      // Refresh students and electives
      if (selectedElective) await fetchStudents(selectedElective as Elective);
      await fetchElectives();
      setPendingChanges((p) => {
        const copy = { ...p };
        delete copy[studentElectiveId];
        return copy;
      });
    } catch (err: any) {
      console.error('Error saving student elective change:', err);
      alert('Failed to save change: ' + (err?.message || err));
    } finally {
      setSavingChange((s) => ({ ...s, [studentElectiveId]: false }));
    }
  };

  const removeStudent = async (studentElectiveId: string) => {
    if (!studentElectiveId) return;
    if (!confirm('Remove this student from the elective? This cannot be undone.')) return;
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('remove_student_elective', {
        p_student_elective_id: studentElectiveId,
        p_admin_id: profile?.id || null,
      });

      if (rpcError) throw rpcError;
      if (rpcData && rpcData.success === false) {
        throw new Error(rpcData.error || 'Remove failed');
      }

      // Refresh students and electives
      if (selectedElective) await fetchStudents(selectedElective as Elective);
      await fetchElectives();
    } catch (err: any) {
      console.error('Error removing student from elective:', err);
      alert('Failed to remove student: ' + (err?.message || err));
    }
  };

  const cancelPendingChange = (studentElectiveId: string) => {
    setPendingChanges((p) => {
      const copy = { ...p };
      delete copy[studentElectiveId];
      return copy;
    });
  };

  const downloadExcel = () => {
    if (!selectedElective) return;

    // Create data array with headers
    const data = [
      [`Elective: ${selectedElective.sub_name} (${selectedElective.course_code})`],
      [`Department: ${selectedElective.department} | Year: ${selectedElective.year}`],
      [`Staff: ${selectedElective.staff?.name || 'Not assigned'}`],
      [],
      ['S.No', 'Name', 'Register Number', 'Department'],
      ...students.map((student, index) => [
        index + 1,
        student.name,
        student.register_number,
        student.department
      ])
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Students');
    XLSX.writeFile(workbook, `${selectedElective.course_code}_Students.xlsx`);
  };

  const fetchElectives = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("electives")
        .select(
          `
          *,
          parent_subject:subjects!parent_subject_id(name, subject_code, department),
          staff:profiles!staff_id(name),
          blocked_departments:elective_blocked_departments(department)
        `
        )
        .order("year", { ascending: true })
        .order("sub_name", { ascending: true });

      if (filterYear !== "all") {
        query = query.eq("year", filterYear);
      }

      if (filterDepartment !== "all") {
        // Include electives that are explicitly for this department OR electives in group ALL
        // Use OR so ALL-group electives are always visible regardless of department filter
        try {
          query = query.or(`department.eq.${filterDepartment},group.eq.ALL`);
        } catch (e) {
          // fallback to direct eq if .or fails for any reason
          query = query.eq("department", filterDepartment);
        }
      }

      if (filterGroup !== "all") {
        query = query.eq("group", filterGroup);
      }

      if (filterParent !== "all") {
        query = query.eq('parent_subject_id', filterParent);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Build parent options from returned data
      const parentsMap: Record<string, string> = {};
      (data || []).forEach((e: any) => {
        if (e.parent_subject && e.parent_subject_id) {
          parentsMap[e.parent_subject_id] = e.parent_subject.name;
        }
      });
      setParentOptions(Object.keys(parentsMap).map(id => ({ id, name: parentsMap[id] })));

      // Fetch student counts for each elective
      const electivesWithCounts = await Promise.all(
        (data || []).map(async (elective) => {
          const { count, error: countError } = await supabase
            .from("student_electives")
            .select("*", { count: "exact", head: true })
            .eq("elective_id", elective.id);

          if (countError) {
            console.error(
              `Error counting students for elective ${elective.id}:`,
              countError
            );
          }

          console.log(
            `Elective ${elective.sub_name} has ${count || 0} students`
          );

          return {
            ...elective,
            student_count: count || 0,
          };
        })
      );

      setElectives(electivesWithCounts);
    } catch (error) {
      console.error("Error fetching electives:", error);
    } finally {
      setLoading(false);
    }
  };

  // Group by department (but treat ALL-group electives as global 'ALL'), then year and parent subject
  const groupedElectives = electives.reduce((acc, elective) => {
    const department = (elective.group === 'ALL') ? 'ALL' : (elective.department || "Unknown");
    if (!acc[department]) {
      acc[department] = {};
    }

    const key = `${elective.year}-${elective.parent_subject_id}`;
    if (!acc[department][key]) {
      acc[department][key] = {
        year: elective.year,
        parentSubject: elective.parent_subject,
        electives: [],
      };
    }
    acc[department][key].electives.push(elective);
    return acc;
  }, {} as Record<string, Record<string, any>>);

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-bold text-slate-800 w-full sm:w-auto">View Electives</h2>

        {/* Filters */}
        <div className="w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full">
              <select
                value={filterParent}
                onChange={(e) => setFilterParent(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="all">All Parent Subjects</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="all">All Groups</option>
              <option value="CG">CG - Common Group</option>
              <option value="EG">EG - Engineering Group</option>
              <option value="MG">MG - Management Group</option>
              <option value="NONE">No Group</option>
            </select>

            <select
              value={filterYear}
              onChange={(e) =>
                setFilterYear(
                  e.target.value === "all" ? "all" : Number(e.target.value)
                )
              }
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="all">All Years</option>
              <option value={2}>2nd Year</option>
              <option value={3}>3rd Year</option>
              <option value={4}>4th Year</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-slate-600">Loading electives...</p>
        </div>
      ) : Object.keys(groupedElectives).length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-slate-600">No electives found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedElectives)
            .sort((a: any, b: any) => {
              const da = a[0];
              const db = b[0];
              if (da === 'ALL' && db !== 'ALL') return -1;
              if (db === 'ALL' && da !== 'ALL') return 1;
              return da.localeCompare(db);
            })
            .map(([department, groups]: [string, any]) => (
              <div key={department} className="space-y-4">
                {/* Department Header */}
                <div className="flex items-center gap-3">
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg font-bold text-lg">
                    {department === 'ALL' ? 'All Departments' : department}
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-indigo-200 to-transparent"></div>
                </div>

                {/* Groups within Department */}
                <div className="space-y-4 ml-4">
                  {Object.values(groups).map((group: any, idx: number) => (
                    <div
                      key={idx}
                      className="bg-white rounded-lg border border-slate-200 overflow-hidden"
                    >
                      {/* Group Header */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-slate-200">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <h3 className="text-lg font-semibold text-slate-800 truncate">
                                {group.parentSubject?.name || "Unknown Subject"}
                              </h3>
                              <p className="text-xs text-slate-600 mt-1 truncate">
                                Year {group.year} • Code: {group.parentSubject?.subject_code}
                              </p>
                            </div>
                            <div className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-sm font-medium">
                              {group.electives.length} Elective{group.electives.length !== 1 ? "s" : ""}
                            </div>
                          </div>
                      </div>

                      {/* Electives List */}
                      <div className="divide-y divide-slate-100">
                        {group.electives.map((elective: Elective) => (
                          <div
                            key={elective.id}
                            className="px-4 py-3 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-center min-w-0">
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-500 mb-1">Elective</p>
                                  <p className="text-sm font-medium text-slate-800 truncate">{elective.sub_name}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">Code</p>
                                  <p className="text-sm text-slate-700">{elective.course_code}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">Group / Staff</p>
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                                      elective.group === 'CG' 
                                        ? 'bg-blue-100 text-blue-700' 
                                        : elective.group === 'EG' 
                                        ? 'bg-green-100 text-green-700' 
                                        : elective.group === 'MG' 
                                        ? 'bg-purple-100 text-purple-700' 
                                        : 'bg-slate-100 text-slate-700'
                                    }`}>{elective.group || 'NONE'}</span>
                                    <span className="text-sm text-slate-700 truncate">{elective.staff?.name || 'Not assigned'}</span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-3">
                                  <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-indigo-600" />
                                    <p className="text-sm font-semibold text-indigo-600">{elective.student_count || 0}</p>
                                  </div>
                                  <button
                                    onClick={() => fetchStudents(elective)}
                                    className="flex items-center gap-2 px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm font-medium"
                                  >
                                    <List className="h-4 w-4" />
                                    <span className="hidden md:inline">List</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Student List Modal */}
      {showStudentList && selectedElective && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">{selectedElective.sub_name}</h3>
                <p className="text-sm opacity-90 mt-1">
                  {selectedElective.course_code} • {selectedElective.department} • Year {selectedElective.year}
                </p>
              </div>
              <button
                onClick={() => setShowStudentList(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6">
              {loadingStudents ? (
                <div className="text-center py-12">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent"></div>
                  <p className="mt-4 text-slate-600">Loading students...</p>
                </div>
              ) : students.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-slate-600">No students have locked this elective yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">S.No</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Name</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Register Number</th>
                        <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Department</th>
                        {isIQACHOD && (
                          <>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Change Course</th>
                            <th className="text-left px-4 py-3 text-sm font-semibold text-slate-700">Remove</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student: any, index) => (
                        <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm text-slate-700">{index + 1}</td>
                          <td className="px-4 py-3 text-sm text-slate-800 font-medium">{student.name}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{student.register_number}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{student.department}</td>
                          {isIQACHOD && (
                            <>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={pendingChanges[student.student_elective_id] ?? student.current_elective_id}
                                    onChange={(e) => {
                                      const newElectiveId = e.target.value;
                                      if (!student.student_elective_id) {
                                        alert('Student-elective row ID missing');
                                        return;
                                      }
                                      handleSelectChange(student.student_elective_id, newElectiveId);
                                    }}
                                    className="px-2 py-1 border rounded"
                                  >
                                    <option value="">Select</option>
                                      {availableSubElectives
                                        .filter((sub: any) => {
                                          const blocked = (sub.blocked_departments || []).map((b: any) => b.department);
                                          return !blocked.includes(student.department);
                                        })
                                        .map((sub: any) => (
                                          <option key={sub.id} value={sub.id}>{sub.sub_name} ({sub.course_code})</option>
                                        ))}
                                  </select>

                                  {/* Save / Cancel buttons when there is a pending change */}
                                  {pendingChanges[student.student_elective_id] && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        className="text-green-600 hover:bg-green-50 rounded p-1"
                                        onClick={() => savePendingChange(student.student_elective_id)}
                                        disabled={!!savingChange[student.student_elective_id]}
                                        title="Save"
                                      >
                                        <Check size={16} />
                                      </button>
                                      <button
                                        className="text-red-600 hover:bg-red-50 rounded p-1"
                                        onClick={() => cancelPendingChange(student.student_elective_id)}
                                        disabled={!!savingChange[student.student_elective_id]}
                                        title="Cancel"
                                      >
                                        <X size={16} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              <button
                                onClick={() => removeStudent(student.student_elective_id)}
                                className="flex items-center gap-2 px-2 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                                title="Remove student from elective"
                              >
                                <Trash className="h-4 w-4" />
                                <span className="hidden sm:inline">Remove</span>
                              </button>
                            </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50">
              <p className="text-sm text-slate-600">
                Total Students: <span className="font-semibold text-slate-800">{students.length}</span>
              </p>
              <button
                onClick={downloadExcel}
                disabled={students.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                Download Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
