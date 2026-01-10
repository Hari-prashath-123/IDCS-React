import api from '../lib/api';

export const staffService = {
  getDashboard: async () => {
    const response = await api.get('/staff/dashboard/');
    return response.data;
  },
  getMyClasses: async () => {
    const response = await api.get('/staff/classes/');
    return response.data;
  },
  getPendingApprovals: async () => {
    const response = await api.get('/staff/approvals/');
    return response.data;
  },
  approveRequest: async (id: number, type: 'od' | 'leave', status: 'approved' | 'rejected') => {
    const response = await api.post(`/staff/approvals/${type}/${id}/`, { status });
    return response.data;
  }
};