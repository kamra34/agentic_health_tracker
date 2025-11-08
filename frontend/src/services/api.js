import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
      // Only redirect if we have a token (user was authenticated but token expired)
      // Don't redirect on login failures (when there's no token)
      const token = localStorage.getItem('token');
      if (token) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
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
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }),
  verifyResetToken: (token) => api.post('/api/auth/verify-reset-token', { token }),
  resetPasswordWithToken: (token, newPassword, confirmPassword) =>
    api.post('/api/auth/reset-password', { token, new_password: newPassword, confirm_password: confirmPassword }),
  forgotUsername: (email) => api.post('/api/auth/forgot-username', { email }),
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

// Admin APIs
export const adminAPI = {
  listUsers: () => api.get('/api/admin/users'),
  createUser: (data, isAdmin = false) => api.post('/api/admin/users', data, { params: { is_admin: isAdmin } }),
  setAdmin: (userId, isAdmin) => api.put(`/api/admin/users/${userId}/admin`, null, { params: { is_admin: isAdmin } }),
  updateUser: (userId, data) => api.put(`/api/admin/users/${userId}`, data),
  deleteTarget: (targetId) => api.delete(`/api/admin/targets/${targetId}`),
  getUser: (userId) => api.get(`/api/admin/users/${userId}`),
  getUserTargets: (userId) => api.get(`/api/admin/users/${userId}/targets`),
  deleteUser: (userId) => api.delete(`/api/admin/users/${userId}`),
  setUserPassword: (userId, newPassword) => api.post(`/api/admin/users/${userId}/set-password`, null, { params: { new_password: newPassword } }),
};

// Insights APIs
export const insightsAPI = {
  getSummary: (params = {}) => api.get('/api/insights/summary', { params }),
  getForecast: ({ metric = 'weight', horizon = 60, method = 'holt', train_window_days = 60, alpha, beta } = {}) =>
    api.get('/api/insights/forecast', { params: { metric, horizon, method, train_window_days, alpha, beta } }),
  getComposition: () => api.get('/api/insights/composition'),
  getDistributions: (bins = 20, params = {}) => api.get('/api/insights/distributions', { params: { bins, ...params } }),
  getSeasonality: (params = {}) => api.get('/api/insights/seasonality', { params }),
  getGoalAnalytics: () => api.get('/api/insights/goal-analytics'),
  getCalendar: (days = 365) => api.get('/api/insights/calendar', { params: { days } }),
};

// Chat API (v2 + async tasks)
export const chatAPI = {
  send: (messages) => api.post('/api/chat/v2', { messages }),
  startTask: (messages) => api.post('/api/chat/v2/task', { messages }),
  getTask: (taskId) => api.get(`/api/chat/v2/tasks/${taskId}`),
};

export default api;

