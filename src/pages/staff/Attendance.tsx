import { useEffect, useState } from 'react';
import { ClipboardCheck, Calendar, Save, Users, CheckCircle, XCircle, BookOpen, Clock, FileText, Plane } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { fetchInChunks } from '../../lib/supabaseHelpers';
import { useAuth } from '../../contexts/AuthContext';

interface Student {
  id: string;
  reg_no: string;
  roll_no: string;
  year: number;
  section: string;
  profile?: {
    name: string;
  };
}

interface Subject {
  id: string;
  subject_code: string;
  name: string;
  year: number;
  section: string;
  department: string;
}

interface TimetableEntry {
  period: number;
  day: string;
  subject_id: string;
}

type RPCAttendance = {
  subject_id: string;
  subject_code?: string | null;
  subject_name?: string | null;
  period: number;
  year: number;
  section?: string | null;
  student_count: number;
  attendance: Array<{ student_id: string; reg_no?: string; roll_no?: string; name?: string; status?: string }>;
  assigned_replacement?: string | null;
  assigned_period?: number | null;
};

type ReplacementRow = {
  id: string;
  target_staff: string;
  replacement_staff: string;
  for_date: string;
  created_by?: string;
  created_at?: string;
  period?: number;
};

interface AttendanceRecord {
  student_id: string;
  status: 'present' | 'absent' | 'late' | 'od' | 'leave';
}

