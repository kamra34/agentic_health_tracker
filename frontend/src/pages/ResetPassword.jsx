import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import { KeyRound, ArrowLeft, CheckCircle, AlertCircle, Loader } from 'lucide-react';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [username, setUsername] = useState('');

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setMessage({ type: 'error', text: 'Invalid reset link. Token is missing.' });
        setVerifying(false);
        return;
      }

      try {
        await authAPI.verifyResetToken(token);
        setTokenValid(true);
        setVerifying(false);
      } catch (error) {
        setMessage({
          type: 'error',
          text: error.response?.data?.detail || 'Invalid or expired reset link.'
        });
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    // Validate password length
    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: 'Password must be at least 4 characters' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await authAPI.resetPasswordWithToken(token, newPassword, confirmPassword);
      setMessage({ type: 'success', text: response.data.message });
      setUsername(response.data.username);

      // Clear form
      setNewPassword('');
      setConfirmPassword('');

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to reset password'
      });
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <Loader className="w-12 h-12 mx-auto mb-4 text-primary-600 animate-spin" />
          <p className="text-gray-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-primary-700 mb-2">Weight Tracker</h1>
            <p className="text-gray-600">Password Reset</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
              <h2 className="text-xl font-bold text-gray-800 mb-2">Invalid Reset Link</h2>
              <p className="text-gray-600 mb-6">{message.text}</p>
              <Link
                to="/forgot-password"
                className="btn btn-primary inline-flex items-center gap-2"
              >
                Request New Reset Link
              </Link>
            </div>
          </div>

          <p className="text-center text-gray-600 mt-6">
            <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-700 mb-2">Weight Tracker</h1>
          <p className="text-gray-600">Reset Your Password</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-6"
          >
            <ArrowLeft size={16} />
            Back to Login
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="bg-primary-100 p-3 rounded-full">
              <KeyRound className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">Create New Password</h2>
              <p className="text-sm text-gray-600">Enter your new password below</p>
            </div>
          </div>

          {/* Messages */}
          {message.text && (
            <div
              className={`px-4 py-3 rounded-lg mb-4 flex items-start gap-2 ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p>{message.text}</p>
                {message.type === 'success' && username && (
                  <p className="mt-2 text-sm">
                    Your username is: <strong>{username}</strong>
                    <br />
                    Redirecting to login...
                  </p>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                placeholder="Enter new password"
                minLength={4}
                required
                disabled={loading || message.type === 'success'}
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 4 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                placeholder="Confirm new password"
                minLength={4}
                required
                disabled={loading || message.type === 'success'}
              />
            </div>

            <button
              type="submit"
              disabled={loading || message.type === 'success'}
              className="btn btn-primary w-full py-3 text-lg flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Resetting Password...
                </>
              ) : message.type === 'success' ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Password Reset!
                </>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 mt-6">
          Remember your password?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
