import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Stethoscope,
  ShieldAlert,
  FileText,
  ChevronLeft,
  User,
  LogOut,
  Heart,
  Pill,
  Layers,
} from 'lucide-react';
import PatientKiosk from './components/PatientKiosk';
import CaseDraftPage from './components/CaseDraftPage';
import TriageDashboard from './components/TriageDashboard';
import DoctorDashboard from './components/DoctorDashboard';
import PrescriptionTab from './components/PrescriptionTab';
import TemplateEditor from './components/TemplateEditor';
import RoleLanding from './components/RoleLanding';
import StaffLogin from './components/StaffLogin';
import PublicPrescriptionPage from './components/PublicPrescriptionPage';

// ─── Backend health hook ──────────────────────────────────────────────────────
function useBackendHealth() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = async (isManual = false) => {
    if (isManual || !healthData) setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
      const endpoint = '/api/health';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      let res;
      try {
        res = await fetch(endpoint, { signal: controller.signal });
      } catch (err1) {
        if (err1.name === 'AbortError') throw err1;
        res = await fetch(`${apiUrl}${endpoint}`, { signal: controller.signal });
      }
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setHealthData(data);
      setError(null);
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      setError(isTimeout ? 'Connection timed out' : (err.message || 'Failed to connect'));
      setHealthData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth(true);
    const interval = setInterval(() => fetchHealth(false), 8000);
    return () => clearInterval(interval);
  }, []);

  return { healthData, loading, error, fetchHealth };
}

// ─── Shared top status pill ───────────────────────────────────────────────────
function StatusPill({ healthData, loading, error, onRefresh }) {
  return (
    <div className="flex items-center gap-2">
      <div
        id="backend-status-pill"
        title={healthData ? `Backend connected (Gemini: ${healthData.gemini_configured ? 'Ready' : 'Not configured'})` : error || 'Backend unreachable'}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border cursor-default ${
          loading
            ? 'bg-[#FEF6E9] text-[#F5A623] border-[#F5A623]/30'
            : healthData?.message === 'PreDoc backend connected'
            ? 'bg-[#EAF7EE] text-[#2FAE60] border-[#2FAE60]/30'
            : 'bg-[#FEECEE] text-[#E5484D] border-[#E5484D]/30'
        }`}
      >
        <span className={`inline-block w-2 h-2 rounded-full ${loading ? 'bg-[#F5A623]' : healthData ? 'bg-[#2FAE60]' : 'bg-[#E5484D]'}`} />
        <span>{loading ? 'Connecting...' : healthData ? 'Online' : 'Offline'}</span>
      </div>
      <button
        onClick={() => onRefresh(true)}
        disabled={loading}
        className="p-2 rounded-full bg-[#F6F9FF] border border-[#E2E8F4] hover:bg-[#EAF1FF] text-[#6B7A99] hover:text-[#2F6FED] transition disabled:opacity-50"
        title="Refresh connection"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2F6FED]' : ''}`} />
      </button>
    </div>
  );
}

// ─── Patient shell (Kiosk Mode) ────────────────────────────────────────────────
function PatientShell({ onSwitchRole, healthData, loading, error, fetchHealth }) {
  return (
    <div className="min-h-screen bg-[#F6F9FF]">
      {/* Minimal patient header */}
      <header className="bg-white border-b border-[#E2E8F4] sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#EAF1FF] flex items-center justify-center shadow-sm">
              <Activity className="w-5 h-5 text-[#2F6FED]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-[#1A2B4C]">PreDoc</span>
                <span className="px-2 py-0.5 rounded-full bg-[#EAF7EE] text-[#2FAE60] text-[10px] font-semibold">
                  Patient Kiosk
                </span>
              </div>
              <p className="text-[10px] text-[#6B7A99]">Pre-visit health intake</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill healthData={healthData} loading={loading} error={error} onRefresh={fetchHealth} />
            <button
              id="switch-role-btn"
              onClick={onSwitchRole}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] text-xs font-medium transition"
              title="Change role"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Change Role
            </button>
          </div>
        </div>
      </header>

      {/* Patient-only content: isolated kiosk intake */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <PatientKiosk onSwitchRole={onSwitchRole} />
      </main>

      <footer className="mt-10 py-5 text-center text-xs text-[#6B7A99] border-t border-[#E2E8F4] bg-white">
        PreDoc · Patient Pre-Consultation Kiosk · Powered by Gemini AI
      </footer>
    </div>
  );
}

