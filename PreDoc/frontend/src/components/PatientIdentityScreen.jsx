import React, { useState } from 'react';
import {
  UserPlus,
  LogIn,
  Shield,
  KeyRound,
  ArrowRight,
  AlertCircle,
  Loader2,
  QrCode,
  Sparkles,
  HelpCircle,
  HeartPulse,
} from 'lucide-react';

const API_BASE = '/api';

export default function PatientIdentityScreen({
  onSelectNewPatient,
  onReturningPatientSuccess,
  language = 'en',
}) {
  const [activeTab, setActiveTab] = useState('choice'); // 'choice' | 'returning_form'
  const [patientCode, setPatientCode] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isHindi = language === 'hi';

  const handleReturningLogin = async (e) => {
    e.preventDefault();
    setError(null);

    const cleanCode = (patientCode || '').trim().toUpperCase();
    const cleanPin = (pin || '').trim();

    if (!cleanCode) {
      setError(isHindi ? 'कृपया अपनी पेशेंट आईडी दर्ज करें' : 'Please enter your Patient ID (e.g. PD-XXXXXX)');
      return;
    }
    if (!cleanPin || cleanPin.length !== 4) {
      setError(isHindi ? 'कृपया अपना ४-अंकों का पिन दर्ज करें' : 'Please enter your 4-digit PIN');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/patient-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_code: cleanCode,
          pin: cleanPin,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Generic error to avoid exposing whether ID exists (per requirements)
        throw new Error(
          data.detail ||
            (isHindi
              ? 'गलत पेशेंट आईडी या पिन। कृपया पुनः प्रयास करें।'
              : 'Incorrect Patient ID or PIN. Please try again.')
        );
      }

      // Successful login
      sessionStorage.setItem('predoc_patient_token', data.access_token);
      sessionStorage.setItem('predoc_patient_info', JSON.stringify(data.patient));
      if (onReturningPatientSuccess) {
        onReturningPatientSuccess(data.patient, data.access_token, cleanPin);
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 animate-in fade-in duration-300">
      {/* Title & Welcome */}
      <div className="text-center max-w-xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/60 text-[#2F6FED] text-xs font-semibold mb-3 shadow-sm">
          <HeartPulse className="w-4 h-4 text-[#2F6FED]" />
          <span>{isHindi ? 'प्रीडॉक डिजिटल कियोस्क' : 'PreDoc Self-Service Clinical Kiosk'}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-[#102347] tracking-tight">
          {isHindi ? 'अस्पताल स्वागत कक्ष में आपका स्वागत है' : 'Welcome to Clinical Check-In'}
        </h1>
        <p className="text-sm text-[#6B7A99] mt-2 leading-relaxed">
          {isHindi
            ? 'परामर्श शुरू करने के लिए चुनें कि आप नए मरीज हैं या पहले आ चुके हैं।'
            : 'Select an option below to begin your consultation or retrieve your past visit history.'}
        </p>
      </div>

      {activeTab === 'choice' ? (
        /* Dual Cards Selection */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Option 1: New Patient */}
          <div
            id="new-patient-card-btn"
            onClick={onSelectNewPatient}
            className="group relative bg-white rounded-3xl border-2 border-[#E2E8F4] hover:border-[#2F6FED] hover:shadow-xl transition-all duration-300 p-8 flex flex-col justify-between cursor-pointer overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500 pointer-events-none" />

            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#2F6FED] to-[#1F54C7] text-white flex items-center justify-center shadow-lg shadow-blue-500/20 mb-6 group-hover:scale-105 transition-transform">
                <UserPlus className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#2F6FED]">
                  {isHindi ? 'पहला दौरा' : 'First Time'}
                </span>
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {isHindi ? 'नया मरीज' : 'New Patient'}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[#102347] tracking-tight">
                {isHindi ? 'मैं नया मरीज हूँ' : "I'm a New Patient"}
              </h2>
              <p className="text-xs text-[#6B7A99] mt-2 leading-relaxed">
                {isHindi
                  ? 'शुरुआती चेक-इन करें। आपको भविष्य के दौरों के लिए एक नया पेशेंट आईडी और पिन दिया जाएगा।'
                  : 'Start your intake session. You will be assigned a permanent Patient ID and PIN to save for future visits.'}
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-[#EEF3FA] flex items-center justify-between text-[#2F6FED] font-bold text-sm">
              <span>{isHindi ? 'चेक-इन शुरू करें' : 'Begin Check-In'}</span>
              <div className="w-8 h-8 rounded-full bg-blue-50 group-hover:bg-[#2F6FED] group-hover:text-white flex items-center justify-center transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Option 2: Returning Patient */}
          <div
            id="returning-patient-card-btn"
            onClick={() => setActiveTab('returning_form')}
            className="group relative bg-white rounded-3xl border-2 border-[#E2E8F4] hover:border-emerald-500 hover:shadow-xl transition-all duration-300 p-8 flex flex-col justify-between cursor-pointer overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50/50 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform duration-500 pointer-events-none" />

            <div>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-6 group-hover:scale-105 transition-transform">
                <LogIn className="w-7 h-7" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                  {isHindi ? 'पुराना रिकॉर्ड' : 'Existing Record'}
                </span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  ID + PIN
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[#102347] tracking-tight">
                {isHindi ? 'मैं पुराना मरीज हूँ' : "I'm a Returning Patient"}
              </h2>
              <p className="text-xs text-[#6B7A99] mt-2 leading-relaxed">
                {isHindi
                  ? 'अपना पेशेंट आईडी (PD-XXXXXX) और ४ अंकों का पिन दर्ज करके अपने पुराने रिकॉर्ड या नया परामर्श खोलें।'
                  : 'Enter your assigned Patient ID and 4-digit PIN to access your history and start today’s visit.'}
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-[#EEF3FA] flex items-center justify-between text-emerald-600 font-bold text-sm">
              <span>{isHindi ? 'आईडी से लॉगिन करें' : 'Enter ID & PIN'}</span>
              <div className="w-8 h-8 rounded-full bg-emerald-50 group-hover:bg-emerald-500 group-hover:text-white flex items-center justify-center transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Returning Patient Login Form */
        <div className="max-w-md mx-auto bg-white rounded-3xl border border-[#DCE4F2] shadow-xl p-8 animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveTab('choice');
                setError(null);
              }}
              className="text-xs text-[#2F6FED] hover:underline flex items-center gap-1 font-semibold"
            >
              ← {isHindi ? 'वापस जाएं' : 'Back to options'}
            </button>
            <span className="text-[11px] text-[#8695B1] font-mono">ID + PIN Auth</span>
          </div>

          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
              <KeyRound className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#102347]">
              {isHindi ? 'वापसी मरीज लॉगिन' : 'Returning Patient Sign-In'}
            </h3>
            <p className="text-xs text-[#6B7A99] mt-1">
              {isHindi ? 'अपनी पिछली पर्ची या फोटो से आईडी और पिन दर्ज करें' : 'Enter your Patient ID and 4-digit security PIN'}
            </p>
          </div>

          {error && (
            <div className="mb-5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3.5 text-xs flex items-start gap-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleReturningLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#102347] mb-1.5">
                {isHindi ? 'पेशेंट आईडी' : 'Patient ID'}
              </label>
              <input
                id="patient-id-input"
                type="text"
                placeholder="PD-XXXXXX"
                value={patientCode}
                onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-[#D5E1F2] focus:border-[#2F6FED] focus:ring-2 focus:ring-[#2F6FED]/20 font-mono text-base font-semibold tracking-wider text-[#102347] outline-none transition"
              />
              <span className="text-[10px] text-[#8695B1] mt-1 block">Format: PD-XXXXXX (from your identity card)</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#102347] mb-1.5">
                {isHindi ? '४-अंकों का सुरक्षा पिन' : '4-Digit Security PIN'}
              </label>
              <input
                id="patient-pin-input"
                type="password"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 rounded-xl border border-[#D5E1F2] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono text-xl font-bold tracking-widest text-[#102347] outline-none transition text-center"
              />
            </div>

            <button
              id="patient-login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isHindi ? 'सत्यापित किया जा रहा है...' : 'Verifying Credentials...'}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>{isHindi ? 'लॉगिन करें' : 'Sign In & View Records'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
