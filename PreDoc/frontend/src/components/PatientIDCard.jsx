import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  ShieldCheck,
  Copy,
  Check,
  Download,
  ArrowRight,
  Camera,
  KeyRound,
  User,
  Sparkles,
} from 'lucide-react';

export default function PatientIDCard({
  patientCode,
  pin,
  patientName = 'Patient',
  onContinue,
  language = 'en',
}) {
  const canvasRef = useRef(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  const isHindi = language === 'hi';

  useEffect(() => {
    if (canvasRef.current && patientCode) {
      // Encode JSON payload in QR code
      const qrPayload = JSON.stringify({
        patient_code: patientCode,
        pin: pin || '',
        name: patientName,
        app: 'PreDoc',
      });

      QRCode.toCanvas(canvasRef.current, qrPayload, {
        width: 180,
        margin: 1,
        color: {
          dark: '#0F1E36',
          light: '#FFFFFF',
        },
      }).catch((err) => {
        console.error('Failed to generate QR code:', err);
      });
    }
  }, [patientCode, pin, patientName]);

  const copyToClipboard = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedPin(true);
        setTimeout(() => setCopiedPin(false), 2000);
      }
    } catch {
      // Fallback ignore
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4 animate-in fade-in zoom-in-95 duration-300">
      {/* Top Banner Alert */}
      <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-700">
          <Camera className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-amber-900">
            {isHindi ? '📸 इस स्क्रीन की फोटो लें या लिख लें' : '📸 Take a photo of this screen or write it down!'}
          </h4>
          <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">
            {isHindi
              ? 'भविष्य के दौरों पर अपने पुराने मेडिकल रिकॉर्ड और जांच देखने के लिए आपको यह पेशेंट आईडी और पिन चाहिए होगा।'
              : 'You will need this Patient ID and 4-digit PIN to retrieve your medical history and test records on future visits.'}
          </p>
        </div>
      </div>

      {/* Main Digital Health Identity Card */}
      <div className="bg-white rounded-3xl border border-[#DCE4F2] shadow-xl overflow-hidden relative">
        {/* Card Header */}
        <div className="bg-gradient-to-r from-[#112347] via-[#1A3673] to-[#2F6FED] text-white p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-16 -mt-16 pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
                <ShieldCheck className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-wider uppercase text-blue-200">
                    PreDoc Clinical Identity
                  </span>
                  <span className="bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-[10px] px-2 py-0.5 rounded-full font-medium">
                    Verified
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
                  {patientName}
                </h2>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-blue-200 block">Kiosk Pass</span>
              <span className="text-[10px] text-blue-300/80">Secured with bcrypt</span>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: QR Code */}
            <div className="flex flex-col items-center justify-center p-4 bg-[#F8FAFD] border border-[#E3EAF6] rounded-2xl">
              <div className="bg-white p-2.5 rounded-xl shadow-sm border border-[#E2E8F4]">
                <canvas ref={canvasRef} className="rounded-lg max-w-full h-auto" />
              </div>
              <p className="text-[11px] text-[#6B7A99] font-medium mt-2 flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-[#2F6FED]" />
                {isHindi ? 'त्वरित लॉगिन के लिए स्कैन करें' : 'Scan for quick kiosk return'}
              </p>
            </div>

            {/* Right: ID & PIN Badges */}
            <div className="space-y-4">
              {/* Patient ID Code */}
              <div className="bg-gradient-to-br from-[#F4F7FC] to-[#EEF3FA] border border-[#D5E1F2] rounded-2xl p-4">
                <div className="flex items-center justify-between text-[#6B7A99] text-xs font-medium mb-1">
                  <span>{isHindi ? 'पेशेंट आईडी' : 'Patient ID'}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(patientCode, 'code')}
                    className="flex items-center gap-1 text-[11px] text-[#2F6FED] hover:text-[#1F54C7] transition font-semibold"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    {copiedCode ? (isHindi ? 'कॉपी हो गया' : 'Copied') : (isHindi ? 'कॉपी' : 'Copy')}
                  </button>
                </div>
                <div className="font-mono text-2xl md:text-3xl font-black text-[#102347] tracking-wider select-all">
                  {patientCode || 'PD-XXXXXX'}
                </div>
                <span className="text-[10px] text-[#8695B1] mt-0.5 block">
                  Unique health record identifier
                </span>
              </div>

              {/* 4-Digit Security PIN */}
              <div className="bg-gradient-to-br from-[#F0FDF4] to-[#DCFCE7]/40 border border-[#BBF7D0] rounded-2xl p-4">
                <div className="flex items-center justify-between text-emerald-800 text-xs font-medium mb-1">
                  <span className="flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                    {isHindi ? 'सुरक्षा पिन (४ अंक)' : 'Security PIN (4 digits)'}
                  </span>
                  {pin && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(pin, 'pin')}
                      className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 transition font-semibold"
                    >
                      {copiedPin ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                      {copiedPin ? (isHindi ? 'कॉपी हो गया' : 'Copied') : (isHindi ? 'कॉपी' : 'Copy')}
                    </button>
                  )}
                </div>
                <div className="font-mono text-2xl md:text-3xl font-black text-emerald-900 tracking-widest select-all">
                  {pin || '••••'}
                </div>
                <span className="text-[10px] text-emerald-700/80 mt-0.5 block">
                  Keep this private. Required along with Patient ID.
                </span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
            <button
              id="patient-id-card-continue-btn"
              type="button"
              onClick={onContinue}
              className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-[#2F6FED] hover:bg-[#245DCE] text-white font-semibold text-sm shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2 group"
            >
              <span>{isHindi ? 'स्वास्थ्य जांच जारी रखें' : 'Continue to Clinical Intake'}</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="w-full sm:w-auto py-3.5 px-5 rounded-2xl border border-[#D5E1F2] bg-white hover:bg-[#F8FAFD] text-[#4A5D7E] text-xs font-semibold transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{isHindi ? 'प्रिंट / सेव' : 'Print / Save'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
