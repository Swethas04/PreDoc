import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Loader2,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  User,
  Bot,
  RotateCcw,
  Languages,
  Hand,
  Thermometer,
  Wind,
  Zap,
  Heart,
  Stethoscope,
  HelpCircle,
  Check,
  X,
  FileText,
  Calendar,
  Upload,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Pill,
  Activity,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import DocumentUpload from './DocumentUpload';
import MedicalTimeline from './MedicalTimeline';
import PatientIDCard from './PatientIDCard';

// ─── Clinical step metadata ───────────────────────────────────────────────────
const CLINICAL_STEPS = [
  'chief_complaint',
  'duration',
  'associated_symptoms',
  'past_history',
  'medications',
  'allergies',
];

const STEP_LABELS = {
  chief_complaint:     { en: 'Chief complaint',       hi: 'मुख्य शिकायत' },
  duration:            { en: 'Duration',               hi: 'अवधि' },
  associated_symptoms: { en: 'Associated symptoms',   hi: 'संबंधित लक्षण' },
  past_history:        { en: 'Past medical history',  hi: 'पिछला चिकित्सा इतिहास' },
  medications:         { en: 'Current medications',   hi: 'वर्तमान दवाएं' },
  allergies:           { en: 'Allergies',              hi: 'एलर्जी' },
};

const API_BASE = '/api';

// ─── TAP MODE: Step-by-step option definitions ────────────────────────────────

const TAP_STEPS = {
  chief_complaint: {
    type: 'icon-grid',
    question: {
      en: "What brings you in today? Tap all that apply.",
      hi: "आज क्या परेशानी है? जो लागू हो उन्हें चुनें।",
    },
    multiSelect: true,
    options: [
      { id: 'fever',          label: { en: 'Fever',            hi: 'बुखार' },       icon: Thermometer, transcript: { en: 'fever',            hi: 'बुखार' } },
      { id: 'pain',           label: { en: 'Pain',             hi: 'दर्द' },        icon: Zap,         transcript: { en: 'pain',             hi: 'दर्द' } },
      { id: 'cough',          label: { en: 'Cough',            hi: 'खांसी' },       icon: Wind,        transcript: { en: 'cough',            hi: 'खांसी' } },
      { id: 'breathlessness', label: { en: 'Breathlessness',   hi: 'सांस की तकलीफ'}, icon: Heart,       transcript: { en: 'breathlessness',   hi: 'सांस की तकलीफ' } },
      { id: 'injury',         label: { en: 'Injury',           hi: 'चोट' },         icon: Stethoscope, transcript: { en: 'injury',           hi: 'चोट' } },
      { id: 'other',          label: { en: 'Other',            hi: 'अन्य' },        icon: HelpCircle,  transcript: { en: 'other symptoms',   hi: 'अन्य लक्षण' } },
    ],
    buildTranscript: (selected, lang) => {
      const labels = selected.map(id => {
        const opt = TAP_STEPS.chief_complaint.options.find(o => o.id === id);
        return opt?.transcript[lang] || id;
      });
      if (lang === 'hi') return `मुझे ${labels.join(', ')} की शिकायत है।`;
      return `I am experiencing ${labels.join(', ')}.`;
    },
  },

  duration: {
    type: 'single-select',
    question: {
      en: "How long have you had this?",
      hi: "यह कब से हो रहा है?",
    },
    multiSelect: false,
    options: [
      { id: 'today',   label: { en: 'Today',         hi: 'आज से' },          transcript: { en: 'It started today.',             hi: 'आज से शुरू हुआ।' } },
      { id: '2_3d',    label: { en: '2–3 days',       hi: '2–3 दिन' },        transcript: { en: 'It has been 2–3 days.',         hi: '2-3 दिनों से है।' } },
      { id: 'week',    label: { en: 'About a week',   hi: 'लगभग एक सप्ताह' }, transcript: { en: 'It has been about a week.',    hi: 'लगभग एक हफ्ते से है।' } },
      { id: '2_weeks', label: { en: '2 weeks',         hi: '2 हफ्ते' },       transcript: { en: 'It has been about 2 weeks.',   hi: 'लगभग 2 हफ्तों से है।' } },
      { id: 'month',   label: { en: 'Over a month',   hi: 'एक महीने से ज़्यादा'}, transcript: { en: 'It has been over a month.',  hi: 'एक महीने से ज़्यादा समय से है।' } },
    ],
    buildTranscript: (selected, lang) => {
      const id = selected[0];
      const opt = TAP_STEPS.duration.options.find(o => o.id === id);
      return opt?.transcript[lang] || id;
    },
  },

  associated_symptoms: {
    type: 'chip-grid',
    question: {
      en: "Any other symptoms? Tap all that apply.",
      hi: "कोई अन्य लक्षण? जो लागू हो चुनें।",
    },
    multiSelect: true,
    options: [
      { id: 'headache',       label: { en: 'Headache',          hi: 'सिरदर्द' },        transcript: { en: 'headache',         hi: 'सिरदर्द' } },
      { id: 'nausea',         label: { en: 'Nausea',            hi: 'मतली' },           transcript: { en: 'nausea',           hi: 'मतली' } },
      { id: 'vomiting',       label: { en: 'Vomiting',          hi: 'उल्टी' },          transcript: { en: 'vomiting',         hi: 'उल्टी' } },
      { id: 'fatigue',        label: { en: 'Fatigue',           hi: 'थकान' },           transcript: { en: 'fatigue',          hi: 'थकान' } },
      { id: 'body_aches',     label: { en: 'Body aches',        hi: 'बदन दर्द' },       transcript: { en: 'body aches',       hi: 'बदन दर्द' } },
      { id: 'dizziness',      label: { en: 'Dizziness',         hi: 'चक्कर' },          transcript: { en: 'dizziness',        hi: 'चक्कर आना' } },
      { id: 'loss_appetite',  label: { en: 'Loss of appetite',  hi: 'भूख न लगना' },    transcript: { en: 'loss of appetite', hi: 'भूख न लगना' } },
      { id: 'diarrhea',       label: { en: 'Diarrhea',          hi: 'दस्त' },           transcript: { en: 'diarrhea',         hi: 'दस्त' } },
      { id: 'chest_pain',     label: { en: 'Chest pain',        hi: 'सीने में दर्द' }, transcript: { en: 'chest pain',       hi: 'सीने में दर्द' } },
      { id: 'none',           label: { en: 'None',              hi: 'कोई नहीं' },       transcript: { en: 'none',             hi: 'कोई नहीं' } },
    ],
    buildTranscript: (selected, lang) => {
      if (selected.includes('none')) {
        return lang === 'hi' ? 'कोई अन्य लक्षण नहीं हैं।' : 'No other associated symptoms.';
      }
      const labels = selected.map(id => {
        const opt = TAP_STEPS.associated_symptoms.options.find(o => o.id === id);
        return opt?.transcript[lang] || id;
      });
      if (lang === 'hi') return `अन्य लक्षण: ${labels.join(', ')}.`;
      return `Other symptoms include: ${labels.join(', ')}.`;
    },
  },

  past_history: {
    type: 'yes-no-expand',
    question: {
      en: "Do you have any past medical conditions?",
      hi: "क्या आपको कोई पुरानी बीमारी है?",
    },
    yesOptions: [
      { id: 'diabetes',     label: { en: 'Diabetes',          hi: 'मधुमेह / शुगर' } },
      { id: 'hypertension', label: { en: 'High blood pressure', hi: 'हाई ब्लड प्रेशर' } },
      { id: 'asthma',       label: { en: 'Asthma',            hi: 'दमा / अस्थमा' } },
      { id: 'heart_disease',label: { en: 'Heart disease',     hi: 'हृदय रोग' } },
      { id: 'thyroid',      label: { en: 'Thyroid',           hi: 'थायराइड' } },
      { id: 'kidney',       label: { en: 'Kidney disease',    hi: 'गुर्दे की बीमारी' } },
    ],
    buildTranscript: (answer, selected, lang) => {
      if (answer === 'no') {
        return lang === 'hi' ? 'कोई पुरानी बीमारी नहीं है।' : 'No significant past medical history.';
      }
      const labels = (selected || []).map(id => {
        const opt = TAP_STEPS.past_history.yesOptions.find(o => o.id === id);
        return opt?.label[lang] || id;
      });
      if (lang === 'hi') return `पुरानी बीमारियाँ: ${labels.join(', ')}।`;
      return `Past medical history: ${labels.join(', ')}.`;
    },
  },

  medications: {
    type: 'yes-no-text',
    question: {
      en: "Are you currently taking any medications?",
      hi: "क्या आप अभी कोई दवा ले रहे हैं?",
    },
    placeholder: {
      en: "e.g. Paracetamol 500mg, Metformin 500mg daily",
      hi: "जैसे: पैरासिटामोल 500mg, मेटफॉर्मिन 500mg रोज़",
    },
    buildTranscript: (answer, text, lang) => {
      if (answer === 'no' || !text.trim()) {
        return lang === 'hi' ? 'वर्तमान में कोई दवा नहीं ले रहे हैं।' : 'Not currently taking any medications.';
      }
      if (lang === 'hi') return `वर्तमान दवाएं: ${text.trim()}।`;
      return `Current medications: ${text.trim()}.`;
    },
  },

  allergies: {
    type: 'chips-and-text',
    question: {
      en: "Do you have any known allergies (drugs, food, etc.)?",
      hi: "क्या आपको किसी दवा या खाने से कोई एलर्जी है?",
    },
    options: [
      { id: 'penicillin', label: { en: 'Penicillin', hi: 'पेनिसिलिन' } },
      { id: 'peanuts',    label: { en: 'Peanuts',    hi: 'मूंगफली' } },
      { id: 'dust',       label: { en: 'Dust',       hi: 'धूल' } },
      { id: 'none',       label: { en: 'None',       hi: 'कोई नहीं' } },
      { id: 'other',      label: { en: 'Other',      hi: 'अन्य' } },
    ],
    placeholder: {
      en: "e.g. Penicillin, Sulfa drugs, Peanuts, Dust, or specify...",
      hi: "जैसे: पेनिसिलिन, सल्फा दवाएं, मूंगफली, धूल या अन्य...",
    },
    buildTranscript: (selected, text, lang) => {
      const isNone = selected.includes('none');
      const filteredSelected = selected.filter(id => id !== 'none' && id !== 'other');
      const labels = filteredSelected.map(id => {
        const opt = TAP_STEPS.allergies.options.find(o => o.id === id);
        return opt?.label[lang] || id;
      });
      const details = (text || '').trim();

      if (isNone && !labels.length && !details) {
        return lang === 'hi' ? 'कोई ज्ञात एलर्जी नहीं है।' : 'No known allergies (NKDA).';
      }

      const parts = [];
      if (labels.length) parts.push(labels.join(', '));
      if (details) parts.push(details);

      if (!parts.length) {
        return lang === 'hi' ? 'कोई ज्ञात एलर्जी नहीं है।' : 'No known allergies (NKDA).';
      }

      const combined = parts.join('; ');
      if (lang === 'hi') return `ज्ञात एलर्जी: ${combined}।`;
      return `Known allergies: ${combined}.`;
    },
  },
};

// ─── Sub-components for TAP MODE UI ──────────────────────────────────────────

