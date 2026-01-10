import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { RefreshCw, Users, Eye } from 'lucide-react';
import { cache, getCacheKey, CACHE_TTL } from '../../lib/cache';

interface StudentRow {
  id: string;
  roll_no: string;
  reg_no: string;
  year: number;
  section: string;
  sem?: number | null;
  profile: {
    id: string;
    name: string;
    department: string;
  } | null;
  attendancePercentage: number;
}

export default function PrincipalStudentDetails() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  // include sems if needed in filters later
  const [years, setYears] = useState<number[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [serverSearchResults, setServerSearchResults] = useState<StudentRow[] | null>(null);
  const [attendanceDeferred, setAttendanceDeferred] = useState(false);
  
  // Filters
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [deptStudentIdsState, setDeptStudentIdsState] = useState<Set<string> | null>(null);
  const [transferringIds, setTransferringIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllVisible, setSelectAllVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  // HOD-style attendance filter (OD/Leave/Present/Absent/Late) and checkboxes
  const [attendanceType, setAttendanceType] = useState<'all' | 'od' | 'leave' | 'present' | 'absent' | 'late'>('all');
  const [attendanceDate, setAttendanceDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [attendanceMatchedIds, setAttendanceMatchedIds] = useState<string[]>([]);

  const [showBonafide, setShowBonafide] = useState(false);
  const [showGatepass, setShowGatepass] = useState(false);
  const [showOD, setShowOD] = useState(false);
  const [showLeave, setShowLeave] = useState(false);

  const [bonafideCounts, setBonafideCounts] = useState<Record<string, number>>({});
  const [gatepassCounts, setGatepassCounts] = useState<Record<string, number>>({});
  const [odCounts, setOdCounts] = useState<Record<string, number>>({});
  const [leaveCounts, setLeaveCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    // load departments (from profiles) so IQAC HOD sees all depts
    fetchDepartments();
    // ensure year filter includes all standard years
    setYears([1,2,3,4]);
    // Call fetchStudents on next tick to avoid referencing an arrow function
    // before it's initialized (prevents Temporal Dead Zone runtime error).
    setTimeout(() => { fetchStudents(); }, 0);
  }, []);

  // Re-fetch students when department or year filters change so sections update
  useEffect(() => {
    fetchStudents();
  }, [selectedDept, selectedYear]);

  useEffect(() => {
    applyFilters();
  }, [students, selectedDept, selectedYear, selectedSection, searchQuery, serverSearchResults]);

  // Server-side search when searching across all departments (selectedDept is empty)
  useEffect(() => {
    const runSearch = async () => {
      const q = (searchQuery || '').trim();
      if (!q || selectedDept) {
        setServerSearchResults(null);
        return;
      }

      try {
        // Find matching profile ids by name
        const { data: profileMatches } = await supabase.from('profiles').select('id').ilike('name', `%${q}%`);
        const profileIds = (profileMatches || []).map((p: any) => p.id).filter(Boolean);

        // Build queries: by profile ids, reg_no, roll_no
        const results: any[] = [];

        if (profileIds.length > 0) {
          // chunk profileIds to avoid long queries
          const MAX = 100;
          for (let i = 0; i < profileIds.length; i += MAX) {
            const chunk = profileIds.slice(i, i + MAX);
            const res = await supabase
              .from('students')
              .select('id, roll_no, reg_no, year, section, sem, profiles!students_id_fkey(id, name, department)')
              .in('id', chunk);
            if (res.data) results.push(...res.data);
          }
        }

        // reg_no matches
        const regRes = await supabase.from('students').select('id, roll_no, reg_no, year, section, sem, profiles!students_id_fkey(id, name, department)').ilike('reg_no', `%${q}%`);
        if (regRes.data) results.push(...regRes.data);

        // roll_no matches
        const rollRes = await supabase.from('students').select('id, roll_no, reg_no, year, section, sem, profiles!students_id_fkey(id, name, department)').ilike('roll_no', `%${q}%`);
        if (rollRes.data) results.push(...rollRes.data);

        // Deduplicate by id
        const seen = new Set<string>();
        const uniq: StudentRow[] = (results || []).filter((r: any) => r && r.id && !seen.has(r.id) && (function(){ seen.add(r.id); return true; })()).map((s: any) => {
          const prof = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
          return {
            id: s.id,
            roll_no: s.roll_no,
            reg_no: s.reg_no,
            year: s.year,
            section: s.section,
            sem: s.sem ?? null,
            profile: prof ? { id: prof.id, name: prof.name, department: prof.department } : null,
            attendancePercentage: 0,
          } as StudentRow;
        });

        // Optionally apply year/section filters on server results
        const filteredByYearSection = uniq.filter(s => {
          if (selectedYear && s.year?.toString() !== selectedYear) return false;
          if (selectedSection && s.section !== selectedSection) return false;
          return true;
        });

        setServerSearchResults(filteredByYearSection);
      } catch (err) {
        console.error('Server search failed', err);
        setServerSearchResults(null);
      }
    };

    // run async
    runSearch();
  }, [searchQuery, selectedDept, selectedYear, selectedSection]);

  const ATTENDANCE_THRESHOLD = 300;

  const fetchStudents = async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);

      const cacheKey = getCacheKey('principal_students', `${selectedDept}|${selectedYear}|${selectedSection}`);
      const yrNum = selectedYear ? Number(selectedYear) : null;

      // Pre-load all sections for the section filter dropdown
      try {
        const allSecsRes = await supabase
          .from('students')
          .select('section')
          .neq('section', null);
        if (!allSecsRes.error) {
          const allSecs = Array.from(new Set((allSecsRes.data || []).map((r: any) => r.section))).filter(Boolean) as string[];
          setSections(allSecs.sort());
        }
      } catch (e) {
        console.warn('Could not pre-load all sections', e);
      }
      if (!forceRefresh) {
        const cached = cache.get<StudentRow[]>(cacheKey);
        if (cached && cached.length > 0) {
          setStudents(cached);
          const secs = Array.from(new Set(cached.map(s => s.section).filter(Boolean))) as string[];
          setSections(secs.sort());
          setLoading(false);
          if (cached.length <= ATTENDANCE_THRESHOLD) {
            setAttendanceDeferred(false);
            setTimeout(() => calculateAttendanceForAll(cached), 100);
          } else {
            setAttendanceDeferred(true);
          }
          return;
        }
      }


      // Query students and include joined profile to avoid large IN(...) queries
      // If a department filter is selected, resolve matching profile ids and
      // filter students by those ids to avoid embedding filters on `profiles`.
      let deptStudentIds: string[] | null = null;
      if (selectedDept) {
        const profRes = await supabase.from('profiles').select('id').eq('department', selectedDept);
        if (profRes.error) {
          console.error('Error fetching profile ids for department', selectedDept, profRes.error);
          throw profRes.error;
        }
        deptStudentIds = (profRes.data || []).map((p: any) => p.id).filter(Boolean);
        // Persist resolved IDs so client-side filtering can rely on IDs
        setDeptStudentIdsState(new Set(deptStudentIds));
        if (deptStudentIds.length === 0) {
          // No students in this department
          setStudents([]);
          setFilteredStudents([]);
          setSections([]);
          // keep dept id state as empty set so filters show no students
          // (avoid setting to null which would fallback to profile-based filtering)
          setDeptStudentIdsState(new Set());
          setLoading(false);
          return;
        }
      }

      // Chunk student queries when filtering by department to avoid sending
      // extremely long GET query strings that hit proxy limits (HTTP 431).
      // Use a conservative chunk size and always perform chunked requests
      // when `deptStudentIds` is present (even small lists will be one chunk).
      const MAX_IDS_PER_STUDENT_QUERY = 100;
      let studentsData: any[] = [];

      if (deptStudentIds) {
        // Try using a POST RPC to avoid very long GET URLs (RPC uses POST)
        try {
          const rpcParams: any = {
            p_ids: deptStudentIds,
            p_year: selectedYear ? Number(selectedYear) : null,
            p_section: selectedSection || null,
          };
          const rpcRes = await supabase.rpc('get_students_for_frontend', rpcParams);
          if (!rpcRes.error && rpcRes.data) {
            // rpc returns rows with `profile` as jsonb
            studentsData = rpcRes.data.map((r: any) => ({
              id: r.id,
              roll_no: r.roll_no,
              reg_no: r.reg_no,
              year: r.year,
              section: r.section,
              sem: r.sem,
               profiles: r.profile ? [r.profile] : null,
            }));
          } else {
            console.warn('RPC get_students_for_frontend failed, falling back to chunked GETs', rpcRes.error);
          }
        } catch (rpcErr) {
          console.warn('RPC call failed, falling back to chunked GETs', rpcErr);
        }

        // If RPC did not populate studentsData, fall back to chunked GET queries
        if (!studentsData || studentsData.length === 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < deptStudentIds.length; i += MAX_IDS_PER_STUDENT_QUERY) {
            chunks.push(deptStudentIds.slice(i, i + MAX_IDS_PER_STUDENT_QUERY));
          }

          for (const chunk of chunks) {
            const chunkQuery = supabase
              .from('students')
              .select('id, roll_no, reg_no, year, section, sem, profiles!students_id_fkey(id, name, department)')
              .order('year')
              .order('section')
              .order('roll_no')
              .in('id', chunk);

            if (selectedYear) chunkQuery.eq('year', Number(selectedYear));
            if (selectedSection) chunkQuery.eq('section', selectedSection);

            const chunkRes = await chunkQuery;
            if (chunkRes.error) {
              console.warn('Error fetching students chunk:', chunkRes.error);
              continue;
            }
            (chunkRes.data || []).forEach((r: any) => studentsData.push(r));
          }

          // Deduplicate by id and keep original ordering
          const seen = new Set<string>();
          studentsData = studentsData.filter((s: any) => {
            if (!s || !s.id) return false;
            if (seen.has(s.id)) return false;
            seen.add(s.id);
            return true;
          });
        }
      } else {
        let query = supabase
          .from('students')
          .select('id, roll_no, reg_no, year, section, sem, profiles!students_id_fkey(id, name, department)')
          .order('year')
          .order('section')
          .order('roll_no');

        if (selectedYear) query = query.eq('year', Number(selectedYear));
        if (selectedSection) query = query.eq('section', selectedSection);

        const studentsResult = await query;
        if (studentsResult.error) {
          console.error('Error fetching students:', studentsResult.error);
          throw studentsResult.error;
        }

        studentsData = studentsResult.data || [];
      }

      if (studentsData.length === 0) {
        setStudents([]);
        setFilteredStudents([]);
        setLoading(false);
        return;
      }

      const studentRows: StudentRow[] = studentsData.map((s: any) => {
        const prof = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
        const profile = prof || null;
        return {
          id: s.id,
          roll_no: s.roll_no,
          reg_no: s.reg_no,
          year: s.year,
          section: s.section,
          sem: s.sem ?? null,
          profile: profile ? {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            department: profile.department
          } : null,
          attendancePercentage: 0,
        };
      });

      const secs = Array.from(new Set(studentRows.map(s => s.section).filter(Boolean))) as string[];
      setSections(secs.sort());

      cache.set(cacheKey, studentRows, CACHE_TTL.MEDIUM);
      setStudents(studentRows);
      setLoading(false);
      if (studentRows.length <= ATTENDANCE_THRESHOLD) {
        setAttendanceDeferred(false);
        setTimeout(() => calculateAttendanceForAll(studentRows), 100);
      } else {
        setAttendanceDeferred(true);
      }

    } catch (error) {
      console.error('Error fetching students:', error);
      try {
        console.error('Error (stringified):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      } catch (e) {
        console.error('Error stringifying fetch error', e);
      }
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('department')
        .neq('department', null);
      const deps = Array.from(new Set((data || []).map((d: any) => d.department))).filter(Boolean).sort();
      setDepartments(deps);
    } catch (err) {
      console.error('Error fetching departments', err);
    }
  };

  const updateFiltersFromData = (studentRows: StudentRow[]) => {
    // Departments are loaded from `profiles` to ensure IQAC HOD sees all departments
    const yrs = Array.from(new Set(studentRows.map(s => s.year).filter(Boolean))) as number[];
    setYears(yrs.sort());
    const secs = Array.from(new Set(studentRows.map(s => s.section).filter(Boolean))) as string[];
    setSections(secs.sort());
  };

  const calculateAttendanceForAll = async (studentRows: StudentRow[]) => {
    try {
      // mark that we're computing attendance now
      setAttendanceDeferred(false);
      const PERIODS_PER_DAY = 7;
      const studentIds = studentRows.map(s => s.id);

      if (!studentIds || studentIds.length === 0) {
        // Nothing to do
        return;
      }

      // Check cache for attendance data
      const attendanceCacheKey = getCacheKey('attendance_bulk', studentIds.length);
      const cachedAttendanceAny = cache.get<any>(attendanceCacheKey);

      if (cachedAttendanceAny) {
        console.log('Loading attendance from cache');
        // Normalize cached attendance into a Map<string, number>
        let attendanceMap: Map<string, number>;
        if (cachedAttendanceAny instanceof Map) {
          attendanceMap = cachedAttendanceAny as Map<string, number>;
        } else if (Array.isArray(cachedAttendanceAny)) {
          attendanceMap = new Map(cachedAttendanceAny);
        } else if (cachedAttendanceAny && typeof cachedAttendanceAny === 'object') {
          attendanceMap = new Map(Object.entries(cachedAttendanceAny).map(([k, v]) => [k, Number(v)]));
        } else {
          attendanceMap = new Map();
        }

        const updatedStudents = studentRows.map(student => ({
          ...student,
          attendancePercentage: attendanceMap.get(student.id) || 0
        }));
        setStudents(updatedStudents);

        // Update cache with complete data
        const cacheKey = getCacheKey('principal_students', 'all');
        cache.set(cacheKey, updatedStudents, CACHE_TTL.MEDIUM);
        return;
      }

      // Fetch ALL daily attendance in one query (chunk if too many ids)
      const MAX_IDS_PER_QUERY = 100; // reduced chunk size to avoid long GET URLs (431)
      const chunks: string[][] = [];
      for (let i = 0; i < studentIds.length; i += MAX_IDS_PER_QUERY) {
        chunks.push(studentIds.slice(i, i + MAX_IDS_PER_QUERY));
      }

      const dailyData: any[] = [];
      const periodData: any[] = [];

      for (const chunk of chunks) {
        const dailyRes = await supabase
          .from('daily_attendance')
          .select('student_id, date, status')
          .in('student_id', chunk);
        if (dailyRes.error) console.warn('Error fetching daily attendance chunk:', dailyRes.error);
        (dailyRes.data || []).forEach((d: any) => dailyData.push(d));

        const periodRes = await supabase
          .from('period_attendance')
          .select('student_id, date, period, status')
          .in('student_id', chunk);
        if (periodRes.error) console.warn('Error fetching period attendance chunk:', periodRes.error);
        (periodRes.data || []).forEach((p: any) => periodData.push(p));
      }

      // Build attendance map for all students in memory
      const studentAttendanceMap = new Map<string, Map<string, Map<number, string>>>();

      // Process daily attendance
      (dailyData || []).forEach((day: any) => {
        const studentId = day.student_id;
        const dateKey = day.date;

        if (!studentAttendanceMap.has(studentId)) {
          studentAttendanceMap.set(studentId, new Map());
        }
        const studentMap = studentAttendanceMap.get(studentId)!;

        if (!studentMap.has(dateKey)) {
          studentMap.set(dateKey, new Map());
        }
        const dayMap = studentMap.get(dateKey)!;

        // Daily attendance applies to all periods
        for (let period = 1; period <= PERIODS_PER_DAY; period++) {
          dayMap.set(period, day.status);
        }
      });

      // Process period attendance (overrides daily)
      (periodData || []).forEach((record: any) => {
        const studentId = record.student_id;
        const dateKey = record.date;

        if (!studentAttendanceMap.has(studentId)) {
          studentAttendanceMap.set(studentId, new Map());
        }
        const studentMap = studentAttendanceMap.get(studentId)!;

        if (!studentMap.has(dateKey)) {
          studentMap.set(dateKey, new Map());
        }
        const dayMap = studentMap.get(dateKey)!;
        dayMap.set(record.period, record.status);
      });

      // Calculate percentages for all students
      const attendancePercentages = new Map<string, number>();
      const updatedStudents = studentRows.map(student => {
        const attendanceMap = studentAttendanceMap.get(student.id);
        let percentage = 0;

        if (attendanceMap) {
          let totalPeriods = 0;
          let presentCount = 0;
          let lateCount = 0;
          let odCount = 0;

          attendanceMap.forEach((dayMap: Map<number, string>) => {
            dayMap.forEach((status: string) => {
              totalPeriods++;
              switch (status) {
                case 'present':
                  presentCount++;
                  break;
                case 'late':
                  lateCount++;
                  break;
                case 'od':
                  odCount++;
                  break;
              }
            });
          });

          const attended = presentCount + odCount + lateCount;
          percentage = totalPeriods > 0 ? Math.round((attended / totalPeriods) * 100) : 0;
        }

        attendancePercentages.set(student.id, percentage);
        return {
          ...student,
          attendancePercentage: percentage
        };
      });

      // Cache attendance percentages for fast subsequent loads
      cache.set(attendanceCacheKey, attendancePercentages, CACHE_TTL.SHORT);

      // Cache complete student data with attendance
      const studentsCacheKey = getCacheKey('principal_students', 'all');
      cache.set(studentsCacheKey, updatedStudents, CACHE_TTL.MEDIUM);

      setStudents(updatedStudents);
      console.log('Finished loading attendance for all students');
    } catch (error) {
      console.error('Error calculating attendance:', error);
    }
  };

  const transferStudentSem = async (student: StudentRow) => {
    try {
      const current = student.sem ?? 0;
      const nextSem = current + 1;
      const confirmMsg = `Transfer ${student.profile?.name || student.roll_no} from sem ${current || '-'} to ${nextSem}?`;
      if (!window.confirm(confirmMsg)) return;

      setTransferringIds(prev => new Set(prev).add(student.id));

      const { data, error } = await supabase
        .from('students')
        .update({ sem: nextSem })
        .eq('id', student.id)
        .select('sem');

      if (error) {
        console.error('Error transferring sem', error);
        alert('Error transferring semester');
        setTransferringIds(prev => { const s = new Set(prev); s.delete(student.id); return s; });
        return;
      }

      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, sem: nextSem } : s));
      setFilteredStudents(prev => prev.map(s => s.id === student.id ? { ...s, sem: nextSem } : s));
      setTransferringIds(prev => { const s = new Set(prev); s.delete(student.id); return s; });
      alert(`Student transferred to sem ${nextSem}`);
    } catch (err) {
      console.error('Unexpected error transferring sem', err);
      alert('Unexpected error transferring semester');
      setTransferringIds(prev => { const s = new Set(prev); s.delete(student.id); return s; });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id); else copy.add(id);
      return copy;
    });
  };

  const toggleSelectAllVisible = () => {
    if (!selectAllVisible) {
      const ids = filteredStudents.map(s => s.id);
      setSelectedIds(new Set(ids));
      setSelectAllVisible(true);
    } else {
      setSelectedIds(new Set());
      setSelectAllVisible(false);
    }
  };

  const transferSelectedToSem = async (semValue: number | '') => {
    if (semValue === '' || semValue == null) {
      alert('Please choose a target sem');
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      alert('No students selected');
      return;
    }
    const confirmed = window.confirm(`Transfer ${ids.length} student(s) to sem ${semValue}?`);
    if (!confirmed) return;

    setTransferringIds(prev => {
      const next = new Set(prev);
      ids.forEach(i => next.add(i));
      return next;
    });

    try {
      const MAX_IDS_PER_BATCH = 100;
      for (let i = 0; i < ids.length; i += MAX_IDS_PER_BATCH) {
        const chunk = ids.slice(i, i + MAX_IDS_PER_BATCH);
        const res = await supabase.from('students').update({ sem: semValue }).in('id', chunk).select('id, sem');
        if (res.error) console.error('Bulk transfer chunk error', res.error);
      }

      // Update local state and caches
      setStudents(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, sem: Number(semValue) } : s));
      setFilteredStudents(prev => prev.map(s => selectedIds.has(s.id) ? { ...s, sem: Number(semValue) } : s));

      try {
        const keyView = getCacheKey('principal_students', `${selectedDept}|${selectedYear}|${selectedSection}`);
        const cachedView = cache.get<StudentRow[]>(keyView);
        if (cachedView) {
          const updated = cachedView.map(s => selectedIds.has(s.id) ? { ...s, sem: Number(semValue) } : s);
          cache.set(keyView, updated, CACHE_TTL.MEDIUM);
        }
        const keyAll = getCacheKey('principal_students', 'all');
        const cachedAll = cache.get<StudentRow[]>(keyAll);
        if (cachedAll) {
          const updatedAll = cachedAll.map(s => selectedIds.has(s.id) ? { ...s, sem: Number(semValue) } : s);
          cache.set(keyAll, updatedAll, CACHE_TTL.MEDIUM);
        }
      } catch (e) {
        console.warn('Could not update caches after bulk sem transfer', e);
      }

      // Clear selection
      setSelectedIds(new Set());
      setSelectAllVisible(false);
      alert('Bulk sem transfer completed');
    } catch (e) {
      console.error('Error bulk transferring sem', e);
      alert('Error during bulk transfer; see console');
    } finally {
      setTransferringIds(prev => {
        const next = new Set(prev);
        ids.forEach(i => next.delete(i));
        return next;
      });
    }
  };

  const applyFilters = () => {
    let filtered = [...students];

    // If searching across all departments, prefer server-side search results when available
    if (!selectedDept && searchQuery && serverSearchResults) {
      filtered = serverSearchResults.slice();
    }

    if (selectedDept) {
      if (deptStudentIdsState) {
        filtered = filtered.filter(s => deptStudentIdsState.has(s.id));
      } else {
        filtered = filtered.filter(s => s.profile?.department === selectedDept);
      }
    }

    if (selectedYear) {
      filtered = filtered.filter(s => s.year.toString() === selectedYear);
    }

    if (selectedSection) {
      filtered = filtered.filter(s => s.section === selectedSection);
    }

    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      // If we used serverSearchResults above, skip client-side filtering
      if (!( !selectedDept && serverSearchResults )) {
        filtered = filtered.filter(s => {
          const name = (s.profile?.name || '').toString().toLowerCase();
          const reg = (s.reg_no || '').toString().toLowerCase();
          const roll = (s.roll_no || '').toString().toLowerCase();
          return name.includes(q) || reg.includes(q) || roll.includes(q);
        });
      }
    }

    // attendance percentage filter removed — keep attendance type filter only

    setFilteredStudents(filtered);
  };

  // Attendance match effect (OD/Leave/Present/Absent/Late) using filteredStudents as source
  useEffect(() => {
    const fetchMatches = async () => {
      if (attendanceType === 'all' || !attendanceDate || filteredStudents.length === 0) {
        setAttendanceMatchedIds([]);
        return;
      }

      try {
        const studentIds = filteredStudents.map(s => String(s.id));

        // Batch queries to avoid 431 "Request Header Fields Too Large" errors
        const MAX_IDS_PER_QUERY = 100;
        const chunks: string[][] = [];
        for (let i = 0; i < studentIds.length; i += MAX_IDS_PER_QUERY) {
          chunks.push(studentIds.slice(i, i + MAX_IDS_PER_QUERY));
        }

        if (attendanceType === 'od') {
          const allData: any[] = [];
          for (const chunk of chunks) {
            const { data } = await supabase.from('od_applications').select('student_id, from_date, to_date').in('student_id', chunk).eq('status', 'approved');
            if (data) allData.push(...data);
          }
          const matched = allData.filter((app: any) => {
            const fromDate = new Date(app.from_date);
            const toDate = new Date(app.to_date);
            const checkDate = new Date(attendanceDate);
            return checkDate >= fromDate && checkDate <= toDate;
          }).map((a: any) => String(a.student_id));
          setAttendanceMatchedIds(Array.from(new Set(matched)));
          return;
        }

        if (attendanceType === 'leave') {
          const allData: any[] = [];
          for (const chunk of chunks) {
            const { data } = await supabase.from('leave_applications').select('student_id, from_date, to_date').in('student_id', chunk).eq('status', 'approved');
            if (data) allData.push(...data);
          }
          const matched = allData.filter((app: any) => {
            const fromDate = new Date(app.from_date);
            const toDate = new Date(app.to_date);
            const checkDate = new Date(attendanceDate);
            return checkDate >= fromDate && checkDate <= toDate;
          }).map((a: any) => String(a.student_id));
          setAttendanceMatchedIds(Array.from(new Set(matched)));
          return;
        }

        // Query daily and period attendance in batches
        const dailyDataAll: any[] = [];
        const periodDataAll: any[] = [];
        for (const chunk of chunks) {
          const [dailyRes, periodRes] = await Promise.all([
            supabase.from('daily_attendance').select('student_id, date, status').in('student_id', chunk).eq('date', attendanceDate),
            supabase.from('period_attendance').select('student_id, date, period, status').in('student_id', chunk).eq('date', attendanceDate)
          ]);
          if (dailyRes.data) dailyDataAll.push(...dailyRes.data);
          if (periodRes.data) periodDataAll.push(...periodRes.data);
        }

        const dailyMap = new Map(dailyDataAll.map((d: any) => [String(d.student_id), d.status]));
        const periodMap = new Map<string, string[]>();
        periodDataAll.forEach((p: any) => {
          const sid = String(p.student_id);
          if (!periodMap.has(sid)) periodMap.set(sid, []);
          periodMap.get(sid)!.push(p.status);
        });

        const matched: string[] = [];
        for (const sid of studentIds) {
          const dStatus = dailyMap.get(sid);
          const pStatuses = periodMap.get(sid) || [];

          if (attendanceType === 'present') {
            if (dStatus === 'present' || pStatuses.includes('present')) { matched.push(sid); continue; }
          }
          if (attendanceType === 'late') {
            if (dStatus === 'late' || pStatuses.includes('late')) { matched.push(sid); continue; }
          }
          if (attendanceType === 'absent') {
            if (dStatus === 'absent' || (pStatuses.length > 0 && pStatuses.every((st) => st === 'absent'))) { matched.push(sid); continue; }
          }
        }

        setAttendanceMatchedIds(Array.from(new Set(matched)));
      } catch (err) {
        console.error('Principal: error fetching attendance matches', err);
        setAttendanceMatchedIds([]);
      }
    };

    fetchMatches();
  }, [attendanceType, attendanceDate, filteredStudents]);

  // Fetch per-student application counts when filteredStudents or checkboxes change
  useEffect(() => {
    const fetchCounts = async () => {
      const studentIds = filteredStudents.map(s => String(s.id));
      if (studentIds.length === 0) {
        setBonafideCounts({}); setGatepassCounts({}); setOdCounts({}); setLeaveCounts({}); return;
      }

      try {
        if (showBonafide) {
          const { data } = await supabase.from('bonafide_applications').select('student_id').in('student_id', studentIds).eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[String(r.student_id)] = (map[String(r.student_id)] || 0) + 1; });
          setBonafideCounts(map);
        } else setBonafideCounts({});

        if (showGatepass) {
          const { data } = await supabase.from('gatepass_applications').select('student_id').in('student_id', studentIds).eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[String(r.student_id)] = (map[String(r.student_id)] || 0) + 1; });
          setGatepassCounts(map);
        } else setGatepassCounts({});

        if (showOD) {
          const { data } = await supabase.from('od_applications').select('student_id').in('student_id', studentIds).eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[String(r.student_id)] = (map[String(r.student_id)] || 0) + 1; });
          setOdCounts(map);
        } else setOdCounts({});

        if (showLeave) {
          const { data } = await supabase.from('leave_applications').select('student_id').in('student_id', studentIds).eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[String(r.student_id)] = (map[String(r.student_id)] || 0) + 1; });
          setLeaveCounts(map);
        } else setLeaveCounts({});
      } catch (err) {
        console.error('Principal: error fetching counts', err);
      }
    };

    fetchCounts();
  }, [filteredStudents, showBonafide, showGatepass, showOD, showLeave]);

  // derive final displayed students based on attendanceType
  const displayedStudents = attendanceType === 'all' ? filteredStudents : filteredStudents.filter(s => attendanceMatchedIds.includes(String(s.id)));
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-24 pr-4">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Student Details</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">View all students and their attendance</p>
          </div>
          <button
            onClick={() => fetchStudents(true)}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

          <div className="mb-4">
          

          {/* attendance summary box removed per request */}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Department</label>
              <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All Departments</option>
                {departments.map((dept) => (<option key={dept} value={dept}>{dept}</option>))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Year</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All Years</option>
                {years.map((yr) => (<option key={yr} value={yr}>{yr}</option>))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Section</label>
              <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All Sections</option>
                {sections.map((sec) => (<option key={sec} value={sec}>{sec}</option>))}
              </select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">Attendance Type</label>
                <select value={attendanceType} onChange={(e) => setAttendanceType(e.target.value as any)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="all">All Students</option>
                  <option value="od">With OD</option>
                  <option value="leave">On Leave</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
              
              {attendanceType !== 'all' && (
                <div className="mt-2 sm:mt-0">
                  <label className="block text-sm text-gray-600 mb-1">Date</label>
                  <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
            </div>

            
          </div>

          {/* Search moved to its own row below filters; checkboxes moved to the right of the search */}
          <div className="mb-4 mt-3 flex items-start justify-between gap-4">
            <div className="w-full sm:w-1/2 lg:w-1/3">
              <label className="block text-sm text-gray-600 mb-1">Search</label>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Name, Reg no or Roll no" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={showBonafide} onChange={(e) => setShowBonafide(e.target.checked)} /> <span className="text-slate-700">Bonafide</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={showGatepass} onChange={(e) => setShowGatepass(e.target.checked)} /> <span className="text-slate-700">Gatepass</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={showOD} onChange={(e) => setShowOD(e.target.checked)} /> <span className="text-slate-700">OD</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={showLeave} onChange={(e) => setShowLeave(e.target.checked)} /> <span className="text-slate-700">Leave</span></label>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><div className="text-gray-500 text-sm sm:text-base">Loading students...</div></div>
        ) : displayedStudents.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 sm:p-8 text-center"><Users className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3" /><p className="text-gray-600 text-sm sm:text-base">No students found.</p></div>
        ) : (
          <>
            {attendanceDeferred && (
              <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                Large result set ({students.length} students) — attendance calculation is deferred to avoid slow queries.
                <button onClick={() => { setAttendanceDeferred(false); setTimeout(() => calculateAttendanceForAll(students), 50); }} className="ml-3 inline-flex items-center px-3 py-1 bg-yellow-600 text-white rounded text-xs">Load attendance</button>
              </div>
            )}

            <div className="hidden lg:block bg-white rounded-lg shadow overflow-x-auto w-full">
              <table className="min-w-full w-full table-auto divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><input type="checkbox" checked={selectAllVisible} onChange={toggleSelectAllVisible} /></th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reg No</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sem</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attendance %</th>
                    {showBonafide && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bonafide</th>}
                    {showGatepass && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gatepass</th>}
                    {showOD && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OD</th>}
                    {showLeave && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave</th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-4 whitespace-nowrap text-sm"><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} /></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.reg_no}</td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">{s.profile?.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.profile?.department || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.year}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.sem ?? '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.section}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.attendancePercentage >= 75 ? 'bg-green-100 text-green-800' : s.attendancePercentage >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{s.attendancePercentage}%</span>
                        <div className="mt-2"><button onClick={() => navigate(`/principal/student/${s.id}`)} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"><Eye className="w-4 h-4" />View</button></div>
                      </td>
                      {showBonafide && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bonafideCounts[s.id] || 0}</td>}
                      {showGatepass && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{gatepassCounts[s.id] || 0}</td>}
                      {showOD && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{odCounts[s.id] || 0}</td>}
                      {showLeave && <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{leaveCounts[s.id] || 0}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-4">
              {displayedStudents.map((s) => (
                <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center mr-3"><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} /></div>
                    <div className="flex-1 min-w-0"><h3 className="text-sm font-semibold text-gray-900 truncate">{s.profile?.name || '-'}</h3></div>
                    <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${s.attendancePercentage >= 75 ? 'bg-green-100 text-green-800' : s.attendancePercentage >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{s.attendancePercentage}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div><span className="text-gray-500">Reg No:</span><span className="ml-1 font-medium">{s.reg_no}</span></div>
                    <div><span className="text-gray-500">Year:</span><span className="ml-1 font-medium">{s.year}</span></div>
                    <div><span className="text-gray-500">Sem:</span><span className="ml-1 font-medium">{s.sem ?? '-'}</span></div>
                    <div><span className="text-gray-500">Section:</span><span className="ml-1 font-medium">{s.section}</span></div>
                    <div className="col-span-2"><span className="text-gray-500">Department:</span><span className="ml-1 font-medium">{s.profile?.department || '-'}</span></div>
                  </div>
                  {(showBonafide || showGatepass || showOD || showLeave) && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {showBonafide && <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Bonafide: {bonafideCounts[s.id] || 0}</span>}
                      {showGatepass && <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Gatepass: {gatepassCounts[s.id] || 0}</span>}
                      {showOD && <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">OD: {odCounts[s.id] || 0}</span>}
                      {showLeave && <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Leave: {leaveCounts[s.id] || 0}</span>}
                    </div>
                  )}
                  <div className="space-y-2"><button onClick={() => navigate(`/principal/student/${s.id}`)} className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"><Eye className="w-4 h-4" />View Profile</button></div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 text-sm text-gray-600">Total Students: {displayedStudents.length}</div>
      </div>
    </DashboardLayout>
  );
}
