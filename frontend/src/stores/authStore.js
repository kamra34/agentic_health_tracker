import { create } from 'zustand';
import { authAPI } from '../services/api';
import { queryClient } from '../main';

const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      // Clear all cached data before login to prevent data leakage between users
      queryClient.clear();

      const response = await authAPI.login(username, password);
      const { access_token } = response.data;

      localStorage.setItem('token', access_token);

      // Get user info
      const userResponse = await authAPI.getMe();

      set({
        token: access_token,
        user: userResponse.data,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      return true;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Login failed';
      set({
        error: errorMessage,
        isLoading: false,
      });
      return false;
    }
  },

  signup: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      // Clear all cached data before signup to prevent data leakage between users
      queryClient.clear();

      await authAPI.signup(userData);

      // Auto-login after signup (login will also clear cache)
      const loginSuccess = await useAuthStore.getState().login(
        userData.name,
        userData.password
      );

      return loginSuccess;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Signup failed';
      set({
        error: errorMessage,
        isLoading: false,
      });
      return false;
    }
  },

  logout: () => {
    // Clear all cached data on logout to prevent data leakage between users
    queryClient.clear();

    localStorage.removeItem('token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
    });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }

    set({ isLoading: true });
    try {
      const response = await authAPI.getMe();
      set({
        user: response.data,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      // Clear cache when token is invalid
      queryClient.clear();

      localStorage.removeItem('token');
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