// ─── Doctor / Staff shell ──────────────────────────────────────────────────────
function DoctorShell({
  onSwitchRole,
  onLogout,
  currentUser,
  authToken,
  healthData,
  loading,
  error,
  fetchHealth,
}) {
  const [urgentCount, setUrgentCount] = useState(0);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);

  const isNurse = currentUser?.role === 'nurse';

  const [currentVisitId, setCurrentVisitId] = useState(() => {
    const match = window.location.pathname.match(/\/(?:case|doctor)\/(\d+)/);
    return match ? Number(match[1]) : 1;
  });

  const [activeTab, setActiveTab] = useState(() => {
    if (isNurse) return 'triage';
    if (window.location.pathname.startsWith('/case/')) return 'case';
    if (window.location.pathname.startsWith('/doctor/templates') || window.location.pathname.startsWith('/templates')) return 'templates';
    if (window.location.pathname.startsWith('/doctor/')) {
      const m = window.location.pathname.match(/\/doctor\/(\d+)/);
      if (m) return 'case';
      return 'doctor';
    }
    if (window.location.pathname.startsWith('/triage')) return 'triage';
    return 'doctor';
  });

  useEffect(() => {
    const handlePop = () => {
      const caseMatch = window.location.pathname.match(/\/(?:case|doctor)\/(\d+)/);
      if (caseMatch) {
        setCurrentVisitId(Number(caseMatch[1]));
        setActiveTab(isNurse ? 'triage' : 'case');
      } else if (window.location.pathname.startsWith('/triage')) {
        setActiveTab('triage');
      } else if (window.location.pathname.startsWith('/doctor/templates') || window.location.pathname.startsWith('/templates')) {
        setActiveTab('templates');
      } else {
        setActiveTab(isNurse ? 'triage' : 'doctor');
      }
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [isNurse]);

  const fetchCounts = async () => {
    try {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const [triageRes, queueRes] = await Promise.all([
        fetch('/api/visits/triage', { headers }),
        fetch('/api/visits/doctor-queue', { headers }),
      ]);
      if (triageRes.status === 401 || queueRes.status === 401) {
        if (onLogout) onLogout();
        return;
      }
      if (triageRes.ok) {
        const d = await triageRes.json();
        setUrgentCount(d.length);
      }
      if (queueRes.ok) {
        const d = await queueRes.json();
        setPendingDraftCount(d.filter((v) => !v.is_approved).length);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 8000);
    return () => clearInterval(interval);
  }, [authToken]);

  const navigateToCase = (vid) => {
    if (isNurse) return; // Nurses only see triage dashboard
    const idNum = Number(vid) || 1;
    setCurrentVisitId(idNum);
    setActiveTab('case');
    window.history.pushState(null, '', `/case/${idNum}`);
  };

  const navigateToTab = (tab) => {
    if (isNurse && tab !== 'triage') return;
    setActiveTab(tab);
    if (tab === 'case') window.history.pushState(null, '', `/case/${currentVisitId}`);
    else if (tab === 'triage') window.history.pushState(null, '', '/triage');
    else if (tab === 'templates') window.history.pushState(null, '', '/doctor/templates');
    else window.history.pushState(null, '', '/doctor');
  };

  // Build role-filtered navigation tabs
  const allTabs = [
    {
      id: 'doctor',
      label: 'Doctor Dashboard',
      icon: Stethoscope,
      badge: pendingDraftCount > 0 ? pendingDraftCount : null,
      badgeColor: 'bg-[#FEF6E9] text-[#F5A623]',
      badgeActiveColor: 'bg-white text-[#2F6FED]',
      roles: ['doctor'],
    },
    {
      id: 'triage',
      label: 'Triage Dashboard',
      icon: ShieldAlert,
      badge: urgentCount > 0 ? urgentCount : null,
      badgeColor: 'bg-[#FEECEE] text-[#E5484D]',
      badgeActiveColor: 'bg-white text-[#E5484D]',
      roles: ['doctor', 'nurse'],
    },
    {
      id: 'case',
      label: 'Case Review',
      icon: FileText,
      badge: `#${currentVisitId}`,
      badgeColor: 'bg-[#EAF1FF] text-[#2F6FED]',
      badgeActiveColor: 'bg-white/20 text-white',
      roles: ['doctor'],
    },
    {
      id: 'prescriptions',
      label: 'Prescriptions',
      icon: Pill,
      badge: null,
      badgeColor: 'bg-[#EAF1FF] text-[#2F6FED]',
      badgeActiveColor: 'bg-white text-[#2F6FED]',
      roles: ['doctor'],
    },
    {
      id: 'templates',
      label: 'Letterhead Templates',
      icon: Layers,
      badge: null,
      badgeColor: 'bg-[#EAF1FF] text-[#2F6FED]',
      badgeActiveColor: 'bg-white text-[#2F6FED]',
      roles: ['doctor'],
    },
  ];

  const NAV_TABS = allTabs.filter((tab) => tab.roles.includes(currentUser?.role || 'doctor'));

  return (
    <div className="min-h-screen bg-[#F6F9FF] text-[#1A2B4C]">
      {/* Doctor / Staff header */}
      <header className="bg-white border-b border-[#E2E8F4] sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-sm ${
              isNurse ? 'bg-[#EAF1FF] text-[#2F6FED]' : 'bg-[#EAF7EE] text-[#2FAE60]'
            }`}>
              {isNurse ? <Heart className="w-5 h-5 text-[#2F6FED]" /> : <Stethoscope className="w-5 h-5 text-[#2FAE60]" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-[#1A2B4C]">PreDoc</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  isNurse ? 'bg-[#EAF1FF] text-[#2F6FED]' : 'bg-[#EAF7EE] text-[#2FAE60]'
                }`}>
                  {isNurse ? 'Nurse Portal' : 'Doctor Portal'}
                </span>
              </div>
              <p className="text-[10px] text-[#6B7A99]">
                {isNurse ? 'Urgent triage & department routing' : 'Clinical case review & approval portal'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* User Indicator */}
            <div
              id="staff-logged-in-indicator"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F6F9FF] border border-[#E2E8F4] text-xs"
            >
              <User className="w-3.5 h-3.5 text-[#2F6FED]" />
              <span className="text-[#6B7A99] hidden sm:inline">Logged in as</span>
              <span className="font-bold text-[#1A2B4C]">{currentUser?.username || 'Staff'}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                isNurse ? 'bg-[#EAF1FF] text-[#2F6FED]' : 'bg-[#EAF7EE] text-[#2FAE60]'
              }`}>
                {currentUser?.role || 'staff'}
              </span>
            </div>

            <StatusPill healthData={healthData} loading={loading} error={error} onRefresh={fetchHealth} />

            {/* Logout button */}
            <button
              id="staff-logout-btn"
              onClick={onLogout}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#E5484D]/30 bg-[#FEECEE] hover:bg-[#E5484D] text-[#E5484D] hover:text-white text-xs font-semibold transition shadow-xs"
              title="Log out of staff portal"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>

            <button
              id="switch-role-btn"
              onClick={onSwitchRole}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] text-xs font-medium transition"
              title="Change role"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Role</span>
            </button>
          </div>
        </div>
      </header>

      {/* Staff nav tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
        <nav className="p-1.5 rounded-full bg-white border border-[#E2E8F4] shadow-soft inline-flex items-center gap-1.5 flex-wrap">
          {NAV_TABS.map(({ id, label, icon: Icon, badge, badgeColor, badgeActiveColor }) => (
            <button
              key={id}
              id={`tab-${id}`}
              onClick={() => navigateToTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition ${
                activeTab === id
                  ? 'bg-[#2F6FED] text-white shadow-sm'
                  : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {badge && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === id ? badgeActiveColor : badgeColor
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Staff main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {activeTab === 'doctor' && !isNurse && (
          <DoctorDashboard
            onOpenReview={navigateToCase}
            onNavigateIntake={null}
            authToken={authToken}
            onAuthError={onLogout}
          />
        )}
        {activeTab === 'triage' && (
          <TriageDashboard
            onNavigateCase={navigateToCase}
            onNavigateIntake={null}
            authToken={authToken}
            onAuthError={onLogout}
          />
        )}
        {activeTab === 'case' && !isNurse && (
          <CaseDraftPage
            visitId={currentVisitId}
            onBack={() => navigateToTab('doctor')}
            onNavigateVisit={navigateToCase}
            authToken={authToken}
            onAuthError={onLogout}
          />
        )}
        {activeTab === 'prescriptions' && !isNurse && (
          <PrescriptionTab
            visitId={currentVisitId}
            patientData={null}
            doctorName={currentUser?.username ? `Dr. ${currentUser.username}` : 'Dr. Attending Physician'}
            authToken={authToken}
            onAuthError={onLogout}
          />
        )}
        {activeTab === 'templates' && !isNurse && (
          <TemplateEditor
            visitId={currentVisitId}
            currentUser={currentUser}
            authToken={authToken}
            onAuthError={onLogout}
          />
        )}
      </main>

      <footer className="mt-12 bg-white border-t border-[#E2E8F4] py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[#6B7A99] gap-2">
          <span>PreDoc · Staff Portal · Authenticated Clinical Case Review</span>
          <div className="flex items-center gap-3">
            <span>FastAPI</span>
            <span>•</span>
            <span>React</span>
            <span>•</span>
            <span>Gemini AI</span>
            <span>•</span>
            <span>JWT Secured</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Handle public prescription verification route (/rx/view/:token)
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  if (currentPath.startsWith('/rx/view/')) {
    const rxToken = currentPath.replace('/rx/view/', '').split('/')[0].split('?')[0];
    return <PublicPrescriptionPage token={rxToken} />;
  }

  const { healthData, loading, error, fetchHealth } = useBackendHealth();

  // Role state: null = show landing, 'patient' or 'doctor'
  const [userRole, setUserRole] = useState(() => {
    const stored = sessionStorage.getItem('predoc_role');
    if (stored) return stored;
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (p.startsWith('/intake') || p.startsWith('/patient')) return 'patient';
      if (
        p.startsWith('/doctor') ||
        p.startsWith('/case') ||
        p.startsWith('/triage') ||
        p.startsWith('/templates')
      ) {
        return 'doctor';
      }
    }
    return null;
  });

  // Staff JWT auth state
  const [authToken, setAuthToken] = useState(() => {
    return sessionStorage.getItem('predoc_auth_token') || null;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = sessionStorage.getItem('predoc_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const handleSelectRole = useCallback((role) => {
    sessionStorage.setItem('predoc_role', role);
    setUserRole(role);
    if (role === 'patient') {
      window.history.replaceState(null, '', '/intake');
    } else {
      window.history.replaceState(null, '', '/doctor');
    }
  }, []);

  const handleLoginSuccess = useCallback(({ token, user }) => {
    setAuthToken(token);
    setCurrentUser(user);
    sessionStorage.setItem('predoc_auth_token', token);
    sessionStorage.setItem('predoc_user', JSON.stringify(user));
    sessionStorage.setItem('predoc_role', 'doctor');
    setUserRole('doctor');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setAuthToken(null);
    setCurrentUser(null);
    sessionStorage.removeItem('predoc_auth_token');
    sessionStorage.removeItem('predoc_user');
    sessionStorage.removeItem('predoc_role');
    setUserRole(null);
    window.history.replaceState(null, '', '/');
  }, []);

  const handleSwitchRole = useCallback(() => {
    sessionStorage.removeItem('predoc_role');
    setUserRole(null);
    window.history.replaceState(null, '', '/');
  }, []);

  // Landing page — no role selected
  if (!userRole) {
    return <RoleLanding onSelectRole={handleSelectRole} />;
  }

  // Patient view — isolated kiosk mode (no auth needed)
  if (userRole === 'patient') {
    return (
      <PatientShell
        onSwitchRole={handleSwitchRole}
        healthData={healthData}
        loading={loading}
        error={error}
        fetchHealth={fetchHealth}
      />
    );
  }

  // Doctor / Staff view — requires staff authentication
  if (!authToken) {
    return (
      <StaffLogin
        onLoginSuccess={handleLoginSuccess}
        onBackToRoleLanding={handleSwitchRole}
      />
    );
  }

  return (
    <DoctorShell
      onSwitchRole={handleSwitchRole}
      onLogout={handleLogout}
      currentUser={currentUser}
      authToken={authToken}
      healthData={healthData}
      loading={loading}
      error={error}
      fetchHealth={fetchHealth}
    />
  );
}