function IconGrid({ step, language, onSubmit, isProcessing }) {
  const config = TAP_STEPS[step];
  const [selected, setSelected] = useState([]);

  const toggle = (id) => {
    if (config.multiSelect) {
      setSelected(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    } else {
      setSelected([id]);
    }
  };

  const handleConfirm = () => {
    if (!selected.length) return;
    const text = config.buildTranscript(selected, language);
    onSubmit(text);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {config.options.map((opt) => {
          const isSelected = selected.includes(opt.id);
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 shadow-soft-hover ${
                isSelected
                  ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED]'
                  : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                isSelected ? 'bg-[#2F6FED] text-white' : 'bg-[#F6F9FF] text-[#6B7A99]'
              }`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold">{opt.label[language]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleConfirm}
          disabled={!selected.length || isProcessing}
          className="px-6 py-2.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
        >
          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{language === 'hi' ? 'आगे बढ़ें' : 'Continue'}</span>
        </button>
      </div>
    </div>
  );
}

function SingleSelect({ step, language, onSubmit, isProcessing }) {
  const config = TAP_STEPS[step];
  const [selected, setSelected] = useState(null);

  const handleSelect = (id) => {
    setSelected(id);
    const text = config.buildTranscript([id], language);
    setTimeout(() => onSubmit(text), 150);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {config.options.map((opt) => {
          const isSelected = selected === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt.id)}
              disabled={isProcessing}
              className={`p-3.5 rounded-2xl border text-left text-xs font-medium transition shadow-soft-hover ${
                isSelected
                  ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED] font-semibold'
                  : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
              }`}
            >
              {opt.label[language]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChipGrid({ step, language, onSubmit, isProcessing }) {
  const config = TAP_STEPS[step];
  const [selected, setSelected] = useState([]);

  const toggle = (id) => {
    if (id === 'none') {
      setSelected(['none']);
      return;
    }
    setSelected(prev => {
      const filtered = prev.filter(x => x !== 'none');
      return filtered.includes(id) ? filtered.filter(x => x !== id) : [...filtered, id];
    });
  };

  const handleConfirm = () => {
    if (!selected.length) return;
    const text = config.buildTranscript(selected, language);
    onSubmit(text);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2.5">
        {config.options.map((opt) => {
          const isSelected = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={`px-4 py-2 rounded-full border text-xs font-medium transition shadow-sm ${
                isSelected
                  ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED] font-semibold'
                  : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
              }`}
            >
              {opt.label[language]}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleConfirm}
          disabled={!selected.length || isProcessing}
          className="px-6 py-2.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
        >
          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{language === 'hi' ? 'आगे बढ़ें' : 'Continue'}</span>
        </button>
      </div>
    </div>
  );
}

function YesNoExpand({ step, language, onSubmit, isProcessing }) {
  const config = TAP_STEPS[step];
  const [answer, setAnswer] = useState(null);
  const [selected, setSelected] = useState([]);

  const handleNo = () => {
    setAnswer('no');
    setTimeout(() => onSubmit(config.buildTranscript('no', [], language)), 150);
  };

  const toggleCondition = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-3">
      {!answer && (
        <div className="flex gap-3">
          <button
            onClick={() => setAnswer('yes')}
            className="flex-1 py-3.5 rounded-full border border-[#E2E8F4] bg-white text-[#1A2B4C] font-semibold hover:border-[#2F6FED] hover:bg-[#EAF1FF] text-xs transition shadow-sm"
          >
            {language === 'hi' ? 'हाँ' : 'Yes'}
          </button>
          <button
            onClick={handleNo}
            disabled={isProcessing}
            className="flex-1 py-3.5 rounded-full border border-[#E2E8F4] bg-white text-[#1A2B4C] font-semibold hover:border-[#2F6FED] hover:bg-[#EAF1FF] text-xs transition shadow-sm"
          >
            {language === 'hi' ? 'नहीं' : 'No'}
          </button>
        </div>
      )}

      {answer === 'yes' && (
        <div className="space-y-3">
          <p className="text-xs text-[#6B7A99]">
            {language === 'hi' ? 'कौन सी स्थिति? (सभी चुनें)' : 'Which conditions? (Select all that apply)'}
          </p>
          <div className="flex flex-wrap gap-2">
            {config.yesOptions.map((opt) => {
              const isSelected = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleCondition(opt.id)}
                  className={`px-4 py-2 rounded-full border text-xs font-medium transition shadow-sm ${
                    isSelected
                      ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED] font-semibold'
                      : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
                  }`}
                >
                  {opt.label[language]}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between pt-2">
            <button
              onClick={() => { setAnswer(null); setSelected([]); }}
              className="px-4 py-2 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] text-xs font-medium"
            >
              ← {language === 'hi' ? 'वापस' : 'Back'}
            </button>
            <button
              onClick={() => selected.length && onSubmit(config.buildTranscript('yes', selected, language))}
              disabled={!selected.length || isProcessing}
              className="px-6 py-2 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>{language === 'hi' ? 'आगे बढ़ें' : 'Continue'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function YesNoText({ step, language, onSubmit, isProcessing }) {
  const config = TAP_STEPS[step];
  const [answer, setAnswer] = useState(null);
  const [text, setText] = useState('');

  const handleNo = () => {
    setAnswer('no');
    setTimeout(() => onSubmit(config.buildTranscript('no', '', language)), 150);
  };

  return (
    <div className="space-y-3">
      {!answer && (
        <div className="flex gap-3">
          <button
            onClick={() => setAnswer('yes')}
            className="flex-1 py-3.5 rounded-full border border-[#E2E8F4] bg-white text-[#1A2B4C] font-semibold hover:border-[#2F6FED] hover:bg-[#EAF1FF] text-xs transition shadow-sm"
          >
            {language === 'hi' ? 'हाँ' : 'Yes'}
          </button>
          <button
            onClick={handleNo}
            disabled={isProcessing}
            className="flex-1 py-3.5 rounded-full border border-[#E2E8F4] bg-white text-[#1A2B4C] font-semibold hover:border-[#2F6FED] hover:bg-[#EAF1FF] text-xs transition shadow-sm"
          >
            {language === 'hi' ? 'नहीं' : 'No'}
          </button>
        </div>
      )}

      {answer === 'yes' && (
        <div className="space-y-3">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={config.placeholder[language]}
            className="w-full px-4 py-3 rounded-2xl bg-[#F6F9FF] border border-[#E2E8F4] text-[#1A2B4C] placeholder-[#6B7A99] focus:outline-none focus:border-[#2F6FED] text-xs resize-none"
          />
          <div className="flex justify-between pt-1">
            <button
              onClick={() => { setAnswer(null); setText(''); }}
              className="px-4 py-2 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] text-xs font-medium"
            >
              ← {language === 'hi' ? 'वापस' : 'Back'}
            </button>
            <button
              onClick={() => onSubmit(config.buildTranscript('yes', text, language))}
              disabled={isProcessing}
              className="px-6 py-2 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>{language === 'hi' ? 'आगे बढ़ें' : 'Continue'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChipsAndText({ step, language, onSubmit, isProcessing }) {
  const config = TAP_STEPS[step] || {};
  const [selected, setSelected] = useState([]);
  const [text, setText] = useState('');

  const toggleChip = (id) => {
    if (id === 'none') {
      setSelected(prev => (prev.includes('none') ? [] : ['none']));
      return;
    }
    setSelected(prev => {
      const withoutNone = prev.filter(x => x !== 'none');
      return withoutNone.includes(id) ? withoutNone.filter(x => x !== id) : [...withoutNone, id];
    });
  };

  const handleConfirm = () => {
    const hasSelection = selected.length > 0;
    const hasText = text.trim().length > 0;
    if (!hasSelection && !hasText) return;

    if (config.buildTranscript) {
      const transcript = config.buildTranscript(selected, text, language);
      onSubmit(transcript);
    } else {
      const labels = selected.join(', ');
      const combined = [labels, text.trim()].filter(Boolean).join('; ');
      onSubmit(combined || (language === 'hi' ? 'कोई ज्ञात एलर्जी नहीं है।' : 'No known allergies (NKDA).'));
    }
  };

  const options = config.options || [
    { id: 'penicillin', label: { en: 'Penicillin', hi: 'पेनिसिलिन' } },
    { id: 'peanuts',    label: { en: 'Peanuts',    hi: 'मूंगफली' } },
    { id: 'dust',       label: { en: 'Dust',       hi: 'धूल' } },
    { id: 'none',       label: { en: 'None',       hi: 'कोई नहीं' } },
    { id: 'other',      label: { en: 'Other',      hi: 'अन्य' } },
  ];

  const canSubmit = selected.length > 0 || text.trim().length > 0;
  const isNoneSelected = selected.includes('none');

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-[#6B7A99] font-medium">
          {language === 'hi' ? 'लागू होने वाले सभी विकल्प चुनें:' : 'Select all that apply:'}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {options.map((opt) => {
            const isSelected = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleChip(opt.id)}
                className={`px-4 py-2 rounded-full border text-xs font-medium transition shadow-sm ${
                  isSelected
                    ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED] font-semibold'
                    : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
                }`}
              >
                {opt.label?.[language] || opt.id}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-[#6B7A99] font-medium block">
          {language === 'hi' ? 'अतिरिक्त विवरण या अन्य एलर्जी:' : 'Additional details or other allergies:'}
        </label>
        <textarea
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (isNoneSelected && e.target.value.trim()) {
              setSelected(prev => prev.filter(x => x !== 'none'));
            }
          }}
          placeholder={
            config.placeholder?.[language] ||
            (language === 'hi' ? 'जैसे: सल्फा, पराग या अन्य दवाएं...' : 'e.g. Sulfa, Pollen, or specific medications...')
          }
          className="w-full px-4 py-2.5 rounded-2xl bg-[#F6F9FF] border border-[#E2E8F4] text-[#1A2B4C] placeholder-[#6B7A99] focus:outline-none focus:border-[#2F6FED] text-xs resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => {
            setSelected(['none']);
            setText('');
            if (config.buildTranscript) {
              onSubmit(config.buildTranscript(['none'], '', language));
            } else {
              onSubmit(language === 'hi' ? 'कोई ज्ञात एलर्जी नहीं है।' : 'No known allergies (NKDA).');
            }
          }}
          disabled={isProcessing}
          className="text-xs text-[#6B7A99] hover:text-[#2F6FED] underline font-medium"
        >
          {language === 'hi' ? 'कोई एलर्जी नहीं (छोड़ें)' : 'No allergies (Skip)'}
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canSubmit || isProcessing}
          className="px-6 py-2.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
        >
          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{language === 'hi' ? 'आगे बढ़ें' : 'Continue'}</span>
        </button>
      </div>
    </div>
  );
}

function DefaultTextInputFallback({ step, language, onSubmit, isProcessing, placeholder }) {
  const [text, setText] = useState('');

  const handleConfirm = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs text-[#6B7A99] font-medium block">
          {language === 'hi' ? 'कृपया अपना उत्तर लिखें:' : 'Please enter your response:'}
        </label>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            placeholder ||
            (language === 'hi' ? 'अपना विवरण यहां दर्ज करें...' : 'Type your answer here...')
          }
          className="w-full px-4 py-3 rounded-2xl bg-[#F6F9FF] border border-[#E2E8F4] text-[#1A2B4C] placeholder-[#6B7A99] focus:outline-none focus:border-[#2F6FED] text-xs resize-none"
        />
      </div>
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!text.trim() || isProcessing}
          className="px-6 py-2.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
        >
          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{language === 'hi' ? 'आगे बढ़ें' : 'Continue'}</span>
        </button>
      </div>
    </div>
  );
}

function DemographicsStepUI({ language, initialName = '', initialAge = '', onSave, isProcessing }) {
  const [name, setName] = useState(initialName === 'Patient' || initialName === 'आगंतुक मरीज' ? '' : initialName);
  const [age, setAge] = useState(initialAge ? String(initialAge) : '');
  const [fieldError, setFieldError] = useState('');

  const handleContinue = () => {
    const finalName = name.trim();
    const parsedAge = age ? parseInt(age, 10) : null;
    if (!finalName) {
      setFieldError(language === 'hi' ? 'कृपया मरीज का नाम दर्ज करें।' : 'Please enter patient name.');
      return;
    }
    setFieldError('');
    onSave({ name: finalName, age: parsedAge || 35 });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-[#1A2B4C] font-semibold">
          {language === 'hi' ? 'मरीज की प्राथमिक जानकारी' : 'Patient Information & Demographics'}
        </p>
        <p className="text-xs text-[#6B7A99]">
          {language === 'hi'
            ? 'यह जानकारी आपके पूरे परामर्श और डॉक्टर के केस नोट्स में प्रदर्शित होगी।'
            : 'Please enter your name and age to personalize the consultation and clinical case notes.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[#1A2B4C] mb-1.5">
            {language === 'hi' ? 'मरीज का नाम *' : 'Patient Name *'}
          </label>
          <input
            id="intro-name-input"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setFieldError(''); }}
            placeholder={language === 'hi' ? 'जैसे: राजेश कुमार' : 'e.g. Ramesh Kumar'}
            className="w-full px-4 py-3 rounded-2xl bg-white border border-[#E2E8F4] text-[#1A2B4C] text-xs focus:outline-none focus:border-[#2F6FED] shadow-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1A2B4C] mb-1.5">
            {language === 'hi' ? 'आयु (वर्ष)' : 'Age (years)'}
          </label>
          <input
            id="intro-age-input"
            type="number"
            min="1"
            max="125"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g. 42"
            className="w-full px-4 py-3 rounded-2xl bg-white border border-[#E2E8F4] text-[#1A2B4C] text-xs focus:outline-none focus:border-[#2F6FED] shadow-sm"
          />
        </div>
      </div>

      {fieldError && (
        <p className="text-xs text-[#E5484D] font-medium">{fieldError}</p>
      )}

      <div className="flex justify-end pt-2">
        <button
          id="intro-continue-btn"
          onClick={handleContinue}
          disabled={isProcessing}
          className="px-6 py-2.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-semibold transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
        >
          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <span>{language === 'hi' ? 'आगे बढ़ें' : 'Continue'}</span>
        </button>
      </div>
    </div>
  );
}

function TapStepUI({ step, language, onSubmit, isProcessing, inputType, backendStepInputTypes }) {
  const config = TAP_STEPS[step];
  const effectiveInputType = inputType || backendStepInputTypes?.[step] || config?.type;

  // 4. Log a console warning if a step has no options and no input_type, so this fails loudly in testing, not silently in the UI.
  const hasOptions = !!(config?.options?.length || config?.yesOptions?.length);
  const hasInputType = !!(config?.type || inputType || backendStepInputTypes?.[step]);

  if (!hasOptions && !hasInputType) {
    console.warn(
      `[IntakeFlow Warning] Step "${step}" has no options and no input_type configured! Falling back to plain text input.`,
      { step, config, inputType, backendStepInputTypes }
    );
  } else if (!config) {
    console.warn(
      `[IntakeFlow Warning] Step "${step}" has no configuration in TAP_STEPS! Falling back to plain text input.`,
      { step, inputType }
    );
  }

  const props = { step, language, onSubmit, isProcessing, config, inputType: effectiveInputType };

  if (!config) {
    return <DefaultTextInputFallback {...props} />;
  }

  switch (config.type) {
    case 'icon-grid':      return <IconGrid {...props} />;
    case 'single-select':  return <SingleSelect {...props} />;
    case 'chip-grid':     return <ChipGrid {...props} />;
    case 'yes-no-expand':  return <YesNoExpand {...props} />;
    case 'yes-no-text':    return <YesNoText {...props} />;
    case 'chips-and-text': return <ChipsAndText {...props} />;
    case 'text':           return <DefaultTextInputFallback {...props} />;
    default:
      console.warn(
        `[IntakeFlow Warning] Unhandled config type "${config.type}" for step "${step}". Falling back to plain text input.`,
        { step, config }
      );
      return <DefaultTextInputFallback {...props} />;
  }
}

// ─── Mode Toggle ──────────────────────────────────────────────────────────────
function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex items-center p-1 rounded-full bg-[#F6F9FF] border border-[#E2E8F4]">
      <button
        id="mode-speak"
        onClick={() => onChange('speak')}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition ${
          mode === 'speak'
            ? 'bg-[#2F6FED] text-white shadow-sm'
            : 'text-[#6B7A99] hover:text-[#1A2B4C]'
        }`}
      >
        <Mic className="w-3.5 h-3.5" /> Speak
      </button>
      <button
        id="mode-tap"
        onClick={() => onChange('tap')}
        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition ${
          mode === 'tap'
            ? 'bg-[#2F6FED] text-white shadow-sm'
            : 'text-[#6B7A99] hover:text-[#1A2B4C]'
        }`}
      >
        <Hand className="w-3.5 h-3.5" /> Tap
      </button>
    </div>
  );
}

// ─── Linear Stepper Breadcrumb ────────────────────────────────────────────────
const LINEAR_STAGES = [
  { id: 'language_patient', step: 1, label: { en: '1. Patient & Language', hi: '1. मरीज व भाषा' } },
  { id: 'consent',          step: 2, label: { en: '2. Consent',         hi: '2. सहमति' } },
  { id: 'interview',        step: 3, label: { en: '3. Interview',       hi: '3. साक्षात्कार' } },
  { id: 'upload_docs',      step: 4, label: { en: '4. Documents (1-3)', hi: '4. दस्तावेज़ (1-3)' } },
  { id: 'ai_extraction',    step: 5, label: { en: '5. AI Extraction',   hi: '5. एआई विश्लेषण' } },
  { id: 'structured_history', step: 6, label: { en: '6. Structured History', hi: '6. संरचित इतिहास' } },
];

function LinearStepper({ currentStage, language }) {
  const stageIndex = Math.max(0, LINEAR_STAGES.findIndex(s => s.id === currentStage));
  return (
    <div className="w-full bg-white border border-[#E2E8F4] rounded-2xl p-3 shadow-soft mb-6 overflow-x-auto">
      <div className="flex items-center justify-between min-w-[660px] gap-2">
        {LINEAR_STAGES.map((st, idx) => {
          const isDone = idx < stageIndex;
          const isActive = idx === stageIndex;
          return (
            <React.Fragment key={st.id}>
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isDone
                      ? 'bg-[#2FAE60] text-white'
                      : isActive
                      ? 'bg-[#2F6FED] text-white ring-4 ring-[#2F6FED]/20'
                      : 'bg-[#F6F9FF] border border-[#E2E8F4] text-[#6B7A99]'
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : st.step}
                </div>
                <span
                  className={`text-xs font-semibold whitespace-nowrap ${
                    isActive
                      ? 'text-[#2F6FED]'
                      : isDone
                      ? 'text-[#1A2B4C]'
                      : 'text-[#6B7A99]'
                  }`}
                >
                  {st.label[language] || st.label.en}
                </span>
              </div>
              {idx < LINEAR_STAGES.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 transition-all ${
                    idx < stageIndex ? 'bg-[#2FAE60]' : 'bg-[#E2E8F4]'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 1: Patient Details & Language Selection ─────────────────────────────
function PatientAndLanguageStep({
  initialLanguage = 'en',
  initialName = '',
  initialAge = '',
  onContinue,
}) {
  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage);
  const [name, setName] = useState(initialName);
  const [age, setAge] = useState(initialAge ? String(initialAge) : '');
  const [nameError, setNameError] = useState('');

  const isHindi = selectedLanguage === 'hi';

  const handleProceed = (e) => {
    if (e) e.preventDefault();
    const finalName = name.trim();
    if (!finalName) {
      setNameError(isHindi ? 'कृपया मरीज का नाम दर्ज करें।' : 'Please enter patient name.');
      return;
    }
    setNameError('');
    onContinue({
      name: finalName,
      age: age ? parseInt(age, 10) : 35,
      lang: selectedLanguage,
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-7">
      {/* Header */}
      <div className="text-center space-y-2.5">
        <div className="w-14 h-14 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mx-auto shadow-sm">
          <Languages className="w-7 h-7 text-[#2F6FED]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2B4C] tracking-tight">
          {isHindi ? 'मरीज पंजीकरण व भाषा का चयन' : 'Patient Registration & Language'}
        </h1>
        <p className="text-xs sm:text-sm text-[#6B7A99] max-w-md mx-auto">
          {isHindi
            ? 'अपनी पसंदीदा भाषा चुनें और नाम दर्ज करें ताकि आपका क्लिनिकल रिकॉर्ड तैयार किया जा सके।'
            : 'Select your preferred consultation language and enter patient details to personalize your intake.'}
        </p>
      </div>

      {/* Language Selector */}
      <div className="space-y-2.5">
        <label className="text-xs font-bold text-[#6B7A99] flex items-center gap-1.5 justify-center">
          <Languages className="w-4 h-4 text-[#2F6FED]" />
          <span>{isHindi ? 'परामर्श की भाषा चुनें:' : 'Select Consultation Language:'}</span>
        </label>
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setSelectedLanguage('en')}
            className={`p-4 rounded-2xl border text-center transition shadow-soft ${
              selectedLanguage === 'en'
                ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED] ring-2 ring-[#2F6FED]/20'
                : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
            }`}
          >
            <div className="text-base font-bold">English</div>
            <div className="text-[11px] text-[#6B7A99] mt-0.5">Clinical English</div>
          </button>
          <button
            type="button"
            onClick={() => setSelectedLanguage('hi')}
            className={`p-4 rounded-2xl border text-center transition shadow-soft ${
              selectedLanguage === 'hi'
                ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED] ring-2 ring-[#2F6FED]/20'
                : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
            }`}
          >
            <div className="text-base font-bold">हिंदी (Hindi)</div>
            <div className="text-[11px] text-[#6B7A99] mt-0.5">सहज हिंदी परामर्श</div>
          </button>
        </div>
      </div>

      {/* Patient Details Form */}
      <div className="max-w-md mx-auto space-y-3">
        <label className="text-xs font-bold text-[#6B7A99] flex items-center gap-1.5 justify-center">
          <User className="w-4 h-4 text-[#2F6FED]" />
          <span>{isHindi ? 'मरीज की प्राथमिक जानकारी:' : 'Patient Identification:'}</span>
        </label>
        <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-[#1A2B4C] mb-1">
              {isHindi ? 'मरीज का पूरा नाम *' : 'Patient Full Name *'}
            </label>
            <input
              id="patient-name-input"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              placeholder={isHindi ? 'जैसे: राजेश कुमार' : 'e.g. Ramesh Kumar'}
              className={`w-full px-4 py-2.5 rounded-xl bg-[#F6F9FF] border text-[#1A2B4C] text-xs focus:outline-none focus:border-[#2F6FED] ${
                nameError ? 'border-[#E5484D]' : 'border-[#E2E8F4]'
              }`}
            />
            {nameError && <p className="text-[11px] text-[#E5484D] mt-1 font-medium">{nameError}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#1A2B4C] mb-1">
              {isHindi ? 'आयु (वर्ष) — वैकल्पिक' : 'Age (years) — optional'}
            </label>
            <input
              id="patient-age-input"
              type="number"
              min="1"
              max="125"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 42"
              className="w-full px-4 py-2.5 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] text-[#1A2B4C] text-xs focus:outline-none focus:border-[#2F6FED]"
            />
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <div className="pt-2 max-w-md mx-auto">
        <button
          id="continue-to-consent-btn"
          type="button"
          onClick={handleProceed}
          className="w-full py-3.5 px-8 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm"
        >
          <span>{isHindi ? 'सहमति स्क्रीन पर आगे बढ़ें' : 'Continue to Consent Step'}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Patient Consent Screen ───────────────────────────────────────────
function ConsentStepScreen({
  patientInfo,
  language = 'en',
  onAgreeAndStart,
  onBack,
  loading,
  error,
}) {
  const isHindi = language === 'hi';
  const [agreed, setAgreed] = useState(true);

  const handleAgree = () => {
    if (!agreed) return;
    const nowIso = new Date().toISOString();
    onAgreeAndStart({
      ...patientInfo,
      consent_given: true,
      consent_timestamp: nowIso,
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-full bg-[#EAF7EE] text-[#2FAE60] flex items-center justify-center mx-auto shadow-sm">
          <ShieldCheck className="w-7 h-7 text-[#2FAE60]" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#EAF1FF] text-[#2F6FED]">
          <Lock className="w-3 h-3" />
          <span>{isHindi ? 'डेटा गोपनीयता व सुरक्षा' : 'Data Privacy & HIPAA Standards'}</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1A2B4C] tracking-tight">
          {isHindi ? 'पूर्व-परामर्श डेटा उपयोग व सहमति' : 'Pre-Consultation Consent & Data Use Notice'}
        </h2>
        <p className="text-xs sm:text-sm text-[#6B7A99] max-w-lg mx-auto">
          {isHindi
            ? 'कृपया नीचे दिए गए डेटा उपयोग विवरण को पढ़ें। परामर्श शुरू करने से पहले आपकी सहमति आवश्यक है।'
            : 'Please review how your clinical data is used. PreDoc requires your informed consent before commencing your clinical intake.'}
        </p>
      </div>

      {/* Data-Use Statement Card */}
      <div className="rounded-2xl border border-[#E2E8F4] bg-white p-6 shadow-soft space-y-4">
        <div className="border-b border-[#E2E8F4] pb-3">
          <h3 className="text-sm font-bold text-[#1A2B4C] flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-[#2F6FED]" />
            <span>{isHindi ? 'डेटा उपयोग विवरण (Data Use Statement)' : 'Clinical Data Use Statement'}</span>
          </h3>
        </div>

        <div className="space-y-3 text-xs text-[#1A2B4C] leading-relaxed">
          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
              1
            </span>
            <p>
              <strong>{isHindi ? 'क्लिनिकल उपयोग:' : 'Direct Clinical Care Purpose:'}</strong>{' '}
              {isHindi
                ? 'आपकी आवाज, लक्षण और अपलोड किए गए चिकित्सा दस्तावेज केवल आपके उपस्थित चिकित्सक के लिए एक संरचित पूर्व-परामर्श सारांश तैयार करने के लिए उपयोग किए जाते हैं।'
                : 'Your symptoms, voice transcriptions, and uploaded medical records are processed solely to prepare a structured pre-consultation summary for your attending physician.'}
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
              2
            </span>
            <p>
              <strong>{isHindi ? 'गोपनीयता व एन्क्रिप्शन:' : 'Encryption & Security:'}</strong>{' '}
              {isHindi
                ? 'सभी स्वास्थ्य जानकारी एंड-टू-एंड एन्क्रिप्टेड है और सुरक्षित मेडिकल डेटाबेस में संग्रहीत की जाती है।'
                : 'All health records and audio inputs are encrypted in transit and at rest using healthcare-grade encryption protocols.'}
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
              3
            </span>
            <p>
              <strong>{isHindi ? 'तृतीय-पक्ष साझेदारी नहीं:' : 'Zero Third-Party Marketing:'}</strong>{' '}
              {isHindi
                ? 'आपकी व्यक्तिगत स्वास्थ्य जानकारी को कभी भी किसी विज्ञापनदाता या अनधिकृत बाहरी संस्था के साथ साझा या बेचा नहीं जाता है।'
                : 'Your personal health data is strictly confidential and will never be shared, sold, or disclosed to commercial advertisers or unapproved third parties.'}
            </p>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
              4
            </span>
            <p>
              <strong>{isHindi ? 'मरीज का नियंत्रण:' : 'Patient Right to Review:'}</strong>{' '}
              {isHindi
                ? 'आप अपने डॉक्टर से परामर्श के दौरान किसी भी समय अपने उत्तरों की समीक्षा या सुधार कर सकते हैं।'
                : 'You retain full rights to review, modify, or verify all documented facts directly with your physician during the consultation.'}
            </p>
          </div>
        </div>

        {/* Affirmation Checkbox */}
        <div className="pt-3 border-t border-[#E2E8F4]">
          <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[#2F6FED]/30 bg-[#F6F9FF] cursor-pointer hover:bg-[#EAF1FF] transition">
            <input
              id="consent-checkbox"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 text-[#2F6FED] rounded border-[#E2E8F4] focus:ring-[#2F6FED]"
            />
            <span className="text-xs font-semibold text-[#1A2B4C]">
              {isHindi
                ? 'मैंने डेटा उपयोग विवरण पढ़ लिया है और मैं नैदानिक पूर्व-परामर्श के लिए सहमति देता/देती हूँ।'
                : 'I have read the statement and consent to the collection and clinical processing of my health information.'}
            </span>
          </label>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-4 rounded-2xl border border-[#E5484D]/40 bg-[#FEECEE] text-[#E5484D] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="px-5 py-3 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] text-xs font-semibold transition"
        >
          {isHindi ? '← वापस' : '← Change Info'}
        </button>

        <button
          id="consent-agree-btn"
          type="button"
          disabled={!agreed || loading}
          onClick={handleAgree}
          className="flex-1 py-3.5 px-8 rounded-full bg-[#2FAE60] hover:bg-[#258d4e] text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isHindi ? 'आरंभ हो रहा है...' : 'Starting Consultation...'}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>{isHindi ? 'मैं सहमत हूँ (I Agree & Begin Intake)' : 'I Agree & Begin Intake'}</span>
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Linear Upload 1-3 Documents Screen ──────────────────────────────
function UploadDocsLinearScreen({
  visitId,
  language = 'en',
  extractedDocs = [],
  onDocumentExtracted,
  onContinue,
  onSkip,
}) {
  const isHindi = language === 'hi';
  const docCount = extractedDocs.length;
  const maxReached = docCount >= 3;

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mx-auto shadow-sm">
          <Upload className="w-7 h-7 text-[#2F6FED]" />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF1FF] text-[#2F6FED]">
          <FileCheck className="w-3.5 h-3.5" />
          <span>
            {isHindi
              ? `${docCount} / 3 दस्तावेज़ अपलोड किए गए`
              : `${docCount} of 3 Documents Uploaded`}
          </span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1A2B4C] tracking-tight">
          {isHindi ? 'चिकित्सा दस्तावेज़ अपलोड करें (1-3)' : 'Upload Medical Documents (1 to 3)'}
        </h2>
        <p className="text-xs sm:text-sm text-[#6B7A99] max-w-lg mx-auto">
          {isHindi
            ? 'पूर्व नुस्खे (Prescriptions), जांच रिपोर्ट (Lab Tests) या डिस्चार्ज सारांश अपलोड करें ताकि एआई दवाओं और इतिहास का विश्लेषण कर सके।'
            : 'Upload previous prescriptions, diagnostic lab reports, or discharge summaries so Clinical AI can extract medications, tests, and medical history.'}
        </p>
      </div>

      {/* Embedded Uploader */}
      <div className="rounded-2xl border border-[#E2E8F4] bg-white p-6 shadow-soft space-y-4">
        <DocumentUpload
          visitId={visitId}
          language={language}
          onDocumentExtracted={onDocumentExtracted}
          extractedDocs={extractedDocs}
        />
        {maxReached && (
          <p className="text-xs text-[#2FAE60] font-semibold text-center mt-2">
            ✓ {isHindi ? 'अधिकतम 3 दस्तावेज़ अपलोड हो चुके हैं।' : 'Maximum 3 documents uploaded.'}
          </p>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-[#6B7A99] hover:text-[#2F6FED] underline font-medium"
        >
          {isHindi ? 'कोई दस्तावेज़ नहीं है? आगे बढ़ें (छोड़ें) →' : 'No documents to upload? Skip this step →'}
        </button>

        <button
          id="proceed-to-ai-extraction-btn"
          type="button"
          onClick={onContinue}
          className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm"
        >
          <span>
            {docCount > 0
              ? (isHindi ? 'एआई विश्लेषण पर आगे बढ़ें (Step 5) →' : 'Proceed to AI Extraction (Step 5) →')
              : (isHindi ? 'आगे बढ़ें (दस्तावेज़ के बिना) →' : 'Continue Without Documents →')}
          </span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Linear AI Extraction Review Screen ──────────────────────────────
function AIExtractionLinearScreen({
  extractedDocs = [],
  language = 'en',
  patient,
  onContinue,
}) {
  const isHindi = language === 'hi';

  const allMedications = [];
  const allDiagnoses = [];
  const allInvestigations = [];

  extractedDocs.forEach((doc, dIdx) => {
    const ext = doc.extracted || doc.extracted_json || {};
    const docId = doc.id || doc.document_id || dIdx + 1;
    (ext.drug_names || []).forEach(d => {
      allMedications.push({
        name: typeof d === 'string' ? d : d.name,
        dosage: typeof d === 'object' ? d.dosage : '',
        frequency: typeof d === 'object' ? d.frequency : '',
        docId,
      });
    });
    (ext.diagnoses || []).forEach(diag => {
      allDiagnoses.push({
        name: typeof diag === 'string' ? diag : diag.name || diag.diagnosis,
        docId,
      });
    });
    (ext.investigations || ext.lab_results || []).forEach(inv => {
      allInvestigations.push({
        test: typeof inv === 'string' ? inv : inv.test || inv.name,
        value: typeof inv === 'object' ? inv.value || inv.result : '',
        docId,
      });
    });
  });

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mx-auto shadow-sm">
          <Sparkles className="w-7 h-7 text-[#2F6FED]" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF7EE] text-[#2FAE60]">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{isHindi ? 'क्लिनिकल एआई निष्कर्षण पूर्ण' : 'Clinical AI Extraction Complete'}</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1A2B4C] tracking-tight">
          {isHindi ? 'एआई निष्कर्षण व सारांश' : 'AI Extraction Results'}
        </h2>
        <p className="text-xs sm:text-sm text-[#6B7A99] max-w-lg mx-auto">
          {isHindi
            ? 'अपलोड किए गए दस्तावेज़ों से निकाली गई महत्वपूर्ण दवाएं, जांच और निदान देखें।'
            : 'Review structured medications, diagnoses, and lab tests automatically parsed from your uploaded documents.'}
        </p>
      </div>

      {/* Extracted Details Grid */}
      <div className="space-y-4">
        {extractedDocs.length === 0 ? (
          <div className="p-8 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft text-center space-y-2">
            <p className="text-sm font-semibold text-[#1A2B4C]">
              {isHindi ? 'कोई दस्तावेज़ अपलोड नहीं किया गया था' : 'No Documents Uploaded'}
            </p>
            <p className="text-xs text-[#6B7A99]">
              {isHindi
                ? 'क्लिनिकल एआई आपके वॉइस/टच साक्षात्कार से सीधे संपूर्ण मेडिकल इतिहास संकलित करेगा।'
                : 'Clinical AI will construct your structured case summary directly from your voice/touch interview responses.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Medications */}
            <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft space-y-3">
              <div className="flex items-center gap-2 text-[#2F6FED]">
                <Pill className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C]">
                  {isHindi ? 'दवाएं (Medications)' : 'Extracted Medications'}
                </h3>
              </div>
              {allMedications.length === 0 ? (
                <p className="text-xs text-[#6B7A99] italic">{isHindi ? 'कोई विशिष्ट दवा नहीं मिली' : 'None detected'}</p>
              ) : (
                <div className="space-y-2">
                  {allMedications.map((m, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] text-xs">
                      <div className="font-semibold text-[#1A2B4C]">{m.name}</div>
                      {(m.dosage || m.frequency) && (
                        <div className="text-[11px] text-[#6B7A99]">{[m.dosage, m.frequency].filter(Boolean).join(' • ')}</div>
                      )}
                      <span className="inline-block mt-1 text-[10px] font-mono text-[#2F6FED] bg-white px-2 py-0.5 rounded border border-[#E2E8F4]">
                        Document #{m.docId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Diagnoses */}
            <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft space-y-3">
              <div className="flex items-center gap-2 text-[#2F6FED]">
                <Activity className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C]">
                  {isHindi ? 'निदान (Diagnoses)' : 'Diagnoses & Findings'}
                </h3>
              </div>
              {allDiagnoses.length === 0 ? (
                <p className="text-xs text-[#6B7A99] italic">{isHindi ? 'कोई पूर्व निदान नहीं मिला' : 'None detected'}</p>
              ) : (
                <div className="space-y-2">
                  {allDiagnoses.map((d, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] text-xs">
                      <div className="font-semibold text-[#1A2B4C]">{d.name}</div>
                      <span className="inline-block mt-1 text-[10px] font-mono text-[#2F6FED] bg-white px-2 py-0.5 rounded border border-[#E2E8F4]">
                        Document #{d.docId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Investigations */}
            <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft space-y-3">
              <div className="flex items-center gap-2 text-[#2F6FED]">
                <FileText className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A2B4C]">
                  {isHindi ? 'जांच (Investigations)' : 'Investigations & Labs'}
                </h3>
              </div>
              {allInvestigations.length === 0 ? (
                <p className="text-xs text-[#6B7A99] italic">{isHindi ? 'कोई जांच विवरण नहीं मिला' : 'None detected'}</p>
              ) : (
                <div className="space-y-2">
                  {allInvestigations.map((inv, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] text-xs">
                      <div className="font-semibold text-[#1A2B4C]">{inv.test}</div>
                      {inv.value && <div className="text-[11px] text-[#6B7A99]">{inv.value}</div>}
                      <span className="inline-block mt-1 text-[10px] font-mono text-[#2F6FED] bg-white px-2 py-0.5 rounded border border-[#E2E8F4]">
                        Document #{inv.docId}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CTA Button */}
      <div className="pt-3 text-center">
        <button
          id="proceed-to-structured-history-btn"
          type="button"
          onClick={onContinue}
          className="px-8 py-3.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white font-bold text-xs transition inline-flex items-center gap-2 shadow-sm"
        >
          <span>{isHindi ? 'संरचित इतिहास देखें (Step 6) →' : 'View Structured History (Step 6) →'}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 6A: Patient-Friendly Confirmation Screen (Patient View only) ─────────
function PatientConfirmationScreen({
  patient,
  language = 'en',
  turns = [],
  extractedDocs = [],
  urgencyFlag,
  urgencyDept,
  onRestart,
}) {
  const isHindi = language === 'hi';
  const [confirmed, setConfirmed] = React.useState(false);

  // Map step keys to friendly plain-language labels
  const FRIENDLY_LABELS = {
    chief_complaint:     { en: 'Why you came in today',    hi: 'आज आने का कारण' },
    duration:            { en: 'Since when',               hi: 'कब से' },
    associated_symptoms: { en: 'Other symptoms',           hi: 'अन्य लक्षण' },
    past_history:        { en: 'Past medical conditions',  hi: 'पुरानी बीमारी' },
    medications:         { en: 'Current medicines',        hi: 'वर्तमान दवाएं' },
    allergies:           { en: 'Allergies',                hi: 'एलर्जी' },
  };

  const completedTurns = turns.filter(t => t.transcript && t.transcript !== '[inaudible]');

  if (confirmed) {
    return (
      <div className="max-w-xl mx-auto py-12 flex flex-col items-center text-center space-y-6 animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-[#EAF7EE] flex items-center justify-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-[#2FAE60]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-[#1A2B4C]">
            {isHindi ? 'धन्यवाद!' : 'Thank you!'}
          </h2>
          <p className="text-sm text-[#6B7A99] leading-relaxed max-w-sm">
            {isHindi
              ? 'आपकी जानकारी सफलतापूर्वक सहेजी गई है। आपका डॉक्टर अब इसकी समीक्षा करेगा।'
              : 'Your information has been submitted. Your doctor will review it before your visit.'}
          </p>
        </div>
        {urgencyFlag && (
          <div className="p-4 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] text-sm font-semibold text-center w-full">
            {isHindi
              ? `⚠️ आपके लक्षण तुरंत ध्यान देने योग्य हैं। कृपया ${urgencyDept || 'Emergency'} विभाग में जाएं।`
              : `⚠️ Your symptoms may need prompt attention. Please inform the ${urgencyDept || 'Emergency'} department.`}
          </div>
        )}
        <button
          type="button"
          onClick={onRestart}
          className="px-6 py-3 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] text-xs font-semibold transition flex items-center gap-2 shadow-soft"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isHindi ? 'नया सेशन शुरू करें' : 'Start a new session'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2.5">
        <div className="w-14 h-14 rounded-full bg-[#EAF7EE] flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-7 h-7 text-[#2FAE60]" />
        </div>
        <h2 className="text-2xl font-extrabold text-[#1A2B4C]">
          {isHindi ? "आपका इंटेक पूरा हो गया!" : "Here's what we captured for your doctor"}
        </h2>
        <p className="text-sm text-[#6B7A99]">
          {isHindi
            ? 'कृपया एक बार जांच लें कि सभी जानकारी सही है।'
            : 'Please review to make sure everything looks right before you hand off to your doctor.'}
        </p>
      </div>

      {/* Consent badge */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EAF7EE] text-[#2FAE60] text-xs font-semibold border border-[#2FAE60]/20 shadow-xs">
          <ShieldCheck className="w-4 h-4" />
          {isHindi ? 'सहमति सत्यापित' : 'Consent Verified'}
        </span>
      </div>

      {/* Urgent notice for patient */}
      {urgencyFlag && (
        <div className="p-4 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-semibold">
            {isHindi
              ? `आपके लक्षण तुरंत ध्यान देने योग्य हैं। कृपया ${urgencyDept || 'Emergency'} विभाग को सूचित करें।`
              : `Your symptoms may need prompt attention. Please let the ${urgencyDept || 'Emergency'} department know.`}
          </p>
        </div>
      )}

      {/* Patient-friendly Q&A summary */}
      <div className="rounded-2xl border border-[#E2E8F4] bg-white shadow-soft divide-y divide-[#E2E8F4] overflow-hidden">
        {completedTurns.length === 0 ? (
          <p className="p-5 text-sm text-[#6B7A99] italic text-center">
            {isHindi ? 'कोई उत्तर दर्ज नहीं हुआ।' : 'No answers recorded.'}
          </p>
        ) : (
          completedTurns.map((turn, i) => (
            <div key={turn.id || i} className="p-4 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-[#EAF1FF] flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-[#2F6FED]">{i + 1}</span>
              </div>
              <div className="flex-1 space-y-0.5">
                <p className="text-[11px] font-bold text-[#6B7A99] uppercase tracking-wider">
                  {FRIENDLY_LABELS[turn.step]?.[language] || (STEP_LABELS[turn.step]?.[language] || turn.step)}
                </p>
                <p className="text-sm text-[#1A2B4C] leading-relaxed">{turn.transcript}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Documents uploaded */}
      {extractedDocs.length > 0 && (
        <div className="p-4 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#EAF1FF] flex items-center justify-center flex-shrink-0">
            <FileCheck className="w-5 h-5 text-[#2F6FED]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A2B4C]">
              {extractedDocs.length} {extractedDocs.length === 1 ? (isHindi ? 'दस्तावेज़' : 'document') : (isHindi ? 'दस्तावेज़' : 'documents')} {isHindi ? 'अपलोड किए गए' : 'uploaded'}
            </p>
            <p className="text-xs text-[#6B7A99]">
              {isHindi ? 'डॉक्टर इन्हें देख पाएंगे।' : 'Your doctor will be able to see these.'}
            </p>
          </div>
        </div>
      )}

      {/* Confirm / Restart buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          id="patient-confirm-btn"
          type="button"
          onClick={() => setConfirmed(true)}
          className="flex-1 px-6 py-3.5 rounded-full bg-[#2FAE60] hover:bg-[#259c55] text-white text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm"
        >
          <CheckCircle2 className="w-5 h-5" />
          <span>{isHindi ? 'यह सही लग रहा है ✓' : 'This looks correct ✓'}</span>
        </button>
        <button
          id="patient-restart-btn"
          type="button"
          onClick={onRestart}
          className="flex-1 px-6 py-3.5 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#E5484D] hover:border-[#E5484D]/30 text-sm font-semibold transition flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>{isHindi ? 'कुछ गलत है — फिर से शुरू करें' : "Something's wrong — restart"}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Step 6B: Clinical Structured History Screen (Doctor-accessible view) ───────
function StructuredHistoryScreen({
  patient,
  visitId,
  consentTimestamp,
  language = 'en',
  turns = [],
  extractedDocs = [],
  urgencyFlag,
  urgencyDept,
  urgencyReason,
  onViewCaseDraft,
  onRestart,
  isPatientView = false,
}) {
  // In patient view, delegate to the patient-friendly confirmation screen
  if (isPatientView) {
    return (
      <PatientConfirmationScreen
        patient={patient}
        language={language}
        turns={turns}
        extractedDocs={extractedDocs}
        urgencyFlag={urgencyFlag}
        urgencyDept={urgencyDept}
        onRestart={onRestart}
      />
    );
  }
  const isHindi = language === 'hi';
  const completedTurns = turns.filter(t => t.transcript && t.transcript !== '[inaudible]');

  const formattedTimestamp = consentTimestamp
    ? new Date(consentTimestamp).toLocaleString()
    : new Date().toLocaleString();

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-6 animate-fade-in">
      {/* Patient Header & Consent Verified Badge */}
      <div className="p-6 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F4]">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center font-bold text-base">
              {patient?.name ? patient.name.charAt(0).toUpperCase() : 'P'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#1A2B4C]">{patient?.name || 'Patient'}</h2>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#EAF1FF] text-[#2F6FED]">
                  Visit #{visitId}
                </span>
              </div>
              <p className="text-xs text-[#6B7A99]">
                {patient?.age ? `${patient.age} yrs` : 'Age pending'} • {language === 'hi' ? 'हिंदी' : 'English'}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EAF7EE] text-[#2FAE60] text-xs font-semibold self-start sm:self-auto shadow-xs border border-[#2FAE60]/20">
            <ShieldCheck className="w-4 h-4 text-[#2FAE60]" />
            <span>Consent Verified • {formattedTimestamp}</span>
          </div>
        </div>

        {/* Quick summary counters */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4]">
            <div className="text-lg font-bold text-[#1A2B4C]">{completedTurns.length}</div>
            <div className="text-[11px] text-[#6B7A99]">Interview Turns</div>
          </div>
          <div className="p-3 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4]">
            <div className="text-lg font-bold text-[#1A2B4C]">{extractedDocs.length}</div>
            <div className="text-[11px] text-[#6B7A99]">Documents Parsed</div>
          </div>
          <div className="p-3 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4]">
            <div className={`text-lg font-bold ${urgencyFlag ? 'text-[#E5484D]' : 'text-[#2FAE60]'}`}>
              {urgencyFlag ? 'Urgent' : 'Routine'}
            </div>
            <div className="text-[11px] text-[#6B7A99]">Triage Status</div>
          </div>
        </div>
      </div>

      {/* Red-Flag Urgent Callout (if active) */}
      {urgencyFlag && (
        <div className="p-4 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] flex items-start gap-3 shadow-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-xs">
              Urgent Clinical Alert: Attention Recommended ({urgencyDept || 'Emergency'})
            </span>
            {urgencyReason && (
              <p className="text-xs text-[#E5484D]/90 mt-0.5">{urgencyReason}</p>
            )}
          </div>
        </div>
      )}

      {/* Primary CTA: Generate & View 8-Section Case Draft */}
      <div className="p-6 rounded-2xl border border-[#2F6FED]/30 bg-[#EAF1FF] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-soft">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full bg-[#2F6FED] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#1A2B4C]">
              {isHindi ? 'डॉक्टर का केस ड्राफ्ट तैयार करें (8 सेक्शन)' : 'Synthesize Doctor Case Draft (8 Sections)'}
            </h3>
            <p className="text-xs text-[#6B7A99]">
              {isHindi
                ? 'चीफ कम्प्लेंट्स, HPI, इतिहास, दवाएं, एलर्जी, जांच, टाइमलाइन और रेड फ्लैग्स सहित पूर्ण सारांश देखें।'
                : 'Generates structured 8-section clinical synthesis with grounded Transcript and Document tags.'}
            </p>
          </div>
        </div>
        <button
          id="view-case-draft-btn"
          type="button"
          onClick={() => {
            if (onViewCaseDraft) {
              onViewCaseDraft(visitId);
            } else {
              window.location.href = `/case/${visitId}`;
            }
          }}
          className="px-6 py-3.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition flex items-center gap-2 shadow-sm whitespace-nowrap"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isHindi ? 'केस ड्राफ्ट देखें →' : 'View Case Draft (8 Sections) →'}</span>
        </button>
      </div>

      {/* Section 1: Structured Interview Responses with Transcript #ID tags */}
      <div className="rounded-2xl border border-[#E2E8F4] bg-white p-6 shadow-soft space-y-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F4] pb-3">
          <h3 className="text-sm font-bold text-[#1A2B4C] flex items-center gap-2">
            <Mic className="w-4 h-4 text-[#2F6FED]" />
            <span>{isHindi ? 'साक्षात्कार प्रश्न व उत्तर' : 'Voice/Touch Clinical Interview Turns'}</span>
          </h3>
          <span className="text-xs text-[#6B7A99] font-medium">{completedTurns.length} turns</span>
        </div>

        <div className="space-y-2.5">
          {completedTurns.length === 0 ? (
            <p className="text-xs text-[#6B7A99] italic">{isHindi ? 'कोई उत्तर दर्ज नहीं हुआ।' : 'No interview turns recorded.'}</p>
          ) : (
            completedTurns.map((turn, i) => (
              <div key={turn.id || i} className="p-3.5 rounded-xl border border-[#E2E8F4] bg-[#F6F9FF] flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1 flex-1">
                  <span className="text-[11px] font-bold text-[#2F6FED] uppercase tracking-wider block">
                    {STEP_LABELS[turn.step]?.[language] || turn.step}
                  </span>
                  <p className="text-[#1A2B4C] font-medium leading-relaxed">{turn.transcript}</p>
                </div>
                <span className="text-[10px] font-mono font-semibold text-[#2F6FED] bg-white px-2.5 py-0.5 rounded-full border border-[#E2E8F4] flex-shrink-0">
                  Transcript #{turn.id || i + 1}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 2: Uploaded Documents with Document #ID tags */}
      {extractedDocs.length > 0 && (
        <div className="rounded-2xl border border-[#E2E8F4] bg-white p-6 shadow-soft space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F4] pb-3">
            <h3 className="text-sm font-bold text-[#1A2B4C] flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-[#2F6FED]" />
              <span>{isHindi ? 'अपलोड किए गए चिकित्सा दस्तावेज़' : 'Extracted Medical Documents'}</span>
            </h3>
            <span className="text-xs text-[#6B7A99] font-medium">{extractedDocs.length} documents</span>
          </div>

          <div className="space-y-3">
            {extractedDocs.map((doc, idx) => (
              <div key={doc.id || idx} className="p-4 rounded-xl border border-[#E2E8F4] bg-[#F6F9FF] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1A2B4C]">{doc.filename || `Document ${idx + 1}`}</span>
                  <span className="text-[10px] font-mono font-semibold text-[#2F6FED] bg-white px-2.5 py-0.5 rounded-full border border-[#E2E8F4]">
                    Document #{doc.id || doc.document_id || idx + 1}
                  </span>
                </div>
                <div className="text-[11px] text-[#6B7A99]">
                  {doc.date && <span className="mr-3">Date: {doc.date}</span>}
                  {doc.doctor_name && <span>Doctor: {doc.doctor_name}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Interactive Medical Timeline */}
      {extractedDocs.length > 0 && (
        <div className="rounded-2xl border border-[#E2E8F4] bg-white p-6 shadow-soft space-y-4">
          <h3 className="text-sm font-bold text-[#1A2B4C] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#2F6FED]" />
            <span>{isHindi ? 'कालानुक्रमिक दस्तावेज़ समयरेखा' : 'Chronological Document Timeline'}</span>
          </h3>
          <MedicalTimeline documents={extractedDocs} />
        </div>
      )}

      {/* Restart / New Session Button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onRestart}
          className="px-5 py-2.5 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] text-xs font-semibold transition flex items-center gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isHindi ? 'नया सेशन शुरू करें' : 'Start New Intake'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Supported Audio Mime Types ─────────────────────────────────────────────
function getSupportedAudioMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }
  const candidateTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
  ];
  for (const t of candidateTypes) {
    if (MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}

// ─── Centered Large Mic Button & Voice Wave Visualizer ────────────────────────
function MicButton({
  isRecording,
  isProcessing,
  disabled,
  onToggle,
  onPress,
  onRelease,
  onCancel,
  recordingSeconds = 0,
  liveTranscript = '',
  language,
}) {
  const isHindi = language === 'hi';
  const formatSeconds = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm mx-auto select-none">
      {/* Dynamic Pulse / Audio Waves when recording */}
      <div className="relative flex items-center justify-center">
        {isRecording && (
          <>
            <span className="absolute w-28 h-28 rounded-full bg-[#E5484D]/20 animate-ping" />
            <span className="absolute w-24 h-24 rounded-full bg-[#E5484D]/30 animate-pulse" />
          </>
        )}

        <button
          id="mic-button"
          type="button"
          onClick={onToggle}
          disabled={disabled || isProcessing}
          aria-label={isRecording ? 'Stop recording' : 'Start speaking'}
          className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-soft active:scale-95 ${
            isProcessing
              ? 'bg-[#FEF6E9] text-[#F5A623] cursor-wait ring-4 ring-[#F5A623]/20'
              : isRecording
              ? 'bg-[#E5484D] text-white scale-110 shadow-lg ring-4 ring-[#E5484D]/30 animate-recording-pulse'
              : disabled
              ? 'bg-[#F6F9FF] border border-[#E2E8F4] text-[#6B7A99] cursor-not-allowed opacity-50'
              : 'bg-[#2F6FED] text-white hover:bg-[#255BC7] hover:scale-105 cursor-pointer shadow-md'
          }`}
        >
          {isProcessing ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-8 h-8" />
          ) : (
            <Mic className="w-8 h-8" />
          )}
        </button>
      </div>

      {/* Recording Status & Elapsed Time Banner */}
      {isRecording ? (
        <div className="flex flex-col items-center gap-2 animate-fade-in w-full">
          <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FEECEE] text-[#E5484D] text-xs font-mono font-bold">
            <span className="w-2 h-2 rounded-full bg-[#E5484D] animate-ping" />
            <span>{isHindi ? 'रिकॉर्डिंग चालू:' : 'Recording:'} {formatSeconds(recordingSeconds)}</span>
          </div>

          <button
            type="button"
            id="finish-recording-btn"
            onClick={onToggle}
            className="px-5 py-2 rounded-full bg-[#2F6FED] text-white text-xs font-bold hover:bg-[#255BC7] transition shadow-xs flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isHindi ? 'बोलना पूरा हुआ — भेजें' : 'Done speaking — Send'}</span>
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-[11px] text-[#6B7A99] hover:text-[#E5484D] underline font-medium"
            >
              {isHindi ? 'रद्द करें' : 'Cancel recording'}
            </button>
          )}

          {liveTranscript && (
            <div className="p-2.5 px-3.5 rounded-xl bg-white border border-[#E2E8F4] text-xs text-[#2F6FED] max-w-xs text-center font-medium shadow-xs italic">
              "{liveTranscript}"
            </div>
          )}
        </div>
      ) : isProcessing ? (
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-xs font-bold text-[#1A2B4C]">
            {isHindi ? 'आवाज़ का विश्लेषण हो रहा है...' : 'Transcribing voice with Gemini...'}
          </p>
          <p className="text-[11px] text-[#6B7A99]">
            {isHindi ? 'कृपया एक क्षण प्रतीक्षा करें' : 'Please wait a moment'}
          </p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-xs text-[#1A2B4C] font-semibold">
            {isHindi ? 'बोलने के लिए दबाएं (टैप करें या दबाकर रखें)' : 'Tap or hold to speak'}
          </p>
          <p className="text-[11px] text-[#6B7A99] mt-0.5">
            {isHindi ? 'स्पष्ट रूप से बोलें, पूरा होने पर फिर से दबाएं' : 'Speak clearly, then tap again when finished'}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Completion Card ──────────────────────────────────────────────────────────
function CompletionCard({
  turns,
  language,
  onRestart,
  extractedDocs = [],
  onTabChange,
  visitId,
  onViewCaseDraft,
  urgencyFlag,
  urgencyDept,
  urgencyReason,
  onNavigateTriage,
}) {
  const completed = turns.filter(t => t.transcript && t.transcript !== '[inaudible]');
  const msg = language === 'hi' ? 'प्री-कंसल्टेशन पूरी हो गई है!' : 'Pre-consultation intake complete!';

  return (
    <div className="space-y-6">
      {/* Red-Flag Urgent Banner if triggered (deliberate motion moment) */}
      {urgencyFlag && (
        <div
          id="red-flag-completion-banner"
          className="animate-slide-down p-5 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-[#E5484D] text-white flex items-center justify-center flex-shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-[#E5484D] text-white">
                  Urgent alert
                </span>
                <span className="text-sm font-bold text-[#E5484D]">
                  {`Urgent: recommend immediate attention, suggested department: ${urgencyDept || 'Emergency'}.`}
                </span>
              </div>
              {language === 'hi' && (
                <p className="text-xs text-[#E5484D] mt-1 font-medium">
                  {`अत्यंत जरूरी: तत्काल ध्यान देने की सिफारिश, सुझाई गई शाखा: ${urgencyDept || 'Emergency'}।`}
                </p>
              )}
              {urgencyReason && (
                <p className="text-xs text-[#E5484D]/80 mt-1">
                  Trigger reason: {urgencyReason}
                </p>
              )}
            </div>
          </div>
          {onNavigateTriage && (
            <button
              type="button"
              onClick={onNavigateTriage}
              className="px-5 py-2.5 rounded-full bg-[#E5484D] hover:bg-[#c93b40] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm whitespace-nowrap"
            >
              <span>View triage queue →</span>
            </button>
          )}
        </div>
      )}

      {/* Completion Header */}
      <div className="text-center py-4">
        <div className="w-16 h-16 rounded-full bg-[#EAF7EE] text-[#2FAE60] flex items-center justify-center mx-auto mb-3 shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-bold text-[#1A2B4C]">{msg}</h3>
        <p className="text-sm text-[#6B7A99] mt-1">
          {language === 'hi'
            ? 'डॉक्टर आपके उत्तर और निकाले गए दस्तावेज़ देख पाएंगे।'
            : 'Your responses and documents have been recorded for physician case review.'}
        </p>
      </div>

      {/* Primary CTA to Case Draft */}
      {visitId && (
        <div className="p-6 rounded-2xl border border-[#E2E8F4] bg-[#EAF1FF] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-soft">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-[#2F6FED] text-white flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-[#1A2B4C]">
                {language === 'hi' ? 'क्लीनिकल केस ड्राफ्ट तैयार करें' : 'Synthesize Clinical Case Draft'}
              </h4>
              <p className="text-xs text-[#6B7A99]">
                {language === 'hi'
                  ? 'जेमिनी द्वारा बनाए गए संरचित SOAP नोट्स और संदर्भ साक्ष्य देखें।'
                  : 'Generate structured SOAP notes with interactive fact-to-evidence grounding.'}
              </p>
            </div>
          </div>
          <button
            id="view-case-draft-btn"
            type="button"
            onClick={() => {
              if (onViewCaseDraft) {
                onViewCaseDraft(visitId);
              } else {
                window.location.href = `/case/${visitId}`;
              }
            }}
            className="px-6 py-3 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition flex items-center gap-2 shadow-sm whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            <span>{language === 'hi' ? 'केस ड्राफ्ट देखें (SOAP) →' : 'View Case Draft (SOAP) →'}</span>
          </button>
        </div>
      )}

      {/* Recorded turns */}
      <div className="space-y-3">
        {completed.map((t, i) => (
          <div key={t.id || i} className="p-4 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft">
            <span className="text-xs font-semibold text-[#2F6FED] block mb-1">
              {STEP_LABELS[t.step]?.[language] || t.step}
            </span>
            <p className="text-sm text-[#1A2B4C]">{t.transcript}</p>
          </div>
        ))}
      </div>

      {/* Extracted timeline */}
      {extractedDocs.length > 0 && (
        <div className="pt-4 border-t border-[#E2E8F4]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-[#1A2B4C]">
              {language === 'hi' ? 'दस्तावेज़ समयरेखा' : 'Prescription & Historical Timeline'}
            </h4>
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-[#EAF1FF] text-[#2F6FED]">
              {extractedDocs.length} {extractedDocs.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          <MedicalTimeline documents={extractedDocs} />
        </div>
      )}

      {/* Footer buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={() => onTabChange && onTabChange('documents')}
          className="flex-1 px-6 py-3 rounded-full border border-[#2F6FED] text-[#2F6FED] hover:bg-[#EAF1FF] text-xs font-semibold transition flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          <span>{language === 'hi' ? 'और पर्चे अपलोड करें' : 'Upload Prescriptions / Reports'}</span>
        </button>
        <button
          id="restart-intake-btn"
          type="button"
          onClick={onRestart}
          className="flex-1 px-6 py-3 rounded-full border border-[#E2E8F4] bg-white text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#F6F9FF] text-xs font-semibold transition flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>{language === 'hi' ? 'नया सेशन शुरू करें' : 'Start New Session'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main IntakeFlow Component ────────────────────────────────────────────────
export default function IntakeFlow({
  onViewCaseDraft,
  onNavigateTriage,
  isPatientView = false,
  onKioskReset,
  initialPatient = null,
  initialPatientToken = null,
  initialPin = null,
  isReturningPatient = false,
}) {
  const [linearStage, setLinearStage] = useState(isReturningPatient ? 'consent' : 'language_patient');
  const [pendingPatientInfo, setPendingPatientInfo] = useState({
    name: initialPatient?.name || '',
    age: initialPatient?.age || 35,
    lang: initialPatient?.language || 'en',
  });
  const [consentTimestamp, setConsentTimestamp] = useState(null);

  const [language, setLanguage] = useState(initialPatient?.language || 'en');
  const [mode, setMode] = useState('speak');
  const [patient, setPatient] = useState(initialPatient || null);
  const [visitId, setVisitId] = useState(null);
  const [patientToken, setPatientToken] = useState(
    initialPatientToken || sessionStorage.getItem('predoc_patient_token') || null
  );
  const [assignedCode, setAssignedCode] = useState(initialPatient?.patient_code || null);
  const [assignedPin, setAssignedPin] = useState(initialPin || null);

  // currentStepIndex: 0..5 = Clinical Script Steps (Chief Complaint to Allergies)
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [turns, setTurns] = useState([]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [backendStepInputTypes, setBackendStepInputTypes] = useState({});
  const [currentInputType, setCurrentInputType] = useState('options');

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [inaudibleNotice, setInaudibleNotice] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [extractedDocs, setExtractedDocs] = useState([]);

  const [urgencyFlag, setUrgencyFlag] = useState(false);
  const [urgencyDept, setUrgencyDept] = useState(null);
  const [urgencyReason, setUrgencyReason] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const clientTranscriptRef = useRef('');
  const recordingStartTimeRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const isHoldPressRef = useRef(false);

  const isIntroStep = false;
  const currentStep = CLINICAL_STEPS[currentStepIndex] || 'chief_complaint';

  const handlePatientInfoContinue = ({ name, age, lang }) => {
    setPendingPatientInfo({ name, age, lang });
    setLanguage(lang || 'en');
    setLinearStage('consent');
  };

  const handleStartIntake = async ({ name, age, lang, consent_given = true, consent_timestamp }) => {
    const timestamp = consent_timestamp || new Date().toISOString();
    const effectiveName = name || initialPatient?.name || 'Patient';
    const effectiveAge = age || initialPatient?.age || 35;
    const effectiveLang = lang || language || 'en';

    const reqPayload = {
      patient_name: effectiveName,
      patient_age: effectiveAge,
      language: effectiveLang,
      consent_given: true,
      consent_timestamp: timestamp,
    };

    if (isReturningPatient || (initialPatient?.patient_code && (initialPin || assignedPin))) {
      reqPayload.patient_code = initialPatient?.patient_code || assignedCode;
      reqPayload.pin = initialPin || assignedPin;
    }

    console.log('[IntakeFlow] Sending /api/intake/start request:', {
      endpoint: `${API_BASE}/intake/start`,
      ...reqPayload,
    });
    setIsProcessing(true);
    setError(null);
    setInaudibleNotice(null);
    setRetryCount(0);
    setLanguage(effectiveLang);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(`${API_BASE}/intake/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to initialize consultation (HTTP ${res.status})`);
      }

      const data = await res.json();
      console.log('[IntakeFlow] Received /api/intake/start success response:', data);

      if (data.patient_token) {
        setPatientToken(data.patient_token);
        sessionStorage.setItem('predoc_patient_token', data.patient_token);
      }

      setPatient({
        id: data.patient_id,
        patient_code: data.patient_code,
        name: effectiveName,
        age: effectiveAge,
        language: effectiveLang,
      });
      setVisitId(data.visit_id);
      setConsentTimestamp(timestamp);
      setCurrentPrompt(
        data.first_question ||
        (effectiveLang === 'hi' ? 'आज आपको क्या परेशानी है?' : 'What symptoms are you experiencing today?')
      );
      setCurrentStepIndex(0);
      setTurns([]);
      setIsComplete(false);
      setUrgencyFlag(false);
      setUrgencyDept(null);
      setUrgencyReason(null);
      if (data.step_input_types) {
        setBackendStepInputTypes(data.step_input_types);
      }
      if (data.input_type) {
        setCurrentInputType(data.input_type);
      }

      // If new patient with code & pin, show PatientIDCard first
      if (!data.is_returning && data.pin) {
        setAssignedCode(data.patient_code);
        setAssignedPin(data.pin);
        setLinearStage('patient_id_card');
      } else {
        setLinearStage('interview');
      }
    } catch (err) {
      console.error('[IntakeFlow] /api/intake/start request error:', err);
      const isTimeout = err.name === 'AbortError';
      setError(
        isTimeout
          ? 'Request timed out after 10s. The backend server might be unresponsive or blocked. Please verify it is running and retry.'
          : (err.message || 'Could not start consultation')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveDemographics = async ({ name, age }) => {
    if (!visitId) return;
    setIsProcessing(true);
    setError(null);
    setInaudibleNotice(null);

    try {
      const token = patientToken || sessionStorage.getItem('predoc_patient_token');
      const res = await fetch(`${API_BASE}/intake/patient/${visitId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name || 'Patient',
          age: age || 35,
          language: language,
        }),
      });

      if (res.status === 404) {
        // Visit may have been cleaned up — still advance the step locally
        // (patient was created during start_intake, so the flow can continue)
        console.warn(`Visit ${visitId} not found during demographics update — advancing step anyway.`);
        setPatient(prev => ({
          ...prev,
          name: name || prev?.name || 'Patient',
          age: age || prev?.age || 35,
        }));
        setCurrentStepIndex(0);
        setRetryCount(0);
        setInaudibleNotice(null);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to update patient details (HTTP ${res.status})`);
      }

      const updated = await res.json();
      setPatient(prev => ({
        ...prev,
        name: updated.name || name || 'Patient',
        age: updated.age || age || 35,
      }));

      // Successfully captured name & age -> advance to Step 1 of 6 (Chief Complaint)
      setCurrentStepIndex(0);
      setRetryCount(0);
      setInaudibleNotice(null);
    } catch (err) {
      console.error('Error saving demographics:', err);
      setError(err.message || 'Could not save patient details');
    } finally {
      setIsProcessing(false);
    }
  };

  // Local fallback: parse name & age from Web Speech transcript when backend is unavailable
  const parseNameAgeLocally = (text, lang) => {
    if (!text || !text.trim()) return { name: null, age: null };
    let name = null;
    let age = null;
    // Age: find any 1-3 digit number
    const ageMatch = text.match(/\b(\d{1,3})\b/);
    if (ageMatch) age = parseInt(ageMatch[1], 10);
    // Name: try "my name is X" or "I am X" patterns
    const nameMatch = text.match(/(?:my name is|i am|i'm|naam hai|mera naam)\s+([A-Za-z\u0900-\u097F]+(?:\s+[A-Za-z\u0900-\u097F]+)*)/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
    } else {
      // Fallback: take first 1-3 capitalized words as name
      const words = text.trim().split(/\s+/);
      const nameWords = words.filter(w => /^[A-Z\u0900-\u097F]/.test(w) && !/^\d/.test(w)).slice(0, 2);
      if (nameWords.length > 0) name = nameWords.join(' ');
    }
    return { name, age };
  };

  const submitIntroVoiceAnswer = async (audioBlob, fallbackClientTranscript = '') => {
    if (!visitId) return;
    setIsProcessing(true);
    setError(null);
    setInaudibleNotice(null);

    try {
      const formData = new FormData();
      if (audioBlob && audioBlob.size > 0) {
        formData.append('audio', audioBlob, 'intro.webm');
      }
      formData.append('language', language);
      if (fallbackClientTranscript && fallbackClientTranscript.trim()) {
        formData.append('client_transcript', fallbackClientTranscript.trim());
      }

      let parsedName = null;
      let parsedAge = null;

      try {
        const res = await fetch(`${API_BASE}/intake/parse-demographics`, {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.is_inaudible) {
            // Check if we have a local fallback before giving up
            if (fallbackClientTranscript && fallbackClientTranscript.trim().length > 2) {
              const local = parseNameAgeLocally(fallbackClientTranscript, language);
              parsedName = local.name;
              parsedAge = local.age;
            } else {
              setInaudibleNotice(
                language === 'hi'
                  ? 'क्षमा करें, आवाज़ स्पष्ट नहीं थी — कृपया दोबारा बोलें।'
                  : "Sorry, I didn't catch that — please try again."
              );
              setRetryCount(prev => prev + 1);
              return;
            }
          } else {
            parsedName = data.name;
            parsedAge = data.age;
          }
        } else {
          // Backend failed — fall back to local parsing of Web Speech transcript
          console.warn('[Voice] parse-demographics failed, using local fallback transcript');
          if (fallbackClientTranscript && fallbackClientTranscript.trim().length > 2) {
            const local = parseNameAgeLocally(fallbackClientTranscript, language);
            parsedName = local.name;
            parsedAge = local.age;
          }
        }
      } catch (fetchErr) {
        console.warn('[Voice] parse-demographics network error, using local fallback:', fetchErr);
        if (fallbackClientTranscript && fallbackClientTranscript.trim().length > 2) {
          const local = parseNameAgeLocally(fallbackClientTranscript, language);
          parsedName = local.name;
          parsedAge = local.age;
        }
      }

      // If still no data and no fallback, prompt retry
      if (!parsedName && !parsedAge && (!fallbackClientTranscript || fallbackClientTranscript.trim().length < 3)) {
        setInaudibleNotice(
          language === 'hi'
            ? 'क्षमा करें, आवाज़ स्पष्ट नहीं थी — कृपया दोबारा बोलें।'
            : "Sorry, I didn't catch that — please try again."
        );
        setRetryCount(prev => prev + 1);
        return;
      }

      await handleSaveDemographics({
        name: parsedName || (language === 'hi' ? 'मरीज' : 'Patient'),
        age: parsedAge || 35,
      });
    } catch (err) {
      console.error('Error in voice demographic intake:', err);
      // Last resort: if we have any fallback, just advance
      if (fallbackClientTranscript && fallbackClientTranscript.trim().length > 2) {
        const local = parseNameAgeLocally(fallbackClientTranscript, language);
        await handleSaveDemographics({
          name: local.name || (language === 'hi' ? 'मरीज' : 'Patient'),
          age: local.age || 35,
        });
      } else {
        setError(err.message || 'Could not process voice input');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const submitTurnAnswer = async (transcriptText, audioBlob = null, fallbackClientTranscript = '') => {
    if (!visitId) return;
    setIsProcessing(true);
    setError(null);
    setInaudibleNotice(null);

    try {
      const formData = new FormData();
      formData.append('visit_id', visitId);
      formData.append('step', currentStep);
      formData.append('language', language);
      if (transcriptText) {
        formData.append('transcript_text', transcriptText);
        formData.append('transcript', transcriptText);
        formData.append('client_transcript', transcriptText);
      }
      if (audioBlob && audioBlob.size > 0) {
        formData.append('audio', audioBlob, 'turn.webm');
      }
      if (fallbackClientTranscript && fallbackClientTranscript.trim()) {
        formData.append('client_transcript', fallbackClientTranscript.trim());
      }

      const token = patientToken || sessionStorage.getItem('predoc_patient_token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/intake/respond`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const effectiveTranscript = fallbackClientTranscript || transcriptText;

      if (!res.ok) {
        // Backend failed — if we have a fallback Web Speech transcript, advance locally
        if (effectiveTranscript && effectiveTranscript.trim().length > 1) {
          console.warn('[Voice] /respond failed, using Web Speech fallback to advance step');
          setInaudibleNotice(null);
          setRetryCount(0);
          setTurns(prev => [
            ...prev,
            { step: currentStep, prompt: currentPrompt, transcript: effectiveTranscript.trim() },
          ]);
          if (currentStepIndex >= CLINICAL_STEPS.length - 1) {
            setIsComplete(true);
            setLinearStage('upload_docs');
          } else {
            setCurrentStepIndex(prev => prev + 1);
            setCurrentPrompt('');
          }
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to submit intake response (HTTP ${res.status})`);
      }

      const data = await res.json();

      // Check for inaudible/unintelligible audio from backend
      if (data.is_inaudible || data.transcript === '[inaudible]') {
        // If Web Speech gave us something useful, use it instead
        if (effectiveTranscript && effectiveTranscript.trim().length > 2) {
          console.info('[Voice] Backend said inaudible but Web Speech has fallback — using it');
          setInaudibleNotice(null);
          setRetryCount(0);
          setTurns(prev => [
            ...prev,
            { step: currentStep, prompt: currentPrompt, transcript: effectiveTranscript.trim() },
          ]);
          if (currentStepIndex >= CLINICAL_STEPS.length - 1) {
            setIsComplete(true);
            setLinearStage('upload_docs');
          } else {
            setCurrentStepIndex(prev => prev + 1);
            setCurrentPrompt(data.next_question || data.next_prompt || '');
          }
          return;
        }
        setInaudibleNotice(
          language === 'hi'
            ? 'क्षमा करें, आवाज़ स्पष्ट नहीं थी — कृपया दोबारा बोलें।'
            : "Sorry, I didn't catch that — please try again."
        );
        setRetryCount(prev => prev + 1);
        return;
      }

      // Valid response received — reset retry counter and inaudible banner
      setInaudibleNotice(null);
      setRetryCount(0);

      setTurns(prev => [
        ...prev,
        {
          step: currentStep,
          prompt: currentPrompt,
          transcript: data.transcript || transcriptText || fallbackClientTranscript,
        },
      ]);

      if (data.urgency_flag) {
        setUrgencyFlag(true);
        setUrgencyDept(data.department || 'Emergency');
        setUrgencyReason(data.urgency_reason || 'Urgent symptom combination detected');
      }

      if (data.is_complete || currentStepIndex >= CLINICAL_STEPS.length - 1) {
        setIsComplete(true);
        setLinearStage('upload_docs');
      } else {
        setCurrentStepIndex(prev => prev + 1);
        setCurrentPrompt(data.next_question || data.next_prompt || '');
        if (data.next_input_type) {
          setCurrentInputType(data.next_input_type);
        } else if (data.input_type) {
          setCurrentInputType(data.input_type);
        }
      }
    } catch (err) {
      console.error('Error submitting turn:', err);
      // Last resort fallback: advance with Web Speech transcript if available
      const fb = fallbackClientTranscript || transcriptText;
      if (fb && fb.trim().length > 1) {
        console.warn('[Voice] Using emergency fallback transcript to advance step');
        setInaudibleNotice(null);
        setRetryCount(0);
        setTurns(prev => [
          ...prev,
          { step: currentStep, prompt: currentPrompt, transcript: fb.trim() },
        ]);
        if (currentStepIndex >= CLINICAL_STEPS.length - 1) {
          setIsComplete(true);
          setLinearStage('upload_docs');
        } else {
          setCurrentStepIndex(prev => prev + 1);
          setCurrentPrompt('');
        }
      } else {
        setError(err.message || 'Could not process turn response');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartRecording = async () => {
    if (isRecording) return;
    setError(null);
    setInaudibleNotice(null);
    setRetryCount(0);
    setRecordingSeconds(0);
    setLiveTranscript('');
    clientTranscriptRef.current = '';
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;

      // Start Web Speech recognition in parallel if supported
      if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        try {
          const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = language === 'hi' ? 'hi-IN' : 'en-US';
          rec.onresult = (event) => {
            let interim = '';
            for (let i = 0; i < event.results.length; i++) {
              interim += event.results[i][0].transcript + ' ';
            }
            const clean = interim.trim();
            clientTranscriptRef.current = clean;
            setLiveTranscript(clean);
          };
          rec.onerror = (e) => {
            console.warn('[WebSpeech] Recognition notice:', e.error);
          };
          rec.start();
          recognitionRef.current = rec;
        } catch (recErr) {
          console.warn('[WebSpeech] Initialization error:', recErr);
        }
      }

      const mimeType = getSupportedAudioMimeType();
      const recorderOptions = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalMime = mediaRecorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: finalMime });
        const durationMs = recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : 0;
        const fallbackSpeech = clientTranscriptRef.current;

        console.info(
          `[Voice Pipeline] Recorded blob: size=${audioBlob.size} bytes, type=${audioBlob.type}, duration=${durationMs}ms, fallback="${fallbackSpeech}"`
        );

        // Stop all media stream tracks to release microphone hardware
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(t => t.stop());
          audioStreamRef.current = null;
        }

        if (currentStepIndex === -1) {
          submitIntroVoiceAnswer(audioBlob, fallbackSpeech);
        } else {
          submitTurnAnswer(null, audioBlob, fallbackSpeech);
        }
      };

      recordingStartTimeRef.current = Date.now();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(sec => sec + 1);
      }, 1000);

      // Buffer audio every 100ms
      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      console.warn('Microphone access unavailable or denied, switching to tap mode:', err);
      setError('Microphone access denied or unavailable. Switched to tap mode.');
      setMode('tap');
    }
  };

  const handleStopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const elapsed = recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : 0;
      if (elapsed < 350) {
        // Enforce minimum recording window to ensure full audio frames
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
        }, 350 - elapsed);
      } else {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
    }
  };

  const handleCancelRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    clientTranscriptRef.current = '';
    setIsRecording(false);
    setRecordingSeconds(0);
    setLiveTranscript('');
  };

  const handleMicToggle = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  const handleMicPress = () => {
    isHoldPressRef.current = true;
    if (!isRecording) {
      handleStartRecording();
    }
  };

  const handleMicRelease = () => {
    if (isHoldPressRef.current) {
      isHoldPressRef.current = false;
      const elapsed = recordingStartTimeRef.current ? Date.now() - recordingStartTimeRef.current : 0;
      if (elapsed > 400) {
        handleStopRecording();
      }
    }
  };

  const handleDocumentExtracted = (docData) => {
    setExtractedDocs(prev => [...prev, docData]);
  };

  const handleRestart = () => {
    handleCancelRecording();
    setLinearStage('language_patient');
    setPendingPatientInfo({ name: '', age: 35, lang: language || 'en' });
    setConsentTimestamp(null);
    setPatient(null);
    setVisitId(null);
    setTurns([]);
    setCurrentStepIndex(0);
    setIsComplete(false);
    setUrgencyFlag(false);
    setUrgencyDept(null);
    setUrgencyReason(null);
    setInaudibleNotice(null);
    setRetryCount(0);
    setCurrentInputType('options');
    setBackendStepInputTypes({});
    setExtractedDocs([]);
    setError(null);
  };

  const activeCardRef = useRef(null);

  // Auto-scroll active question card into view on every step change
  useEffect(() => {
    if (activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentStepIndex, mode]);

  return (
    <div className="space-y-6">
      {/* 1. Linear Stepper at top */}
      <LinearStepper currentStage={linearStage} language={language} />

      {/* Stage 1: Patient Details & Language Selection */}
      {linearStage === 'language_patient' && (
        <div className="rounded-3xl bg-white border border-[#E2E8F4] p-6 sm:p-8 shadow-soft">
          <PatientAndLanguageStep
            initialLanguage={language}
            initialName={pendingPatientInfo?.name || ''}
            initialAge={pendingPatientInfo?.age || ''}
            onContinue={handlePatientInfoContinue}
          />
        </div>
      )}

      {/* Stage 2: Informed Consent */}
      {linearStage === 'consent' && (
        <div className="rounded-3xl bg-white border border-[#E2E8F4] p-6 sm:p-8 shadow-soft">
          <ConsentStepScreen
            patientInfo={pendingPatientInfo || { name: 'Patient', age: 35, lang: language }}
            language={language}
            onAgreeAndStart={handleStartIntake}
            onBack={() => setLinearStage('language_patient')}
            loading={isProcessing}
            error={error}
          />
        </div>
      )}

      {/* Stage 2.5: Patient ID Card (New Patient Identity) */}
      {linearStage === 'patient_id_card' && (
        <PatientIDCard
          patientCode={assignedCode}
          pin={assignedPin}
          patientName={patient?.name || pendingPatientInfo?.name || 'Patient'}
          language={language}
          onContinue={() => setLinearStage('interview')}
        />
      )}

      {/* Stage 3: Clinical Voice/Touch Interview */}
      {linearStage === 'interview' && patient && (
        <div className="rounded-3xl bg-white border border-[#E2E8F4] p-5 shadow-soft space-y-4">
          {/* Active Patient Meta Strip */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F4]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center font-bold">
                {patient.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-[#1A2B4C]">{patient.name}</span>
                  {patient.patient_code && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#EAF1FF] text-[#2F6FED]">
                      {patient.patient_code}
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-[#EAF1FF] text-[#2F6FED]">
                    Visit #{visitId}
                  </span>
                </div>
                <p className="text-xs text-[#6B7A99]">
                  {patient.age ? `${patient.age} yrs` : 'Age pending'} • {language === 'hi' ? 'हिंदी' : 'English'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <ModeToggle mode={mode} onChange={(m) => { setMode(m); setInaudibleNotice(null); setError(null); }} />
              <button
                onClick={handleRestart}
                className="p-2 rounded-full border border-[#E2E8F4] bg-[#F6F9FF] hover:bg-[#EAF1FF] text-[#6B7A99] hover:text-[#2F6FED] transition text-xs"
                title="Restart intake"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Red-Flag Urgent Banner */}
          {urgencyFlag && (
            <div
              id="red-flag-live-banner"
              className="animate-slide-down p-4 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#E5484D]" />
                <div>
                  <span className="font-bold text-xs">
                    {`Urgent: recommend immediate attention, suggested department: ${urgencyDept || 'Emergency'}.`}
                  </span>
                  {urgencyReason && (
                    <p className="text-xs mt-0.5 text-[#E5484D]/90">
                      Trigger identified: {urgencyReason}
                    </p>
                  )}
                </div>
              </div>
              {onNavigateTriage && (
                <button
                  type="button"
                  onClick={onNavigateTriage}
                  className="px-4 py-2 rounded-full bg-[#E5484D] text-white text-xs font-semibold hover:bg-[#c93b40] transition whitespace-nowrap shadow-sm"
                >
                  View triage queue →
                </button>
              )}
            </div>
          )}

          {/* Interview Question & Controls */}
          <div className="space-y-3">
            {/* Step Progress Tracker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
                <span>
                  {`Question ${currentStepIndex + 1} of ${CLINICAL_STEPS.length}: ${STEP_LABELS[currentStep]?.[language] || currentStep}`}
                </span>
                <span>
                  {`${Math.round(((currentStepIndex + 1) / CLINICAL_STEPS.length) * 100)}% complete`}
                </span>
              </div>
              <div className="w-full h-2 bg-[#F6F9FF] border border-[#E2E8F4] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2F6FED] transition-all duration-300 rounded-full"
                  style={{
                    width: `${((currentStepIndex + 1) / CLINICAL_STEPS.length) * 100}%`
                  }}
                />
              </div>
            </div>

            {/* Active Question Card */}
            <div ref={activeCardRef} className="p-4 sm:p-5 rounded-2xl border border-[#E2E8F4] bg-[#F6F9FF] space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#2F6FED] block">
                    {STEP_LABELS[currentStep]?.[language] || currentStep}
                  </span>
                  <h3 className="text-base font-bold text-[#1A2B4C] leading-snug">
                    {currentPrompt || (language === 'hi' ? 'कृपया अपनी समस्या बताएं...' : 'Please describe your symptoms...')}
                  </h3>
                </div>
              </div>

              {/* Immediate Thinking Loading Indicator */}
              {isProcessing && (
                <div
                  id="question-card-thinking-banner"
                  className="p-3 rounded-2xl border border-[#2F6FED]/30 bg-[#EAF1FF] text-[#1A2B4C] flex items-center justify-between shadow-xs animate-pulse"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-[#2F6FED] animate-spin flex-shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-[#2F6FED]">
                        {language === 'hi' ? 'सोच रहे हैं... (Thinking...)' : 'Thinking...'}
                      </span>
                      <span className="text-[11px] text-[#6B7A99] ml-1.5 hidden sm:inline">
                        {language === 'hi'
                          ? 'क्लिनिकल एआई आपके विवरण का विश्लेषण कर रहा है...'
                          : 'Analyzing symptoms with clinical AI...'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-[#2F6FED] border border-[#2F6FED]/20 flex items-center gap-1 shadow-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>AI Active</span>
                  </span>
                </div>
              )}

              {/* Inaudible notice */}
              {inaudibleNotice && (
                <div className="p-3.5 rounded-2xl border border-[#F5A623]/30 bg-[#FEF6E9] text-[#1A2B4C] text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#F5A623] flex-shrink-0" />
                    <span className="font-semibold text-[#B26B00]">{inaudibleNotice}</span>
                  </div>
                  {retryCount >= 3 && (
                    <button
                      type="button"
                      onClick={() => { setMode('tap'); setInaudibleNotice(null); }}
                      className="px-3 py-1 rounded-full bg-white border border-[#F5A623] text-[#B26B00] hover:bg-[#F5A623] hover:text-white text-[11px] font-bold transition whitespace-nowrap shadow-xs"
                    >
                      {language === 'hi' ? 'टैप मोड का उपयोग करें →' : 'Switch to Tap mode →'}
                    </button>
                  )}
                </div>
              )}

              {/* Controls */}
              {mode === 'speak' ? (
                <div className="pt-2 border-t border-[#E2E8F4] flex flex-col items-center">
                  {TAP_STEPS[currentStep]?.type?.startsWith('yes-no') ||
                  TAP_STEPS[currentStep]?.type === 'chips-and-text' ||
                  TAP_STEPS[currentStep]?.type === 'text' ||
                  currentInputType === 'text' ||
                  currentInputType === 'yesno' ? (
                    <div className="w-full space-y-4">
                      <TapStepUI
                        step={currentStep}
                        language={language}
                        onSubmit={(text) => submitTurnAnswer(text)}
                        isProcessing={isProcessing}
                        inputType={currentInputType}
                        backendStepInputTypes={backendStepInputTypes}
                      />
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-[#E2E8F4]" />
                        <span className="text-[10px] text-[#6B7A99] font-medium">
                          {language === 'hi' ? 'या बोलकर जवाब दें' : 'or speak your answer'}
                        </span>
                        <div className="flex-1 h-px bg-[#E2E8F4]" />
                      </div>
                      <MicButton
                        isRecording={isRecording}
                        isProcessing={isProcessing}
                        onToggle={handleMicToggle}
                        onPress={handleMicPress}
                        onRelease={handleMicRelease}
                        onCancel={handleCancelRecording}
                        recordingSeconds={recordingSeconds}
                        liveTranscript={liveTranscript}
                        language={language}
                      />
                    </div>
                  ) : (
                    <>
                      <MicButton
                        isRecording={isRecording}
                        isProcessing={isProcessing}
                        onToggle={handleMicToggle}
                        onPress={handleMicPress}
                        onRelease={handleMicRelease}
                        onCancel={handleCancelRecording}
                        recordingSeconds={recordingSeconds}
                        liveTranscript={liveTranscript}
                        language={language}
                      />
                      <button
                        type="button"
                        onClick={() => { setMode('tap'); setInaudibleNotice(null); }}
                        className="mt-4 text-xs text-[#2F6FED] hover:underline flex items-center gap-1 font-medium"
                      >
                        <Hand className="w-3.5 h-3.5" />
                        <span>{language === 'hi' ? 'बोलने में परेशानी? टैप मोड का उपयोग करें' : 'Prefer tapping? Switch to tap mode'}</span>
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="pt-2 border-t border-[#E2E8F4]">
                  <TapStepUI
                    step={currentStep}
                    language={language}
                    onSubmit={(text) => submitTurnAnswer(text)}
                    isProcessing={isProcessing}
                    inputType={currentInputType}
                    backendStepInputTypes={backendStepInputTypes}
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block">{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="ml-auto text-[#E5484D] hover:text-[#c93b40] flex-shrink-0"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage 4: Upload 1-3 Medical Documents */}
      {linearStage === 'upload_docs' && (
        <UploadDocsLinearScreen
          visitId={visitId}
          language={language}
          extractedDocs={extractedDocs}
          onDocumentExtracted={handleDocumentExtracted}
          onContinue={() => setLinearStage('ai_extraction')}
          onSkip={() => setLinearStage('ai_extraction')}
        />
      )}

      {/* Stage 5: AI Extraction Results */}
      {linearStage === 'ai_extraction' && (
        <AIExtractionLinearScreen
          extractedDocs={extractedDocs}
          language={language}
          patient={patient}
          onContinue={() => setLinearStage('structured_history')}
        />
      )}

      {/* Stage 6: Structured History Screen */}
      {linearStage === 'structured_history' && (
        <StructuredHistoryScreen
          patient={patient}
          visitId={visitId}
          consentTimestamp={consentTimestamp}
          language={language}
          turns={turns}
          extractedDocs={extractedDocs}
          urgencyFlag={urgencyFlag}
          urgencyDept={urgencyDept}
          urgencyReason={urgencyReason}
          onViewCaseDraft={onViewCaseDraft}
          onRestart={handleRestart}
          isPatientView={isPatientView}
        />
      )}
    </div>
  );
}
