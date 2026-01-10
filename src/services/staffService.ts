import api from '../lib/api';

export interface PendingApproval {
  id: number;
  application_id: number;
  applicant_name: string;
  submitted_at: string;
  type: string;
  details?: any;
}

export interface ApprovalActionResponse {
  ok: boolean;
  id?: number;
  message?: string;
}

export interface ClassAttendanceRecord {
  student_id: number;
  student_name: string;
  date: string;
  present: boolean;
}

const staffService = {
  async getPendingApprovals(): Promise<PendingApproval[]> {
    const resp = await api.get<PendingApproval[]>('/staff/approvals/');
    return resp.data;
  },

  async approveRequest(id: number | string, status: string, comment?: string): Promise<ApprovalActionResponse> {
    const resp = await api.post<ApprovalActionResponse>(`/staff/approvals/${id}/action/`, { status, comment });
    return resp.data;
  },

  async getClassAttendance(sectionId: number | string): Promise<ClassAttendanceRecord[]> {
    const resp = await api.get<ClassAttendanceRecord[]>(`/staff/attendance/${sectionId}`);
    return resp.data;
  },
};

export default staffService;