export default function Attendance() {
  const { user, profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  // Separate date selection for Alter (replacement) mode so replacements can be
  // inspected for arbitrary dates without changing the main attendance date.
  const [alterDate, setAlterDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Map<string, 'present' | 'absent' | 'late' | 'od' | 'leave'>>(new Map());
  const [year, setYear] = useState<number | null>(null);
  const [section, setSection] = useState<string | null>(null);
  
  // New states for attendance type
  const [attendanceType, setAttendanceType] = useState<'daily' | 'period'>('daily');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [periodNumber, setPeriodNumber] = useState<number | null>(null);
  const [canMarkDaily, setCanMarkDaily] = useState(false);
  const [canMarkPeriod, setCanMarkPeriod] = useState(false);
  const [isDeptAdmin, setIsDeptAdmin] = useState(false);
  const [fullDaySelectedPeriod, setFullDaySelectedPeriod] = useState<Record<string, number | null>>({});
  const [fullDaySelectedRow, setFullDaySelectedRow] = useState<Record<string, RPCAttendance | null>>({});
  const [showPeriodSelection, setShowPeriodSelection] = useState(true);
  const [availablePeriods, setAvailablePeriods] = useState<TimetableEntry[]>([]);
  const [effectiveSubjectId, setEffectiveSubjectId] = useState<string | null>(null);
  // Alter (replacement) mode
  const [alterMode, setAlterMode] = useState(false);
  const [alterResults, setAlterResults] = useState<Array<{ target_id: string; target_name: string; rows: RPCAttendance[]; full_day?: boolean; assigned_periods?: number[]; caller_is_replacement?: boolean }>>([]);
  const [loadingAlter, setLoadingAlter] = useState(false);
  const [alterAttendanceType, setAlterAttendanceType] = useState<'daily' | 'period'>('period');
  const [dailyAttendanceMap, setDailyAttendanceMap] = useState<Record<string, string>>({});
  const [alterClassStudents, setAlterClassStudents] = useState<Record<string, Record<string, Student[]>>>({});
  const [periodAttendanceMap, setPeriodAttendanceMap] = useState<Record<string, string>>({});
  // Editable attendance state for Alter mode. Structure: { [blockId]: { [classKey]: { [studentId]: status } } }
  const [alterAttendanceState, setAlterAttendanceState] = useState<Record<string, Record<string, Record<string, 'present' | 'absent' | 'late' | 'od' | 'leave'>>>>({});
  const [alterSavingState, setAlterSavingState] = useState<Record<string, Record<string, boolean>>>({});

  const normalizeStatus = (s?: string): 'present' | 'absent' | 'late' | 'od' | 'leave' => {
    if (!s) return 'present';
    const v = s.toString().toLowerCase();
    if (v === 'absent') return 'absent';
    if (v === 'late') return 'late';
    if (v === 'od') return 'od';
    if (v === 'leave') return 'leave';
    return 'present';
  };

  useEffect(() => {
    if (user) {
      fetchStaffDetails();
      fetchStaffSubjects();
    }
    // Re-run when selectedDate changes so HOD sees only subjects scheduled on that day
  }, [user, profile, selectedDate]);

  useEffect(() => {
    // reload replacements when alterDate changes
    if (alterMode) {
      loadMyReplacements();
    }
  }, [alterDate]);

  useEffect(() => {
    if (alterAttendanceType === 'daily' && alterResults.length > 0) {
      fetchAlterDailyData();
    }
  }, [alterAttendanceType, alterResults, alterDate]);

  // Initialize alterAttendanceState when alterResults or dailyAttendanceMap or alterClassStudents change
  useEffect(() => {
    if (!alterResults || alterResults.length === 0) return;

    setAlterAttendanceState(prev => {
      const next = { ...prev };

      for (const block of alterResults) {
        const blockId = block.target_id;
        if (!next[blockId]) next[blockId] = {};

        // Period rows
        for (const r of block.rows || []) {
          const clsKey = `period_${r.subject_id}_${r.period}_${r.year}_${(r.section || '')}`;
          if (!next[blockId][clsKey]) {
            next[blockId][clsKey] = {};
            // initialize from RPC attendance if available
            (r.attendance || []).forEach((a: any) => {
              next[blockId][clsKey][a.student_id] = (a.status as any) || (a.period_status as any) || 'present';
            });
            // prefer period attendance fetched separately when available
            // periodAttendanceMap key format: `${subject_id}_${period}_${student_id}`
            for (const sid of Object.keys(next[blockId][clsKey])) {
              const pKey = `${r.subject_id}_${r.period}_${sid}`;
              if (periodAttendanceMap[pKey]) {
                next[blockId][clsKey][sid] = periodAttendanceMap[pKey] as any;
              }
            }
          }
          // Also ensure students from roster are present (if roster exists)
          const roster = alterClassStudents?.[blockId]?.[`${r.year}_${r.section || ''}`];
          if (roster && roster.length > 0) {
                roster.forEach(s => {
              if (!next[blockId][clsKey][s.id]) {
                // prefer period attendance first, then daily map for defaults
                const pKey = `${r.subject_id}_${r.period}_${s.id}`;
                if (periodAttendanceMap[pKey]) {
                  next[blockId][clsKey][s.id] = normalizeStatus(periodAttendanceMap[pKey]) as 'present' | 'absent' | 'late' | 'od' | 'leave';
                } else {
                  next[blockId][clsKey][s.id] = normalizeStatus(dailyAttendanceMap[s.id]) as 'present' | 'absent' | 'late' | 'od' | 'leave';
                }
              }
            });
          }
        }

        // Daily class keys
        const classKeys = new Set<string>();
        block.rows.forEach(r => classKeys.add(`${r.year}_${r.section || ''}`));
        for (const key of Array.from(classKeys)) {
          const clsKey = `daily_${key}`;
          if (!next[blockId][clsKey]) {
            next[blockId][clsKey] = {};
            // prefer roster students
            const roster = alterClassStudents?.[blockId]?.[key] || [];
            if (roster.length > 0) {
              roster.forEach(s => {
                next[blockId][clsKey][s.id] = normalizeStatus(dailyAttendanceMap[s.id]) as 'present' | 'absent' | 'late' | 'od' | 'leave';
              });
            } else {
              // fallback to RPC attendance payload
              const seen = new Set<string>();
              block.rows.forEach(r => {
                (r.attendance || []).forEach((a: any) => {
                  const k = `${r.year}_${r.section || ''}`;
                  if (k !== key) return;
                  if (!seen.has(a.student_id)) {
                    seen.add(a.student_id);
                    next[blockId][clsKey][a.student_id] = dailyAttendanceMap[a.student_id] || a.daily_status || a.status || 'present';
                  }
                });
              });
            }
          }
        }
      }

      return next;
    });
  }, [alterResults, dailyAttendanceMap, alterClassStudents, periodAttendanceMap]);
  // include periodAttendanceMap so initialisation uses period-level statuses when available



  const fetchAlterDailyData = async (resultsParam?: Array<{ target_id: string; target_name: string; rows: RPCAttendance[] }>) => {
    try {
      const source = resultsParam || alterResults;
      // First fetch full class student lists for each target staff and class
      const classStudentsMap: Record<string, Record<string, Student[]>> = {};

      for (const block of source) {
        const perTargetMap: Record<string, Student[]> = {};
        const classKeys = new Set<string>();
        block.rows.forEach(r => {
          const secVal = r.section ?? '';
          const key = `${r.year}_${secVal}`;
          classKeys.add(key);
        });

        for (const key of Array.from(classKeys)) {
          const [yr, secRaw] = key.split('_');
          const sec = secRaw === undefined ? '' : secRaw;
          try {
            const { data: studentsData, error: studentsError } = await supabase
              .from('students')
              .select('id, reg_no, roll_no, year, section')
              .eq('year', Number(yr))
              // only filter by section when we have a non-empty section
              .match(sec !== '' ? { section: sec } : {})
              .order('roll_no', { ascending: true });

            if (studentsError) {
              console.error('Error fetching class students for alter daily:', studentsError);
              perTargetMap[key] = [];
              continue;
            }

            const studentsList = (studentsData || []) as Student[];
            if (studentsList.length === 0) {
              perTargetMap[key] = [];
              continue;
            }

            const studentIds = studentsList.map(s => s.id);
            const profilesData = await fetchInChunks('profiles', 'id, name', 'id', studentIds as string[]);
            const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

            const studentsWithProfiles = studentsList.map(s => ({ ...s, profile: profilesMap.get(s.id) }));
            perTargetMap[key] = studentsWithProfiles;
          } catch (e) {
            console.error('Error fetching students/profiles for class', key, e);
            perTargetMap[key] = [];
          }
        }

        classStudentsMap[block.target_id] = perTargetMap;
      }

      setAlterClassStudents(classStudentsMap);
      console.debug('Alter class rosters:', classStudentsMap);

      // Then fetch daily attendance for all student ids found in those class rosters
      const allIds = new Set<string>();
      Object.values(classStudentsMap).forEach(perTarget => {
        Object.values(perTarget).forEach(list => list.forEach(s => allIds.add(s.id)));
      });

      // Also include ids from RPC-provided attendance as a fallback
      source.forEach(block => {
        block.rows.forEach(r => {
          (r.attendance || []).forEach((a: any) => allIds.add(a.student_id));
        });
      });

      const ids = Array.from(allIds);
      if (ids.length === 0) {
        setDailyAttendanceMap({});
        return;
      }

      const dailyData = await fetchInChunks('daily_attendance', 'student_id, status', 'student_id', ids);
      const map: Record<string, string> = {};
      (dailyData || []).forEach((d: any) => {
        map[d.student_id] = d.status;
      });
      setDailyAttendanceMap(map);
      // Fetch period attendance for these student ids (for the selected date)
      try {
        const periodData = await fetchInChunks('period_attendance', 'student_id, subject_id, period, status', 'student_id', ids);
        const pmap: Record<string, string> = {};
        (periodData || []).forEach((p: any) => {
          const key = `${p.subject_id}_${p.period}_${p.student_id}`;
          pmap[key] = p.status;
        });
        setPeriodAttendanceMap(pmap);
      } catch (e) {
        console.error('Error fetching period attendance', e);
        setPeriodAttendanceMap({});
      }
      console.debug('Alter daily statuses:', map);
    } catch (e) {
      console.error('Error fetching alter daily data', e);
      setDailyAttendanceMap({});
      setAlterClassStudents({});
    }
  };

  useEffect(() => {
    // Re-fetch timetable when selected subject, selected date, attendance type or user changes.
    if (selectedSubject && attendanceType === 'period') {
      fetchTimetableForSubject();
    }
  }, [selectedSubject, selectedDate, attendanceType, user?.id]);

  useEffect(() => {
    if (attendanceType === 'daily' && canMarkDaily) {
      fetchStudentsForDaily();
    } else if (attendanceType === 'period' && selectedSubject && periodNumber !== null) {
      setShowPeriodSelection(false);
      fetchStudentsForSubject();
    }
  }, [attendanceType, canMarkDaily, selectedSubject, periodNumber, selectedDate]);

  const fetchStaffDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('staff_role, year, section')
        .eq('id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setYear(data.year);
        setSection(data.section);
        setStaffRole(data.staff_role ?? null);
        
        // Advisor can mark daily attendance
        if (data.staff_role === 'advisor') {
          setCanMarkDaily(true);
          setAttendanceType('daily');
        } else {
          setAttendanceType('period');
        }
      }
    } catch (error) {
      console.error('Error fetching staff details:', error);
    }
  };

  const fetchStaffSubjects = async () => {
    try {
      // If the current user is HOD/AHOD, load only subjects assigned to them
      // that are scheduled on the currently selected date (period-wise).
      if (profile && (profile.role === 'hod' || profile.role === 'ahod')) {
        const hodId = profile.id as string;
        // Compute dbDay from selectedDate (same conversion as elsewhere)
        const jsDay = new Date(selectedDate).getDay();
        const dbDay = jsDay === 0 ? 0 : jsDay === 6 ? 0 : jsDay;

        // If weekend, nothing to show
        if (dbDay === 0) {
          setSubjects([]);
          setCanMarkPeriod(false);
          setSelectedSubject('');
          return;
        }

        // 1) subjects where staff_id == hodId
        const { data: mySubjData } = await supabase
          .from('subjects')
          .select('id')
          .eq('staff_id', hodId);
        const subjIds = (mySubjData || []).map((s: any) => s.id);

        // 2) electives where staff_id == hodId -> collect parent_subject_id and elective id
        const { data: myElects } = await supabase
          .from('electives')
          .select('id, parent_subject_id')
          .eq('staff_id', hodId);
        const electIds = (myElects || []).map((e: any) => e.id);
        const parentIds = (myElects || []).map((e: any) => e.parent_subject_id).filter(Boolean);

        // Also include subject_ids from staff_timetables where this HOD is assigned
        // for specific periods (covers cases where staff assignments are stored per-slot)
        const { data: stRows, error: stErr } = await supabase
          .from('staff_timetables')
          .select('subject_id')
          .eq('staff_id', hodId)
          .eq('day_of_week', dbDay);
        if (stErr) console.debug('Failed to load staff_timetables for HOD subject discovery', stErr);
        const stIds = (stRows || []).map((r: any) => r.subject_id).filter(Boolean as any) as string[];

        const allowedIds = Array.from(new Set([...subjIds, ...parentIds, ...electIds, ...stIds]));
        if (allowedIds.length === 0) {
          // nothing assigned to this HOD
          setSubjects([]);
          setCanMarkPeriod(false);
          setSelectedSubject('');
          return;
        }

        // Query timetable for this day where subject_id is one of allowedIds
        const ttData = await fetchInChunks('timetables', 'distinct subject_id', 'subject_id', allowedIds as string[]);
        if (!ttData) {
          console.error('Timetable query error for HOD subjects');
          setSubjects([]);
          setCanMarkPeriod(false);
          setSelectedSubject('');
          return;
        }

        const ttSubjectIds = Array.from(new Set((ttData || []).map((r: any) => r.subject_id))).filter(Boolean) as string[];
        // Combine timetable subject_ids with subject_ids discovered from staff_timetables
        const combinedIds = Array.from(new Set([...(ttSubjectIds || []), ...(stIds || [])])).filter(Boolean) as string[];
        console.debug('HOD subject discovery:', { hodId, dbDay, subjIds, electIds, parentIds, stIds, allowedIds, ttSubjectIds, combinedIds, ttData });
        if (combinedIds.length === 0) {
          setSubjects([]);
          setCanMarkPeriod(false);
          setSelectedSubject('');
          return;
        }

        // Fetch subject rows for those timetable subject ids
        const subjectsData = await fetchInChunks('subjects', 'id, subject_code, name, year, section, department', 'id', combinedIds as string[]);
        if (!subjectsData) {
          console.error('Error fetching subjects for HOD timetable ids:', subjectsErr);
          setSubjects([]);
          setCanMarkPeriod(false);
          setSelectedSubject('');
          return;
        }
        if (subjectsData && subjectsData.length > 0) {
          setSubjects(subjectsData as Subject[]);
          setCanMarkPeriod(true);
          setSelectedSubject(subjectsData[0].id);
        } else {
          // No matching subjects found (timetable might reference parent or unexpected ids)
          setSubjects([]);
          setCanMarkPeriod(false);
          setSelectedSubject('');
        }
      } else {
        // Regular staff flow: subjects assigned to the staff member
        const { data, error } = await supabase
          .from('subjects')
          .select('id, subject_code, name, year, section, department')
          .eq('staff_id', user?.id)
          .order('year', { ascending: true })
          .order('section', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          setSubjects(data);
          setCanMarkPeriod(true);
          setSelectedSubject(data[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchTimetableForSubject = async () => {
    try {
      if (!selectedSubject) {
        setAvailablePeriods([]);
        return;
      }

      // Get the current day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
      const jsDay = new Date(selectedDate).getDay();
      
      // Convert to database format (1=Monday, 2=Tuesday, ..., 5=Friday)
      // Sunday(0) and Saturday(6) map to 0 (no classes)
      const dbDay = jsDay === 0 ? 0 : jsDay === 6 ? 0 : jsDay;

      if (dbDay === 0) {
        // Weekend - no classes
        setAvailablePeriods([]);
        return;
      }

      // Get subject details to know which year/section
      const subject = subjects.find(s => s.id === selectedSubject);
      if (!subject) {
        setAvailablePeriods([]);
        return;
      }

      console.log('Fetching timetable for:', {
        staff_id: user?.id,
        day_of_week: dbDay,
        subject_id: selectedSubject,
        subject: subject.name,
        year: subject.year,
        section: subject.section,
        department: subject.department,
        date: selectedDate
      });

      // First, try to get periods from staff_timetables (staff-specific assignments)
      const { data: staffTimetableData, error: staffTimetableError } = await supabase
        .from('staff_timetables')
        .select('period, day_of_week, department, year, section')
        .eq('staff_id', user?.id)
        .eq('day_of_week', dbDay)
        .eq('department', subject.department)
        .eq('year', subject.year)
        .eq('section', subject.section);

      if (staffTimetableError) {
        console.error('Staff timetable query error:', staffTimetableError);
      } else {
        console.log('Staff timetable query result:', staffTimetableData);
      }

      // Then, query the general timetables table to find periods where this subject is scheduled
      let timetableQuery = supabase
        .from('timetables')
        .select('period, day_of_week, subject_id')
        .eq('subject_id', selectedSubject)
        .eq('day_of_week', dbDay)
        .eq('year', subject.year)
        .eq('section', subject.section);

      // Only add department filter if it exists
      if (subject.department) {
        timetableQuery = timetableQuery.eq('department', subject.department);
      }

      const { data: timetableData, error: timetableError } = await timetableQuery;

      if (timetableError) {
        console.error('Timetable query error:', timetableError);
        console.error('Full error:', JSON.stringify(timetableError, null, 2));
      } else {
        console.log('Timetable query result:', timetableData);
        console.log('Number of periods found:', timetableData?.length || 0);
      }

      // Combine results from both queries. Preserve the subject_id from timetable rows
      // so that when a subject is an elective (parent) we use the actual scheduled
      // subject_id for period attendance lookups.
      const entries: TimetableEntry[] = [];

      // Add periods from staff_timetables (no subject_id available here - assume selectedSubject)
      if (staffTimetableData && staffTimetableData.length > 0) {
        staffTimetableData.forEach(entry => {
          entries.push({ period: entry.period, day: String(dbDay), subject_id: selectedSubject });
        });
      }

      // Add periods from timetables (where subject is scheduled) and keep their subject_id
      if (timetableData && timetableData.length > 0) {
        timetableData.forEach(entry => {
          entries.push({ period: entry.period, day: String(dbDay), subject_id: entry.subject_id });
        });
      }

      // Deduplicate by period+subject to avoid duplicates
      const seen = new Set<string>();
      const dedupedEntries = [] as TimetableEntry[];
      for (const e of entries) {
        const key = `${e.period}_${e.subject_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedupedEntries.push(e);
      }

      if (dedupedEntries.length > 0) {
        console.log('Available periods (combined):', dedupedEntries);
        setAvailablePeriods(dedupedEntries);
      } else {
        // If no results, try a simpler fallback query
        console.log('No results from primary queries, trying fallback...');
        
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('timetables')
          .select('period, day_of_week, subject_id, year, section, department')
          .eq('subject_id', selectedSubject)
          .eq('day_of_week', dbDay);

        console.log('Fallback query result:', fallbackData);

        if (fallbackError) {
          console.error('Fallback query error:', fallbackError);
        }

        if (fallbackData && fallbackData.length > 0) {
          // Found periods without strict year/section matching
          const entries: TimetableEntry[] = fallbackData.map(entry => ({
            period: entry.period,
            day: String(entry.day_of_week),
            subject_id: entry.subject_id || selectedSubject
          }));
          console.log('Available periods from fallback:', entries);
          setAvailablePeriods(entries);
        } else {
          console.log('No timetable entries found for the current day/subject');
          setAvailablePeriods([]);
        }
      }
    } catch (error) {
      console.error('Error fetching timetable:', error);
      setAvailablePeriods([]);
    }
  };

  const fetchStudentsForDaily = async () => {
    setLoading(true);
    try {
      let query = supabase.from('students').select('id, reg_no, roll_no, year, section');

      // Advisor gets students in their section
      if (year) {
        query = query.eq('year', year);
      }
      if (section) {
        query = query.eq('section', section);
      }
      query = query.eq('advisor_id', user?.id);

      const { data: studentsData, error } = await query.order('roll_no', { ascending: true });

      if (error) throw error;

      await enrichStudentsWithProfiles(studentsData || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentsForSubject = async () => {
    setLoading(true);
    try {
      // Use the effectiveSubjectId (from timetable) when available to ensure
      // we query the actual scheduled subject (important for electives)
      const subjectIdToUse = effectiveSubjectId || selectedSubject;

      if (!subjectIdToUse) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // Fetch subject details from DB in case this component doesn't have it locally
      const { data: subjData, error: subjErr } = await supabase
        .from('subjects')
        .select('id, subject_code, name, year, section, department, subject_type')
        .eq('id', subjectIdToUse)
        .maybeSingle();

      if (subjErr || !subjData) {
        console.error('Failed to load subject details for attendance student fetch', subjErr);
        setStudents([]);
        setLoading(false);
        return;
      }

      const subject = subjData as Subject & { subject_type?: string };

      // If this is a main elective (section === 'ALL' or subject_type === 'elective'),
      // students are assigned to subelectives. Load students from `student_electives`.
      if (String(subject.section).toUpperCase() === 'ALL' || subject.subject_type === 'elective') {
        try {
          // load subelective ids for this parent subject
          const { data: subs, error: subsErr } = await supabase
            .from('electives')
            .select('id')
            .eq('parent_subject_id', subject.id);
          if (subsErr) throw subsErr;
          const subIds = (subs || []).map((s: any) => s.id);
          if (subIds.length === 0) {
            // no subelectives defined — fallback to all students of the year
            const { data: studentsData, error } = await supabase
              .from('students')
              .select('id, reg_no, roll_no, year, section')
              .eq('year', subject.year)
              .order('roll_no', { ascending: true });
            if (error) throw error;
            await enrichStudentsWithProfiles(studentsData || []);
            return;
          }

          // find student_ids assigned to any of these subelectives
          const assignedRows = await fetchInChunks('student_electives', 'student_id', 'elective_id', subIds as string[]);
          const studentIds = Array.from(new Set((assignedRows || []).map((r: any) => r.student_id)));

          if (studentIds.length === 0) {
            setStudents([]);
            setLoading(false);
            return;
          }

          const studentsData = await fetchInChunks('students', 'id, reg_no, roll_no, year, section', 'id', studentIds as string[]);
          await enrichStudentsWithProfiles(studentsData || []);
          return;
        } catch (e) {
          console.error('Error fetching elective-assigned students:', e);
          setStudents([]);
          setLoading(false);
          return;
        }
      }

      // Default: non-elective subject — fetch students for the exact year+section
      let query = supabase.from('students').select('id, reg_no, roll_no, year, section');
      query = query.eq('year', subject.year);
      if (subject.section) {
        query = query.eq('section', subject.section);
      }
      const { data: studentsData, error } = await query.order('roll_no', { ascending: true });
      if (error) throw error;
      await enrichStudentsWithProfiles(studentsData || []);
    } catch (error) {
      console.error('Error fetching students for subject:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMyReplacements = async () => {
    if (!user) return;
    setLoadingAlter(true);
    setAlterResults([]);
    try {
      const { data, error } = await supabase
        .from('replacements')
        .select('id, target_staff, replacement_staff, for_date, created_by, created_at, period')
        .eq('replacement_staff', user.id)
        .eq('for_date', alterDate);

      if (error) throw error;
      const rows = (data || []) as ReplacementRow[];
      console.debug('loadMyReplacements: initial fetch', { userId: user?.id, alterDate, rows });

      // Group replacements by target_staff so we only call RPC once per target
      const byTarget = new Map<string, number[]>();
      const targetsSet = new Set<string>();
      rows.forEach(r => {
        const arr = byTarget.get(r.target_staff) || [];
        // collect periods (may include 0 for full-day) - normalize to number when present
        if (r.period !== undefined && r.period !== null) arr.push(Number(r.period));
        byTarget.set(r.target_staff, arr);
        targetsSet.add(r.target_staff);
      });

      // no-op: targets are available via `byTarget` map when needed

      // Fetch caller profile to know if they're a department admin
      const { data: callerProfile } = await supabase.from('profiles').select('is_department_admin').eq('id', user.id).maybeSingle();
      const isDeptAdmin = !!callerProfile?.is_department_admin;

      const results: Array<{ target_id: string; target_name: string; rows: RPCAttendance[]; full_day?: boolean; assigned_periods?: number[]; caller_is_replacement?: boolean }> = [];
      for (const [targetId, periods] of byTarget.entries()) {
        // fetch target profile name
        const { data: prof } = await supabase.from('profiles').select('id,name').eq('id', targetId).maybeSingle();
        const targetName = prof?.name || 'Staff';

        const { data: rpcData, error: rpcError } = await supabase.rpc('get_staff_leave_attendance', { p_target_staff: targetId, p_for_date: alterDate });
        if (rpcError) {
          console.error('RPC error while loading alter attendance for', targetId, rpcError);
          try {
            // Show supabase auth user (the auth.uid used by RPC on server)
            const authUser = await supabase.auth.getUser();
            console.debug('supabase.auth.getUser()', authUser);

            // Show caller profile from profiles table (client-side mapping)
            const { data: callerProfile, error: callerError } = await supabase
              .from('profiles')
              .select('id, name, is_department_admin, department')
              .eq('id', user.id)
              .maybeSingle();
            console.debug('Caller profile for RPC auth debug', { callerProfile, callerError });

            // Show any replacement rows for this target/date (all rows)
            const { data: replsAll, error: replsErr } = await supabase
              .from('replacements')
              .select('*')
              .eq('target_staff', targetId)
              .eq('for_date', alterDate);
            console.debug('All replacements for target/date', { replsAll, replsErr });

            // Check whether a replacement row exists for the auth user according to client auth
            const callerId = authUser?.data?.user?.id;
            if (callerId) {
              const { data: matchRow, error: matchErr } = await supabase
                .from('replacements')
                .select('*')
                .eq('target_staff', targetId)
                .eq('for_date', alterDate)
                .eq('replacement_staff', callerId);
              console.debug('Replacement rows matching auth user', { callerId, matchRow, matchErr });
            }
          } catch (pe) {
            console.debug('Failed to fetch debug info for RPC error', pe);
          }
          continue;
        }

        const rpcRows = (rpcData || []) as RPCAttendance[];

        // For department admins, show all rows.
        // For non-admins (replacement users), be strict: only show per-period rows
        // where the RPC indicates an exact per-period assignment. Do NOT rely on
        // a full-day replacement (period=0) to grant per-period access.
        let filteredRows: RPCAttendance[] = [];
        if (isDeptAdmin) {
          filteredRows = rpcRows;
        } else {
          filteredRows = rpcRows.filter(r => {
            // assigned_replacement must match caller
            if (String(r.assigned_replacement || '') !== String(user.id)) return false;
            // assigned_period must be present and equal to the period for this row
            // this avoids treating a full-day replacement (assigned_period=0)
            // as permission to mark every period.
            const ap = typeof r.assigned_period !== 'undefined' && r.assigned_period !== null ? Number(r.assigned_period) : null;
            const p = typeof r.period !== 'undefined' && r.period !== null ? Number(r.period) : null;
            if (ap === null || p === null) return false;
            return ap === p && p > 0;
          });
        }

        // Dedupe by subject/period/year/section
        const seen = new Set<string>();
        const deduped: RPCAttendance[] = [];
        for (const r of filteredRows) {
          const key = `${r.subject_id}_${r.period}_${r.year}_${r.section || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(r);
        }

        const assignedPeriods = Array.from(new Set(deduped.map(r => r.period)));
        const userHasFullDay = (Array.from(periods).map(Number).includes(0));
        const full_day = userHasFullDay;
        const callerIsReplacement = (Array.from(periods).length > 0);

        console.debug('loadMyReplacements: target', targetId, { periods, isDeptAdmin, assignedPeriods, rowsReturned: deduped.length });

        results.push({ target_id: targetId, target_name: targetName, rows: deduped, full_day, assigned_periods: assignedPeriods, caller_is_replacement: callerIsReplacement });
      }

      // Persist caller's admin status to component state so render logic can
      // decide whether to allow daily marking. Also keep caller replacement
      // flag per-block in `alterResults` so admins who are replacements are
      // treated as replacements (restricted to their assigned periods).
      setIsDeptAdmin(isDeptAdmin);

      setAlterResults(results);

      // Always fetch rosters/daily statuses so period-only replacements also get student lists
      if (results.length > 0) {
        // await so UI shows results only after rosters/statuses are loaded
        await fetchAlterDailyData(results);
      }
    } catch (e) {
      console.error('Error loading replacements', e);
      setAlterResults([]);
    } finally {
      setLoadingAlter(false);
    }
  };

  const enrichStudentsWithProfiles = async (studentsData: Student[]) => {
    if (studentsData && studentsData.length > 0) {
      const studentIds = studentsData.map(s => s.id);
      const profilesData = await fetchInChunks('profiles', 'id, name', 'id', studentIds);
      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]) || []);
      
      const studentsWithProfiles = studentsData.map(s => ({
        ...s,
        profile: profilesMap.get(s.id)
      }));

      setStudents(studentsWithProfiles);

      // Fetch existing attendance for the selected date
      await fetchExistingAttendance(studentIds);
    } else {
      setStudents([]);
    }
  };

  const fetchExistingAttendance = async (studentIds: string[]) => {
    try {
      if (attendanceType === 'daily') {
        // Fetch daily attendance
        const data = await fetchInChunks('daily_attendance', 'student_id, status', 'student_id', studentIds);
        const attendanceMap = new Map<string, 'present' | 'absent' | 'late' | 'od' | 'leave'>();
        (data || []).forEach(record => {
          attendanceMap.set(record.student_id, record.status);
        });

        // For students without attendance records, default to present
        studentIds.forEach(id => {
          if (!attendanceMap.has(id)) {
            attendanceMap.set(id, 'present');
          }
        });

        setAttendance(attendanceMap);
      } else if (attendanceType === 'period' && selectedSubject && periodNumber !== null) {
          // Fetch period attendance. Use the effective subject id (from timetable)
          // if available; otherwise fall back to the selected subject.
          const subjectToQuery = effectiveSubjectId || selectedSubject;
          // Fetch period attendance
          const periodData = await fetchInChunks('period_attendance', 'student_id, status', 'student_id', studentIds);
          // Also fetch daily attendance for fallback defaults
          const dailyData = await fetchInChunks('daily_attendance', 'student_id, status', 'student_id', studentIds);

          const attendanceMap = new Map<string, 'present' | 'absent' | 'late' | 'od' | 'leave'>();

          const periodMap = new Map((periodData || []).map((r: any) => [r.student_id, r.status]));
          const dailyMap = new Map((dailyData || []).map((r: any) => [r.student_id, r.status]));

          // For students, prefer period attendance; otherwise fall back to daily attendance; otherwise default to present
          studentIds.forEach(id => {
            if (periodMap.has(id)) {
              attendanceMap.set(id, periodMap.get(id));
            } else if (dailyMap.has(id)) {
              attendanceMap.set(id, dailyMap.get(id));
            } else {
              attendanceMap.set(id, 'present');
            }
          });

          setAttendance(attendanceMap as Map<string, 'present' | 'absent' | 'late' | 'od' | 'leave'>);
      }
    } catch (error) {
      console.error('Error fetching existing attendance:', error);
      
      // Fallback: Initialize to all present
      const initialAttendance = new Map<string, 'present' | 'absent' | 'late' | 'od' | 'leave'>();
      studentIds.forEach(id => {
        initialAttendance.set(id, 'present');
      });
      setAttendance(initialAttendance);
    }
  };

  const handleAttendanceChange = (studentId: string, status: 'present' | 'absent' | 'late' | 'od' | 'leave') => {
    setAttendance(prev => {
      const newMap = new Map(prev);
      newMap.set(studentId, status);
      return newMap;
    });
  };

  // Alter-mode handlers
  const alterHandleAttendanceChange = (blockId: string, classKey: string, studentId: string, status: 'present' | 'absent' | 'late' | 'od' | 'leave') => {
    setAlterAttendanceState(prev => {
      const next = { ...prev };
      if (!next[blockId]) next[blockId] = {};
      if (!next[blockId][classKey]) next[blockId][classKey] = {};
      next[blockId][classKey] = { ...next[blockId][classKey], [studentId]: status };
      return next;
    });
  };

  const alterMarkAllPresent = (blockId: string, classKey: string) => {
    setAlterAttendanceState(prev => {
      const next = { ...prev };
      if (!next[blockId] || !next[blockId][classKey]) return next;
      const newClass = { ...next[blockId][classKey] };
      Object.keys(newClass).forEach(sid => {
        newClass[sid] = 'present';
      });
      next[blockId][classKey] = newClass;
      return next;
    });
  };

  const saveAlterAttendance = async (blockId: string, classKey: string, type: 'daily' | 'period', meta?: { subject_id?: string; period?: number }) => {
    try {
      setAlterSavingState(prev => ({ ...prev, [blockId]: { ...(prev[blockId] || {}), [classKey]: true } }));
      const classMap = alterAttendanceState?.[blockId]?.[classKey] || {};
      const records = Object.entries(classMap).map(([student_id, status]) => ({ student_id, status }));

      if (type === 'daily') {
        const dailyRecords = records.map(r => ({ student_id: r.student_id, date: alterDate, status: r.status, marked_by: user?.id }));
        const { error } = await supabase.from('daily_attendance').upsert(dailyRecords, { onConflict: 'student_id,date' });
        if (error) throw error;
      } else {
        // need subject_id and period
        if (!meta?.subject_id || typeof meta?.period === 'undefined') throw new Error('missing subject/period meta');
        const periodRecords = records.map(r => ({ student_id: r.student_id, subject_id: meta.subject_id, date: alterDate, period: meta.period, status: r.status, marked_by: user?.id, is_manually_marked: true }));
        const { error } = await supabase.from('period_attendance').upsert(periodRecords, { onConflict: 'student_id,subject_id,date,period' });
        if (error) throw error;
      }

      alert(`Attendance saved for ${alterDate}`);
    } catch (e) {
      console.error('Error saving alter attendance', e);
      alert('Failed to save alter attendance');
    } finally {
      setAlterSavingState(prev => ({ ...prev, [blockId]: { ...(prev[blockId] || {}), [classKey]: false } }));
    }
  };

  const handleMarkAllPresent = () => {
    // Preserve OD statuses only in period attendance mode; in daily mode OD can be changed
    setAttendance(prev => {
      const newMap = new Map(prev);
      students.forEach(s => {
        const existing = newMap.get(s.id);
        if (attendanceType === 'period' && existing === 'od') return; // keep OD locked in period mode
        newMap.set(s.id, 'present');
      });
      return newMap;
    });
  };

  const handlePeriodSelect = (period: number, subjectId: string) => {
    setPeriodNumber(period);
    setEffectiveSubjectId(subjectId || null);
    setShowPeriodSelection(false);
  };

  const handleBackToPeriodSelection = () => {
    setShowPeriodSelection(true);
    setPeriodNumber(null);
    setStudents([]);
    setAttendance(new Map());
    setEffectiveSubjectId(null);
  };

  const handleSaveAttendance = async () => {
    setSaving(true);
    try {
      const attendanceRecords: AttendanceRecord[] = Array.from(attendance.entries()).map(([student_id, status]) => ({
        student_id,
        status,
      }));

      const attendanceDetails = attendanceType === 'daily' 
        ? `Daily attendance for Year ${year} Section ${section}`
        : `Period ${periodNumber} - ${subjects.find(s => s.id === selectedSubject)?.name || 'Subject'}`;

      console.log('Saving attendance for date:', selectedDate);
      console.log('Attendance type:', attendanceType);
      console.log('Attendance details:', attendanceDetails);
      console.log('Attendance records:', attendanceRecords);

      if (attendanceType === 'daily') {
        // Save daily attendance
        const dailyRecords = attendanceRecords.map(record => ({
          student_id: record.student_id,
          date: selectedDate,
          status: record.status,
          marked_by: user?.id,
        }));

        console.log('Saving daily records:', dailyRecords);

        const { error: dailyError } = await supabase
          .from('daily_attendance')
          .upsert(dailyRecords, { onConflict: 'student_id,date' });

        if (dailyError) {
          console.error('Daily attendance error:', dailyError);
          console.error('Error details:', JSON.stringify(dailyError, null, 2));
          throw dailyError;
        }

        console.log('Daily attendance saved successfully');

        // Auto-populate period attendance for all scheduled periods
        // Get day of week
        const jsDay = new Date(selectedDate).getDay();
        const dbDay = jsDay === 0 ? 0 : jsDay === 6 ? 0 : jsDay;

        if (dbDay !== 0 && year && section) {
          console.log('Fetching timetable for:', { year, section, day: dbDay });
          
          // Get timetable for this class on this day
          const { data: timetableData, error: timetableError } = await supabase
            .from('timetables')
            .select('period, subject_id')
            .eq('year', year)
            .eq('section', section)
            .eq('day_of_week', dbDay)
            .not('subject_id', 'is', null);

          if (timetableError) {
            console.error('Timetable query error:', timetableError);
            // Don't throw - daily attendance was saved successfully
          } else if (timetableData && timetableData.length > 0) {
            console.log('Found timetable entries:', timetableData);
            
            // Create period attendance records for each student, subject, and period
            const periodRecords = [];
            for (const record of attendanceRecords) {
              for (const tt of timetableData) {
                periodRecords.push({
                  student_id: record.student_id,
                  subject_id: tt.subject_id,
                  date: selectedDate,
                  period: tt.period,
                  status: record.status,
                  marked_by: user?.id,
                  is_manually_marked: false, // Auto-populated from daily
                });
              }
            }

            console.log('Upserting period records:', periodRecords.length, 'records');

            // Insert or update period records
            if (periodRecords.length > 0) {
              // First, try to get existing records to check which ones are manually marked
              const existingRecords = await fetchInChunks('period_attendance', 'student_id, subject_id, period, is_manually_marked', 'student_id', attendanceRecords.map(r => r.student_id));

              // Create a set of manually marked records to skip
              const manuallyMarked = new Set(
                existingRecords?.filter(r => r.is_manually_marked)
                  .map(r => `${r.student_id}_${r.subject_id}_${r.period}`) || []
              );

              // Filter out manually marked records
              const recordsToUpsert = periodRecords.filter(r => 
                !manuallyMarked.has(`${r.student_id}_${r.subject_id}_${r.period}`)
              );

              console.log('Records to upsert after filtering:', recordsToUpsert.length);

              if (recordsToUpsert.length > 0) {
                const { error: periodError } = await supabase
                  .from('period_attendance')
                  .upsert(recordsToUpsert, { 
                    onConflict: 'student_id,subject_id,date,period'
                  });

                if (periodError) {
                  console.error('Error auto-populating period attendance:', periodError);
                  // Don't throw - daily attendance was saved successfully
                } else {
                  console.log('Successfully auto-populated period attendance');
                }
              }
            }
          } else {
            console.log('No timetable entries found for this day');
          }
        }
      } else {
        // Save period attendance (manually marked)
        const subjectToSave = effectiveSubjectId || selectedSubject;
        const periodRecords = attendanceRecords.map(record => ({
          student_id: record.student_id,
          subject_id: subjectToSave,
          date: selectedDate,
          period: periodNumber,
          status: record.status,
          marked_by: user?.id,
          is_manually_marked: true, // Manually marked by staff
        }));

        const { error } = await supabase
          .from('period_attendance')
          .upsert(periodRecords, { onConflict: 'student_id,subject_id,date,period' });

        if (error) throw error;
      }

      alert(`${attendanceType === 'daily' ? 'Daily' : 'Period'} Attendance saved successfully for ${selectedDate}!\n\n${attendanceDetails}\n\nPresent: ${Array.from(attendance.values()).filter(s => s === 'present').length}\nAbsent: ${Array.from(attendance.values()).filter(s => s === 'absent').length}\nLate: ${Array.from(attendance.values()).filter(s => s === 'late').length}\nOD: ${Array.from(attendance.values()).filter(s => s === 'od').length}\nLeave: ${Array.from(attendance.values()).filter(s => s === 'leave').length}`);
    } catch (error) {
      console.error('Error saving attendance:', error);
      alert('Failed to save attendance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/staff-dashboard', icon: <ClipboardCheck className="w-5 h-5" /> },
    { label: 'Attendance', path: '/staff/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
  ];

  const presentCount = Array.from(attendance.values()).filter(s => s === 'present').length;
  const absentCount = Array.from(attendance.values()).filter(s => s === 'absent').length;
  const lateCount = Array.from(attendance.values()).filter(s => s === 'late').length;
  const odCount = Array.from(attendance.values()).filter(s => s === 'od').length;
  const leaveCount = Array.from(attendance.values()).filter(s => s === 'leave').length;

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="bg-blue-100 rounded-lg p-2 sm:p-3 text-blue-600 flex-shrink-0">
              <ClipboardCheck className="h-6 w-6 sm:h-8 sm:w-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800">Attendance Management</h1>
                {/* Show top Alter button for relevant staff roles */}
                {staffRole && ['advisor', 'mentor', 'ahod', 'hod', 'staff'].includes(staffRole) && (
                  <button
                    onClick={async () => {
                      const newMode = !alterMode;
                      setAlterMode(newMode);
                      if (newMode) await loadMyReplacements();
                    }}
                    className={`ml-3 px-3 py-1 rounded text-sm ${alterMode ? 'bg-yellow-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    Alter
                  </button>
                )}
              </div>
              <p className="text-sm sm:text-base text-slate-600 mt-1">Mark student attendance for your class</p>
            </div>
          </div>
        </div>

        {/* Attendance Type Selector */}
        {canMarkDaily && canMarkPeriod && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <span className="text-sm font-medium text-slate-700">Attendance Type:</span>
              <div className="flex gap-2 flex-1 sm:flex-none">
                <button
                  onClick={() => {
                    setAttendanceType('daily');
                    setShowPeriodSelection(true);
                    setPeriodNumber(null);
                  }}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    attendanceType === 'daily'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Daily Attendance</span>
                  <span className="sm:hidden">Daily</span>
                </button>
                <button
                  onClick={() => {
                    setAttendanceType('period');
                    setShowPeriodSelection(true);
                    setPeriodNumber(null);
                  }}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                    attendanceType === 'period'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span className="hidden sm:inline">Period Attendance</span>
                  <span className="sm:hidden">Period</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Period Selection Cards */}
        {attendanceType === 'period' && showPeriodSelection && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 mb-6">
            <div className="mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">Select Subject & Period</h2>
              <p className="text-slate-600 text-xs sm:text-sm">Choose a subject and click on a period to mark attendance</p>
            </div>

            {/* Subject Selection */}
            <div className="mb-6">
              <label className="text-sm font-medium text-slate-700 block mb-2">
                <BookOpen className="inline h-4 w-4 mr-1" />
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {subjects.map(subject => (
                  <option key={subject.id} value={subject.id}>
                    {subject.subject_code} - {subject.name} (Year {subject.year} {subject.section})
                  </option>
                ))}
              </select>
            </div>

            {/* Period Cards Grid */}
            {selectedSubject && (
              <div>
                <h3 className="text-base sm:text-lg font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-sm sm:text-base">{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </h3>
                
                {availablePeriods.length === 0 ? (
                  <div>
                    <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-8 text-center mb-4">
                      <Clock className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">No classes scheduled for this subject today</p>
                      <p className="text-slate-500 text-sm mt-1">Please select a different date or subject</p>
                    </div>
                    
                    {/* Debug Information */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-xs">
                      <p className="font-semibold text-yellow-800 mb-2">Debug Info (check browser console for more details):</p>
                      <div className="space-y-1 text-yellow-700">
                        <p><strong>Selected Date:</strong> {selectedDate}</p>
                        <p><strong>Day of Week:</strong> {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long' })} ({new Date(selectedDate).getDay()})</p>
                        <p><strong>DB Day Value:</strong> {(() => {
                          const jsDay = new Date(selectedDate).getDay();
                          return jsDay === 0 ? 0 : jsDay === 6 ? 0 : jsDay;
                        })()}</p>
                        <p><strong>Selected Subject:</strong> {subjects.find(s => s.id === selectedSubject)?.name || 'N/A'}</p>
                        <p><strong>Subject Code:</strong> {subjects.find(s => s.id === selectedSubject)?.subject_code || 'N/A'}</p>
                        <p><strong>Year/Section:</strong> {subjects.find(s => s.id === selectedSubject)?.year}/{subjects.find(s => s.id === selectedSubject)?.section}</p>
                        <p><strong>Department:</strong> {subjects.find(s => s.id === selectedSubject)?.department || 'N/A'}</p>
                        <p className="mt-2 text-yellow-600">Open browser console (F12) to see detailed query logs</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {availablePeriods.map(({ period, subject_id }) => {
                      const periodTimes = [
                        { period: 1, time: '9:00 - 9:50', label: 'Period 1' },
                        { period: 2, time: '9:50 - 10:40', label: 'Period 2' },
                        { period: 3, time: '10:55 - 11:45', label: 'Period 3' },
                        { period: 4, time: '11:45 - 12:35', label: 'Period 4' },
                        { period: 5, time: '1:30 - 2:20', label: 'Period 5' },
                        { period: 6, time: '2:20 - 3:10', label: 'Period 6' },
                        { period: 7, time: '3:10 - 4:00', label: 'Period 7' },
                        { period: 8, time: '4:00 - 4:50', label: 'Period 8' },
                      ];
                      
                      const periodInfo = periodTimes.find(p => p.period === period);
                      if (!periodInfo) return null;
                      
                      return (
                        <button
                          key={`${period}_${subject_id}`}
                          onClick={() => handlePeriodSelect(period, subject_id)}
                          className="bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-2 border-blue-300 rounded-xl p-3 sm:p-4 transition-all transform hover:scale-105 hover:shadow-lg"
                        >
                          <div className="flex flex-col items-center text-center">
                            <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 mb-2" />
                            <div className="text-sm sm:text-lg font-bold text-blue-800">{periodInfo.label}</div>
                            <div className="text-xs text-blue-600 mt-1">{periodInfo.time}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Controls - Show when taking attendance */}
        {((attendanceType === 'daily') || (attendanceType === 'period' && !showPeriodSelection && periodNumber !== null)) && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 mb-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:justify-between">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
                  {attendanceType === 'period' && (
                    <button
                      onClick={handleBackToPeriodSelection}
                      className="px-3 sm:px-4 py-2 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200 transition-colors font-medium w-full sm:w-auto"
                    >
                      ← Back to Period Selection
                    </button>
                  )}
                  
                  <div className="w-full sm:w-auto">
                    <label className="text-sm font-medium text-slate-700 block mb-1">
                      <Calendar className="inline h-4 w-4 mr-1" />
                      Date
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Alter (replacement) toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const newMode = !alterMode;
                        setAlterMode(newMode);
                        if (newMode) await loadMyReplacements();
                      }}
                      className={`px-3 py-2 rounded text-sm ${alterMode ? 'bg-yellow-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      Alter
                    </button>
                  </div>

                  <div className="text-xs sm:text-sm text-slate-600">
                    <div><Users className="inline h-4 w-4 mr-1" />Total Students: <strong>{students.length}</strong></div>
                    {attendanceType === 'daily' && year && section && (
                      <div className="mt-1">Year {year} • Section {section}</div>
                    )}
                    {attendanceType === 'period' && selectedSubject && periodNumber && (
                      <div className="mt-1">
                        {subjects.find(s => s.id === selectedSubject)?.name} - Period {periodNumber}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-col sm:flex-row">
                  <button
                    onClick={handleMarkAllPresent}
                    disabled={students.length === 0}
                    className="px-3 sm:px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Mark All Present
                  </button>
                  <button
                    onClick={handleSaveAttendance}
                    disabled={saving || students.length === 0}
                    className="px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Attendance'}
                  </button>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-green-700">{presentCount}</div>
                  <div className="text-xs sm:text-sm text-green-600">Present</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-red-700">{absentCount}</div>
                  <div className="text-xs sm:text-sm text-red-600">Absent</div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-orange-700">{lateCount}</div>
                  <div className="text-xs sm:text-sm text-orange-600">Late</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-blue-700">{odCount}</div>
                  <div className="text-xs sm:text-sm text-blue-600">OD</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 sm:p-3 text-center col-span-2 sm:col-span-1">
                  <div className="text-xl sm:text-2xl font-bold text-purple-700">{leaveCount}</div>
                  <div className="text-xs sm:text-sm text-purple-600">Leave</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Student List - Only show when actively marking attendance */}
        {((attendanceType === 'daily') || (attendanceType === 'period' && !showPeriodSelection && periodNumber !== null)) && (
          <>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-slate-600">Loading students...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 sm:p-8 text-center">
                <Users className="h-12 w-12 sm:h-16 sm:w-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 text-sm sm:text-base">No students found. Please check your staff assignments.</p>
              </div>
            ) : (
              <>

                {/* Desktop Table View (≥ 1024px) */}
                <div className="hidden lg:block bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left p-4 text-sm font-semibold text-slate-700">Roll No</th>
                          <th className="text-left p-4 text-sm font-semibold text-slate-700">Register No</th>
                          <th className="text-left p-4 text-sm font-semibold text-slate-700">Name</th>
                          <th className="text-left p-4 text-sm font-semibold text-slate-700">Year</th>
                          <th className="text-left p-4 text-sm font-semibold text-slate-700">Section</th>
                          <th className="text-center p-4 text-sm font-semibold text-slate-700">Attendance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student, index) => (
                          <tr
                            key={student.id}
                            className={`border-b border-slate-100 hover:bg-slate-50 ${
                              index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                            }`}
                          >
                            <td className="p-4 text-sm text-slate-800">{student.roll_no}</td>
                            <td className="p-4 text-sm text-slate-800">{student.reg_no}</td>
                            <td className="p-4 text-sm font-medium text-slate-800">
                              {student.profile?.name || 'N/A'}
                            </td>
                            <td className="p-4 text-sm text-slate-600">{student.year}</td>
                            <td className="p-4 text-sm text-slate-600">{student.section}</td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => handleAttendanceChange(student.id, 'present')}
                                  disabled={attendanceType === 'period' && attendance.get(student.id) === 'od'}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    attendance.get(student.id) === 'present'
                                      ? 'bg-green-600 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  } ${attendanceType === 'period' && attendance.get(student.id) === 'od' ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  <CheckCircle className="inline h-3 w-3 mr-1" />
                                  Present
                                </button>
                                <button
                                  onClick={() => handleAttendanceChange(student.id, 'absent')}
                                  disabled={attendanceType === 'period' && attendance.get(student.id) === 'od'}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    attendance.get(student.id) === 'absent'
                                      ? 'bg-red-600 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  } ${attendanceType === 'period' && attendance.get(student.id) === 'od' ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  <XCircle className="inline h-3 w-3 mr-1" />
                                  Absent
                                </button>
                                <button
                                  onClick={() => handleAttendanceChange(student.id, 'late')}
                                  disabled={attendanceType === 'period' && attendance.get(student.id) === 'od'}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    attendance.get(student.id) === 'late'
                                      ? 'bg-orange-600 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  } ${attendanceType === 'period' && attendance.get(student.id) === 'od' ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  Late
                                </button>
                                <button
                                  onClick={() => handleAttendanceChange(student.id, 'od')}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    attendance.get(student.id) === 'od'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  <FileText className="inline h-3 w-3 mr-1" />
                                  OD
                                </button>
                                <button
                                  onClick={() => handleAttendanceChange(student.id, 'leave')}
                                  disabled={attendanceType === 'period' && attendance.get(student.id) === 'od'}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    attendance.get(student.id) === 'leave'
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  } ${attendanceType === 'period' && attendance.get(student.id) === 'od' ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  <Plane className="inline h-3 w-3 mr-1" />
                                  Leave
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Card View (< 640px) */}
                <div className="block sm:hidden space-y-3">
                  {students.map((student) => (
                    <div
                      key={student.id}
                      className="bg-white rounded-lg border border-slate-200 p-3 w-full flex flex-col gap-2"
                      style={{ minWidth: '100%' }}
                    >
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex flex-col gap-1 w-full">
                          <div className="text-sm font-semibold text-slate-800 break-words whitespace-normal py-2">{student.profile?.name || 'N/A'}</div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-600 break-words whitespace-normal">
                            <span>Roll Number: <span className="font-medium text-slate-800">{student.roll_no}</span></span>
                            <span>Register No: <span className="font-medium text-slate-800">{student.reg_no}</span></span>
                            <span>Mentor: <span className="font-medium text-slate-800">{student.profile?.name || 'N/A'}</span></span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-600 break-words whitespace-normal">
                          <span>OD Count: <span className="font-medium text-blue-700">{/* OD count logic here if available */}</span></span>
                          <span>Leave Count: <span className="font-medium text-purple-700">{/* Leave count logic here if available */}</span></span>
                        </div>
                        <div className="flex gap-2 mt-2 w-full">
                          <button
                            className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 w-full"
                            onClick={() => {/* Profile button logic here */}}
                          >
                            Profile
                          </button>
                        </div>
                        <div className="flex flex-col gap-2 mt-2 w-full">
                          <button
                            onClick={() => handleAttendanceChange(student.id, 'present')}
                            disabled={attendanceType === 'period' && attendance.get(student.id) === 'od'}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors w-full ${
                              attendance.get(student.id) === 'present'
                                ? 'bg-green-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            } ${attendanceType === 'period' && attendance.get(student.id) === 'od' ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            Present
                          </button>
                          <button
                            onClick={() => handleAttendanceChange(student.id, 'absent')}
                            disabled={attendanceType === 'period' && attendance.get(student.id) === 'od'}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors w-full ${
                              attendance.get(student.id) === 'absent'
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            } ${attendanceType === 'period' && attendance.get(student.id) === 'od' ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            Absent
                          </button>
                          <button
                            onClick={() => handleAttendanceChange(student.id, 'late')}
                            disabled={attendanceType === 'period' && attendance.get(student.id) === 'od'}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors w-full ${
                              attendance.get(student.id) === 'late'
                                ? 'bg-orange-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            } ${attendanceType === 'period' && attendance.get(student.id) === 'od' ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            Late
                          </button>
                          <button
                            onClick={() => handleAttendanceChange(student.id, 'od')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors w-full ${
                              attendance.get(student.id) === 'od'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            OD
                          </button>
                          <button
                            onClick={() => handleAttendanceChange(student.id, 'leave')}
                            disabled={attendanceType === 'period' && attendance.get(student.id) === 'od'}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors w-full ${
                              attendance.get(student.id) === 'leave'
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            } ${attendanceType === 'period' && attendance.get(student.id) === 'od' ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            Leave
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                  {/* Bottom Button Group: 100% identical to top button group */}
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:justify-between mt-6">
                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
                      {/* ...existing code for period back button, date input, alter toggle, student count, etc. can be omitted here for bottom group ... */}
                    </div>
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <button
                        onClick={handleMarkAllPresent}
                        disabled={students.length === 0}
                        className="px-3 sm:px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Mark All Present
                      </button>
                      <button
                        onClick={handleSaveAttendance}
                        disabled={saving || students.length === 0}
                        className="px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="h-4 w-4" />
                        {saving ? 'Saving...' : 'Save Attendance'}
                      </button>
                    </div>
                  </div>
              </>
            )}
          </>
        )}

        {/* Alter results - show when alterMode is enabled */}
        {alterMode && (
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Alter Attendance — Covered Sessions</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setAlterAttendanceType('daily')}
                  className={`px-3 py-1 rounded text-sm ${alterAttendanceType === 'daily' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  Daily
                </button>
                <button
                  onClick={() => setAlterAttendanceType('period')}
                  className={`px-3 py-1 rounded text-sm ${alterAttendanceType === 'period' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  Period
                </button>
                <div className="ml-3">
                  <label className="text-xs font-medium text-slate-600 mr-2">Date</label>
                  <input
                    type="date"
                    value={alterDate}
                    onChange={(e) => setAlterDate(e.target.value)}
                    className="px-2 py-1 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {loadingAlter ? (
              <div className="text-center py-6">Loading replacement assignments...</div>
            ) : alterResults.length === 0 ? (
              <div className="text-slate-600">No replacement assignments found for {alterDate}.</div>
            ) : (
              <div className="space-y-4">
                {alterResults.map((block) => (
                  <div key={block.target_id} className="border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">Covering for: {block.target_name}</div>
                      <div className="text-xs text-slate-500">Date: {alterDate}</div>
                    </div>

                            {block.rows.length === 0 ? (
                      <div>
                        <div className="text-slate-600 mb-2">No scheduled periods found for this staff on the selected date.</div>
                        {block.full_day && isDeptAdmin && (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <label className="text-sm text-slate-700">Open Period:</label>
                              <select
                                value={fullDaySelectedPeriod[block.target_id] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value);
                                  setFullDaySelectedPeriod(prev => ({ ...prev, [block.target_id]: val }));
                                  // clear previously selected row
                                  setFullDaySelectedRow(prev => ({ ...prev, [block.target_id]: null }));
                                }}
                                className="px-2 py-1 border rounded text-sm"
                              >
                                <option value="">Select period</option>
                                {[1,2,3,4,5,6,7,8].map(p => (
                                  <option key={p} value={p}>{`Period ${p}`}</option>
                                ))}
                              </select>
                              <button
                                onClick={async () => {
                                  const sel = fullDaySelectedPeriod[block.target_id];
                                  if (!sel) return;
                                  try {
                                    const { data: rpcData, error: rpcError } = await supabase.rpc('get_staff_leave_attendance', { p_target_staff: block.target_id, p_for_date: alterDate });
                                    if (rpcError) {
                                      console.error('RPC error while fetching period for full-day open', rpcError);
                                      setFullDaySelectedRow(prev => ({ ...prev, [block.target_id]: null }));
                                      return;
                                    }
                                    const rpcRows = (rpcData || []) as RPCAttendance[];
                                    const match = rpcRows.find(r => Number(r.period) === Number(sel));
                                    setFullDaySelectedRow(prev => ({ ...prev, [block.target_id]: match || null }));
                                    if (!match) {
                                      console.debug('No scheduled session for selected period', { block: block.target_id, period: sel });
                                    }
                                  } catch (e) {
                                    console.error('Failed to load period for full-day selection', e);
                                  }
                                }}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
                              >
                                View Period
                              </button>
                            </div>

                            {/* If a period row was loaded for this full-day open, render it */}
                            {fullDaySelectedRow[block.target_id] ? (
                              (() => {
                                const r = fullDaySelectedRow[block.target_id] as RPCAttendance;
                                const blockId = block.target_id;
                                const clsKey = `period_${r.subject_id}_${r.period}_${r.year}_${(r.section || '')}`;
                                const classMap = alterAttendanceState?.[blockId]?.[clsKey] || {};
                                const roster = alterClassStudents?.[blockId]?.[`${r.year}_${r.section || ''}`] || [];
                                const studentsList = roster.length > 0 ? roster.map(s => ({ student_id: s.id, roll_no: s.roll_no, reg_no: s.reg_no, name: s.profile?.name || 'N/A' })) : (r.attendance || []);

                                return (
                                  <div key={`full_open_${block.target_id}_${r.period}`} className="border rounded p-2">
                                    <div className="flex items-center justify-between mb-2">
                                      <div>
                                        <div className="font-medium">{r.subject_code || r.subject_name || 'Subject'}</div>
                                        <div className="text-xs text-slate-500">Year {r.year} • Section {r.section} • Period {r.period}</div>
                                      </div>
                                      <div className="text-sm text-slate-700">Students: {studentsList.length}</div>
                                    </div>

                                    <div className="mb-3 flex items-center justify-between">
                                      <div className="text-xs text-slate-600">Mark attendance for this period</div>
                                      <div className="flex gap-2">
                                        <button onClick={() => alterMarkAllPresent(blockId, clsKey)} className="px-2 py-1 text-xs bg-green-50 rounded">Mark All Present</button>
                                        <button onClick={() => saveAlterAttendance(blockId, clsKey, 'period', { subject_id: r.subject_id, period: r.period })} disabled={alterSavingState?.[blockId]?.[clsKey]} className="px-3 py-1 text-xs bg-blue-600 text-white rounded">{alterSavingState?.[blockId]?.[clsKey] ? 'Saving...' : 'Save'}</button>
                                      </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead className="bg-slate-50">
                                          <tr>
                                            <th className="p-2 text-left">Roll</th>
                                            <th className="p-2 text-left">Reg No</th>
                                            <th className="p-2 text-left">Name</th>
                                            <th className="p-2 text-left">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {studentsList.map((a: any) => (
                                            <tr key={a.student_id} className="border-t">
                                              <td className="p-2">{a.roll_no}</td>
                                              <td className="p-2">{a.reg_no}</td>
                                              <td className="p-2">{a.name}</td>
                                              <td className="p-2">
                                                <div className="flex items-center gap-1.5">
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'present')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'present' ? 'bg-green-600 text-white' : 'bg-slate-100'}`}>Present</button>
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'absent')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'absent' ? 'bg-red-600 text-white' : 'bg-slate-100'}`}>Absent</button>
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'late')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'late' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Late</button>
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'od')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'od' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>OD</button>
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'leave')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'leave' ? 'bg-purple-600 text-white' : 'bg-slate-100'}`}>Leave</button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {alterAttendanceType === 'period' ? (
                          // Prefer showing period rows when available. Only show the full-day message
                          // if there are no period rows for this replacement but a full-day assignment exists.
                          block.rows && block.rows.length > 0 ? (
                            <>
                              {block.rows.map(r => {
                                const blockId = block.target_id;
                                const clsKey = `period_${r.subject_id}_${r.period}_${r.year}_${(r.section || '')}`;
                                const classMap = alterAttendanceState?.[blockId]?.[clsKey] || {};
                                const roster = alterClassStudents?.[blockId]?.[`${r.year}_${r.section || ''}`] || [];
                                const studentsList = roster.length > 0 ? roster.map(s => ({ student_id: s.id, roll_no: s.roll_no, reg_no: s.reg_no, name: s.profile?.name || 'N/A' })) : (r.attendance || []);

                                return (
                                  <div key={`${r.subject_id}_${r.period}`} className="border rounded p-2">
                                    <div className="flex items-center justify-between mb-2">
                                      <div>
                                        <div className="font-medium">{r.subject_code || r.subject_name || 'Subject'}</div>
                                        <div className="text-xs text-slate-500">Year {r.year} • Section {r.section} • Period {r.period}</div>
                                      </div>
                                      <div className="text-sm text-slate-700">Students: {studentsList.length}</div>
                                    </div>

                                    <div className="mb-3 flex items-center justify-between">
                                      <div className="text-xs text-slate-600">Mark attendance for this period</div>
                                      <div className="flex gap-2">
                                        <button onClick={() => alterMarkAllPresent(blockId, clsKey)} className="px-2 py-1 text-xs bg-green-50 rounded">Mark All Present</button>
                                        <button onClick={() => saveAlterAttendance(blockId, clsKey, 'period', { subject_id: r.subject_id, period: r.period })} disabled={alterSavingState?.[blockId]?.[clsKey]} className="px-3 py-1 text-xs bg-blue-600 text-white rounded">{alterSavingState?.[blockId]?.[clsKey] ? 'Saving...' : 'Save'}</button>
                                      </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead className="bg-slate-50">
                                          <tr>
                                            <th className="p-2 text-left">Roll</th>
                                            <th className="p-2 text-left">Reg No</th>
                                            <th className="p-2 text-left">Name</th>
                                            <th className="p-2 text-left">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {studentsList.map((a: any) => (
                                            <tr key={a.student_id} className="border-t">
                                              <td className="p-2">{a.roll_no}</td>
                                              <td className="p-2">{a.reg_no}</td>
                                              <td className="p-2">{a.name}</td>
                                              <td className="p-2">
                                                <div className="flex items-center gap-1.5">
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'present')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'present' ? 'bg-green-600 text-white' : 'bg-slate-100'}`}>Present</button>
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'absent')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'absent' ? 'bg-red-600 text-white' : 'bg-slate-100'}`}>Absent</button>
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'late')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'late' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Late</button>
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'od')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'od' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>OD</button>
                                                  <button onClick={() => alterHandleAttendanceChange(blockId, clsKey, a.student_id, 'leave')} className={`px-2 py-1 text-xs rounded ${classMap[a.student_id] === 'leave' ? 'bg-purple-600 text-white' : 'bg-slate-100'}`}>Leave</button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          ) : (
                            block.full_day ? (
                              <div key={`${block.target_id}_fullday`} className="p-3 bg-yellow-50 border border-yellow-100 rounded text-sm text-yellow-800">This replacement is for the full day — switch to <strong>Daily</strong> view to mark attendance for the class.</div>
                            ) : null
                          )
                        ) : (
                            <>
                            {/* If caller is a replacement for this target and this replacement is
                                not a full-day assignment, block daily marking UI and
                                prompt to switch to Period view. This ensures department
                                admins who are assigned to specific periods are treated
                                like replacements (no admin-wide daily access). */}
                            {block.caller_is_replacement && !block.full_day ? (
                              <div key={`${block.target_id}_no_daily`} className="p-3 bg-yellow-50 border border-yellow-100 rounded text-sm text-yellow-800">
                                You are assigned for specific period(s) only on {alterDate}. Daily marking is not allowed — switch to <strong>Period</strong> view to mark your assigned session(s).
                              </div>
                            ) : (
                              Array.from(new Set(block.rows.map(r => `${r.year}_${r.section}`))).map(key => {
                              const [yr, sec] = key.split('_');

                              // Prefer full class roster fetched into alterClassStudents
                              const roster = alterClassStudents?.[block.target_id]?.[key];

                              let studentsList: Array<any> = [];
                              if (roster && roster.length > 0) {
                                studentsList = roster.map(s => ({
                                  student_id: s.id,
                                  roll_no: s.roll_no,
                                  reg_no: s.reg_no,
                                  name: s.profile?.name || 'N/A',
                                }));
                              } else {
                                // Fallback to RPC-provided attendance
                                const seen = new Set<string>();
                                block.rows.forEach(r => {
                                  (r.attendance || []).forEach((a: any) => {
                                    const k = `${r.year}_${r.section}`;
                                    if (k !== key) return;
                                    if (!seen.has(a.student_id)) {
                                      seen.add(a.student_id);
                                      studentsList.push(a);
                                    }
                                  });
                                });
                              }

                              return (
                                <div key={key} className="border rounded p-2">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="font-medium">Year {yr} • Section {sec}</div>
                                    <div className="text-sm text-slate-700">Students: {studentsList.length}</div>
                                  </div>

                                  <div className="mb-3 flex items-center justify-between">
                                    <div className="text-xs text-slate-600">Mark daily attendance for this class</div>
                                    <div className="flex gap-2">
                                      <button onClick={() => alterMarkAllPresent(block.target_id, `daily_${key}`)} className="px-2 py-1 text-xs bg-green-50 rounded">Mark All Present</button>
                                      <button onClick={() => saveAlterAttendance(block.target_id, `daily_${key}`, 'daily')} disabled={alterSavingState?.[block.target_id]?.[`daily_${key}`]} className="px-3 py-1 text-xs bg-blue-600 text-white rounded">{alterSavingState?.[block.target_id]?.[`daily_${key}`] ? 'Saving...' : 'Save'}</button>
                                    </div>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead className="bg-slate-50">
                                        <tr>
                                          <th className="p-2 text-left">Roll</th>
                                          <th className="p-2 text-left">Reg No</th>
                                          <th className="p-2 text-left">Name</th>
                                          <th className="p-2 text-left">Status (daily)</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {studentsList.map((a: any) => {
                                          const classKey = `daily_${key}`;
                                          const val = alterAttendanceState?.[block.target_id]?.[classKey]?.[a.student_id] ?? dailyAttendanceMap[a.student_id] ?? 'present';
                                          return (
                                            <tr key={a.student_id} className="border-t">
                                              <td className="p-2">{a.roll_no}</td>
                                              <td className="p-2">{a.reg_no}</td>
                                              <td className="p-2">{a.name}</td>
                                              <td className="p-2">
                                                <div className="flex items-center gap-1.5">
                                                  <button onClick={() => alterHandleAttendanceChange(block.target_id, classKey, a.student_id, 'present')} className={`px-2 py-1 text-xs rounded ${val === 'present' ? 'bg-green-600 text-white' : 'bg-slate-100'}`}>Present</button>
                                                  <button onClick={() => alterHandleAttendanceChange(block.target_id, classKey, a.student_id, 'absent')} className={`px-2 py-1 text-xs rounded ${val === 'absent' ? 'bg-red-600 text-white' : 'bg-slate-100'}`}>Absent</button>
                                                  <button onClick={() => alterHandleAttendanceChange(block.target_id, classKey, a.student_id, 'late')} className={`px-2 py-1 text-xs rounded ${val === 'late' ? 'bg-orange-600 text-white' : 'bg-slate-100'}`}>Late</button>
                                                  <button onClick={() => alterHandleAttendanceChange(block.target_id, classKey, a.student_id, 'od')} className={`px-2 py-1 text-xs rounded ${val === 'od' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>OD</button>
                                                  <button onClick={() => alterHandleAttendanceChange(block.target_id, classKey, a.student_id, 'leave')} className={`px-2 py-1 text-xs rounded ${val === 'leave' ? 'bg-purple-600 text-white' : 'bg-slate-100'}`}>Leave</button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                              })
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
