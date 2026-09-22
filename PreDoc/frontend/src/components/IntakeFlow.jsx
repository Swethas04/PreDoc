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
} from 'lucide-react';
import DocumentUpload from './DocumentUpload';
import MedicalTimeline from './MedicalTimeline';

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

// ─── Start Intake Screen ──────────────────────────────────────────────────────
function StartIntakeScreen({ onStart, loading, error, onClearError, initialLanguage = 'en' }) {
  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [nameError, setNameError] = useState('');

  const handleBegin = (e) => {
    if (e) e.preventDefault();
    const finalName = name.trim();
    if (!finalName) {
      setNameError(selectedLanguage === 'hi' ? 'कृपया मरीज का नाम दर्ज करें।' : 'Please enter patient name.');
      return;
    }
    setNameError('');
    if (onClearError) onClearError();
    const finalAge = age ? parseInt(age, 10) : 35;
    onStart({ name: finalName, age: finalAge, lang: selectedLanguage });
  };

  const isHindi = selectedLanguage === 'hi';

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-8">
      {/* Hero Header */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mx-auto shadow-sm">
          <Sparkles className="w-8 h-8 text-[#2F6FED]" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A2B4C] tracking-tight">
          {isHindi ? 'मरीज पंजीकरण व पूर्व परामर्श' : 'Patient Intake Consultation'}
        </h1>
        <p className="text-sm text-[#6B7A99] max-w-md mx-auto">
          {isHindi
            ? 'अपनी भाषा चुनें और परामर्श शुरू करने के लिए नीचे दिए गए बटन को दबाएं।'
            : 'Select your preferred language and touch below to begin your guided clinical pre-consultation.'}
        </p>
      </div>

      {/* Step 1: Language Selector Cards */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-[#6B7A99] flex items-center gap-1.5 justify-center">
          <Languages className="w-4 h-4 text-[#2F6FED]" />
          <span>{isHindi ? 'चरण 1: भाषा चुनें' : 'Step 1: Select language / भाषा चुनें'}</span>
        </label>
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setSelectedLanguage('en')}
            className={`p-5 rounded-2xl border text-center transition shadow-soft ${
              selectedLanguage === 'en'
                ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED] ring-2 ring-[#2F6FED]/20'
                : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
            }`}
          >
            <div className="text-lg font-bold">English</div>
            <div className="text-xs text-[#6B7A99] mt-0.5">Clinical English</div>
          </button>
          <button
            type="button"
            onClick={() => setSelectedLanguage('hi')}
            className={`p-5 rounded-2xl border text-center transition shadow-soft ${
              selectedLanguage === 'hi'
                ? 'border-[#2F6FED] bg-[#EAF1FF] text-[#2F6FED] ring-2 ring-[#2F6FED]/20'
                : 'border-[#E2E8F4] bg-white text-[#1A2B4C] hover:border-[#2F6FED]/50'
            }`}
          >
            <div className="text-lg font-bold">हिंदी (Hindi)</div>
            <div className="text-xs text-[#6B7A99] mt-0.5">सहज हिंदी परामर्श</div>
          </button>
        </div>
      </div>

      {/* Step 2: Patient Details — always visible */}
      <div className="max-w-md mx-auto space-y-3">
        <label className="text-xs font-bold text-[#6B7A99] flex items-center gap-1.5 justify-center">
          <User className="w-4 h-4 text-[#2F6FED]" />
          <span>{isHindi ? 'चरण 2: मरीज की जानकारी' : 'Step 2: Patient details'}</span>
        </label>
        <div className="p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-[#1A2B4C] mb-1">
              {isHindi ? 'मरीज का नाम *' : 'Patient name *'}
            </label>
            <input
              id="start-name-input"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); if (onClearError) onClearError(); }}
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
              id="start-age-input"
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

      {/* Prominent Error Banner if Start Consultation Fails */}
      {error && (
        <div
          id="intake-start-error-banner"
          className="max-w-md mx-auto p-4 rounded-2xl border border-[#E5484D]/40 bg-[#FEECEE] text-[#1A2B4C] shadow-sm flex items-start justify-between gap-3 animate-shake"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-[#E5484D] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-[#E5484D]">
                {isHindi ? 'परामर्श शुरू करने में समस्या आई' : 'Could not start consultation'}
              </p>
              <p className="text-xs text-[#6B7A99] mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
          {onClearError && (
            <button
              type="button"
              onClick={onClearError}
              className="p-1 rounded-full text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-white transition flex-shrink-0"
              title="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Immediate Thinking... Indicator */}
      {loading && (
        <div
          id="intake-start-thinking-banner"
          className="max-w-md mx-auto p-3.5 rounded-2xl bg-[#EAF1FF] border border-[#2F6FED]/30 text-[#2F6FED] flex items-center justify-center gap-2.5 shadow-xs animate-pulse"
        >
          <Sparkles className="w-4 h-4 animate-spin text-[#2F6FED] flex-shrink-0" />
          <div className="text-xs font-semibold">
            <span>{isHindi ? 'सोच रहे हैं... (Thinking...)' : 'Thinking... '}</span>
            <span className="text-[#6B7A99] font-normal">
              {isHindi ? 'क्लिनिकल एआई प्री-कंसल्टेशन तैयार कर रहा है...' : 'Initializing clinical AI session...'}
            </span>
          </div>
        </div>
      )}

      {/* Touch to Begin CTA Button */}
      <div className="pt-2 max-w-md mx-auto">
        <button
          id="begin-intake-btn"
          type="button"
          disabled={loading}
          onClick={handleBegin}
          className="w-full py-4 px-8 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{isHindi ? 'सोच रहे हैं... (Thinking...)' : 'Thinking... Starting consultation'}</span>
            </>
          ) : error ? (
            <>
              <span>{isHindi ? 'पुनः प्रयास करें' : 'Retry consultation'}</span>
              <ChevronRight className="w-5 h-5" />
            </>
          ) : (
            <>
              <span>{isHindi ? 'परामर्श शुरू करने के लिए यहाँ दबाएं' : 'Touch here to begin consultation'}</span>
              <ChevronRight className="w-5 h-5" />
            </>
          )}
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
export default function IntakeFlow({ onViewCaseDraft, onNavigateTriage }) {
  const [activeTab, setActiveTab] = useState('interview');
  const [language, setLanguage] = useState('en');
  const [mode, setMode] = useState('speak');
  const [patient, setPatient] = useState(null);
  const [visitId, setVisitId] = useState(null);

  // currentStepIndex: -1 = Intro Step (Name & Age), 0..5 = Clinical Script Steps
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
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

  const isIntroStep = currentStepIndex === -1;
  const currentStep = !isIntroStep && CLINICAL_STEPS[currentStepIndex] ? CLINICAL_STEPS[currentStepIndex] : 'chief_complaint';

  const handleStartIntake = async ({ name, age, lang }) => {
    console.log('[IntakeFlow] Sending /api/intake/start request:', {
      endpoint: `${API_BASE}/intake/start`,
      patient_name: name || 'Patient',
      patient_age: age || 35,
      language: lang || 'en',
    });
    setIsProcessing(true);
    setError(null);
    setInaudibleNotice(null);
    setRetryCount(0);
    setLanguage(lang || 'en');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(`${API_BASE}/intake/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_name: name || 'Patient',
          patient_age: age || 35,
          language: lang || 'en',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to initialize consultation (HTTP ${res.status})`);
      }

      const data = await res.json();
      console.log('[IntakeFlow] Received /api/intake/start success response:', data);

      setPatient({
        id: data.patient_id,
        name: name || 'Patient',
        age: age || 35,
        language: lang || 'en',
      });
      setVisitId(data.visit_id);
      setCurrentPrompt(
        data.first_question ||
        (lang === 'hi' ? 'आज आपको क्या परेशानी है?' : 'What symptoms are you experiencing today?')
      );
      // Begin with the intro step (Name & Age collection)
      setCurrentStepIndex(-1);
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
      const res = await fetch(`${API_BASE}/intake/patient/${visitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

      const res = await fetch(`${API_BASE}/intake/respond`, {
        method: 'POST',
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
    setPatient(null);
    setVisitId(null);
    setTurns([]);
    setCurrentStepIndex(-1);
    setIsComplete(false);
    setUrgencyFlag(false);
    setInaudibleNotice(null);
    setRetryCount(0);
    setCurrentInputType('options');
    setBackendStepInputTypes({});
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
      {!patient && (
        <div className="rounded-3xl bg-white border border-[#E2E8F4] p-8 shadow-soft">
          <StartIntakeScreen
            onStart={handleStartIntake}
            loading={isProcessing}
            error={error}
            onClearError={() => setError(null)}
            initialLanguage={language}
          />
        </div>
      )}

      {patient && (
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

          {/* Red-Flag Urgent Banner (Deliberate slide-down motion) */}
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

          {/* Subtabs: Clinical Interview vs Document Upload */}
          <div className="flex items-center gap-2 border-b border-[#E2E8F4] pb-2">
            <button
              onClick={() => setActiveTab('interview')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition ${
                activeTab === 'interview'
                  ? 'bg-[#2F6FED] text-white shadow-sm'
                  : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
              }`}
            >
              Clinical interview
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'documents'
                  ? 'bg-[#2F6FED] text-white shadow-sm'
                  : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#EAF1FF]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload documents</span>
              {extractedDocs.length > 0 && (
                <span className="px-2 py-0.2 rounded-full text-[10px] bg-white text-[#2F6FED]">
                  {extractedDocs.length}
                </span>
              )}
            </button>
          </div>

          {/* Subtab: Document Upload */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <DocumentUpload
                visitId={visitId}
                language={language}
                onDocumentExtracted={handleDocumentExtracted}
                extractedDocs={extractedDocs}
              />
            </div>
          )}

          {/* Subtab: Clinical Interview */}
          {activeTab === 'interview' && (
            <>
              {isComplete ? (
                <CompletionCard
                  turns={turns}
                  language={language}
                  onRestart={handleRestart}
                  extractedDocs={extractedDocs}
                  onTabChange={setActiveTab}
                  visitId={visitId}
                  onViewCaseDraft={onViewCaseDraft}
                  urgencyFlag={urgencyFlag}
                  urgencyDept={urgencyDept}
                  urgencyReason={urgencyReason}
                  onNavigateTriage={onNavigateTriage}
                />
              ) : (
                <div className="space-y-3">
                  {/* Step Progress Tracker */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#6B7A99] font-medium">
                      <span>
                        {isIntroStep
                          ? (language === 'hi' ? 'प्रारंभिक चरण: मरीज का परिचय (नाम और उम्र)' : 'Intro Step: Patient Information (Name & Age)')
                          : `Step ${currentStepIndex + 1} of ${CLINICAL_STEPS.length}: ${STEP_LABELS[currentStep]?.[language] || currentStep}`}
                      </span>
                      <span>
                        {isIntroStep
                          ? (language === 'hi' ? 'शुरुआत' : 'Intro')
                          : `${Math.round(((currentStepIndex + 1) / CLINICAL_STEPS.length) * 100)}% complete`}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#F6F9FF] border border-[#E2E8F4] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#2F6FED] transition-all duration-300 rounded-full"
                        style={{
                          width: isIntroStep ? '4%' : `${((currentStepIndex + 1) / CLINICAL_STEPS.length) * 100}%`
                        }}
                      />
                    </div>
                  </div>


                  {/* Active Question Card */}
                  <div ref={activeCardRef} className="p-3 rounded-2xl border border-[#E2E8F4] bg-[#F6F9FF] space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-[#2F6FED] block">
                          {isIntroStep
                            ? (language === 'hi' ? 'मरीज का परिचय' : 'Patient Details')
                            : (STEP_LABELS[currentStep]?.[language] || currentStep)}
                        </span>
                        <h3 className="text-base font-bold text-[#1A2B4C] leading-snug">
                          {isIntroStep
                            ? (mode === 'speak'
                                ? (language === 'hi' ? 'कृपया अपना नाम और उम्र बताएं...' : 'What is your name and how old are you?')
                                : (language === 'hi' ? 'कृपया अपना नाम और उम्र दर्ज करें' : 'Please enter your name and age'))
                            : (currentPrompt || (language === 'hi' ? 'कृपया अपनी समस्या बताएं...' : 'Please describe your symptoms...'))}
                        </h3>
                      </div>
                    </div>

                    {/* Immediate Thinking... Loading Indicator */}
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

                    {/* Inaudible / Unclear Voice Input Notice */}
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

                    {/* Step-Specific Input Handling */}
                    {isIntroStep ? (
                      <div className="pt-4 border-t border-[#E2E8F4]">
                        {mode === 'speak' ? (
                          <div className="pt-2 flex flex-col items-center">
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
                            <p className="text-[11px] text-[#6B7A99] mt-3 text-center">
                              {language === 'hi'
                                ? 'उदाहरण: "मेरा नाम राजेश कुमार है और मेरी उम्र 42 साल है"'
                                : 'e.g. "My name is Ramesh Kumar and I am 42 years old"'}
                            </p>
                            <button
                              type="button"
                              onClick={() => { setMode('tap'); setInaudibleNotice(null); }}
                              className="mt-4 text-xs text-[#2F6FED] hover:underline flex items-center gap-1 font-medium"
                            >
                              <Hand className="w-3.5 h-3.5" />
                              <span>{language === 'hi' ? 'टाइप करना चाहते हैं? टैप मोड पर जाएं' : 'Prefer typing? Switch to tap mode'}</span>
                            </button>
                          </div>
                        ) : (
                          <DemographicsStepUI
                            language={language}
                            initialName={patient.name}
                            initialAge={patient.age}
                            onSave={handleSaveDemographics}
                            isProcessing={isProcessing}
                          />
                        )}
                      </div>
                    ) : (
                      /* Clinical Steps 1 to 6 */
                      mode === 'speak' ? (
                        <div className="pt-2 border-t border-[#E2E8F4] flex flex-col items-center">
                          {/* For yes-no, chips-and-text, or text type steps, show tap controls so user isn't stuck with only mic */}
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
                      )
                    )}
                  </div>

                  {error && (
                    <div className="p-4 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-semibold block">
                          {error.includes('404') || error.toLowerCase().includes('not found')
                            ? (language === 'hi' ? 'सत्र समाप्त हो गया — कृपया पुनः प्रारंभ करें।' : 'Session expired or not found — please restart.')
                            : error.includes('500') || error.includes('Failed')
                            ? (language === 'hi' ? 'सर्वर से जुड़ने में समस्या हुई — कृपया पुनः प्रयास करें।' : 'Server error — please try again.')
                            : error}
                        </span>
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
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
