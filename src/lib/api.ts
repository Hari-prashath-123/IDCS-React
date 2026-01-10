import axios, { AxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api', // Your Django Backend URL
});

// Automatically add the JWT Token to every request
api.interceptors.request.use((config: AxiosRequestConfig | any) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    if (!config.headers) config.headers = {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
