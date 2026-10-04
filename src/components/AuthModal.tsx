import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  X,
  Zap,
} from 'lucide-react';
import { User } from '../types';
import {
  resetPasswordForEmail,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '../services/supabaseClient';

export interface AuthModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSuccess?: (user: User) => void;
  onSelectUser?: (user: User) => void;
  currentUserId?: string;
  initialMode?: 'register' | 'login';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  onSelectUser,
  initialMode = 'register',
}) => {
  const [activeTab, setActiveTab] = useState<'register' | 'login' | 'forgot_password'>(initialMode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialMode);
    setError(null);
    setInfoMessage(null);
  }, [initialMode]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      const result = await signInWithGoogle();
      if (result.error) {
        setError(result.error.message || 'Google sign-in failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in error');
    } finally {
      setGoogleLoading(false);
    }
  };

  if (isOpen === false) return null;

  const handleCompleteAuth = (user: User) => {
    if (onSelectUser) onSelectUser(user);
    if (onSuccess) onSuccess(user);
    onClose();
  };

  const validateEmail = (e: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  };

  const handleDirectEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      // 1. Authenticate with Supabase Email + Password
      const supaRes = await signInWithEmail(cleanEmail, password);

      if (supaRes.error) {
        // Safe generic authentication error: NEVER reveal whether an email exists
        setError('Invalid email or password. Please check your credentials or click "Forgot Password?".');
        setLoading(false);
        return;
      }

      const supaUser = supaRes.data?.user;
      const userEmail = supaUser?.email || cleanEmail;
      const displayName = supaUser?.user_metadata?.name || userEmail.split('@')[0];

      // 2. Fetch/sync matching FirstRound SQLite profile
      const res = await fetch('/api/auth/login-or-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          name: displayName,
        }),
      });

      const data = await res.json();
      if (data.user) {
        handleCompleteAuth(data.user);
      } else {
        throw new Error(data.error || 'Failed to resolve user profile.');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanName = name.trim();

    if (!cleanName) {
      setError('Please enter your full name.');
      return;
    }
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Confirm password does not match. Please re-enter your password.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      // 1. Register with Supabase Auth
      const supaRes = await signUpWithEmail(cleanEmail, password, { name: cleanName });

      if (supaRes.error) {
        setError(supaRes.error.message || 'Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      // 2. Create/sync SQLite candidate profile (role enforced as 'student' server-side)
      const res = await fetch('/api/auth/login-or-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          name: cleanName,
        }),
      });

      const data = await res.json();
      if (data.user) {
        handleCompleteAuth(data.user);
      } else {
        throw new Error(data.error || 'Failed to create candidate profile.');
      }
    } catch (err: any) {
      setError(err.message || 'Error registering profile');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !validateEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    try {
      await resetPasswordForEmail(cleanEmail);
      // Always show safe generic message so account existence is never leaked
      setInfoMessage('Check your email for a password reset link.');
    } catch (err: any) {
      setInfoMessage('Check your email for a password reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm p-3 sm:p-4 flex items-center justify-center animate-in fade-in"
    >
      <div
        id="auth-modal"
        className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden text-slate-900 my-6"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 bg-primary border-b border-primary-dark text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
              <Zap className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-['Outfit'] text-white">FirstRound Candidate Access</h2>
              <p className="text-xs text-slate-300">Sign in to start practicing placement assessments</p>
            </div>
          </div>
          <button
            id="close-auth-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector — Hidden when in Forgot Password mode */}
        {activeTab !== 'forgot_password' && (
          <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold">
            <button
              onClick={() => {
                setActiveTab('register');
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex-1 py-3 text-center transition-colors border-b-2 cursor-pointer ${
                activeTab === 'register'
                  ? 'border-amber-400 bg-white text-primary font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Register New Candidate
            </button>
            <button
              onClick={() => {
                setActiveTab('login');
                setError(null);
                setInfoMessage(null);
              }}
              className={`flex-1 py-3 text-center transition-colors border-b-2 cursor-pointer ${
                activeTab === 'login'
                  ? 'border-amber-400 bg-white text-primary font-black'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
          </div>
        )}

        <div className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold">
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-semibold">
              {infoMessage}
            </div>
          )}

          {/* Forgot Password Screen */}
          {activeTab === 'forgot_password' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setError(null);
                    setInfoMessage(null);
                  }}
                  className="p-1 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-sm font-bold text-slate-900 font-['Outfit']">Reset Your Password</h3>
              </div>
              <p className="text-xs text-slate-500">
                Enter your registered email address below and we'll send you a password reset link.
              </p>

              <form onSubmit={handleForgotPasswordSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    id="forgot-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-primary shadow-2xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-60"
                  >
                    {loading ? 'Sending link...' : 'Send Reset Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('login');
                      setError(null);
                      setInfoMessage(null);
                    }}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Google OAuth Button — visible on Register & Sign In tabs */}
              <button
                id="google-signin-btn"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs disabled:opacity-60 cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleLoading ? 'Redirecting to Google...' : 'Continue with Google'}
              </button>

              <div className="relative flex items-center justify-center my-1">
                <div className="border-t border-slate-200 w-full"></div>
                <span className="bg-white px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest absolute">
                  or use email
                </span>
              </div>

              {activeTab === 'register' ? (
                /* Registration Form */
                <form onSubmit={handleRegisterSubmit} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="register-name-input"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your full name"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-primary shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="register-email-input"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email address"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-primary shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Password <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="register-password-input"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a password"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-primary shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Confirm Password <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="register-confirm-password-input"
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-primary shadow-2xs"
                      />
                    </div>
                  </div>

                  <button
                    id="submit-register-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? 'Registering Profile...' : 'Register Profile & Enter FirstRound'}
                  </button>
                </form>
              ) : (
                /* Sign In Form */
                <form onSubmit={handleDirectEmailLogin} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                    <input
                      id="login-email-input"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-primary shadow-2xs"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">Password</label>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('forgot_password');
                          setError(null);
                          setInfoMessage(null);
                        }}
                        className="text-2xs font-bold text-primary hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <input
                      id="login-password-input"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-primary shadow-2xs"
                    />
                  </div>

                  <button
                    id="submit-login-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
