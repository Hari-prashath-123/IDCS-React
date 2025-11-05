// src/services/auth.service.js
import api from './api';

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) => api.post('/auth/reset-password', { token, newPassword }),
};
