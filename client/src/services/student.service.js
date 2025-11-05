// src/services/student.service.js
import api from './api';

export const studentApi = {
  applyBonafide: (data) => api.post('/student/bonafide/apply', data),
  getDashboard: () => api.get('/student/dashboard'),
};
