import api from '../lib/api';
import type { StudentProfile } from '../lib/apiTypes';

// Domain-specific types for student service
export interface DashboardData {
  pending_stats: {
    od: number;
    leave: number;
    bonafide: number;
    gatepass: number;
  };
  total_stats: {
    od: number;
    leave: number;
    bonafide: number;
    gatepass: number;
  };
  attendance_percentage: number;
  today_period_attendance: Array<{
    period: number;
    status: 'present' | 'absent' | 'late' | 'od' | 'leave';
  }>;
  recent_notices: Array<{
    id: number;
    title: string;
    description: string;
    created_at: string;
    image_name: string;
    publicUrl?: string;
    attachment_url?: string;
  }>;
  notifications: Array<{
    id: string;
    type: string;
    status: string;
    date: string;
    message: string;
  }>;
  today_timetable: Array<{
    day_of_week: number;
    period: number;
    subject_id: number | null;
    subject: {
      id: number;
      name: string;
      subject_code: string;
    } | null;
  }>;
  has_unclaimed_ps_bonafide: boolean;
}

export interface StudentProfileData extends StudentProfile {
  name?: string;
  email?: string;
  department?: string;
}

export interface AttendanceRecord {
  date: string;
  present: boolean;
  subject?: string | null;
  marked_at?: string;
}

export interface TimetableEntry {
  day: string;
  period: number;
  subject: string;
  staff?: string;
  room?: string;
}

export interface ODApplicationRequest {
  from_date: string; // ISO date
  to_date: string; // ISO date
  reason: string;
  event_name?: string;
  attachment_url?: string | null;
}

export interface LeaveApplicationRequest {
  from_date: string; // ISO date
  to_date: string; // ISO date
  reason: string;
  attachment_url?: string | null;
}

export interface ApplicationResponse {
  id: number;
  student_id: number;
  status: string;
  created_at: string;
  updated_at?: string;
  message?: string;
}

export interface Elective {
  id: number;
  name: string;
  code: string;
  staff?: string;
  seats_available?: number;
  total_seats?: number;
}

export interface ElectiveSelectionResponse {
  id: number;
  elective_id: number;
  message?: string;
  success?: boolean;
}

const studentService = {
  async getDashboard(): Promise<DashboardData> {
    const resp = await api.get<DashboardData>('/student/dashboard/');
    return resp.data;
  },

  async getProfile(): Promise<StudentProfileData> {
    const resp = await api.get<StudentProfileData>('/student/profile/');
    return resp.data;
  },

  async getAttendanceHistory(): Promise<AttendanceRecord[]> {
    const resp = await api.get<AttendanceRecord[]>('/student/attendance/history/');
    return resp.data;
  },

  async getTimeTable(): Promise<TimetableEntry[]> {
    const resp = await api.get<TimetableEntry[]>('/student/timetable/');
    return resp.data;
  },

  async applyForOD(payload: ODApplicationRequest): Promise<ApplicationResponse> {
    const resp = await api.post<ApplicationResponse>('/student/od/apply/', payload);
    return resp.data;
  },

  async applyForLeave(payload: LeaveApplicationRequest): Promise<ApplicationResponse> {
    const resp = await api.post<ApplicationResponse>('/student/leave/apply/', payload);
    return resp.data;
  },

  async getElectives(): Promise<Elective[]> {
    const resp = await api.get<Elective[]>('/student/electives/');
    return resp.data;
  },

  async selectElective(id: number): Promise<ElectiveSelectionResponse> {
    const resp = await api.post<ElectiveSelectionResponse>('/student/electives/select/', { elective_id: id });
    return resp.data;
  },
};

export default studentService;
