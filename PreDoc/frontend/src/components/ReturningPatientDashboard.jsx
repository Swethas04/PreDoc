import React, { useEffect, useState } from 'react';
import {
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  ChevronRight,
  PlusCircle,
  LogOut,
  User,
  ShieldCheck,
  RefreshCw,
  Eye,
  FileSearch,
  Pill,
} from 'lucide-react';

const API_BASE = '/api';

export default function ReturningPatientDashboard({
  patient,
  patientToken,
  onStartNewVisit,
  onLogout,
  language = 'en',
}) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [visitSummary, setVisitSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const isHindi = language === 'hi';

  const fetchMyVisits = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/visits/patient/my-visits`, {
        headers: {
          Authorization: `Bearer ${patientToken}`,
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to load visit history (HTTP ${res.status})`);
      }
      const data = await res.json();
      setVisits(data.visits || []);
    } catch (err) {
      setError(err.message || 'Could not load your records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientToken) {
      fetchMyVisits();
    }
  }, [patientToken]);

  const handleViewSummary = async (visitId) => {
    setSelectedVisitId(visitId);
    setLoadingSummary(true);
    try {
      const res = await fetch(`${API_BASE}/visits/${visitId}/patient-summary`, {
        headers: {
          Authorization: `Bearer ${patientToken}`,
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to load visit details (HTTP ${res.status})`);
      }
      const data = await res.json();
      setVisitSummary(data);
    } catch (err) {
      setError(err.message || 'Could not load visit details.');
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 animate-in fade-in duration-300">
      {/* Patient Header Banner */}
      <div className="bg-gradient-to-r from-[#112347] via-[#1A3673] to-[#2F6FED] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 text-white font-bold text-2xl shadow-inner">
              {patient?.name ? patient.name.charAt(0).toUpperCase() : <User className="w-8 h-8" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                  {isHindi ? 'मरीज रिकॉर्ड पोर्टल' : 'Patient Record Portal'}
                </span>
                <span className="bg-emerald-400/20 text-emerald-300 text-[11px] px-2.5 py-0.5 rounded-full font-medium border border-emerald-400/30">
                  {isHindi ? 'सत्यापित मरीज' : 'Verified'}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-1">
                {patient?.name || (isHindi ? 'मरीज' : 'Patient')}
              </h1>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-blue-200/90 font-mono">
                <span className="bg-white/10 px-2 py-0.5 rounded-lg border border-white/15">
                  ID: <strong className="text-white">{patient?.patient_code}</strong>
                </span>
                {patient?.age && <span>{patient.age} {isHindi ? 'वर्ष' : 'yrs'}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="kiosk-start-new-visit-btn"
              type="button"
              onClick={onStartNewVisit}
              className="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-600/30 transition flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isHindi ? 'नई जांच शुरू करें' : 'Start New Consultation'}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold transition flex items-center gap-2"
              title="Sign out of kiosk"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{isHindi ? 'लॉगआउट' : 'Exit'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Visits List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#102347] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#2F6FED]" />
              <span>{isHindi ? 'आपके पिछले दौरे एवं परामर्श' : 'Your Visit & Consultation History'}</span>
            </h2>
            <button
              type="button"
              onClick={fetchMyVisits}
              className="text-xs text-[#2F6FED] hover:underline flex items-center gap-1 font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{isHindi ? 'ताज़ा करें' : 'Refresh'}</span>
            </button>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-[#E2E8F4] p-12 text-center text-[#6B7A99]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#2F6FED]" />
              <p className="text-sm">{isHindi ? 'रिकॉर्ड लोड हो रहे हैं...' : 'Loading your records...'}</p>
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-800 text-sm">
              {error}
            </div>
          ) : visits.length === 0 ? (
            <div className="bg-white rounded-3xl border border-[#E2E8F4] p-10 text-center shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#2F6FED] flex items-center justify-center mx-auto mb-3">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-[#102347]">
                {isHindi ? 'कोई पुराना दौरा नहीं मिला' : 'No previous visits on record'}
              </h3>
              <p className="text-xs text-[#6B7A99] mt-1 max-w-sm mx-auto">
                {isHindi
                  ? 'आज का चेक-इन शुरू करने के लिए नीचे दिए गए बटन पर टैप करें।'
                  : 'Start your first guided check-in today by clicking the button below.'}
              </p>
              <button
                type="button"
                onClick={onStartNewVisit}
                className="mt-5 px-6 py-2.5 rounded-full bg-[#2F6FED] text-white text-xs font-semibold hover:bg-[#245DCE] transition inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isHindi ? 'पहला चेक-इन शुरू करें' : 'Begin First Check-In'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visits.map((v) => {
                const isSelected = selectedVisitId === v.visit_id;
                return (
                  <div
                    key={v.visit_id}
                    onClick={() => handleViewSummary(v.visit_id)}
                    className={`bg-white rounded-2xl border transition-all cursor-pointer p-5 shadow-sm hover:shadow-md ${
                      isSelected
                        ? 'border-[#2F6FED] ring-2 ring-[#2F6FED]/20 bg-[#F8FAFD]'
                        : 'border-[#E2E8F4] hover:border-[#2F6FED]/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="font-mono text-xs font-bold text-[#102347] bg-[#EEF3FA] px-2 py-0.5 rounded-md">
                            Visit #{v.visit_id}
                          </span>
                          <span className="text-xs font-medium text-[#4A5D7E] flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-[#2F6FED]" />
                            {v.department || 'General Medicine'}
                          </span>
                          {v.urgency_flag ? (
                            <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              Flagged
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Standard
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-[#6B7A99] flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {v.created_at ? new Date(v.created_at).toLocaleDateString() : 'Recent'}
                          </span>
                          <span>•</span>
                          <span>{v.turn_count || 0} questions</span>
                          <span>•</span>
                          <span>{v.doc_count || 0} documents</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition flex items-center gap-1 ${
                            isSelected
                              ? 'bg-[#2F6FED] text-white border-[#2F6FED]'
                              : 'bg-white text-[#2F6FED] border-[#D5E1F2] hover:bg-[#EEF3FA]'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isHindi ? 'विवरण' : 'Details'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Col: Selected Visit Details Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl border border-[#DCE4F2] p-6 shadow-md sticky top-6">
            <h3 className="text-base font-bold text-[#102347] flex items-center gap-2 mb-4">
              <FileSearch className="w-5 h-5 text-[#2F6FED]" />
              <span>{isHindi ? 'दौरा विवरण' : 'Visit Snapshot'}</span>
            </h3>

            {loadingSummary ? (
              <div className="py-12 text-center text-[#6B7A99]">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2F6FED]" />
                <p className="text-xs">{isHindi ? 'विवरण लोड हो रहा है...' : 'Fetching visit details...'}</p>
              </div>
            ) : visitSummary ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="bg-[#F8FAFD] rounded-2xl p-4 border border-[#E3EAF6]">
                  <div className="text-xs text-[#6B7A99]">{isHindi ? 'विभाग' : 'Department'}</div>
                  <div className="text-sm font-bold text-[#102347] mt-0.5">
                    {visitSummary.department || 'General Medicine'}
                  </div>
                  <div className="text-xs text-[#6B7A99] mt-2">{isHindi ? 'स्थिति' : 'Status'}</div>
                  <div className="text-xs font-semibold capitalize text-[#2F6FED] mt-0.5">
                    {visitSummary.status?.replace(/_/g, ' ') || 'Completed'}
                  </div>
                </div>

                {/* Turns breakdown */}
                <div>
                  <h4 className="text-xs font-bold text-[#4A5D7E] uppercase tracking-wider mb-2">
                    {isHindi ? 'दर्ज की गई शिकायतें' : 'Intake Summary'}
                  </h4>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {visitSummary.turns?.length > 0 ? (
                      visitSummary.turns.map((t) => (
                        <div key={t.id} className="text-xs bg-[#F4F7FC] rounded-xl p-2.5 border border-[#E2E8F4]">
                          <span className="font-semibold text-[#102347] block capitalize">
                            {t.step?.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[#6B7A99] mt-0.5 block italic">
                            "{t.transcript || '[No transcript]'}"
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[#8695B1] italic">No intake dialogue found.</p>
                    )}
                  </div>
                </div>

                {/* Documents breakdown */}
                {visitSummary.documents?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-[#4A5D7E] uppercase tracking-wider mb-2">
                      {isHindi ? 'संलग्न दस्तावेज़' : 'Attached Documents'}
                    </h4>
                    <div className="space-y-1.5">
                      {visitSummary.documents.map((d) => (
                        <div key={d.id} className="text-xs flex items-center gap-2 p-2 bg-[#F8FAFD] rounded-xl border border-[#E3EAF6]">
                          <FileText className="w-3.5 h-3.5 text-[#2F6FED]" />
                          <span className="truncate flex-1 font-medium text-[#102347]">{d.filename}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-[#8695B1] text-xs">
                {isHindi
                  ? 'विवरण देखने के लिए किसी भी दौरे पर टैप करें।'
                  : 'Select any visit from the left list to review its clinical details.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
