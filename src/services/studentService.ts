import api from '../lib/api';
import type { DRFObject, DRFPaginated, StudentProfile } from '../lib/apiTypes';

// Domain-specific types for student service
export interface DashboardData {
  // adapt fields to your backend; keep flexible
  announcements?: Array<{ id: number; title: string; content: string }>;
  stats?: Record<string, number>;
}

export interface LeaveApplicationRequest {
  from_date: string; // ISO date
  to_date: string; // ISO date
  reason: string;
  attachment_url?: string | null;
}

export interface LeaveApplicationResponse {
  id: number;
  student_id: number;
  status: string;
  created_at: string;
  updated_at?: string;
}

export interface AttendanceRecord {
  date: string;
  present: boolean;
  subject?: string | null;
}

const studentService = {
  async getDashboardData(): Promise<DashboardData> {
    const resp = await api.get<DashboardData>('/student/dashboard/');
    return resp.data;
  },

  async applyForLeave(payload: LeaveApplicationRequest): Promise<LeaveApplicationResponse> {
    const resp = await api.post<LeaveApplicationResponse>('/applications/leave/', payload);
    return resp.data;
  },

  async getAttendance(): Promise<AttendanceRecord[]> {
    const resp = await api.get<AttendanceRecord[]>('/student/attendance/');
    return resp.data;
  },
};

export default studentService;
