import api from './api';

export interface User {
  id: number;
  email: string;
  username: string;
  role: 'student' | 'staff' | 'hod' | 'principal';
}

export const authService = {
  async login(credentials: any) {
    // Hits Django's /api/token/ endpoint
    const response = await api.post('/token/', credentials);
    const { access, refresh } = response.data;
    
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    
    return this.getProfile();
  },

  async getProfile() {
    // Hits Django's /api/users/me/ endpoint
    const response = await api.get('/users/me/');
    const user = response.data;
    localStorage.setItem('user', JSON.stringify(user));
    return user;
  },

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
};