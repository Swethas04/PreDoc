import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Database,
  Server,
  Layers,
  Users,
  CalendarCheck,
  FileText,
  ExternalLink,
  Mic,
  LayoutDashboard,
  ShieldAlert,
  Stethoscope,
  Heart,
  ChevronRight,
} from 'lucide-react';
import IntakeFlow from './components/IntakeFlow';
import CaseDraftPage from './components/CaseDraftPage';
import TriageDashboard from './components/TriageDashboard';
import DoctorDashboard from './components/DoctorDashboard';

export default function App() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  const [urgentCount, setUrgentCount] = useState(0);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);

  // URL-driven routing support (/case/:id, /doctor, /triage, and /intake)
  const [currentVisitId, setCurrentVisitId] = useState(() => {
    const match = window.location.pathname.match(/\/(?:case|doctor)\/(\d+)/);
    return match ? Number(match[1]) : 1;
  });

  const [activeTab, setActiveTab] = useState(() => {
    if (window.location.pathname.startsWith('/case/')) return 'case';
    if (window.location.pathname === '/doctor' || window.location.pathname.startsWith('/doctor/')) {
      const match = window.location.pathname.match(/\/doctor\/(\d+)/);
      if (match) return 'case';
      return 'doctor';
    }
    if (window.location.pathname.startsWith('/triage')) return 'triage';
    if (window.location.pathname.startsWith('/intake') || window.location.pathname.startsWith('/kiosk')) return 'intake';
    return 'overview';
  });

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const caseMatch = window.location.pathname.match(/\/(?:case|doctor)\/(\d+)/);
      if (caseMatch) {
        setCurrentVisitId(Number(caseMatch[1]));
        setActiveTab('case');
      } else if (window.location.pathname.startsWith('/doctor')) {
        setActiveTab('doctor');
      } else if (window.location.pathname.startsWith('/triage')) {
        setActiveTab('triage');
      } else if (window.location.pathname.startsWith('/intake') || window.location.pathname.startsWith('/kiosk')) {
        setActiveTab('intake');
      } else {
        setActiveTab('overview');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToCase = (vid) => {
    const idNum = Number(vid) || 1;
    setCurrentVisitId(idNum);
    setActiveTab('case');
    window.history.pushState(null, '', `/case/${idNum}`);
  };

  const navigateToTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'case') {
      window.history.pushState(null, '', `/case/${currentVisitId}`);
    } else if (tab === 'doctor') {
      window.history.pushState(null, '', '/doctor');
    } else if (tab === 'triage') {
      window.history.pushState(null, '', '/triage');
    } else if (tab === 'intake' || tab === 'kiosk') {
      window.history.pushState(null, '', '/intake');
    } else {
      window.history.pushState(null, '', '/');
    }
  };

  const fetchUrgentCount = async () => {
    try {
      const res = await fetch('/api/visits/triage');
      if (res.ok) {
        const data = await res.json();
        setUrgentCount(data.length);
      }
    } catch {
      // ignore
    }
  };

  const fetchDoctorQueueCount = async () => {
    try {
      const res = await fetch('/api/visits/doctor-queue');
      if (res.ok) {
        const data = await res.json();
        const pending = data.filter((v) => !v.is_approved);
        setPendingDraftCount(pending.length);
      }
    } catch {
      // ignore
    }
  };

  const fetchHealth = async (isManual = false) => {
    if (isManual || !healthData) {
      setLoading(true);
    }
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

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setHealthData(data);
      setError(null);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn('[App] Health check failed:', err);
      const isTimeout = err.name === 'AbortError';
      setError(isTimeout ? 'Connection timed out (backend not responding)' : (err.message || 'Failed to connect to backend server'));
      setHealthData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth(true);
    fetchUrgentCount();
    fetchDoctorQueueCount();
    const interval = setInterval(() => {
      fetchHealth(false);
      fetchUrgentCount();
      fetchDoctorQueueCount();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const tables = [
    {
      name: 'patients',
      icon: Users,
      description: 'Patient demographics and primary pre-consultation profiles.',
      columns: [
        { name: 'id', type: 'Integer (PK)', desc: 'Patient identifier' },
        { name: 'name', type: 'String', desc: 'Full patient name' },
        { name: 'age', type: 'Integer', desc: 'Age in years' },
        { name: 'language', type: 'String', desc: 'Preferred consultation language' },
      ],
      relations: ['1-to-many with visits (cascade delete)'],
    },
    {
      name: 'visits',
      icon: CalendarCheck,
      description: 'Clinical consultation episodes, triage flags, and department routing.',
      columns: [
        { name: 'id', type: 'Integer (PK)', desc: 'Visit identifier' },
        { name: 'patient_id', type: 'Integer (FK)', desc: 'Associated patient' },
        { name: 'status', type: 'String', desc: 'Current clinical status' },
        { name: 'urgency_flag', type: 'Boolean', desc: 'Urgent red-flag indicator' },
        { name: 'department', type: 'String', desc: 'Assigned clinical department' },
      ],
      relations: ['Belongs to patient', '1-to-many with case_drafts'],
    },
    {
      name: 'case_drafts',
      icon: FileText,
      description: 'Structured SOAP notes synthesized by Gemini with source citations.',
      columns: [
        { name: 'id', type: 'Integer (PK)', desc: 'Draft identifier' },
        { name: 'visit_id', type: 'Integer (FK)', desc: 'Associated visit ID' },
        { name: 'content_json', type: 'JSON', desc: 'Structured SOAP clinical data' },
        { name: 'source_links_json', type: 'JSON', desc: 'Grounded citations & quotes' },
      ],
      relations: ['Belongs to visit'],
    },
  ];

  return (
    <div className="min-h-screen bg-[#F6F9FF] text-[#1A2B4C]">
      {/* Top Healthcare Navigation Bar */}
      <header className="bg-white border-b border-[#E2E8F4] sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center font-bold shadow-sm">
              <Activity className="w-5 h-5 text-[#2F6FED]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-[#1A2B4C] tracking-tight">PreDoc</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#EAF1FF] text-[#2F6FED] text-xs font-semibold">
                  Healthcare
                </span>
              </div>
              <p className="text-xs text-[#6B7A99]">Clinical pre-consultation & SOAP case review</p>
            </div>
          </div>

          {/* System status pill & Refresh */}
          <div className="flex items-center gap-2.5">
            <div
              id="backend-status-pill"
              title={
                healthData
                  ? `Backend connected (${healthData.app_name}, Gemini: ${healthData.gemini_configured ? 'Ready' : 'Not configured'})`
                  : error || 'Cannot reach backend server. Ensure backend is running.'
              }
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border cursor-default ${
                loading
                  ? 'bg-[#FEF6E9] text-[#F5A623] border-[#F5A623]/30'
                  : healthData?.message === 'PreDoc backend connected'
                  ? 'bg-[#EAF7EE] text-[#2FAE60] border-[#2FAE60]/30'
                  : 'bg-[#FEECEE] text-[#E5484D] border-[#E5484D]/30'
              }`}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  loading ? 'bg-[#F5A623]' : healthData ? 'bg-[#2FAE60]' : 'bg-[#E5484D]'
                }`}
              />
              <span>
                {loading
                  ? 'Connecting...'
                  : healthData?.message === 'PreDoc backend connected'
                  ? 'Online'
                  : 'Offline'}
              </span>
            </div>

            <button
              onClick={() => fetchHealth(true)}
              disabled={loading}
              className="p-2 rounded-full bg-[#F6F9FF] border border-[#E2E8F4] hover:bg-[#EAF1FF] text-[#6B7A99] hover:text-[#2F6FED] transition disabled:opacity-50"
              title={error ? `Error: ${error}. Click to retry.` : "Refresh connection status"}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2F6FED]' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Pill-shaped Tab Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
        <nav className="p-1.5 rounded-full bg-white border border-[#E2E8F4] shadow-soft inline-flex items-center gap-1.5 flex-wrap">
          <button
            id="tab-overview"
            onClick={() => navigateToTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition ${
              activeTab === 'overview'
                ? 'bg-[#2F6FED] text-white shadow-sm'
                : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Overview</span>
          </button>

          <button
            id="tab-intake"
            onClick={() => navigateToTab('intake')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition ${
              activeTab === 'intake'
                ? 'bg-[#2F6FED] text-white shadow-sm'
                : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>Patient Intake</span>
          </button>

          <button
            id="tab-doctor"
            onClick={() => navigateToTab('doctor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition ${
              activeTab === 'doctor'
                ? 'bg-[#2F6FED] text-white shadow-sm'
                : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>Doctor Dashboard</span>
            {pendingDraftCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'doctor' ? 'bg-white text-[#2F6FED]' : 'bg-[#FEF6E9] text-[#F5A623]'
              }`}>
                {pendingDraftCount}
              </span>
            )}
          </button>

          <button
            id="tab-triage"
            onClick={() => navigateToTab('triage')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition ${
              activeTab === 'triage'
                ? 'bg-[#2F6FED] text-white shadow-sm'
                : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Triage Dashboard</span>
            {urgentCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'triage' ? 'bg-white text-[#E5484D]' : 'bg-[#FEECEE] text-[#E5484D]'
              }`}>
                {urgentCount}
              </span>
            )}
          </button>

          <button
            id="tab-case"
            onClick={() => navigateToTab('case')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition ${
              activeTab === 'case'
                ? 'bg-[#2F6FED] text-white shadow-sm'
                : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Case Review (SOAP)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'case' ? 'bg-white/20 text-white' : 'bg-[#EAF1FF] text-[#2F6FED]'
            }`}>
              #{currentVisitId}
            </span>
          </button>
        </nav>
      </div>

      {/* Main Container Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Doctor Dashboard Tab */}
        {activeTab === 'doctor' && (
          <DoctorDashboard
            onOpenReview={navigateToCase}
            onNavigateIntake={() => navigateToTab('intake')}
          />
        )}

        {/* Triage Dashboard Tab */}
        {activeTab === 'triage' && (
          <TriageDashboard
            onNavigateCase={navigateToCase}
            onNavigateIntake={() => navigateToTab('intake')}
          />
        )}

        {/* Case Review Tab */}
        {activeTab === 'case' && (
          <CaseDraftPage
            visitId={currentVisitId}
            onBack={() => navigateToTab('doctor')}
            onNavigateVisit={navigateToCase}
          />
        )}

        {/* Intake Tab */}
        {activeTab === 'intake' && (
          <div className="space-y-6">
            <IntakeFlow
              onViewCaseDraft={navigateToCase}
              onNavigateTriage={() => navigateToTab('triage')}
            />
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Hero Welcome Card */}
            <div className="rounded-3xl bg-white border border-[#E2E8F4] p-8 shadow-soft relative overflow-hidden">
              <div className="max-w-2xl relative z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF1FF] text-[#2F6FED] mb-3">
                  <Activity className="w-3.5 h-3.5" /> Modern Healthcare Assistant
                </span>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A2B4C] tracking-tight">
                  Welcome to PreDoc
                </h1>
                <p className="text-sm sm:text-base text-[#6B7A99] mt-2 leading-relaxed">
                  Streamlined patient intake with voice transcription, prescription document analysis, and grounded SOAP clinical case review.
                </p>

                <div className="flex items-center gap-3 mt-6 flex-wrap">
                  <button
                    onClick={() => navigateToTab('intake')}
                    className="px-6 py-3 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-semibold transition shadow-sm flex items-center gap-2"
                  >
                    <span>Start patient intake</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigateToTab('doctor')}
                    className="px-6 py-3 rounded-full bg-white border border-[#2F6FED] text-[#2F6FED] hover:bg-[#EAF1FF] text-xs font-semibold transition"
                  >
                    Doctor review queue
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-6 rounded-2xl bg-white border border-[#E2E8F4] shadow-soft">
                <div className="w-10 h-10 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mb-3">
                  <Mic className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#1A2B4C]">Patient Intake</h3>
                <p className="text-xs text-[#6B7A99] mt-1">
                  Guided voice & tap intake in English and Hindi powered by Gemini AI.
                </p>
                <div className="mt-3">
                  <span className="text-xs font-medium text-[#2F6FED] hover:underline cursor-pointer" onClick={() => navigateToTab('intake')}>
                    Open intake flow →
                  </span>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-[#E2E8F4] shadow-soft">
                <div className="w-10 h-10 rounded-full bg-[#FEF6E9] text-[#F5A623] flex items-center justify-center mb-3">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#1A2B4C]">Doctor Portal</h3>
                <p className="text-xs text-[#6B7A99] mt-1">
                  Review and lock synthesized SOAP case drafts side-by-side with original sources.
                </p>
                <div className="mt-3">
                  <span className="text-xs font-medium text-[#2F6FED] hover:underline cursor-pointer" onClick={() => navigateToTab('doctor')}>
                    View doctor queue ({pendingDraftCount} pending) →
                  </span>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white border border-[#E2E8F4] shadow-soft">
                <div className="w-10 h-10 rounded-full bg-[#FEECEE] text-[#E5484D] flex items-center justify-center mb-3">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-[#1A2B4C]">Triage Alerts</h3>
                <p className="text-xs text-[#6B7A99] mt-1">
                  Real-time red flag rule engine identifying urgent symptom combinations.
                </p>
                <div className="mt-3">
                  <span className="text-xs font-medium text-[#2F6FED] hover:underline cursor-pointer" onClick={() => navigateToTab('triage')}>
                    View triage alerts ({urgentCount} active) →
                  </span>
                </div>
              </div>
            </div>

            {/* Database Schema Visualizer */}
            <div className="rounded-2xl bg-white border border-[#E2E8F4] p-6 shadow-soft space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F4]">
                <div>
                  <h2 className="text-lg font-bold text-[#1A2B4C] flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#2F6FED]" />
                    <span>Database Models & Entities</span>
                  </h2>
                  <p className="text-xs text-[#6B7A99] mt-0.5">PostgreSQL schemas for pre-consultation workflow</p>
                </div>
                <span className="text-xs font-medium px-3 py-1 rounded-full bg-[#EAF1FF] text-[#2F6FED]">
                  3 Active Models
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tables.map((tbl) => {
                  const Icon = tbl.icon;
                  return (
                    <div key={tbl.name} className="p-4 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F4]">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-[#2F6FED]" />
                            <span className="font-mono text-xs font-bold text-[#1A2B4C]">{tbl.name}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-[#6B7A99] border border-[#E2E8F4]">
                            Table
                          </span>
                        </div>

                        <p className="text-xs text-[#6B7A99] mt-2 mb-3 leading-relaxed">{tbl.description}</p>

                        <div className="space-y-1">
                          {tbl.columns.map((col) => (
                            <div key={col.name} className="p-1.5 rounded-lg bg-white border border-[#E2E8F4] text-xs flex justify-between">
                              <span className="text-[#2F6FED] font-mono font-medium">{col.name}</span>
                              <span className="text-[10px] text-[#6B7A99]">{col.type}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-[#E2E8F4] text-[11px] text-[#6B7A99]">
                        <span className="font-medium text-[#1A2B4C]">Relations: </span>
                        {tbl.relations.join(', ')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Health Endpoint Payload */}
            <div className="rounded-2xl bg-white border border-[#E2E8F4] p-6 shadow-soft space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#2F6FED]" />
                  <h3 className="text-sm font-bold text-[#1A2B4C]">Live Health Endpoint Payload</h3>
                </div>
                <span className="text-xs font-mono text-[#2F6FED] bg-[#EAF1FF] px-3 py-1 rounded-full">
                  GET /api/health
                </span>
              </div>
              <pre className="p-4 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] text-xs font-mono text-[#1A2B4C] overflow-x-auto">
                {healthData
                  ? JSON.stringify(healthData, null, 2)
                  : error
                  ? JSON.stringify({ error: error, message: 'Backend unreachable' }, null, 2)
                  : '// Loading health payload...'}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 bg-white border-t border-[#E2E8F4] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-[#6B7A99] gap-2">
          <span>PreDoc Healthcare Pre-Consultation System</span>
          <div className="flex items-center gap-3">
            <span>FastAPI</span>
            <span>•</span>
            <span>React</span>
            <span>•</span>
            <span>Gemini AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
