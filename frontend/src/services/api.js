import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (username, password) =>
    api.post('/api/auth/login', 
      new URLSearchParams({ username, password }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),
  signup: (userData) => api.post('/api/auth/signup', userData),
  getMe: () => api.get('/api/auth/me'),
  changePassword: (oldPassword, newPassword) =>
    api.post('/api/auth/change-password', null, {
      params: { old_password: oldPassword, new_password: newPassword }
    }),
};

// User APIs
export const userAPI = {
  getProfile: () => api.get('/api/users/me'),
  updateProfile: (data) => api.put('/api/users/me', data),
  getStats: () => api.get('/api/users/stats'),
  getDashboard: () => api.get('/api/users/dashboard'),
};

// Weight APIs
export const weightAPI = {
  create: (data) => api.post('/api/weights', data),
  list: (params) => api.get('/api/weights', { params }),
  getLatest: () => api.get('/api/weights/latest'),
  getById: (id) => api.get(`/api/weights/${id}`),
  update: (id, data) => api.put(`/api/weights/${id}`, data),
  delete: (id) => api.delete(`/api/weights/${id}`),
  backfillEstimates: (overwrite = true) =>
    api.post('/api/weights/backfill-estimates', null, { params: { overwrite } }),
};

// Target APIs
export const targetAPI = {
  create: (data) => api.post('/api/targets', data),
  list: (params) => api.get('/api/targets', { params }),
  getActive: () => api.get('/api/targets/active'),
  getById: (id) => api.get(`/api/targets/${id}`),
  update: (id, data) => api.put(`/api/targets/${id}`, data),
  delete: (id) => api.delete(`/api/targets/${id}`),
  complete: (id) => api.post(`/api/targets/${id}/complete`),
  cancel: (id) => api.post(`/api/targets/${id}/cancel`),
};

export default api;
