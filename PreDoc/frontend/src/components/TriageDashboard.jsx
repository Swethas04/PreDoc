import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Flame,
  HeartPulse,
  Brain,
  Wind,
  Stethoscope,
  Activity,
  RefreshCw,
  Clock,
  User,
  FileText,
  CheckCircle2,
  ChevronRight,
  Filter,
  ShieldAlert,
  ArrowRight,
  Search,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Layers,
} from 'lucide-react';

const API_BASE = '/api';

export default function TriageDashboard({ onNavigateCase, onNavigateIntake }) {
  const [urgentVisits, setUrgentVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchTriageFeed = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/visits/triage`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setUrgentVisits(data);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to fetch triage queue:', err);
      setError(err.message || 'Failed to connect to triage API');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTriageFeed();
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTriageFeed(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTriageFeed]);

  const handleMarkTriaged = async (visitId) => {
    setActionLoading(visitId);
    try {
      const res = await fetch(`${API_BASE}/visits/${visitId}/triage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'triaged',
        }),
      });
      if (res.ok) {
        fetchTriageFeed(true);
      }
    } catch (err) {
      console.error('Failed to update triage status:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredVisits = urgentVisits.filter((v) => {
    const matchesDept =
      selectedDept === 'ALL' ||
      (v.department || '').toLowerCase().includes(selectedDept.toLowerCase());
    const matchesSearch =
      !searchQuery.trim() ||
      v.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(v.visit_id).includes(searchQuery) ||
      (v.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.urgency_reason || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesSearch;
  });

  const cardioCount = urgentVisits.filter((v) =>
    (v.department || '').toLowerCase().includes('cardio')
  ).length;
  const neuroCount = urgentVisits.filter((v) =>
    (v.department || '').toLowerCase().includes('neuro')
  ).length;
  const otherCount = urgentVisits.length - cardioCount - neuroCount;

  return (
    <div className="space-y-6">
      {/* Top Banner & Controls */}
      <div className="p-8 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#FEECEE] text-[#E5484D] flex items-center justify-center flex-shrink-0 shadow-sm">
            <ShieldAlert className="w-7 h-7 text-[#E5484D]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2B4C] tracking-tight">
                Emergency & Clinical Triage Queue
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FEECEE] text-[#E5484D]">
                {urgentVisits.length} urgent {urgentVisits.length === 1 ? 'case' : 'cases'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#6B7A99] mt-1">
              Real-time symptom-combination red flag triggers detected during live patient intake sessions.
            </p>
          </div>
        </div>

        {/* Action / Refresh Bar */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-full text-xs font-semibold border transition flex items-center gap-2 shadow-sm ${
              autoRefresh
                ? 'bg-[#EAF7EE] text-[#2FAE60] border-[#2FAE60]/30'
                : 'bg-white text-[#6B7A99] border-[#E2E8F4]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? 'bg-[#2FAE60]' : 'bg-[#6B7A99]'
              }`}
            />
            {autoRefresh ? 'Live polling (5s)' : 'Polling paused'}
          </button>

          <button
            onClick={() => fetchTriageFeed(false)}
            disabled={loading}
            className="px-5 py-2 rounded-full bg-white border border-[#E2E8F4] hover:bg-[#EAF1FF] text-[#1A2B4C] text-xs font-semibold transition flex items-center gap-2 shadow-sm"
            title="Refresh queue now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2F6FED]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] shadow-soft">
          <div className="flex items-center justify-between text-xs text-[#E5484D] font-semibold">
            <span>Urgent flagged</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <p className="text-3xl font-bold text-[#E5484D] mt-2">{urgentVisits.length}</p>
          <div className="text-[11px] text-[#E5484D] mt-1 font-medium">Requires immediate attention</div>
        </div>

        <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft">
          <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
            <span>Cardiology alerts</span>
            <HeartPulse className="w-4 h-4 text-[#E5484D]" />
          </div>
          <p className="text-3xl font-bold text-[#1A2B4C] mt-2">{cardioCount}</p>
          <div className="text-[11px] text-[#6B7A99] mt-1">Chest pain & dyspnea triggers</div>
        </div>

        <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft">
          <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
            <span>Neurology alerts</span>
            <Brain className="w-4 h-4 text-[#2F6FED]" />
          </div>
          <p className="text-3xl font-bold text-[#1A2B4C] mt-2">{neuroCount}</p>
          <div className="text-[11px] text-[#6B7A99] mt-1">Severe headache / neuro signs</div>
        </div>

        <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft">
          <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
            <span>Other alerts</span>
            <Activity className="w-4 h-4 text-[#6B7A99]" />
          </div>
          <p className="text-3xl font-bold text-[#1A2B4C] mt-2">{otherCount}</p>
          <div className="text-[11px] text-[#6B7A99] mt-1">Pulmonary and emergency</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-3.5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <span className="text-xs text-[#6B7A99] font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Department:
          </span>
          {['ALL', 'Cardiology', 'Neurology', 'Pulmonology'].map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${
                selectedDept === dept
                  ? 'bg-[#2F6FED] text-white shadow-sm'
                  : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#6B7A99] absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Search patient, trigger, visit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-full bg-[#F6F9FF] border border-[#E2E8F4] text-xs text-[#1A2B4C] placeholder-[#6B7A99] focus:outline-none focus:border-[#2F6FED]"
          />
        </div>
      </div>

      {/* Main Urgent Cases Feed */}
      {loading && !urgentVisits.length ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl border border-[#E2E8F4] bg-white text-[#6B7A99] gap-3 shadow-soft">
          <RefreshCw className="w-8 h-8 text-[#2F6FED] animate-spin" />
          <p className="text-sm font-medium">Loading real-time triage queue...</p>
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl border border-[#E2E8F4] bg-white text-center gap-3 shadow-soft">
          <div className="w-14 h-14 rounded-full bg-[#EAF7EE] text-[#2FAE60] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#1A2B4C]">No urgent triage alerts</h3>
            <p className="text-xs text-[#6B7A99] mt-1 max-w-sm">
              {urgentVisits.length > 0
                ? 'No cases match your active filters.'
                : 'All patient intake sessions are currently stable with no red flag combinations detected.'}
            </p>
          </div>
          {onNavigateIntake && (
            <button
              onClick={onNavigateIntake}
              className="mt-2 px-5 py-2.5 rounded-full bg-[#2F6FED] text-white text-xs font-semibold hover:bg-[#255BC7] transition shadow-sm"
            >
              Start new patient intake →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVisits.map((visit) => (
            <div
              key={visit.visit_id}
              className="p-6 rounded-2xl border-2 border-[#E5484D]/30 bg-white shadow-soft flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition hover:border-[#E5484D]"
            >
              {/* Left Patient & Trigger Info */}
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-12 h-12 rounded-full bg-[#FEECEE] text-[#E5484D] flex items-center justify-center font-bold text-base flex-shrink-0">
                  <ShieldAlert className="w-6 h-6 text-[#E5484D]" />
                </div>

                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FEECEE] text-[#E5484D]">
                      Urgent triage
                    </span>

                    <span className="text-xs font-semibold text-[#1A2B4C] bg-[#F6F9FF] px-3 py-1 rounded-full border border-[#E2E8F4]">
                      {visit.department || 'General Medicine'}
                    </span>

                    <span className="font-mono text-xs text-[#2F6FED] bg-[#EAF1FF] px-3 py-1 rounded-full">
                      Visit #{visit.visit_id}
                    </span>

                    <span className="text-xs text-[#6B7A99] bg-[#F6F9FF] px-3 py-1 rounded-full">
                      Status: <strong className="text-[#1A2B4C]">{visit.status}</strong>
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-[#1A2B4C]">
                        {visit.patient_name}
                      </h3>
                      {visit.patient_age && (
                        <span className="text-xs text-[#6B7A99]">
                          ({visit.patient_age} yrs, {visit.language === 'hi' ? 'हिंदी' : 'English'})
                        </span>
                      )}
                    </div>

                    {/* Red Flag Trigger Reason */}
                    <div className="mt-2 p-3 rounded-xl bg-[#FEECEE] text-xs text-[#E5484D] flex items-start gap-2.5 font-medium">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Trigger identified: </span>
                        <span className="font-bold">{visit.urgency_reason}</span>
                      </div>
                    </div>
                  </div>

                  {/* Latest Transcript Snippet */}
                  {visit.latest_transcript && (
                    <div className="text-xs text-[#1A2B4C] bg-[#F6F9FF] p-3 rounded-xl border border-[#E2E8F4]">
                      <span className="text-[#6B7A99] font-medium text-[11px] block">
                        Latest transcript ({visit.latest_step}):
                      </span>
                      <span>"{visit.latest_transcript}"</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex flex-row md:flex-col items-center md:items-end gap-2.5 w-full md:w-auto flex-shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-[#E2E8F4]">
                <button
                  type="button"
                  onClick={() => onNavigateCase && onNavigateCase(visit.visit_id)}
                  className="flex-1 md:flex-initial w-full px-5 py-2.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <FileText className="w-4 h-4" />
                  <span>Open SOAP draft →</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleMarkTriaged(visit.visit_id)}
                  disabled={actionLoading === visit.visit_id}
                  className="flex-1 md:flex-initial w-full px-5 py-2.5 rounded-full bg-white hover:bg-[#EAF1FF] text-[#1A2B4C] border border-[#E2E8F4] text-xs font-semibold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#2FAE60]" />
                  <span>
                    {actionLoading === visit.visit_id ? 'Updating...' : 'Mark as triaged'}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-[#6B7A99] pt-3 border-t border-[#E2E8F4]">
        <span>PreDoc Real-Time Clinical Red-Flag Rule Engine</span>
        <span>Last synced: {lastRefreshed || 'Just now'}</span>
      </div>
    </div>
  );
}
