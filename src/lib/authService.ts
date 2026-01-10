import api from './api';
import type { AuthResponse, User } from './apiTypes';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

const authService = {
  async login(credentials: { username: string; password: string }): Promise<AuthResponse> {
    const resp = await api.post('/token/', credentials);
    const data: AuthResponse = resp.data;
    if (data.access) localStorage.setItem(ACCESS_KEY, data.access);
    if (data.refresh) localStorage.setItem(REFRESH_KEY, data.refresh);
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },

  async getProfile(): Promise<User> {
    const resp = await api.get('/users/me/');
    const user: User = resp.data;
    try {
      localStorage.setItem('user', JSON.stringify(user));
    } catch {}
    return user;
  },

  logout(redirectTo = '/login') {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem('user');
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.href = redirectTo;
    }
  },

  async refreshToken(): Promise<string> {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!refresh) throw new Error('No refresh token available');
    const resp = await api.post('/token/refresh/', { refresh });
    const data = resp.data as { access?: string };
    const newAccess = data.access;
    if (!newAccess) throw new Error('Invalid refresh response');
    localStorage.setItem(ACCESS_KEY, newAccess);
    return newAccess;
  },
};

export default authService;
