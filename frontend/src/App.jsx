import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './stores/authStore';

// Placeholder components (we'll create these in the next phase)
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import WeightEntry from './pages/WeightEntry';
import TargetEntry from './pages/TargetEntry';
import Insights from './pages/Insights';
import Profile from './pages/Profile';
import Layout from './components/Layout';

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function App() {
  const loadUser = useAuthStore((state) => state.loadUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />}
      />
      <Route
        path="/signup"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <Signup />}
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="weights" element={<WeightEntry />} />
        <Route path="targets" element={<TargetEntry />} />
        <Route path="insights" element={<Insights />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
