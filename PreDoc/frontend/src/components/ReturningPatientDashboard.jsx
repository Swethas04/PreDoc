import React, { useEffect, useState, useRef } from 'react';
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
  ShieldAlert,
  RefreshCw,
  Eye,
  FileSearch,
  Pill,
  Printer,
  Sparkles,
  HeartPulse,
  UploadCloud,
  PhoneCall,
  Activity,
  ArrowRight,
} from 'lucide-react';
import PatientPrescriptionsView from './PatientPrescriptionsView';
import CriticalTriageModal from './CriticalTriageModal';

const API_BASE = '/api';

export default function ReturningPatientDashboard({
  patient,
  patientToken,
  onStartNewVisit,
  onLogout,
  language = 'en',
}) {
  const [activeTab, setActiveTab] = useState('prescriptions'); // 'prescriptions' | 'visits' | 'triage'
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [visitSummary, setVisitSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Triage condition checker state
  const [conditionInput, setConditionInput] = useState('');
  const [evaluatingTriage, setEvaluatingTriage] = useState(false);
  const [triageResult, setTriageResult] = useState(null);
  const [triageError, setTriageError] = useState(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [uploadedRxFile, setUploadedRxFile] = useState(null);
  const rxFileInputRef = useRef(null);

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

  const handleCheckCondition = async (overrideText = null) => {
    const textToEvaluate = (overrideText || conditionInput).trim();
    if (!textToEvaluate) return;

    setEvaluatingTriage(true);
    setTriageError(null);
    try {
      const res = await fetch(`${API_BASE}/intake/evaluate-emergency`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(patientToken ? { Authorization: `Bearer ${patientToken}` } : {}),
        },
        body: JSON.stringify({
          text: textToEvaluate,
          patient_id: patient?.id,
          language: language,
        }),
      });

      if (!res.ok) {
        throw new Error(`Triage evaluation failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      setTriageResult(data);

      if (data.is_emergency || data.triage_level === 'CRITICAL') {
        setShowEmergencyModal(true);
      }
    } catch (err) {
      console.error('Triage check error:', err);
      setTriageError(err.message || 'Could not evaluate condition.');
    } finally {
      setEvaluatingTriage(false);
    }
  };

  const handleRxFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedRxFile(file);
    setEvaluatingTriage(true);
    setTriageError(null);

    const formData = new FormData();
    if (patient?.id) formData.append('patient_id', patient.id);
    formData.append('label', file.name || 'Previous Prescription');
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        headers: {
          ...(patientToken ? { Authorization: `Bearer ${patientToken}` } : {}),
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      const evalData = data.triage_evaluation || {
        is_emergency: data.is_emergency || false,
        triage_level: data.is_emergency ? 'CRITICAL' : 'ROUTINE',
        urgency_score: data.is_emergency ? 5 : 1,
        detected_red_flags: data.is_emergency ? ['High-risk prescription detected'] : [],
        clinical_rationale: 'Prescription document ingested and evaluated by Clinical Triage AI.',
        patient_warning_message: data.is_emergency ? 'Immediate emergency medical care required.' : 'Prescription recorded.',
        recommended_department: data.is_emergency ? 'Emergency Medicine' : 'General Medicine',
      };

      setTriageResult(evalData);
      if (evalData.is_emergency || evalData.triage_level === 'CRITICAL') {
        setShowEmergencyModal(true);
      }
    } catch (err) {
      console.error('Prescription triage error:', err);
      setTriageError(err.message || 'Failed to analyze uploaded prescription.');
    } finally {
      setEvaluatingTriage(false);
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

      {/* Navigation Tabs Bar (Hidden during print) */}
      <div className="no-print mb-6 flex items-center gap-3 border-b border-[#E2E8F4] pb-2">
        <button
          type="button"
          id="patient-tab-prescriptions"
          onClick={() => setActiveTab('prescriptions')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'prescriptions'
              ? 'bg-[#2F6FED] text-white shadow-md shadow-blue-500/20'
              : 'bg-white hover:bg-[#EEF3FA] text-[#4A5D7E] border border-[#E2E8F4]'
          }`}
        >
          <Pill className="w-4 h-4" />
          <span>{isHindi ? 'मेरे मेडिकल पर्चे' : 'My Prescriptions'}</span>
        </button>
        <button
          type="button"
          id="patient-tab-visits"
          onClick={() => setActiveTab('visits')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'visits'
              ? 'bg-[#2F6FED] text-white shadow-md shadow-blue-500/20'
              : 'bg-white hover:bg-[#EEF3FA] text-[#4A5D7E] border border-[#E2E8F4]'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{isHindi ? 'दौरे एवं परामर्श इतिहास' : 'Visit History'}</span>
          {visits.length > 0 && (
            <span
              className={`px-2 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'visits' ? 'bg-white/20 text-white' : 'bg-[#EEF3FA] text-[#2F6FED]'
              }`}
            >
              {visits.length}
            </span>
          )}
        </button>
        <button
          type="button"
          id="patient-tab-triage"
          onClick={() => setActiveTab('triage')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'triage'
              ? 'bg-red-600 text-white shadow-md shadow-red-500/20'
              : 'bg-white hover:bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          <HeartPulse className="w-4 h-4 text-red-500" />
          <span>{isHindi ? 'आपातकालीन ट्रायज व लक्षण परीक्षक' : 'Emergency Triage & Rx Checker'}</span>
        </button>
      </div>

      {/* Conditional Active Tab Content */}
      {activeTab === 'prescriptions' ? (
        <PatientPrescriptionsView
          patient={patient}
          patientToken={patientToken}
          language={language}
          onStartNewVisit={onStartNewVisit}
          onSwitchToVisits={() => setActiveTab('visits')}
        />
      ) : activeTab === 'visits' ? (
        /* Main Content Area: Visits List & Snapshot */
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
            <div className="bg-white rounded-2xl border border-[#E2E8F4] p-12 text-center">
              <FileSearch className="w-12 h-12 text-[#94A3B8] mx-auto mb-3 opacity-60" />
              <h3 className="font-bold text-[#102347] text-base mb-1">
                {isHindi ? 'कोई पिछला परामर्श नहीं मिला' : 'No Prior Visits Found'}
              </h3>
              <p className="text-xs text-[#6B7A99] max-w-sm mx-auto mb-6">
                {isHindi
                  ? 'आपने अभी तक कोई परामर्श रिकॉर्ड नहीं बनाया है। आप अभी नई जांच शुरू कर सकते हैं।'
                  : 'You have not recorded any clinical visits under this Patient ID yet.'}
              </p>
              <button
                type="button"
                onClick={onStartNewVisit}
                className="px-6 py-3 rounded-2xl bg-[#2F6FED] hover:bg-[#2058CA] text-white font-bold text-xs shadow-md shadow-blue-500/20 transition inline-flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isHindi ? 'पहली जांच शुरू करें' : 'Start First Consultation'}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visits.map((v) => {
                const isSelected = selectedVisitId === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => handleViewSummary(v.id)}
                    className={`p-5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'bg-[#EEF4FF] border-[#2F6FED] shadow-md shadow-blue-500/10'
                        : 'bg-white hover:bg-[#F8FAFD] border-[#E2E8F4]'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${
                          isSelected
                            ? 'bg-[#2F6FED] text-white'
                            : 'bg-[#EEF3FA] text-[#2F6FED]'
                        }`}
                      >
                        #{v.id}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-[#102347]">
                            {v.department || (isHindi ? 'सामान्य चिकित्सा' : 'General Consultation')}
                          </h4>
                          {v.urgency_flag && (
                            <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">
                              {isHindi ? 'आपातकालीन' : 'Urgent Flag'}
                            </span>
                          )}
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-full capitalize">
                            {v.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[#6B7A99]">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                            {v.created_at ? new Date(v.created_at).toLocaleDateString() : 'Recent'}
                          </span>
                          {v.documents_count > 0 && (
                            <span className="flex items-center gap-1 text-[#2F6FED] font-medium">
                              <FileText className="w-3.5 h-3.5" />
                              {v.documents_count} {isHindi ? 'दस्तावेज़' : 'Docs'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <ChevronRight className={`w-5 h-5 ${isSelected ? 'text-[#2F6FED]' : 'text-[#94A3B8]'}`} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Detailed Clinical Summary */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-[#102347] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#2F6FED]" />
            <span>{isHindi ? 'परामर्श विवरण' : 'Visit Snapshot'}</span>
          </h2>

          <div className="bg-white rounded-2xl border border-[#E2E8F4] p-5 shadow-sm min-h-[300px]">
            {loadingSummary ? (
              <div className="py-16 text-center text-[#6B7A99]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#2F6FED]" />
                <p className="text-xs">{isHindi ? 'विवरण लोड हो रहा है...' : 'Loading summary...'}</p>
              </div>
            ) : visitSummary ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="border-b border-[#E2E8F4] pb-3">
                  <div className="flex items-center justify-between text-xs text-[#6B7A99] mb-1">
                    <span>Visit #{visitSummary.visit_id}</span>
                    <span>{visitSummary.date ? new Date(visitSummary.date).toLocaleDateString() : 'Recent'}</span>
                  </div>
                  <h3 className="font-bold text-base text-[#102347]">
                    {visitSummary.department || (isHindi ? 'परामर्श सारांश' : 'Clinical Consultation')}
                  </h3>
                  {visitSummary.urgency_flag && (
                    <div className="mt-2 bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-xs text-rose-800 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold">{isHindi ? 'प्राथमिकता अलर्ट:' : 'Triage Notice:'}</strong>{' '}
                        {visitSummary.urgency_reason || (isHindi ? 'त्वरित देखभाल आवश्यक' : 'Prompt care indicated')}
                      </div>
                    </div>
                  )}
                </div>

                {/* Chief Complaint / Symptoms */}
                {visitSummary.symptoms?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-[#4A5D7E] uppercase tracking-wider mb-2">
                      {isHindi ? 'प्रमुख लक्षण एवं शिकायतें' : 'Reported Symptoms'}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {visitSummary.symptoms.map((s, i) => (
                        <span key={i} className="text-xs bg-[#EEF4FF] text-[#1A3673] px-2.5 py-1 rounded-lg font-medium border border-blue-100">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Consultation Note */}
                {visitSummary.consultation && (
                  <div className="bg-[#F8FAFD] p-3.5 rounded-xl border border-[#E3EAF6] text-xs space-y-2">
                    <h4 className="font-bold text-[#102347] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{isHindi ? 'डॉक्टर का अंतिम परामर्श' : 'Doctor Finalized Note'}</span>
                    </h4>
                    {visitSummary.consultation.diagnosis && (
                      <p className="text-[#334155]">
                        <strong>{isHindi ? 'निदान:' : 'Diagnosis:'}</strong> {visitSummary.consultation.diagnosis}
                      </p>
                    )}
                    {visitSummary.consultation.doctor_name && (
                      <p className="text-[11px] text-[#6B7A99]">
                        {isHindi ? 'परामर्शदाता:' : 'By:'} {visitSummary.consultation.doctor_name}
                      </p>
                    )}
                  </div>
                )}

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

                {/* Quick Prescription CTA */}
                <div className="pt-2 border-t border-[#E2E8F4]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('prescriptions')}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#EAF1FF] hover:bg-[#D5E4FF] text-[#2F6FED] text-xs font-bold transition flex items-center justify-center gap-1.5 border border-[#2F6FED]/20"
                  >
                    <Pill className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'इस दौरे का पर्चा देखें' : 'View Saved Prescriptions'}</span>
                  </button>
                </div>
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
      ) : (
        /* Emergency Triage & Rx Checker View */
        <div className="bg-white rounded-3xl border border-[#E2E8F4] p-6 md:p-8 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F4] pb-6">
            <div>
              <div className="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                <HeartPulse className="w-3.5 h-3.5" />
                <span>{isHindi ? 'आपातकालीन ट्रायज एआई' : 'PreDoc Emergency Clinical Triage AI'}</span>
              </div>
              <h2 className="text-2xl font-black text-[#102347] tracking-tight">
                {isHindi ? 'लक्षण एवं पूर्व पर्चा आपातकालीन जांच' : 'Emergency Condition & Prescription Checker'}
              </h2>
              <p className="text-xs text-[#6B7A99] mt-1 max-w-xl">
                {isHindi
                  ? 'अपने मौजूदा लक्षण दर्ज करें या पिछला मेडिकल पर्चा अपलोड करें। हमारा ट्रायज एआई तुरंत जीवन-घातक या गंभीर स्थितियों की पहचान करेगा।'
                  : 'Enter your current symptoms or upload a previous prescription/record. The AI automatically classifies acuity and instantly alerts if critical.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="tel:108"
                className="px-4 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-red-600/20 no-underline transition"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>{isHindi ? 'आपातकालीन 108' : 'Emergency 108'}</span>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Condition Entry & Upload */}
            <div className="space-y-4">
              {/* Option A: Enter Symptoms */}
              <div className="bg-[#F8FAFD] p-5 rounded-2xl border border-[#E2E8F4] space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#102347]">
                  {isHindi ? '1. अपने लक्षण या परेशानी का विवरण दें:' : '1. Describe Your Current Symptoms or Condition:'}
                </label>
                <textarea
                  rows={4}
                  value={conditionInput}
                  onChange={(e) => setConditionInput(e.target.value)}
                  placeholder={
                    isHindi
                      ? 'उदा. सीने में तेज दर्द, सांस लेने में दिक्कत, बाएं हाथ में दर्द, या बुखार...'
                      : 'e.g., Severe crushing chest pain radiating to left arm with breathlessness, or sudden weakness...'
                  }
                  className="w-full p-3.5 rounded-xl border border-[#CBD5E1] text-xs focus:ring-2 focus:ring-[#2F6FED] focus:border-transparent outline-none bg-white text-[#102347]"
                />

                {/* Quick Symptom Chips */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-[#6B7A99] uppercase tracking-wider">
                    {isHindi ? 'त्वरित उदाहरण लक्षण:' : 'Quick Sample Tests:'}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const txt = 'Severe crushing chest pain radiating to left arm with shortness of breath';
                        setConditionInput(txt);
                        handleCheckCondition(txt);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-semibold border border-red-200 transition"
                    >
                      🚨 Chest Pain + Radiating Arm (Cardiac)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const txt = 'Taking Sublingual Nitroglycerin with acute ongoing chest tightness';
                        setConditionInput(txt);
                        handleCheckCondition(txt);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-semibold border border-red-200 transition"
                    >
                      🚨 Sublingual Nitroglycerin (Rescue Rx)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const txt = 'Sudden severe thunderclap headache, facial numbness and slurred speech';
                        setConditionInput(txt);
                        handleCheckCondition(txt);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-semibold border border-red-200 transition"
                    >
                      🚨 Stroke Signs / FAST (Neuro)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const txt = 'Mild runny nose and slight dry cough since 2 days';
                        setConditionInput(txt);
                        handleCheckCondition(txt);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold border border-emerald-200 transition"
                    >
                      🟢 Mild Cough / Cold (Routine)
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={evaluatingTriage || !conditionInput.trim()}
                  onClick={() => handleCheckCondition()}
                  className="w-full py-3 rounded-xl bg-[#2F6FED] hover:bg-[#2058CA] disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2"
                >
                  {evaluatingTriage ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{isHindi ? 'ट्रायज विश्लेषण जारी है...' : 'Evaluating Clinical Triage...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{isHindi ? 'ट्रायज जांच शुरू करें' : 'Run Emergency Triage Check'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Option B: Upload Prescription / Document */}
              <div className="bg-[#F8FAFD] p-5 rounded-2xl border border-[#E2E8F4] space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#102347]">
                  {isHindi ? '2. या पिछला मेडिकल पर्चा / रिपोर्ट अपलोड करें:' : '2. Or Upload Previous Prescription / Report:'}
                </label>
                <div
                  onClick={() => rxFileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#CBD5E1] hover:border-[#2F6FED] p-5 rounded-xl text-center cursor-pointer bg-white transition space-y-2"
                >
                  <UploadCloud className="w-8 h-8 text-[#2F6FED] mx-auto" />
                  <p className="text-xs font-bold text-[#102347]">
                    {uploadedRxFile ? uploadedRxFile.name : (isHindi ? 'पर्चा अपलोड करने के लिए क्लिक करें' : 'Click to select prescription image or PDF')}
                  </p>
                  <p className="text-[11px] text-[#6B7A99]">JPG, PNG, WebP or PDF (Max 20MB)</p>
                  <input
                    ref={rxFileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleRxFileSelect}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* Right: Real-Time Triage AI Evaluation Result */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#102347] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#2F6FED]" />
                <span>{isHindi ? 'ट्रायज परिणाम एवं आपातकालीन स्थिति:' : 'Triage AI Evaluation & Emergency Status:'}</span>
              </h3>

              {triageError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {triageError}
                </div>
              )}

              {evaluatingTriage ? (
                <div className="bg-[#F8FAFD] rounded-2xl border border-[#E2E8F4] p-12 text-center text-[#6B7A99] space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#2F6FED]" />
                  <h4 className="font-bold text-sm text-[#102347]">
                    {isHindi ? 'क्लिनिकल ट्रायज एआई विश्लेषण कर रहा है...' : 'Clinical Triage AI Analyzing Input...'}
                  </h4>
                  <p className="text-xs text-[#6B7A99] max-w-sm mx-auto">
                    {isHindi
                      ? 'लक्षणों और दवाओं का आपातकालीन लाल झंडों (Red Flags) के विरुद्ध परीक्षण किया जा रहा है।'
                      : 'Scanning symptoms and medications against high-acuity life safety criteria.'}
                  </p>
                </div>
              ) : triageResult ? (
                <div
                  className={`rounded-3xl p-6 border-2 transition animate-in zoom-in-95 duration-200 space-y-4 ${
                    triageResult.is_emergency || triageResult.triage_level === 'CRITICAL'
                      ? 'bg-red-50/70 border-red-500 shadow-xl shadow-red-500/10'
                      : triageResult.triage_level === 'URGENT'
                      ? 'bg-amber-50/70 border-amber-400 shadow-md shadow-amber-400/10'
                      : 'bg-emerald-50/70 border-emerald-400 shadow-md shadow-emerald-400/10'
                  }`}
                >
                  {/* Status Banner */}
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                        triageResult.is_emergency || triageResult.triage_level === 'CRITICAL'
                          ? 'bg-red-600 text-white animate-pulse'
                          : triageResult.triage_level === 'URGENT'
                          ? 'bg-amber-600 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>
                        {triageResult.triage_level === 'CRITICAL'
                          ? 'LEVEL 1: CRITICAL EMERGENCY'
                          : triageResult.triage_level === 'URGENT'
                          ? 'LEVEL 2: URGENT CARE'
                          : 'LEVEL 3: ROUTINE'}
                      </span>
                    </span>

                    <span className="text-xs font-mono font-bold text-slate-700">
                      Score: {triageResult.urgency_score || (triageResult.is_emergency ? 5 : 1)}/5
                    </span>
                  </div>

                  {/* Red Flags List */}
                  {triageResult.detected_red_flags?.length > 0 && (
                    <div className="bg-white/80 p-3.5 rounded-2xl border border-red-200">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-red-800 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        <span>{isHindi ? 'पहचाने गए गंभीर संकेत:' : 'Detected Red Flags:'}</span>
                      </h4>
                      <ul className="space-y-1">
                        {triageResult.detected_red_flags.map((flag, idx) => (
                          <li key={idx} className="text-xs text-red-900 font-semibold flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-600 flex-shrink-0" />
                            <span>{flag}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Rationale & Warning */}
                  <div className="bg-white/90 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
                    <p className="text-slate-800">
                      <strong>{isHindi ? 'चिकित्सीय कारण:' : 'Clinical Rationale:'}</strong> {triageResult.clinical_rationale}
                    </p>
                    {triageResult.patient_warning_message && (
                      <p className="text-red-700 font-bold border-t border-slate-100 pt-2">
                        {triageResult.patient_warning_message}
                      </p>
                    )}
                    {triageResult.recommended_department && (
                      <p className="text-blue-800 font-semibold pt-1">
                        <strong>{isHindi ? 'अनुशंसित विभाग:' : 'Recommended Department:'}</strong> {triageResult.recommended_department}
                      </p>
                    )}
                  </div>

                  {/* Action CTA */}
                  {triageResult.is_emergency || triageResult.triage_level === 'CRITICAL' ? (
                    <div className="space-y-2 pt-2">
                      <a
                        href="tel:108"
                        className="w-full py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 text-center no-underline transition"
                      >
                        <PhoneCall className="w-4 h-4" />
                        <span>{isHindi ? 'आपातकालीन एम्बुलेंस को कॉल करें (108)' : 'Call Emergency Ambulance (108)'}</span>
                      </a>
                      <button
                        type="button"
                        onClick={onStartNewVisit}
                        className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition flex items-center justify-center gap-2"
                      >
                        <span>{isHindi ? 'आपातकालीन परामर्श शुरू करें' : 'Proceed to Emergency Intake'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onStartNewVisit}
                      className="w-full py-3 rounded-2xl bg-[#2F6FED] hover:bg-[#2058CA] text-white font-bold text-xs shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2"
                    >
                      <span>{isHindi ? 'इस स्थिति के साथ परामर्श शुरू करें' : 'Start Consultation with these Symptoms'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-[#F8FAFD] rounded-2xl border border-dashed border-[#CBD5E1] p-12 text-center text-[#8695B1] text-xs">
                  <ShieldCheck className="w-10 h-10 mx-auto text-[#94A3B8] mb-2 opacity-50" />
                  <p>{isHindi ? 'लक्षण दर्ज करें या पर्चा अपलोड करके ट्रायज विश्लेषण देखें।' : 'Enter symptoms or upload a prescription to view real-time triage evaluation.'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Critical Emergency Notification Modal */}
      <CriticalTriageModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        triageData={triageResult}
        language={language}
      />
    </div>
  );
}
