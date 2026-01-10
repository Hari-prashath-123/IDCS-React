import api from '../lib/api';

export type ApprovalStatus = 'approved' | 'rejected';

export interface StaffDashboardData {
  pending_approvals_count?: number;
  classes?: Array<{ id: number; name: string; section: string }>;
  recent_activity?: Array<{ id: number; message: string; timestamp: string }>;
}

export interface ClassInfo {
  id: number;
  name: string;
  section: string;
  year: number;
  department: string;
  student_count?: number;
}

export interface AttendanceMarkRequest {
  class_id: number;
  date: string; // ISO date
  absentees: number[]; // array of student IDs
}

export interface AttendanceMarkResponse {
  success: boolean;
  message?: string;
  marked_count?: number;
}

export interface LeaveRequest {
  id: number;
  student_id: number;
  student_name: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  submitted_at: string;
}

export interface ODRequest {
  id: number;
  student_id: number;
  student_name: string;
  from_date: string;
  to_date: string;
  reason: string;
  event_name?: string;
  status: string;
  submitted_at: string;
}

export interface ApprovalResponse {
  success: boolean;
  message?: string;
  id?: number;
}

const staffService = {
  async getDashboard(): Promise<StaffDashboardData> {
    const resp = await api.get<StaffDashboardData>('/staff/dashboard/');
    return resp.data;
  },

  async getMyClasses(): Promise<ClassInfo[]> {
    const resp = await api.get<ClassInfo[]>('/staff/classes/');
    return resp.data;
  },

  async markAttendance(classId: number, date: string, absentees: number[]): Promise<AttendanceMarkResponse> {
    const resp = await api.post<AttendanceMarkResponse>('/staff/attendance/mark/', {
      class_id: classId,
      date,
      absentees,
    });
    return resp.data;
  },

  async getLeaveRequests(): Promise<LeaveRequest[]> {
    const resp = await api.get<LeaveRequest[]>('/staff/approvals/leave/');
    return resp.data;
  },

  async approveLeave(id: number, status: ApprovalStatus): Promise<ApprovalResponse> {
    const resp = await api.post<ApprovalResponse>(`/staff/approvals/leave/${id}/`, { status });
    return resp.data;
  },

  async getODRequests(): Promise<ODRequest[]> {
    const resp = await api.get<ODRequest[]>('/staff/approvals/od/');
    return resp.data;
  },

  async approveOD(id: number, status: ApprovalStatus): Promise<ApprovalResponse> {
    const resp = await api.post<ApprovalResponse>(`/staff/approvals/od/${id}/`, { status });
    return resp.data;
  },
};

export default staffService;
