import React, { useState } from 'react';
import {
  Stethoscope,
  Lock,
  User,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Sparkles,
  Heart,
} from 'lucide-react';

const API_BASE = '/api';

export default function StaffLogin({ onLoginSuccess, onBackToRoleLanding }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e, overrideCredentials = null) => {
    if (e) e.preventDefault();
    const finalUsername = overrideCredentials ? overrideCredentials.username : username.trim();
    const finalPassword = overrideCredentials ? overrideCredentials.password : password;

    if (!finalUsername || !finalPassword) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: finalUsername,
          password: finalPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Login failed (${res.status})`);
      }

      const data = await res.json();
      // Store in sessionStorage
      sessionStorage.setItem('predoc_auth_token', data.access_token);
      sessionStorage.setItem('predoc_user', JSON.stringify(data.user));
      sessionStorage.setItem('predoc_role', 'doctor');

      if (onLoginSuccess) {
        onLoginSuccess({
          token: data.access_token,
          user: data.user,
        });
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  const fillAndSubmitDemo = (demoUser, demoPass) => {
    setUsername(demoUser);
    setPassword(demoPass);
    handleLogin(null, { username: demoUser, password: demoPass });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EAF1FF] via-[#F6F9FF] to-[#E8F4FF] flex flex-col justify-between">
      {/* Top bar */}
      <header className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2F6FED] flex items-center justify-center shadow-sm">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-extrabold text-[#1A2B4C] tracking-tight">PreDoc</span>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-[#EAF1FF] text-[#2F6FED] text-[10px] font-semibold">
              Clinical Portal
            </span>
          </div>
        </div>

        {onBackToRoleLanding && (
          <button
            onClick={onBackToRoleLanding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] text-xs font-medium transition shadow-xs"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Role Selection</span>
          </button>
        )}
      </header>

      {/* Main card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white border border-[#E2E8F4] rounded-3xl p-8 shadow-soft space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mx-auto shadow-xs">
              <KeyRound className="w-7 h-7 text-[#2F6FED]" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#1A2B4C] tracking-tight">
              Staff Portal Login
            </h1>
            <p className="text-xs text-[#6B7A99]">
              Enter authorized clinical staff credentials to access Doctor and Triage dashboards.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] text-xs flex items-center gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#1A2B4C] mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6B7A99]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="staff-username-input"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. doctor_demo"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] text-xs text-[#1A2B4C] focus:outline-none focus:border-[#2F6FED]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#1A2B4C] mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#6B7A99]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="staff-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] text-xs text-[#1A2B4C] focus:outline-none focus:border-[#2F6FED]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#6B7A99] hover:text-[#1A2B4C]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="staff-login-btn"
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick demo accounts */}
          <div className="pt-4 border-t border-[#E2E8F4] space-y-2.5">
            <p className="text-[11px] font-semibold text-[#6B7A99] text-center uppercase tracking-wider">
              ⚡ Demo Accounts (Hackathon Quick Fill)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="demo-doctor-login-btn"
                onClick={() => fillAndSubmitDemo('doctor_demo', 'doctor123')}
                disabled={loading}
                className="p-2.5 rounded-xl border border-[#2FAE60]/40 bg-[#EAF7EE] hover:bg-[#d6f0df] text-left transition flex flex-col gap-0.5 text-xs text-[#1A2B4C]"
              >
                <div className="flex items-center gap-1 font-bold text-[#2FAE60]">
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>Doctor</span>
                </div>
                <div className="text-[10px] text-[#6B7A99]">Full access & drafts</div>
              </button>

              <button
                type="button"
                id="demo-nurse-login-btn"
                onClick={() => fillAndSubmitDemo('nurse_demo', 'nurse123')}
                disabled={loading}
                className="p-2.5 rounded-xl border border-[#2F6FED]/40 bg-[#EAF1FF] hover:bg-[#dbe7ff] text-left transition flex flex-col gap-0.5 text-xs text-[#1A2B4C]"
              >
                <div className="flex items-center gap-1 font-bold text-[#2F6FED]">
                  <Heart className="w-3.5 h-3.5" />
                  <span>Nurse</span>
                </div>
                <div className="text-[10px] text-[#6B7A99]">Triage queue only</div>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-[#6B7A99]">
        PreDoc · Staff Authentication · Bcrypt + JWT Secured
      </footer>
    </div>
  );
}
