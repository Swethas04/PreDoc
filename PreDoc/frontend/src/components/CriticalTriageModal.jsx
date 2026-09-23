import React from 'react';
import {
  AlertTriangle,
  PhoneCall,
  ShieldAlert,
  Hospital,
  X,
  ArrowRight,
  Flame,
  Activity,
  HeartPulse,
} from 'lucide-react';

export default function CriticalTriageModal({
  isOpen,
  onClose,
  triageData,
  language = 'en',
}) {
  if (!isOpen || !triageData) return null;

  const isHindi = language === 'hi';
  const isEmergency = triageData.is_emergency || triageData.triage_level === 'CRITICAL';
  const redFlags = triageData.detected_red_flags || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border-2 border-red-500 animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Urgent Header Banner */}
        <div className="bg-gradient-to-r from-red-600 via-red-500 to-rose-600 p-6 text-white text-center relative overflow-hidden">
          <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white shadow-inner animate-pulse">
              <HeartPulse className="w-9 h-9 text-white" />
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase border border-white/30 text-white mb-2">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>
              {isEmergency
                ? isHindi
                  ? 'तत्काल आपातकालीन चेतावनी (लेवल 1)'
                  : 'CRITICAL EMERGENCY (LEVEL 1)'
                : isHindi
                ? 'अति आवश्यक ध्यान'
                : 'URGENT MEDICAL ATTENTION'}
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white leading-tight">
            {isEmergency
              ? isHindi
                ? 'तत्काल आपातकालीन चिकित्सा सहायता आवश्यक है!'
                : 'Immediate Emergency Medical Care Required!'
              : isHindi
              ? 'त्वरित चिकित्सा परामर्श आवश्यक है'
              : 'Prompt Clinical Evaluation Needed'}
          </h2>
          <p className="text-red-100 text-xs mt-1.5 font-medium">
            {isHindi
              ? 'अपलोड किए गए पर्चे / दर्ज लक्षणों में गंभीर आपातकालीन संकेत पाए गए हैं।'
              : 'Critical markers detected from your entered condition or uploaded prescription.'}
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Detected Red Flags */}
          {redFlags.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>{isHindi ? 'पहचाने गए गंभीर संकेत:' : 'Detected Critical Red Flags:'}</span>
              </h4>
              <ul className="space-y-1.5">
                {redFlags.map((flag, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs font-semibold text-red-900">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 mt-1 flex-shrink-0" />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Clinical Rationale & Warning Message */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-4 text-xs space-y-2">
            <div>
              <span className="font-bold text-[#1E293B]">
                {isHindi ? 'चिकित्सीय कारण (Clinical Rationale): ' : 'Clinical Rationale: '}
              </span>
              <span className="text-[#475569]">
                {triageData.clinical_rationale ||
                  (isHindi
                    ? 'लक्षण या दवाएं तीव्र आपातकालीन स्थिति की ओर संकेत करती हैं।'
                    : 'Condition indicates potential acute emergency requiring immediate triage.')}
              </span>
            </div>
            {triageData.patient_warning_message && (
              <div className="pt-2 border-t border-[#E2E8F0] text-red-700 font-medium">
                {triageData.patient_warning_message}
              </div>
            )}
            {triageData.recommended_department && (
              <div className="pt-1 text-[#334155] flex items-center gap-1.5 font-semibold">
                <Hospital className="w-3.5 h-3.5 text-blue-600" />
                <span>{isHindi ? 'अनुशंसित विभाग:' : 'Recommended Department:'} </span>
                <span className="text-blue-700">{triageData.recommended_department}</span>
              </div>
            )}
          </div>

          {/* Hospital Alert Badge */}
          <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
            <Activity className="w-4 h-4 text-emerald-600 flex-shrink-0 animate-pulse" />
            <span className="font-medium">
              {isHindi
                ? 'अस्पताल के आपातकालीन ट्रायज डेस्क को तुरंत सूचित कर दिया गया है।'
                : 'Hospital Emergency Triage Desk and on-call medical staff have been alerted.'}
            </span>
          </div>

          {/* Emergency Call Buttons */}
          <div className="space-y-2 pt-2">
            <a
              href="tel:108"
              className="w-full py-3.5 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition transform active:scale-98 text-center no-underline"
            >
              <PhoneCall className="w-4 h-4" />
              <span>{isHindi ? 'आपातकालीन एम्बुलेंस को कॉल करें (108)' : 'Call Emergency Ambulance (108)'}</span>
            </a>

            <div className="grid grid-cols-2 gap-2">
              <a
                href="tel:112"
                className="py-2.5 px-3 rounded-xl bg-[#1E293B] hover:bg-[#0F172A] text-white font-bold text-xs flex items-center justify-center gap-1.5 text-center no-underline transition"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>{isHindi ? 'राष्ट्रीय हेल्पलाइन (112)' : 'National SOS (112)'}</span>
              </a>
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition"
              >
                {isHindi ? 'मैंने समझ लिया (Acknowledge)' : 'I Understand / Close'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
