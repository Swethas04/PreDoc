import React, { useState } from 'react';
import {
  Stethoscope,
  User,
  Activity,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Heart,
  FileText,
  Mic,
} from 'lucide-react';

export default function RoleLanding({ onSelectRole }) {
  const [hoveredRole, setHoveredRole] = useState(null);

  const handleSelect = (role) => {
    sessionStorage.setItem('predoc_role', role);
    onSelectRole(role);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EAF1FF] via-[#F6F9FF] to-[#E8F4FF] flex flex-col">
      {/* Top bar */}
      <header className="px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#2F6FED] flex items-center justify-center shadow-sm">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="text-lg font-extrabold text-[#1A2B4C] tracking-tight">PreDoc</span>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-[#EAF1FF] text-[#2F6FED] text-[10px] font-semibold">
            Healthcare
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-14 max-w-xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-[#E2E8F4] shadow-sm text-xs font-semibold text-[#2F6FED] mb-5">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Clinical Pre-Consultation
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1A2B4C] tracking-tight leading-tight mb-4">
            Welcome to{' '}
            <span className="text-[#2F6FED]">PreDoc</span>
          </h1>
          <p className="text-sm sm:text-base text-[#6B7A99] leading-relaxed">
            Tell us who you are so we can show you the right experience.
          </p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
          {/* Patient card */}
          <button
            id="role-patient-btn"
            onClick={() => handleSelect('patient')}
            onMouseEnter={() => setHoveredRole('patient')}
            onMouseLeave={() => setHoveredRole(null)}
            className="group relative flex flex-col items-start p-8 rounded-3xl bg-white border-2 border-[#E2E8F4] shadow-sm hover:border-[#2F6FED] hover:shadow-lg transition-all duration-200 text-left"
          >
            {/* Hover glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#EAF1FF]/0 to-[#2F6FED]/0 group-hover:from-[#EAF1FF]/60 group-hover:to-[#EAF1FF]/20 transition-all duration-200" />

            {/* Icon */}
            <div className="relative w-16 h-16 rounded-2xl bg-[#EAF1FF] flex items-center justify-center mb-5 group-hover:bg-[#2F6FED] transition-colors duration-200 shadow-sm">
              <User className="w-8 h-8 text-[#2F6FED] group-hover:text-white transition-colors duration-200" />
            </div>

            <div className="relative flex-1">
              <h2 className="text-xl font-extrabold text-[#1A2B4C] mb-2">
                I'm a Patient
              </h2>
              <p className="text-sm text-[#6B7A99] leading-relaxed mb-4">
                Share your symptoms and medical history before your visit. Quick, guided, and private.
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2 mb-5">
                {[
                  { icon: Mic, label: 'Voice or Tap' },
                  { icon: ShieldCheck, label: 'Private & Secure' },
                  { icon: FileText, label: '5 min intake' },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F6F9FF] border border-[#E2E8F4] text-[11px] font-medium text-[#6B7A99]">
                    <Icon className="w-3 h-3" />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative flex items-center gap-2 text-[#2F6FED] text-sm font-bold">
              Start my intake
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Doctor card */}
          <button
            id="role-doctor-btn"
            onClick={() => handleSelect('doctor')}
            onMouseEnter={() => setHoveredRole('doctor')}
            onMouseLeave={() => setHoveredRole(null)}
            className="group relative flex flex-col items-start p-8 rounded-3xl bg-white border-2 border-[#E2E8F4] shadow-sm hover:border-[#2FAE60] hover:shadow-lg transition-all duration-200 text-left"
          >
            {/* Hover glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#EAF7EE]/0 to-[#2FAE60]/0 group-hover:from-[#EAF7EE]/60 group-hover:to-[#EAF7EE]/20 transition-all duration-200" />

            {/* Icon */}
            <div className="relative w-16 h-16 rounded-2xl bg-[#EAF7EE] flex items-center justify-center mb-5 group-hover:bg-[#2FAE60] transition-colors duration-200 shadow-sm">
              <Stethoscope className="w-8 h-8 text-[#2FAE60] group-hover:text-white transition-colors duration-200" />
            </div>

            <div className="relative flex-1">
              <h2 className="text-xl font-extrabold text-[#1A2B4C] mb-2">
                I'm a Doctor / Staff
              </h2>
              <p className="text-sm text-[#6B7A99] leading-relaxed mb-4">
                Review AI-synthesized patient histories, triage alerts, and 8-section clinical drafts.
              </p>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2 mb-5">
                {[
                  { icon: FileText, label: '8-Section Draft' },
                  { icon: Heart, label: 'Triage Alerts' },
                  { icon: ShieldCheck, label: 'Source-grounded' },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F6F9FF] border border-[#E2E8F4] text-[11px] font-medium text-[#6B7A99]">
                    <Icon className="w-3 h-3" />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative flex items-center gap-2 text-[#2FAE60] text-sm font-bold">
              Open Doctor Dashboard
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>

        {/* Disclaimer */}
        <p className="mt-10 text-xs text-[#6B7A99] text-center max-w-md">
          This is a pre-consultation tool for use at point of care.
          Patient data is processed by AI for clinical assistance only.
        </p>
      </main>

      {/* Footer */}
      <footer className="py-4 px-6 text-center text-xs text-[#6B7A99]">
        PreDoc · FastAPI · React · Gemini AI
      </footer>
    </div>
  );
}
