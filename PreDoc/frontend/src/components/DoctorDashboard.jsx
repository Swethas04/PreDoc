import React, { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  User,
  Calendar,
  Lock,
} from 'lucide-react';

const API_BASE = '/api';

export default function DoctorDashboard({ onOpenReview, onNavigateIntake, authToken, onAuthError }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTab, setFilterTab] = useState('pending'); // 'all' | 'pending' | 'approved' | 'urgent'
  const [searchQuery, setSearchQuery] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchQueue = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const headers = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${API_BASE}/visits/doctor-queue`, { headers });
      if (res.status === 401 && onAuthError) {
        onAuthError();
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setQueue(data);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to load doctor queue:', err);
      setError(err.message || 'Could not load visits queue');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [authToken, onAuthError]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(() => fetchQueue(true), 8000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Filtered queue items
  const filteredQueue = queue.filter((item) => {
    if (filterTab === 'pending' && item.is_approved) return false;
    if (filterTab === 'approved' && !item.is_approved) return false;
    if (filterTab === 'urgent' && !item.urgency_flag) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.patient_name.toLowerCase().includes(q) ||
      String(item.visit_id).includes(q) ||
      (item.department || '').toLowerCase().includes(q) ||
      (item.urgency_reason || '').toLowerCase().includes(q)
    );
  });

  const pendingCount = queue.filter((v) => !v.is_approved).length;
  const approvedCount = queue.filter((v) => v.is_approved).length;
  const urgentCount = queue.filter((v) => v.urgency_flag).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-8 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center flex-shrink-0 shadow-sm">
            <Stethoscope className="w-7 h-7 text-[#2F6FED]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2B4C] tracking-tight">
                Physician Review & Approval Queue
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF1FF] text-[#2F6FED]">
                Doctor Portal
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#6B7A99] mt-1">
              Review provisional 8-section clinical case drafts (Chief Complaint, HPI, Medical History, Medications, Allergies, Investigations, Timeline, Red Flags) against original interview transcripts and uploaded documents, edit inline, and lock as final.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => fetchQueue(false)}
            disabled={loading}
            className="px-5 py-2.5 rounded-full bg-white border border-[#E2E8F4] hover:bg-[#EAF1FF] text-[#1A2B4C] text-xs font-semibold transition flex items-center gap-2 shadow-sm"
            title="Refresh queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2F6FED]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setFilterTab('pending')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-soft ${
            filterTab === 'pending'
              ? 'border-[#F5A623] bg-[#FEF6E9] ring-2 ring-[#F5A623]/20'
              : 'border-[#E2E8F4] bg-white hover:border-[#F5A623]/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
            <span>Pending review</span>
            <Clock className="w-4 h-4 text-[#F5A623]" />
          </div>
          <p className="text-3xl font-bold text-[#F5A623] mt-2">{pendingCount}</p>
          <div className="text-[11px] text-[#6B7A99] mt-1">Require physician approval</div>
        </div>

        <div
          onClick={() => setFilterTab('approved')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-soft ${
            filterTab === 'approved'
              ? 'border-[#2FAE60] bg-[#EAF7EE] ring-2 ring-[#2FAE60]/20'
              : 'border-[#E2E8F4] bg-white hover:border-[#2FAE60]/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
            <span>Approved & final</span>
            <ShieldCheck className="w-4 h-4 text-[#2FAE60]" />
          </div>
          <p className="text-3xl font-bold text-[#2FAE60] mt-2">{approvedCount}</p>
          <div className="text-[11px] text-[#6B7A99] mt-1">Final clinical records</div>
        </div>

        <div
          onClick={() => setFilterTab('urgent')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-soft ${
            filterTab === 'urgent'
              ? 'border-[#E5484D] bg-[#FEECEE] ring-2 ring-[#E5484D]/20'
              : 'border-[#E2E8F4] bg-white hover:border-[#E5484D]/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
            <span>Urgent red flags</span>
            <ShieldAlert className="w-4 h-4 text-[#E5484D]" />
          </div>
          <p className="text-3xl font-bold text-[#E5484D] mt-2">{urgentCount}</p>
          <div className="text-[11px] text-[#6B7A99] mt-1">Priority clinical attention</div>
        </div>

        <div
          onClick={() => setFilterTab('all')}
          className={`p-5 rounded-2xl border cursor-pointer transition shadow-soft ${
            filterTab === 'all'
              ? 'border-[#2F6FED] bg-[#EAF1FF] ring-2 ring-[#2F6FED]/20'
              : 'border-[#E2E8F4] bg-white hover:border-[#2F6FED]/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
            <span>Total visits</span>
            <FileText className="w-4 h-4 text-[#2F6FED]" />
          </div>
          <p className="text-3xl font-bold text-[#1A2B4C] mt-2">{queue.length}</p>
          <div className="text-[11px] text-[#6B7A99] mt-1">All recorded episodes</div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="p-3.5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <span className="text-xs text-[#6B7A99] font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {[
            { id: 'pending', label: 'Pending review', count: pendingCount },
            { id: 'approved', label: 'Approved & final', count: approvedCount },
            { id: 'urgent', label: 'Urgent cases', count: urgentCount },
            { id: 'all', label: 'All cases', count: queue.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                filterTab === tab.id
                  ? 'bg-[#2F6FED] text-white shadow-sm'
                  : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                filterTab === tab.id ? 'bg-white/20 text-white' : 'bg-[#F6F9FF] text-[#6B7A99]'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#6B7A99] absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="Search patient, ID, department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-full bg-[#F6F9FF] border border-[#E2E8F4] text-xs text-[#1A2B4C] placeholder-[#6B7A99] focus:outline-none focus:border-[#2F6FED]"
          />
        </div>
      </div>

      {/* Main Queue Feed */}
      {loading && !queue.length ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl border border-[#E2E8F4] bg-white text-[#6B7A99] gap-3 shadow-soft">
          <RefreshCw className="w-8 h-8 text-[#2F6FED] animate-spin" />
          <p className="text-sm font-medium">Loading physician review queue...</p>
        </div>
      ) : filteredQueue.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl border border-[#E2E8F4] bg-white text-center gap-3 shadow-soft">
          <div className="w-14 h-14 rounded-full bg-[#EAF7EE] text-[#2FAE60] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#1A2B4C]">No visits found</h3>
            <p className="text-xs text-[#6B7A99] mt-1 max-w-sm">
              {filterTab === 'pending'
                ? 'All generated case drafts have been reviewed and approved.'
                : 'No clinical visits matched the selected filter.'}
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
          {filteredQueue.map((item) => {
            const isApproved = item.is_approved;

            return (
              <div
                key={item.visit_id}
                className="p-6 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition hover:border-[#2F6FED]/50"
              >
                {/* Left Patient & Status Info */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center font-bold text-base flex-shrink-0">
                    {item.patient_name ? item.patient_name.charAt(0).toUpperCase() : 'P'}
                  </div>

                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF7EE] text-[#2FAE60]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Approved & final
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF6E9] text-[#F5A623]">
                          <Clock className="w-3.5 h-3.5" />
                          Pending review
                        </span>
                      )}

                      {item.consent_given ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF7EE] text-[#2FAE60] border border-[#2FAE60]/20">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Consent Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF6E9] text-[#F5A623] border border-[#F5A623]/20">
                          <Lock className="w-3.5 h-3.5" />
                          Consent Pending
                        </span>
                      )}

                      {item.urgency_flag && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FEECEE] text-[#E5484D]">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Urgent
                        </span>
                      )}

                      <span className="text-xs font-medium text-[#6B7A99] bg-[#F6F9FF] px-3 py-1 rounded-full border border-[#E2E8F4]">
                        {item.department || 'General Medicine'}
                      </span>

                      <span className="font-mono text-xs text-[#2F6FED] bg-[#EAF1FF] px-3 py-1 rounded-full">
                        Visit #{item.visit_id}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-[#1A2B4C]">
                          {item.patient_name}
                        </h3>
                        {item.patient_age && (
                          <span className="text-xs text-[#6B7A99]">
                            ({item.patient_age} yrs, {item.language === 'hi' ? 'हिंदी' : 'English'})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[#6B7A99] mt-1 flex-wrap">
                        <span>
                          Interview turns: <strong className="text-[#1A2B4C] font-semibold">{item.turn_count}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Uploaded documents: <strong className="text-[#1A2B4C] font-semibold">{item.doc_count}</strong>
                        </span>
                        {isApproved && item.approved_by && (
                          <>
                            <span>•</span>
                            <span className="text-[#2FAE60] font-medium">
                              Approved by: {item.approved_by}
                            </span>
                          </>
                        )}
                      </div>

                      {item.urgency_reason && (
                        <p className="text-xs text-[#E5484D] mt-2 px-3 py-1.5 rounded-xl bg-[#FEECEE] inline-block font-medium">
                          ⚠️ Red flag: {item.urgency_reason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Action Button */}
                <div className="flex items-center gap-2.5 w-full md:w-auto flex-shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-[#E2E8F4]">
                  <button
                    type="button"
                    onClick={() => onOpenReview(item.visit_id)}
                    className={`w-full md:w-auto px-6 py-3 rounded-full text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm ${
                      isApproved
                        ? 'bg-white border border-[#2F6FED] text-[#2F6FED] hover:bg-[#EAF1FF]'
                        : 'bg-[#2F6FED] hover:bg-[#255BC7] text-white'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>
                      {isApproved ? 'View finalized case' : 'Review & edit draft →'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clinical Governance Notice Footer */}
      <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft text-xs text-[#6B7A99] flex items-start gap-3">
        <Lock className="w-4 h-4 text-[#F5A623] flex-shrink-0 mt-0.5" />
        <p>
          <strong className="text-[#1A2B4C]">Clinical Governance Notice: </strong>
          All AI-synthesized SOAP case drafts remain provisional drafts until reviewed, modified, and explicitly approved by an attending physician. Nothing is treated as a final medical record until approved.
        </p>
      </div>
    </div>
  );
}
