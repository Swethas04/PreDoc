import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Pill,
  Printer,
  QrCode,
  Calendar,
  User,
  Stethoscope,
  Building2,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  Check,
  Download,
  Info,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

const API_BASE = '/api';

export default function PatientPrescriptionsView({
  patient,
  patientToken,
  language = 'en',
  onStartNewVisit,
  onSwitchToVisits,
}) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRxForModal, setSelectedRxForModal] = useState(null);
  const [printingRx, setPrintingRx] = useState(null);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [networkInfo, setNetworkInfo] = useState(null);

  const qrCanvasRef = useRef(null);
  const isHindi = language === 'hi';

  useEffect(() => {
    fetch(`${API_BASE}/network-info`)
      .then((r) => r.json())
      .then((data) => setNetworkInfo(data))
      .catch((e) => console.warn('Could not fetch network info:', e));
  }, []);

  const getVerificationUrl = (shareToken) => {
    const origin = window.location.origin;
    const hostname = window.location.hostname;
    // If running on localhost on PC, point the phone's QR code to the PC's Wi-Fi IP address
    if (
      (hostname === 'localhost' || hostname === '127.0.0.1') &&
      networkInfo?.local_ip &&
      networkInfo.local_ip !== '127.0.0.1'
    ) {
      return `http://${networkInfo.local_ip}:${networkInfo.frontend_port || 5173}/rx/view/${shareToken}`;
    }
    return `${origin}/rx/view/${shareToken}`;
  };

  const fetchPrescriptions = async () => {
    if (!patient?.id) return;
    setLoading(true);
    setError(null);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (patientToken) {
        headers['Authorization'] = `Bearer ${patientToken}`;
      }

      // Fetch from patient prescriptions endpoint
      let res = await fetch(`${API_BASE}/patients/${patient.id}/prescriptions`, { headers });
      if (!res.ok) {
        // Fallback to prescriptions router
        res = await fetch(`${API_BASE}/prescriptions/patient/${patient.id}`, { headers });
      }

      if (!res.ok) {
        throw new Error(
          isHindi
            ? `पर्चे लोड करने में असमर्थ (HTTP ${res.status})`
            : `Failed to load prescriptions (HTTP ${res.status})`
        );
      }

      const data = await res.json();
      setPrescriptions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch prescriptions failed:', err);
      setError(err.message || (isHindi ? 'पर्चे लोड नहीं हो सके।' : 'Could not load your prescriptions.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptions();
  }, [patient?.id, patientToken]);

  // Render QR Code in modal whenever selectedRxForModal changes
  useEffect(() => {
    if (selectedRxForModal && qrCanvasRef.current) {
      const shareToken = selectedRxForModal.share_token || selectedRxForModal.id;
      const verifyUrl = getVerificationUrl(shareToken);

      QRCode.toCanvas(
        qrCanvasRef.current,
        verifyUrl,
        {
          width: 230,
          margin: 1,
          color: {
            dark: '#0F1E36',
            light: '#FFFFFF',
          },
        },
        (err) => {
          if (err) console.error('QR code generation error:', err);
        }
      );
    }
  }, [selectedRxForModal, patient, networkInfo]);



  // Trigger browser printing for a specific prescription
  const handlePrint = (rx) => {
    setPrintingRx(rx);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleCopyDigitalSummary = () => {
    if (!selectedRxForModal) return;
    const medText = (selectedRxForModal.medicines || [])
      .map(
        (m, idx) =>
          `${idx + 1}. ${m.name} - ${m.dosage || '1 tab'} | ${m.frequency} | ${m.duration} (${m.instructions || 'After food'})`
      )
      .join('\n');

    const summaryText = `PreDoc Official Prescription
Patient: ${patient?.name} (ID: ${patient?.patient_code || patient?.id})
Doctor: ${selectedRxForModal.doctor_name || 'Dr. Attending Physician'}
Visit: #${selectedRxForModal.visit_id}
Date: ${new Date(selectedRxForModal.created_at || Date.now()).toLocaleDateString()}
Diagnosis: ${selectedRxForModal.diagnosis || 'Clinical Consultation'}

Prescribed Medicines:
${medText}

Advice: ${selectedRxForModal.general_advice || 'Take as prescribed.'}
Follow-up: ${selectedRxForModal.follow_up || 'Review as needed.'}`;

    navigator.clipboard.writeText(summaryText);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner / Actions (Hidden during print) */}
      <div className="no-print bg-white rounded-3xl border border-[#E2E8F4] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#2F6FED] to-[#558EFF] text-white flex items-center justify-center shadow-md flex-shrink-0">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-[#102347] tracking-tight">
                {isHindi ? 'मेरे मेडिकल पर्चे' : 'My Prescriptions & Medicines'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#EAF1FF] text-[#2F6FED] border border-[#2F6FED]/20">
                {prescriptions.length} {prescriptions.length === 1 ? (isHindi ? 'पर्चा' : 'Rx Order') : (isHindi ? 'पर्चे' : 'Rx Orders')}
              </span>
            </div>
            <p className="text-xs text-[#6B7A99] mt-0.5">
              {isHindi
                ? 'डॉक्टर द्वारा दिए गए सभी दवा पर्चे, खुराक नियम एवं फार्मेसी प्रिंटआउट।'
                : 'All verified physician prescriptions, medication dosages, and pharmacy printouts.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchPrescriptions}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-[#F6F9FF] hover:bg-[#EEF3FA] border border-[#E2E8F4] text-xs font-semibold text-[#4A5D7E] flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2F6FED]' : ''}`} />
            <span>{isHindi ? 'ताज़ा करें' : 'Refresh'}</span>
          </button>
          {onStartNewVisit && (
            <button
              type="button"
              onClick={onStartNewVisit}
              className="px-4 py-2 rounded-xl bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>{isHindi ? 'नई जांच शुरू करें' : 'Start Consultation'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="no-print bg-white rounded-3xl border border-[#E2E8F4] p-16 text-center text-[#6B7A99]">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-[#2F6FED]" />
          <h3 className="text-base font-bold text-[#102347]">
            {isHindi ? 'पर्चे लोड हो रहे हैं...' : 'Retrieving your prescriptions...'}
          </h3>
          <p className="text-xs text-[#6B7A99] mt-1">
            {isHindi ? 'कृपया प्रतीक्षा करें...' : 'Fetching your secure prescription history.'}
          </p>
        </div>
      ) : error ? (
        <div className="no-print bg-rose-50 border border-rose-200 rounded-2xl p-5 text-rose-800 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">{isHindi ? 'त्रुटि' : 'Error loading records'}:</span> {error}
            <button
              onClick={fetchPrescriptions}
              className="block mt-2 text-xs font-bold underline text-rose-900"
            >
              {isHindi ? 'पुनः प्रयास करें' : 'Try Again'}
            </button>
          </div>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="no-print bg-white rounded-3xl border border-[#E2E8F4] p-12 text-center shadow-sm max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#2F6FED] flex items-center justify-center mx-auto mb-4">
            <Pill className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-[#102347]">
            {isHindi ? 'कोई सक्रिय पर्चा नहीं मिला' : 'No Saved Prescriptions Yet'}
          </h3>
          <p className="text-xs text-[#6B7A99] mt-2 max-w-md mx-auto leading-relaxed">
            {isHindi
              ? 'जब कोई डॉक्टर आपकी जांच के बाद पर्चा सहेजेंगे, तो वह यहाँ तुरंत दिखाई देगा। आप उसे फार्मेसी के लिए प्रिंट या क्यूआर कोड से दिखा सकते हैं।'
              : 'Once a doctor consults with you and saves a prescription to your patient record, it will appear right here with full dosage instructions, digital QR verification, and printable pharmacy sheets.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {onSwitchToVisits && (
              <button
                type="button"
                onClick={onSwitchToVisits}
                className="px-5 py-2.5 rounded-full bg-white border border-[#CBD5E1] text-xs font-semibold text-[#1A2B4C] hover:bg-[#F6F9FF] transition flex items-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-[#2F6FED]" />
                <span>{isHindi ? 'दौरे का इतिहास देखें' : 'View Visit History'}</span>
              </button>
            )}
            {onStartNewVisit && (
              <button
                type="button"
                onClick={onStartNewVisit}
                className="px-5 py-2.5 rounded-full bg-[#2F6FED] text-white text-xs font-bold hover:bg-[#255BC7] transition shadow-sm flex items-center gap-1.5"
              >
                <Stethoscope className="w-4 h-4" />
                <span>{isHindi ? 'नई जांच शुरू करें' : 'Start New Check-In'}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="no-print space-y-6">
          {prescriptions.map((rx, rxIndex) => {
            const rxDate = rx.created_at
              ? new Date(rx.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : 'Recent';

            const medicines = rx.medicines || [];

            return (
              <div
                key={rx.id || rxIndex}
                className="bg-white rounded-3xl border border-[#D8E2F0] hover:border-[#2F6FED]/50 shadow-sm transition-all overflow-hidden"
              >
                {/* Prescription Card Header */}
                <div className="bg-gradient-to-r from-[#F8FAFC] via-[#EEF4FD] to-[#F8FAFC] p-5 sm:p-6 border-b border-[#E2E8F4]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-[#EAF1FF] border border-[#2F6FED]/20 text-[#2F6FED] flex items-center justify-center flex-shrink-0 font-serif font-black text-xl shadow-xs">
                        ℞
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-base text-[#102347]">
                            {rx.doctor_name || 'Dr. Attending Physician'}
                          </span>
                          <span className="font-mono text-xs font-bold text-[#2F6FED] bg-white px-2.5 py-0.5 rounded-lg border border-[#2F6FED]/30 shadow-xs">
                            Visit #{rx.visit_id}
                          </span>
                          {rxIndex === 0 && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                              {isHindi ? 'नवीनतम पर्चा' : 'Most Recent'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[#6B7A99]">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-[#2F6FED]" />
                            {rxDate}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-medium text-[#4A5D7E]">
                            <Pill className="w-3.5 h-3.5 text-emerald-600" />
                            {medicines.length} {medicines.length === 1 ? 'Medicine' : 'Medicines'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: Print & Digital QR */}
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedRxForModal(rx)}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#EEF3FA] border border-[#CBD5E1] text-[#102347] text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                        title="Show digital QR code for pharmacy"
                      >
                        <QrCode className="w-3.5 h-3.5 text-[#2F6FED]" />
                        <span>{isHindi ? 'डिजिटल QR' : 'Pharmacy QR'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrint(rx)}
                        className="px-4 py-2 rounded-xl bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                        title="Print pharmacy-ready prescription"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'प्रिंट करें' : 'Print Rx'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Diagnosis callout if present */}
                  {rx.diagnosis && (
                    <div className="mt-3.5 pt-3 border-t border-[#E2E8F4]/80 flex items-center gap-2 text-xs">
                      <span className="font-bold text-[#4A5D7E] uppercase text-[10px] tracking-wider">
                        {isHindi ? 'निदान (Diagnosis):' : 'Diagnosis:'}
                      </span>
                      <span className="font-semibold text-[#102347] bg-white px-2.5 py-0.5 rounded-md border border-[#E2E8F4]">
                        {rx.diagnosis}
                      </span>
                    </div>
                  )}
                </div>

                {/* Medicines List matching Doctor Preview Card */}
                <div className="p-5 sm:p-6 space-y-4">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#6B7A99] flex items-center gap-2">
                    <Pill className="w-4 h-4 text-[#2F6FED]" />
                    <span>{isHindi ? 'निर्धारित दवाएं' : 'Prescribed Medications'}</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {medicines.map((med, idx) => (
                      <div
                        key={med.id || idx}
                        className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F4] hover:border-[#2F6FED]/40 transition space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-6 h-6 rounded-full bg-[#EAF1FF] text-[#2F6FED] font-black text-xs flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <h5 className="font-bold text-sm text-[#102347] leading-snug truncate">
                                {med.name}
                              </h5>
                              {med.composition && (
                                <p className="text-[11px] text-[#6B7A99] truncate mt-0.5">
                                  {med.composition}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Dosage Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1 border-t border-[#EDF2F9]">
                          <span className="px-2.5 py-0.5 rounded-md font-bold bg-[#E2E8F4] text-[#1E293B]">
                            {med.dosage || '1 tab'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md font-semibold bg-[#EAF1FF] text-[#2F6FED]">
                            {med.frequency || '1-0-1'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-md font-semibold bg-[#EAF7EE] text-[#2FAE60]">
                            {med.duration || '5 days'}
                          </span>
                        </div>

                        {med.instructions && (
                          <div className="text-xs text-[#475569] bg-white p-2 rounded-xl border border-[#E2E8F4] flex items-center gap-1.5 font-medium">
                            <span className="text-[#2F6FED]">📝</span>
                            <span>{med.instructions}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* General Advice & Follow-Up Box */}
                  {(rx.general_advice || rx.follow_up) && (
                    <div className="mt-4 p-4 rounded-2xl bg-[#F4F7FB] border border-[#E2E8F4] space-y-2 text-xs">
                      {rx.general_advice && (
                        <div>
                          <span className="font-bold text-[#334155] block mb-0.5">
                            {isHindi ? 'डॉक्टर की सलाह / आहार:' : 'Physician Advice & Lifestyle:'}
                          </span>
                          <p className="text-[#475569] leading-relaxed">{rx.general_advice}</p>
                        </div>
                      )}
                      {rx.follow_up && (
                        <div className="pt-2 border-t border-[#E2E8F4]/80">
                          <span className="font-bold text-[#2F6FED] block mb-0.5">
                            {isHindi ? 'पुनः जांच (Follow-Up):' : 'Follow-Up Instructions:'}
                          </span>
                          <p className="text-[#475569]">{rx.follow_up}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Digital Pharmacy QR Modal ────────────────────────────────────────── */}
      {selectedRxForModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E2E8F4] space-y-5 relative">
            <button
              type="button"
              onClick={() => setSelectedRxForModal(null)}
              className="absolute top-5 right-5 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mx-auto mb-2">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-[#102347]">
                {isHindi ? 'डिजिटल फार्मेसी क्यूआर कोड' : 'Digital Pharmacy QR'}
              </h3>
              <p className="text-xs text-[#6B7A99]">
                {isHindi
                  ? 'दवा काउंटर पर यह क्यूआर कोड दिखाएं या स्कैन करवाएं।'
                  : 'Present this verified QR code at the pharmacy counter for digital verification.'}
              </p>
            </div>

            {/* Canvas QR Code Display */}
            <div className="flex justify-center p-4 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F4]">
              <canvas ref={qrCanvasRef} className="rounded-xl shadow-xs" />
            </div>

            {/* Quick Prescription Details */}
            <div className="p-3.5 bg-[#F1F5F9] rounded-2xl text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Patient:</span>
                <span className="font-bold text-[#0F172A]">{patient?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Patient ID:</span>
                <span className="font-bold text-[#2F6FED]">{patient?.patient_code || patient?.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Doctor:</span>
                <span className="font-semibold text-[#0F172A]">
                  {selectedRxForModal.doctor_name || 'Dr. Attending Physician'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Medicines:</span>
                <span className="font-bold text-emerald-700">
                  {selectedRxForModal.medicines?.length || 0} prescribed
                </span>
              </div>
              <div className="pt-2 border-t border-[#E2E8F0] space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#64748B]">Verify URL:</span>
                  <a
                    href={getVerificationUrl(selectedRxForModal.share_token || selectedRxForModal.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2F6FED] hover:underline font-bold flex items-center gap-1 truncate max-w-[200px]"
                  >
                    <span className="truncate">{getVerificationUrl(selectedRxForModal.share_token || selectedRxForModal.id)}</span>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
                <p className="text-[10px] text-[#64748B] font-sans">
                  💡 Ensure your phone is connected to the same Wi-Fi network ({networkInfo?.local_ip ? `http://${networkInfo.local_ip}:5173` : 'local network'}).
                </p>
              </div>
            </div>

            {/* Actions: Copy & Print */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyDigitalSummary}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#102347] text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                {copiedPayload ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedPayload ? (isHindi ? 'कॉपी हो गया ✓' : 'Copied ✓') : (isHindi ? 'सारांश कॉपी करें' : 'Copy Summary')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const toPrint = selectedRxForModal;
                  setSelectedRxForModal(null);
                  handlePrint(toPrint);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>{isHindi ? 'पर्चा प्रिंट करें' : 'Print Rx Sheet'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Pharmacy-Friendly Printable Sheet ─────────────────────────────────── */}
      {/* This layout is strictly styled for window.print() and clean paper output */}
      <div
        id="printable-prescription-root"
        className="printable-prescription-sheet hidden print:block p-8 bg-white text-[#0F172A] font-sans"
      >
        {(() => {
          const rxToPrint = printingRx || prescriptions[0];
          if (!rxToPrint) return null;

          const medicines = rxToPrint.medicines || [];
          const printDate = rxToPrint.created_at
            ? new Date(rxToPrint.created_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })
            : new Date().toLocaleDateString();

          return (
            <div className="space-y-6 max-w-4xl mx-auto border-2 border-[#1E293B] p-8 rounded-xl">
              {/* Official Clinic / Hospital Header */}
              <div className="border-b-2 border-[#0F172A] pb-5 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center font-bold text-base">
                      +
                    </div>
                    <h1 className="text-2xl font-black uppercase tracking-tight text-[#0F172A]">
                      PreDoc Healthcare Center
                    </h1>
                  </div>
                  <p className="text-xs text-[#475569] font-medium mt-1">
                    Department of Internal Medicine &amp; Clinical Triage
                  </p>
                  <p className="text-[11px] text-[#64748B]">
                    Affiliated Multi-Speciality Clinic • Emergency &amp; OPD Services
                  </p>
                </div>

                <div className="text-right text-xs">
                  <span className="font-serif font-black text-3xl text-[#0F172A] block leading-none">℞</span>
                  <span className="font-bold text-[#0F172A] block mt-1">Date: {printDate}</span>
                  <span className="font-mono text-[#475569]">Visit Ref: #{rxToPrint.visit_id}</span>
                </div>
              </div>

              {/* Patient & Doctor Demographics Bar */}
              <div className="grid grid-cols-4 gap-4 p-4 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] text-xs">
                <div>
                  <span className="text-[#64748B] block text-[10px] uppercase font-bold">Patient Name</span>
                  <span className="font-bold text-[#0F172A] text-sm">{patient?.name || 'Patient'}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10px] uppercase font-bold">Patient ID / UHID</span>
                  <span className="font-mono font-bold text-[#0F172A] text-sm">
                    {patient?.patient_code || `PID-${patient?.id}`}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10px] uppercase font-bold">Age / Gender</span>
                  <span className="font-bold text-[#0F172A]">
                    {patient?.age ? `${patient.age} Yrs` : 'N/A'} {patient?.gender ? `/ ${patient.gender}` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[10px] uppercase font-bold">Attending Doctor</span>
                  <span className="font-bold text-[#0F172A]">{rxToPrint.doctor_name || 'Dr. Attending Physician'}</span>
                </div>
              </div>

              {/* Diagnosis */}
              {rxToPrint.diagnosis && (
                <div className="border border-[#CBD5E1] p-3 rounded-lg bg-white text-xs">
                  <span className="font-bold text-[#0F172A] uppercase text-[10px] mr-2">Clinical Diagnosis:</span>
                  <span className="font-semibold text-[#1E293B]">{rxToPrint.diagnosis}</span>
                </div>
              )}

              {/* Medicines Table */}
              <div className="space-y-2">
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-[#0F172A] border-b border-[#CBD5E1] pb-1">
                  Prescription &amp; Medication Orders ({medicines.length})
                </h3>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#0F172A] text-[11px] font-bold text-[#0F172A]">
                      <th className="py-2 px-2 w-10">#</th>
                      <th className="py-2 px-2">Medicine &amp; Composition</th>
                      <th className="py-2 px-2 w-24">Dosage</th>
                      <th className="py-2 px-2 w-36">Frequency</th>
                      <th className="py-2 px-2 w-24">Duration</th>
                      <th className="py-2 px-2">Special Instructions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {medicines.map((med, idx) => (
                      <tr key={med.id || idx} className="prescription-medicine-row">
                        <td className="py-3 px-2 font-bold text-[#0F172A] align-top">{idx + 1}.</td>
                        <td className="py-3 px-2 align-top">
                          <span className="font-bold text-sm text-[#0F172A] block">{med.name}</span>
                          {med.composition && (
                            <span className="text-[10px] text-[#64748B] block">{med.composition}</span>
                          )}
                        </td>
                        <td className="py-3 px-2 font-semibold text-[#0F172A] align-top">
                          {med.dosage || '1 tab'}
                        </td>
                        <td className="py-3 px-2 font-semibold text-[#0F172A] align-top">
                          {med.frequency || '1-0-1'}
                        </td>
                        <td className="py-3 px-2 font-semibold text-[#0F172A] align-top">
                          {med.duration || '5 days'}
                        </td>
                        <td className="py-3 px-2 text-[#334155] italic align-top">
                          {med.instructions || 'After food'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Advice & Follow-Up */}
              <div className="prescription-footer-block space-y-3 pt-4 border-t border-[#CBD5E1]">
                {rxToPrint.general_advice && (
                  <div className="text-xs">
                    <span className="font-bold text-[#0F172A] block">Physician Advice &amp; Lifestyle:</span>
                    <p className="text-[#334155] leading-relaxed mt-0.5">{rxToPrint.general_advice}</p>
                  </div>
                )}
                {rxToPrint.follow_up && (
                  <div className="text-xs">
                    <span className="font-bold text-[#0F172A] block">Follow-Up Review:</span>
                    <p className="text-[#334155] mt-0.5">{rxToPrint.follow_up}</p>
                  </div>
                )}
              </div>

              {/* Doctor Signature & Pharmacy Dispense Seal */}
              <div className="prescription-footer-block pt-12 mt-8 border-t border-[#CBD5E1] grid grid-cols-2 gap-8 text-xs">
                <div>
                  <div className="p-3 border border-dashed border-[#94A3B8] rounded text-center text-[#64748B] text-[10px]">
                    Pharmacy Stamp / Dispensed Date &amp; Batch No.
                  </div>
                </div>
                <div className="text-right">
                  <div className="w-48 ml-auto border-b border-[#0F172A] pb-1">
                    <span className="font-serif italic text-sm text-[#1E3A8A]">
                      {rxToPrint.doctor_name || 'Dr. Attending Physician'}
                    </span>
                  </div>
                  <span className="font-bold text-[11px] block mt-1 text-[#0F172A]">
                    Authorized Medical Practitioner
                  </span>
                  <span className="text-[10px] text-[#64748B] block">PreDoc Healthcare Clinical Network</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
