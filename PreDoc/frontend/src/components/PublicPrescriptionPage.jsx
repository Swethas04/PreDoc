import React, { useEffect, useState } from 'react';
import {
  Pill,
  Printer,
  ShieldCheck,
  Building2,
  Calendar,
  User,
  Stethoscope,
  Clock,
  AlertTriangle,
  FileText,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  PhoneCall,
  CheckCircle2,
} from 'lucide-react';

const API_BASE = '/api';

export default function PublicPrescriptionPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing prescription verification token.');
      setLoading(false);
      return;
    }

    const fetchPrescription = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/prescriptions/share/${token}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Prescription not found or invalid QR code link.');
          }
          throw new Error(`Failed to load prescription (HTTP ${res.status}).`);
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error('Public prescription fetch failed:', err);
        setError(err.message || 'Could not verify prescription.');
      } finally {
        setLoading(false);
      }
    };

    fetchPrescription();
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    if (!data) return;
    const medList = (data.medicines || [])
      .map(
        (m, idx) =>
          `${idx + 1}. ${m.name} (${m.composition || ''}) - ${m.dosage || '1 tab'} | ${m.frequency} | ${m.duration} (${m.instructions || 'After food'})`
      )
      .join('\n');

    const text = `PreDoc Verified Digital Prescription
Patient: ${data.patient_name} (${data.patient_code || `PID-${data.id}`})
Age/Gender: ${data.patient_age ? `${data.patient_age} yrs` : 'N/A'} ${data.patient_gender ? `/ ${data.patient_gender}` : ''}
Doctor: ${data.doctor_name}
Date: ${new Date(data.issued_at).toLocaleDateString()}
Visit: #${data.visit_id}
Diagnosis: ${data.diagnosis || 'Clinical Consultation'}

Medications:
${medList}

Advice: ${data.general_advice || 'Take as prescribed.'}
Follow-Up: ${data.follow_up || 'Review as advised.'}

Verified by PreDoc Healthcare Network`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F9FF] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-10 border border-[#E2E8F4] shadow-lg max-w-sm w-full text-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin text-[#2F6FED] mx-auto" />
          <h2 className="text-lg font-black text-[#102347]">Verifying Prescription...</h2>
          <p className="text-xs text-[#6B7A99]">Connecting to PreDoc Secure Clinical Network</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F6F9FF] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 border border-rose-200 shadow-lg max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-black text-[#102347]">Verification Failed</h2>
          <p className="text-xs text-[#6B7A99] leading-relaxed">
            {error || 'The requested prescription could not be found or the link has expired.'}
          </p>
          <div className="p-3 bg-rose-50 rounded-2xl text-[11px] text-rose-800 font-mono">
            Token: {token}
          </div>
        </div>
      </div>
    );
  }

  const issuedDate = new Date(data.issued_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const expiresDate = data.expires_at
    ? new Date(data.expires_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen bg-[#F4F7FC] py-6 sm:py-10 px-3 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* ─── Top Verified Banner ──────────────────────────────────────────────── */}
        <div className="no-print bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-3xl p-4 sm:p-5 shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  Official Digital Rx
                </span>
                <span className="text-[11px] font-semibold text-emerald-100 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                  Verified
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-black tracking-tight mt-0.5">
                Verified Prescription from PreDoc Healthcare
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold transition flex items-center gap-1.5"
              title="Print prescription"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              type="button"
              onClick={handleCopySummary}
              className="p-2.5 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold transition flex items-center gap-1.5"
              title="Copy text summary"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ─── Medical Prescription Card (Paper Style) ─────────────────────────── */}
        <div className="bg-white rounded-3xl border border-[#D5E1F2] shadow-xl overflow-hidden printable-prescription-sheet">
          {/* Clinic Header */}
          <div className="bg-[#0F1E36] text-white p-6 sm:p-7 relative overflow-hidden">
            <div className="flex items-start justify-between relative z-10 gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#2F6FED] text-white flex items-center justify-center font-bold text-lg shadow-md">
                    +
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-black tracking-tight uppercase">
                      {data.clinic_name || 'PreDoc Healthcare Center'}
                    </h2>
                    <p className="text-[11px] text-blue-200/90 font-medium">
                      {data.clinic_department || 'Department of Internal Medicine & Clinical Triage'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span className="font-serif font-black text-3xl text-blue-400 block leading-none">℞</span>
                <span className="text-[10px] text-blue-200 mt-1 block">Ref: #{data.visit_id}</span>
              </div>
            </div>

            {/* Subtle background glow */}
            <div className="absolute -right-10 -bottom-10 w-36 h-36 bg-[#2F6FED]/20 rounded-full blur-2xl pointer-events-none" />
          </div>

          {/* Demographics Strip */}
          <div className="bg-[#F8FAFD] border-b border-[#E2E8F4] p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-[#6B7A99] font-bold uppercase block">Patient Name</span>
              <span className="font-bold text-[#102347] text-sm block truncate">{data.patient_name}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#6B7A99] font-bold uppercase block">Patient ID / UHID</span>
              <span className="font-mono font-bold text-[#2F6FED] text-sm block">
                {data.patient_code || `PID-${data.id}`}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#6B7A99] font-bold uppercase block">Age / Gender</span>
              <span className="font-bold text-[#102347]">
                {data.patient_age ? `${data.patient_age} Yrs` : 'N/A'}{' '}
                {data.patient_gender ? `/ ${data.patient_gender}` : ''}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-[#6B7A99] font-bold uppercase block">Attending Doctor</span>
              <span className="font-bold text-[#102347] block truncate">{data.doctor_name}</span>
            </div>
          </div>

          {/* Date & Diagnosis Header */}
          <div className="px-6 py-4 bg-white border-b border-[#E2E8F4] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#4A5D7E]">Issue Date:</span>
              <span className="font-semibold text-[#102347]">{issuedDate}</span>
              {expiresDate && (
                <span className="text-[10px] text-[#6B7A99] bg-[#F1F5F9] px-2 py-0.5 rounded-full">
                  Valid thru: {expiresDate}
                </span>
              )}
            </div>
            {data.diagnosis && (
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#4A5D7E]">Diagnosis:</span>
                <span className="font-bold text-[#102347] bg-[#EEF4FD] text-[#2F6FED] px-2.5 py-0.5 rounded-lg border border-[#2F6FED]/20">
                  {data.diagnosis}
                </span>
              </div>
            )}
          </div>

          {/* Prescribed Medicines Body */}
          <div className="p-6 sm:p-7 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F4] pb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#102347] flex items-center gap-2">
                <Pill className="w-4 h-4 text-[#2F6FED]" />
                <span>Prescribed Medications ({data.medicines?.length || 0})</span>
              </h3>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Verified Order
              </span>
            </div>

            <div className="space-y-3">
              {(data.medicines || []).map((med, idx) => (
                <div
                  key={med.id || idx}
                  className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F4] hover:border-[#2F6FED]/40 transition space-y-2.5 prescription-medicine-row"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-[#EAF1FF] text-[#2F6FED] font-black text-xs flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-sm text-[#102347] leading-snug truncate">
                          {med.name}
                        </h4>
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

            {/* Advice & Follow-Up */}
            {(data.general_advice || data.follow_up) && (
              <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2E8F4] space-y-2.5 text-xs prescription-footer-block">
                {data.general_advice && (
                  <div>
                    <span className="font-bold text-[#334155] block mb-0.5">
                      Physician Advice &amp; Lifestyle:
                    </span>
                    <p className="text-[#475569] leading-relaxed">{data.general_advice}</p>
                  </div>
                )}
                {data.follow_up && (
                  <div className="pt-2 border-t border-[#E2E8F4]/80">
                    <span className="font-bold text-[#2F6FED] block mb-0.5">
                      Follow-Up Instructions:
                    </span>
                    <p className="text-[#475569]">{data.follow_up}</p>
                  </div>
                )}
              </div>
            )}

            {/* Signature & Verification Seal */}
            <div className="pt-6 border-t border-[#CBD5E1] grid grid-cols-2 gap-4 text-xs prescription-footer-block">
              <div className="p-3 border border-dashed border-[#CBD5E1] rounded-xl text-center text-[#64748B] text-[10px] flex items-center justify-center">
                Digital Verification ID: {data.share_token?.substring(0, 16)}...
              </div>
              <div className="text-right space-y-0.5">
                <div className="w-36 ml-auto border-b border-[#0F172A] pb-0.5">
                  <span className="font-serif italic text-xs text-[#1E3A8A] block">
                    {data.doctor_name}
                  </span>
                </div>
                <span className="font-bold text-[10px] block text-[#0F172A]">
                  Authorized Practitioner
                </span>
                <span className="text-[9px] text-[#64748B] block">PreDoc Healthcare Network</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Footer Note (Hidden during print) ─────────────────────────────────── */}
        <div className="no-print text-center text-xs text-[#6B7A99] space-y-1">
          <p>This digital prescription was securely generated by the PreDoc Clinical System.</p>
          <p className="text-[10px] text-[#94A3B8]">
            For medical verification or inquiries, contact PreDoc Healthcare Center.
          </p>
        </div>
      </div>
    </div>
  );
}
