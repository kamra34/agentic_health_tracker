import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import { KeyRound, User as UserIcon, ArrowLeft } from 'lucide-react';

function ForgotPassword() {
  const [activeTab, setActiveTab] = useState('password'); // 'password' or 'username'
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' }); // type: 'success' or 'error'

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await authAPI.forgotPassword(email);
      setMessage({
        type: 'success',
        text: response.data.message || 'If an account exists with this email, a password reset link has been sent.'
      });
      setEmail('');
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to send reset link'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotUsername = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await authAPI.forgotUsername(email);
      // Check if username is included (fallback when email is not configured)
      if (response.data.username) {
        setMessage({
          type: 'success',
          text: response.data.message || `Your username is: ${response.data.username}`
        });
      } else {
        // Email was sent successfully
        setMessage({
          type: 'success',
          text: response.data.message || 'Your username has been sent to your email address.'
        });
      }
      setEmail('');
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || 'Failed to retrieve username'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-700 mb-2">Weight Tracker</h1>
          <p className="text-gray-600">Account Recovery</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-6"
          >
            <ArrowLeft size={16} />
            Back to Login
          </Link>

          {/* Tab Navigation */}
          <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => {
                setActiveTab('password');
                setMessage({ type: '', text: '' });
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
                activeTab === 'password'
                  ? 'bg-white text-primary-700 shadow-sm font-medium'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <KeyRound size={18} />
              Reset Password
            </button>
            <button
              onClick={() => {
                setActiveTab('username');
                setMessage({ type: '', text: '' });
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
                activeTab === 'username'
                  ? 'bg-white text-primary-700 shadow-sm font-medium'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <UserIcon size={18} />
              Forgot Username
            </button>
          </div>

          {/* Messages */}
          {message.text && (
            <div
              className={`px-4 py-3 rounded-lg mb-4 ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Reset Password Form */}
          {activeTab === 'password' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="your@email.com"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  A secure password reset link will be sent to this email address
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-3 text-lg"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <p className="text-xs text-gray-500 mt-4">
                The reset link will expire in 15 minutes for security reasons.
              </p>
            </form>
          )}

          {/* Forgot Username Form */}
          {activeTab === 'username' && (
            <form onSubmit={handleForgotUsername} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="your@email.com"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Your username will be sent to this email address
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full py-3 text-lg"
              >
                {loading ? 'Retrieving...' : 'Retrieve Username'}
              </button>

              <p className="text-xs text-gray-500 mt-4">
                Note: If email is not configured on the server, the username will be displayed here instead.
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-gray-600 mt-6">
          Remember your credentials?{' '}
          <Link to="/login" className="text-primary-600 font-medium hover:text-primary-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
