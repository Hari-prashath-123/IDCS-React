import api from '../lib/api';

export const studentService = {
  getDashboard: async () => {
    const response = await api.get('/student/dashboard/');
    return response.data;
  },
  getProfile: async () => {
    const response = await api.get('/student/profile/');
    return response.data;
  },
  getAttendance: async () => {
    const response = await api.get('/student/attendance/');
    return response.data;
  },
  applyOD: async (data: any) => {
    const response = await api.post('/student/od/apply/', data);
    return response.data;
  },
  applyLeave: async (data: any) => {
    const response = await api.post('/student/leave/apply/', data);
    return response.data;
  },
  getElectives: async () => {
    const response = await api.get('/student/electives/');
    return response.data;
  },
  selectElective: async (electiveId: number) => {
    const response = await api.post('/student/electives/select/', { id: electiveId });
    return response.data;
  }
};