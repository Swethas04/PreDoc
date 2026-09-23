import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  FileText,
  AlertCircle,
  CheckCircle2,
  Mic,
  FileCheck,
  ChevronRight,
  Copy,
  Check,
  Filter,
  Layers,
  Activity,
  Stethoscope,
  ClipboardList,
  Eye,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeft,
  Pill,
  HeartPulse,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Maximize2,
  Image as ImageIcon,
  Calendar,
  ChevronDown,
  ChevronUp,
  ListTree,
  Download,
  ExternalLink,
  File,
} from 'lucide-react';
import MedicalTimeline from './MedicalTimeline';
import PrescriptionTab from './PrescriptionTab';

const API_BASE = '/api';

// ─── 8 Clinical Sections Configuration ───────────────────────────────────────
const DRAFT_SECTIONS = [
  {
    key: 'chief_complaint',
    title: '1. Chief Complaint',
    subtitle: "Patient's primary reported concern",
    icon: Stethoscope,
    fallbackNegative: 'No primary complaint reported.',
  },
  {
    key: 'hpi',
    title: '2. History of Present Illness (HPI)',
    subtitle: 'Duration, progression, and associated symptoms from interview',
    icon: Activity,
    fallbackNegative: 'No HPI duration or progression details reported.',
  },
  {
    key: 'medical_history',
    title: '3. Medical History',
    subtitle: 'Past medical conditions, chronic illnesses, and surgical history',
    icon: HeartPulse,
    fallbackNegative: 'No significant past medical history reported.',
  },
  {
    key: 'medications',
    title: '4. Current Medications',
    subtitle: 'Current medications reported in interview and extracted from uploaded documents',
    icon: Pill,
    fallbackNegative: 'Not currently taking any medications.',
  },
  {
    key: 'allergies',
    title: '5. Allergies',
    subtitle: 'Known drug, food, and environmental allergies',
    icon: AlertCircle,
    fallbackNegative: 'No known drug or food allergies reported (NKDA).',
  },
  {
    key: 'previous_investigations',
    title: '6. Previous Investigations',
    subtitle: 'Extracted laboratory test values, diagnostics, and vitals from records',
    icon: ClipboardList,
    fallbackNegative: 'No previous diagnostic investigations or lab reports uploaded.',
  },
  {
    key: 'timeline',
    title: '7. Medical Timeline',
    subtitle: 'Chronological prescription and diagnostic history',
    icon: Calendar,
    fallbackNegative: 'Single consultation encounter; no prior documented events.',
    isTimeline: true,
  },
  {
    key: 'red_flags',
    title: '8. Red Flags & Urgent Alerts',
    subtitle: 'High-risk triage flags, critical symptoms, and urgent clinical recommendations',
    icon: ShieldAlert,
    fallbackNegative: 'No red flag symptoms identified.',
    isRedFlag: true,
  },
];

export default function CaseDraftPage({
  visitId: propVisitId,
  onBack,
  onNavigateVisit,
  onBackToDoctorQueue,
  authToken,
  onAuthError,
}) {
  const [visitId, setVisitId] = useState(() => {
    if (propVisitId) return Number(propVisitId);
    const match = window.location.pathname.match(/\/case\/(\d+)/);
    return match ? Number(match[1]) : 1;
  });

  const [caseData, setCaseData] = useState(null);
  const [allVisits, setAllVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('case'); // 'case' | 'prescription'

  // Helper for auth headers
  const getAuthHeaders = useCallback((extra = {}) => ({
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...extra,
  }), [authToken]);

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(null);

  // Highlighting & interactive source state
  const [selectedFactKey, setSelectedFactKey] = useState(null);
  const [activeSource, setActiveSource] = useState(null);
  const [filterSourceId, setFilterSourceId] = useState(null);
  const [sidePanelTab, setSidePanelTab] = useState('all');
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [expandedImage, setExpandedImage] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});

  const handleOpenPreview = (doc) => {
    setPreviewDoc(doc);
    setImgLoading(true);
    setImgError(false);
  };

  const getFileTypeCategory = (doc) => {
    if (!doc) return 'unknown';
    const mime = (doc.mime_type || '').toLowerCase();
    const name = (doc.filename || '').toLowerCase();

    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      return 'pdf';
    }
    if (
      mime.startsWith('image/') ||
      /\.(png|jpe?g|webp|svg|gif|bmp|tiff|heic)$/i.test(name)
    ) {
      return 'image';
    }
    if (
      mime.includes('word') ||
      mime.includes('officedocument.wordprocessingml') ||
      /\.(docx?|rtf|odt)$/i.test(name)
    ) {
      return 'word';
    }
    if (
      mime.includes('spreadsheet') ||
      mime.includes('excel') ||
      mime.includes('csv') ||
      /\.(xlsx?|csv)$/i.test(name)
    ) {
      return 'spreadsheet';
    }
    if (mime.startsWith('text/') || /\.(txt|md|json)$/i.test(name)) {
      return 'text';
    }
    return 'other';
  };

  const isPdfDoc = (doc) => getFileTypeCategory(doc) === 'pdf';
  const isImageDoc = (doc) => getFileTypeCategory(doc) === 'image';

  const getFileBadgeInfo = (doc) => {
    const cat = getFileTypeCategory(doc);
    if (cat === 'pdf') {
      return { badge: 'PDF', bg: 'bg-[#FEECEE]', text: 'text-[#E5484D]', border: 'border-[#E5484D]/30' };
    }
    if (cat === 'image') {
      const ext = (doc.filename || '').split('.').pop()?.toUpperCase();
      return { badge: ext && ext.length <= 4 ? ext : 'IMG', bg: 'bg-[#EAF1FF]', text: 'text-[#2F6FED]', border: 'border-[#2F6FED]/30' };
    }
    if (cat === 'word') {
      return { badge: 'DOC', bg: 'bg-[#F3E8FF]', text: 'text-[#7C3AED]', border: 'border-[#7C3AED]/30' };
    }
    if (cat === 'spreadsheet') {
      return { badge: 'SHEET', bg: 'bg-[#ECFDF5]', text: 'text-[#059669]', border: 'border-[#059669]/30' };
    }
    if (cat === 'text') {
      return { badge: 'TXT', bg: 'bg-[#F1F5F9]', text: 'text-[#475569]', border: 'border-[#CBD5E1]' };
    }
    return { badge: 'FILE', bg: 'bg-[#F1F5F9]', text: 'text-[#64748B]', border: 'border-[#CBD5E1]' };
  };

  const getDocumentRawUrl = (doc) => {
    if (!doc) return '';
    if (doc.file_url) return doc.file_url;
    if (doc.patient_profile_id) return `/api/patients/documents/${doc.id}/raw`;
    return `/api/documents/${doc.id}/raw`;
  };

  const getDocumentDownloadUrl = (doc) => {
    if (!doc) return '';
    if (doc.download_url) return doc.download_url;
    if (doc.patient_profile_id) return `/api/patients/documents/${doc.id}/download`;
    return `/api/documents/${doc.id}/download`;
  };

  const handleToggleCollapse = (key) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExpandAll = () => {
    setCollapsedSections({});
  };

  const handleCollapseAll = () => {
    const all = {};
    DRAFT_SECTIONS.forEach((s) => {
      all[s.key] = true;
    });
    setCollapsedSections(all);
  };

  const getSectionItems = (draftObj, sectionKey) => {
    if (!draftObj) return [];
    if (Array.isArray(draftObj[sectionKey])) return draftObj[sectionKey];
    // Backward compatibility fallback if old SOAP structure:
    if (sectionKey === 'chief_complaint' && draftObj.subjective) {
      return draftObj.subjective.slice(0, 1);
    }
    if (sectionKey === 'hpi' && draftObj.subjective) {
      return draftObj.subjective.slice(1);
    }
    if (sectionKey === 'medications' && draftObj.plan) {
      return draftObj.plan.filter((p) => p.fact && /mg|tablet|daily|dose|med/i.test(p.fact));
    }
    if (sectionKey === 'previous_investigations' && draftObj.objective) {
      return draftObj.objective;
    }
    return [];
  };

  const turnRefs = useRef({});
  const docRefs = useRef({});
  const sidePanelScrollRef = useRef(null);

  useEffect(() => {
    if (propVisitId && Number(propVisitId) !== visitId) {
      setVisitId(Number(propVisitId));
    }
  }, [propVisitId, visitId]);

  const fetchVisitsList = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/visits`, {
        headers: getAuthHeaders(),
      });
      if (res.status === 401 && onAuthError) {
        onAuthError();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAllVisits(data);
      }
    } catch (err) {
      console.warn('Could not load visits list:', err);
    }
  }, [getAuthHeaders, onAuthError]);

  const fetchCaseContext = useCallback(async (vid) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/visits/${vid}/case`, {
        headers: getAuthHeaders(),
      });
      if (res.status === 401 && onAuthError) {
        onAuthError();
        return;
      }
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error(`Visit #${vid} not found.`);
        }
        throw new Error(`Failed to load visit case context (HTTP ${res.status})`);
      }
      const data = await res.json();
      setCaseData(data);
      setIsEditing(false);

      if (data.draft?.content) {
        setEditContent(JSON.parse(JSON.stringify(data.draft.content)));
      }

      if (data.draft?.content?.chief_complaint?.length > 0) {
        const first = data.draft.content.chief_complaint[0];
        setSelectedFactKey('chief_complaint-0');
        setActiveSource(first.source);
      } else if (data.draft?.content?.subjective?.length > 0) {
        const first = data.draft.content.subjective[0];
        setSelectedFactKey('chief_complaint-0');
        setActiveSource(first.source);
      }
    } catch (err) {
      setError(err.message || 'Error loading case details');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, onAuthError]);

  useEffect(() => {
    fetchVisitsList();
  }, [fetchVisitsList]);

  useEffect(() => {
    if (visitId) {
      fetchCaseContext(visitId);
      if (window.location.pathname !== `/case/${visitId}`) {
        window.history.pushState(null, '', `/case/${visitId}`);
      }
    }
  }, [visitId, fetchCaseContext]);

  const handleGenerateDraft = async () => {
    if (!visitId) return;
    setGenerating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`${API_BASE}/visits/${visitId}/generate-draft`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.status === 401 && onAuthError) {
        onAuthError();
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Generation failed (HTTP ${res.status})`);
      }
      const draftResult = await res.json();
      setSuccessMessage('✨ 8-section clinical case draft generated with grounded citations.');
      fetchCaseContext(visitId);
    } catch (err) {
      setError(err.message || 'Error generating case draft');
    } finally {
      setGenerating(false);
    }
  };

  const handleStartEdit = () => {
    if (caseData?.draft?.content) {
      setEditContent(JSON.parse(JSON.stringify(caseData.draft.content)));
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    if (caseData?.draft?.content) {
      setEditContent(JSON.parse(JSON.stringify(caseData.draft.content)));
    }
    setIsEditing(false);
  };

  const handleSaveDraft = async () => {
    if (!visitId || !editContent) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`${API_BASE}/visits/${visitId}/draft`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content: editContent,
        }),
      });

      if (res.status === 401 && onAuthError) {
        onAuthError();
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Save failed (HTTP ${res.status})`);
      }

      setSuccessMessage('Case draft changes saved successfully.');
      setIsEditing(false);
      fetchCaseContext(visitId);
    } catch (err) {
      setError(err.message || 'Failed to save modifications');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveDraft = async () => {
    if (!visitId) return;
    setApproving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`${API_BASE}/visits/${visitId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          doctor_name: 'Dr. Attending Physician',
          final_notes: editContent ? JSON.stringify(editContent) : undefined,
        }),
      });

      if (res.status === 401 && onAuthError) {
        onAuthError();
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Approval failed (HTTP ${res.status})`);
      }

      setSuccessMessage('Visit approved and locked as final medical record.');
      setIsEditing(false);
      fetchCaseContext(visitId);
    } catch (err) {
      setError(err.message || 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  const handleFactClick = (fact, key) => {
    setSelectedFactKey(key);
    setActiveSource(fact.source || null);

    if (fact.source) {
      const { type, id } = fact.source;
      const ref = type === 'turn' ? turnRefs.current[id] : docRefs.current[id];
      if (ref && sidePanelScrollRef.current) {
        ref.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const handleCopyDraft = () => {
    if (!caseData?.draft?.content) return;
    const c = caseData.draft.content;
    const textLines = [
      `PATIENT: ${caseData.patient?.name || 'N/A'} (Age: ${caseData.patient?.age || 'N/A'}, Visit #${visitId})`,
      `STATUS: ${caseData.is_approved ? 'APPROVED FINAL' : 'PROVISIONAL DRAFT'}`,
      `CONSENT: ${caseData.consent_given ? `Verified (${caseData.consent_timestamp || 'recorded'})` : 'Pending'}`,
      '',
    ];

    if (c.clinical_summary) {
      textLines.push(`CLINICAL IMPRESSION: ${c.clinical_summary}`, '');
    }

    DRAFT_SECTIONS.forEach((sec) => {
      textLines.push(`=== ${sec.title.toUpperCase()} ===`);
      const items = getSectionItems(c, sec.key);
      if (items.length > 0) {
        items.forEach((f) => {
          const src = f.source ? ` [${f.source.label || `${f.source.type === 'turn' ? 'Transcript' : 'Document'} #${f.source.id}`}]` : '';
          textLines.push(`• ${f.fact}${src}`);
        });
      } else {
        textLines.push(`• ${sec.fallbackNegative}`);
      }
      textLines.push('');
    });

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectVisit = (newVid) => {
    if (onNavigateVisit) {
      onNavigateVisit(newVid);
    } else {
      setVisitId(Number(newVid));
    }
  };

  const handleItemChange = (sectionKey, index, newFactText) => {
    setEditContent((prev) => {
      const copy = { ...prev };
      if (copy[sectionKey] && copy[sectionKey][index]) {
        copy[sectionKey][index] = {
          ...copy[sectionKey][index],
          fact: newFactText,
        };
      }
      return copy;
    });
  };

  const handleAddItem = (sectionKey) => {
    setEditContent((prev) => {
      const copy = { ...prev };
      if (!copy[sectionKey]) copy[sectionKey] = [];
      copy[sectionKey].push({
        fact: '',
        source: null,
      });
      return copy;
    });
  };

  const handleDeleteItem = (sectionKey, index) => {
    setEditContent((prev) => {
      const copy = { ...prev };
      if (copy[sectionKey]) {
        copy[sectionKey].splice(index, 1);
      }
      return copy;
    });
  };

  const isFactMatchedByFilter = (fact) => {
    if (!filterSourceId) return true;
    if (!fact.source) return false;
    return (
      fact.source.type === filterSourceId.type &&
      Number(fact.source.id) === Number(filterSourceId.id)
    );
  };

  const isApproved = caseData?.is_approved || false;
  const draft = isEditing ? editContent : caseData?.draft?.content;
  const turns = caseData?.turns || [];
  const documents = caseData?.documents || [];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Patient Chart Banner */}
      <div className="rounded-3xl bg-white border border-[#E2E8F4] p-6 sm:p-8 shadow-soft">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2.5 rounded-full bg-[#F6F9FF] hover:bg-[#EAF1FF] text-[#6B7A99] hover:text-[#2F6FED] border border-[#E2E8F4] transition"
                title="Back to queue"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div className="w-14 h-14 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center font-bold text-lg flex-shrink-0">
              {caseData?.patient?.name ? caseData.patient.name.trim().charAt(0).toUpperCase() : 'P'}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2B4C] tracking-tight">
                  {caseData?.patient?.name || 'Patient Case Review'}
                </h1>
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-[#EAF1FF] text-[#2F6FED]">
                  Visit #{visitId}
                </span>

                {isApproved ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF7EE] text-[#2FAE60] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Approved & final
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF6E9] text-[#F5A623] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Provisional draft
                  </span>
                )}

                {caseData?.consent_given ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#EAF7EE] text-[#2FAE60] flex items-center gap-1.5 border border-[#2FAE60]/20">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#2FAE60]" />
                    Consent verified
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF6E9] text-[#F5A623] flex items-center gap-1.5 border border-[#F5A623]/20">
                    <Lock className="w-3.5 h-3.5 text-[#F5A623]" />
                    Consent pending
                  </span>
                )}

                {caseData?.urgency_flag && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FEECEE] text-[#E5484D] flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Urgent
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-2 text-xs text-[#6B7A99] flex-wrap">
                <span>Age: <strong className="text-[#1A2B4C] font-semibold">{caseData?.patient?.age ? `${caseData.patient.age} yrs` : 'N/A'}</strong></span>
                <span>•</span>
                <span>Language: <strong className="text-[#1A2B4C] font-semibold">{caseData?.patient?.language === 'hi' ? 'Hindi' : 'English'}</strong></span>
                <span>•</span>
                <span>Interview turns: <strong className="text-[#2F6FED] font-semibold">{turns.length}</strong></span>
                <span>•</span>
                <span>Uploaded documents: <strong className="text-[#2F6FED] font-semibold">{documents.length}</strong></span>
              </div>
            </div>
          </div>

          {/* Action buttons & selector */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {allVisits.length > 1 && (
              <select
                aria-label="Switch consultation visit"
                value={visitId}
                onChange={(e) => handleSelectVisit(e.target.value)}
                className="bg-[#F6F9FF] text-xs font-medium text-[#1A2B4C] py-2 px-4 rounded-full border border-[#E2E8F4] hover:border-[#2F6FED] focus:outline-none cursor-pointer"
              >
                {allVisits.map((v) => (
                  <option key={v.visit_id || v.id} value={v.visit_id || v.id}>
                    Visit #{v.visit_id || v.id} {v.is_approved ? '✓ (Approved)' : '(Pending)'}
                  </option>
                ))}
              </select>
            )}

            {draft && (
              <button
                type="button"
                onClick={handleCopyDraft}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-[#EAF1FF] text-[#1A2B4C] text-xs font-semibold border border-[#E2E8F4] transition shadow-sm"
                title="Copy SOAP note text"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#2FAE60]" /> : <Copy className="w-3.5 h-3.5 text-[#6B7A99]" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setSidePanelOpen(!sidePanelOpen)}
              className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-[#EAF1FF] text-[#1A2B4C] text-xs font-semibold border border-[#E2E8F4] transition shadow-sm"
            >
              {sidePanelOpen ? <PanelRightClose className="w-3.5 h-3.5 text-[#6B7A99]" /> : <PanelRightOpen className="w-3.5 h-3.5 text-[#2F6FED]" />}
              <span>{sidePanelOpen ? 'Hide evidence' : 'Show evidence'}</span>
            </button>

            {draft && !isApproved && (
              <>
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-white hover:bg-[#EAF1FF] text-[#2F6FED] border border-[#2F6FED] text-xs font-bold transition shadow-sm"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit draft</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveDraft}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? 'Saving...' : 'Save changes'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="p-2 rounded-full bg-white hover:bg-[#F6F9FF] text-[#6B7A99] border border-[#E2E8F4] text-xs"
                      title="Cancel edit"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            )}

            {draft && !isApproved && (
              <button
                id="approve-draft-btn"
                type="button"
                disabled={approving}
                onClick={handleApproveDraft}
                className="flex items-center gap-1.5 px-6 py-2 rounded-full bg-[#2FAE60] hover:bg-[#258d4e] text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{approving ? 'Finalizing...' : 'Approve & lock final'}</span>
              </button>
            )}

            {!draft && (
              <button
                id="generate-draft-btn"
                type="button"
                disabled={generating || loading}
                onClick={handleGenerateDraft}
                className="flex items-center gap-2 px-6 py-2 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{generating ? 'Synthesizing...' : 'Generate SOAP draft'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Governance banner */}
        <div className="mt-4 pt-4 border-t border-[#E2E8F4] flex items-center justify-between flex-wrap gap-2 text-xs">
          {isApproved ? (
            <div className="flex items-center gap-1.5 text-[#2FAE60] font-semibold">
              <Lock className="w-4 h-4" />
              <span>
                <strong>Locked final record:</strong> Approved by {caseData?.approved_by || 'Attending Physician'}
                {caseData?.approved_at ? ` on ${new Date(caseData.approved_at).toLocaleString()}` : ''}.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[#F5A623] font-semibold">
              <AlertCircle className="w-4 h-4" />
              <span>
                <strong>Provisional draft — not final:</strong> Must be reviewed and approved by a physician before clinical action.
              </span>
            </div>
          )}

          {isEditing && (
            <span className="text-[#2F6FED] font-bold flex items-center gap-1">
              <Edit3 className="w-3.5 h-3.5" /> Inline edit mode active
            </span>
          )}
        </div>

        {successMessage && (
          <div className="mt-3 p-3 rounded-2xl border border-[#2FAE60]/30 bg-[#EAF7EE] text-[#2FAE60] text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Mode Switcher: Clinical Case Review vs Prescription ── */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white border border-[#E2E8F4] shadow-xs inline-flex">
        <button
          type="button"
          id="tab-mode-case"
          onClick={() => setViewMode('case')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition ${
            viewMode === 'case'
              ? 'bg-[#2F6FED] text-white shadow-sm'
              : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#F6F9FF]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Clinical Case Review</span>
        </button>

        <button
          type="button"
          id="tab-mode-prescription"
          onClick={() => setViewMode('prescription')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition ${
            viewMode === 'prescription'
              ? 'bg-[#2F6FED] text-white shadow-sm'
              : 'text-[#6B7A99] hover:text-[#1A2B4C] hover:bg-[#F6F9FF]'
          }`}
        >
          <Pill className="w-4 h-4" />
          <span>Prescriptions & Rx</span>
        </button>
      </div>

      {viewMode === 'prescription' ? (
        <PrescriptionTab
          visitId={visitId}
          patientData={caseData?.patient}
          doctorName={caseData?.approved_by || 'Dr. Attending Physician'}
          authToken={authToken}
          onAuthError={onAuthError}
        />
      ) : (
        <>
          {/* ── Main Two-Column View: SOAP Section Cards + Evidence Panel ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: SOAP Draft Cards (Col 7 or 12) */}
            <div className={`${sidePanelOpen ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-5 transition-all duration-200`}>
          {/* Clinical Impression Card */}
          {(draft?.clinical_summary !== undefined || isEditing) && (
            <div className="rounded-2xl border border-[#E2E8F4] bg-white p-6 shadow-soft space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-[#1A2B4C]">
                    Clinical Impression & Summary
                  </h3>
                </div>
                {isEditing && <span className="text-xs font-semibold text-[#2F6FED]">Editable</span>}
              </div>

              {isEditing ? (
                <textarea
                  rows={3}
                  value={draft?.clinical_summary || ''}
                  onChange={(e) =>
                    setEditContent((prev) => ({ ...prev, clinical_summary: e.target.value }))
                  }
                  className="w-full p-3 rounded-xl bg-[#F6F9FF] border border-[#E2E8F4] text-[#1A2B4C] text-xs focus:outline-none focus:border-[#2F6FED] resize-y"
                  placeholder="Enter clinical summary or diagnostic impression..."
                />
              ) : (
                <p className="text-sm text-[#1A2B4C] leading-relaxed">
                  {draft?.clinical_summary || 'No clinical summary recorded.'}
                </p>
              )}
            </div>
          )}

          {!draft && !loading && (
            <div className="p-12 rounded-3xl border border-[#E2E8F4] bg-white shadow-soft text-center">
              <div className="w-14 h-14 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mx-auto mb-3">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-[#1A2B4C]">No case draft generated</h3>
              <p className="text-xs text-[#6B7A99] max-w-sm mx-auto mt-1 mb-5">
                Synthesize patient transcript and uploaded medical documents into a structured SOAP case note.
              </p>
              <button
                type="button"
                disabled={generating}
                onClick={handleGenerateDraft}
                className="px-6 py-3 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                Generate SOAP case draft
              </button>
            </div>
          )}

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-6 rounded-2xl bg-white border border-[#E2E8F4] shadow-soft space-y-3 animate-pulse">
                  <div className="h-4 bg-[#EAF1FF] rounded-full w-1/3"></div>
                  <div className="h-3 bg-[#F6F9FF] rounded-full w-3/4"></div>
                  <div className="h-3 bg-[#F6F9FF] rounded-full w-1/2"></div>
                </div>
              ))}
            </div>
          )}

          {/* Reorganized 8 Clinical Sections + Table of Contents Outline */}
          {draft && (
            <div className="space-y-5">
              {/* Collapsible Tree / Outline for direct section jumping */}
              <DraftTableOfContents
                sections={DRAFT_SECTIONS}
                draft={draft}
                collapsedSections={collapsedSections}
                onToggleSection={handleToggleCollapse}
                onExpandAll={handleExpandAll}
                onCollapseAll={handleCollapseAll}
                getSectionItems={getSectionItems}
              />

              {/* 8 Clinical Section Cards */}
              {DRAFT_SECTIONS.map((sec) => (
                <ClinicalSectionCard
                  key={sec.key}
                  section={sec}
                  sectionKey={sec.key}
                  items={getSectionItems(draft, sec.key)}
                  selectedFactKey={selectedFactKey}
                  onSelectFact={handleFactClick}
                  isMatched={isFactMatchedByFilter}
                  isEditing={isEditing}
                  onItemChange={handleItemChange}
                  onAddItem={handleAddItem}
                  onDeleteItem={handleDeleteItem}
                  documents={documents}
                  isCollapsed={!!collapsedSections[sec.key]}
                  onToggleCollapse={() => handleToggleCollapse(sec.key)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Evidence Side Panel (Col 5) */}
        {sidePanelOpen && (
          <div className="lg:col-span-5 sticky top-20 space-y-4">
            <div className="rounded-2xl border border-[#E2E8F4] bg-white shadow-soft overflow-hidden flex flex-col max-h-[calc(100vh-7rem)]">
              {/* Header */}
              <div className="p-4 border-b border-[#E2E8F4] bg-[#F6F9FF] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs font-bold text-[#1A2B4C]">
                    Original evidence & sources
                  </h2>
                </div>

                <div className="flex items-center gap-1 bg-white p-1 rounded-full border border-[#E2E8F4] text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSidePanelTab('all')}
                    className={`px-3 py-1 rounded-full font-medium transition ${
                      sidePanelTab === 'all'
                        ? 'bg-[#2F6FED] text-white shadow-sm'
                        : 'text-[#6B7A99] hover:text-[#1A2B4C]'
                    }`}
                  >
                    All ({turns.length + documents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidePanelTab('images')}
                    className={`px-3 py-1 rounded-full font-medium transition ${
                      sidePanelTab === 'images'
                        ? 'bg-[#2F6FED] text-white shadow-sm'
                        : 'text-[#6B7A99] hover:text-[#1A2B4C]'
                    }`}
                  >
                    Docs ({documents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidePanelTab('active')}
                    className={`px-3 py-1 rounded-full font-medium transition ${
                      sidePanelTab === 'active'
                        ? 'bg-[#2F6FED] text-white shadow-sm'
                        : 'text-[#6B7A99] hover:text-[#1A2B4C]'
                    }`}
                  >
                    Focus
                  </button>
                </div>
              </div>

              {/* Active Citation Spotlight */}
              {activeSource && (
                <div className="p-3.5 bg-[#EAF1FF] border-b border-[#E2E8F4] flex items-center justify-between gap-3 text-xs">
                  <div className="truncate">
                    <span className="font-bold text-[#2F6FED] block truncate">{activeSource.label || 'Active citation'}</span>
                    <span className="text-[10px] text-[#6B7A99]">Click facts on left to inspect evidence quote</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (filterSourceId?.id === activeSource.id && filterSourceId?.type === activeSource.type) {
                        setFilterSourceId(null);
                      } else {
                        setFilterSourceId({ type: activeSource.type, id: activeSource.id });
                      }
                    }}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold border transition whitespace-nowrap ${
                      filterSourceId?.id === activeSource.id && filterSourceId?.type === activeSource.type
                        ? 'bg-[#2F6FED] text-white border-[#2F6FED]'
                        : 'bg-white text-[#2F6FED] border-[#2F6FED] hover:bg-[#EAF1FF]'
                    }`}
                  >
                    {filterSourceId?.id === activeSource.id && filterSourceId?.type === activeSource.type
                      ? 'Filtered ✓'
                      : 'Filter by source'}
                  </button>
                </div>
              )}

              {/* Scrollable Evidence Body */}
              <div
                ref={sidePanelScrollRef}
                className="p-4 overflow-y-auto space-y-4 text-xs"
              >
                {/* TAB: IMAGES & DOCUMENTS */}
                {sidePanelTab === 'images' && (
                  <div className="space-y-4">
                    {documents.length === 0 ? (
                      <p className="text-[#6B7A99] text-xs italic">No uploaded documents or prescriptions on file.</p>
                    ) : (
                      documents.map((doc) => {
                        const badgeInfo = getFileBadgeInfo(doc);
                        const isPdf = isPdfDoc(doc);
                        const isImg = isImageDoc(doc);
                        const downloadUrl = getDocumentDownloadUrl(doc);

                        return (
                          <div
                            key={doc.id}
                            ref={(el) => (docRefs.current[doc.id] = el)}
                            onClick={() => handleOpenPreview(doc)}
                            className="p-4 rounded-2xl border border-[#E2E8F4] bg-[#F8FAFC] hover:bg-white hover:border-[#2F6FED]/50 transition cursor-pointer space-y-3 shadow-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${badgeInfo.bg} ${badgeInfo.text} border ${badgeInfo.border}`}>
                                  {badgeInfo.badge}
                                </span>
                                <span className="font-bold text-[#1A2B4C] text-xs truncate" title={doc.filename}>
                                  {doc.label || doc.filename}
                                </span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-[#6B7A99] font-mono border border-[#E2E8F4] flex-shrink-0">
                                Doc #{doc.id}
                              </span>
                            </div>

                            {isImg && (doc.image_base64 || doc.file_url) && (
                              <div className="relative border border-[#E2E8F4] bg-white rounded-xl overflow-hidden max-h-40 flex items-center justify-center">
                                <img
                                  src={getDocumentRawUrl(doc) || doc.image_base64}
                                  alt={doc.filename}
                                  className="w-full h-36 object-contain mx-auto bg-slate-50"
                                  loading="lazy"
                                />
                              </div>
                            )}

                            <DocumentDetailSnippet doc={doc} />

                            <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F4] gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenPreview(doc);
                                }}
                                className="flex items-center gap-1 text-[11px] font-bold text-[#2F6FED] hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{isPdf ? 'Open PDF' : isImg ? 'Preview' : 'View File'}</span>
                              </button>

                              <a
                                href={downloadUrl}
                                download={doc.filename}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] hover:border-[#2F6FED] text-[#1A2B4C] hover:text-[#2F6FED] text-[11px] font-semibold transition shadow-xs"
                                title={`Download ${doc.filename}`}
                              >
                                <Download className="w-3.5 h-3.5 text-[#2F6FED]" />
                                <span>Download</span>
                              </a>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* TAB: ACTIVE FOCUSED CITATION */}
                {sidePanelTab === 'active' && (
                  <div className="space-y-3">
                    {activeSource ? (
                      <div className="p-4 rounded-2xl border border-[#2F6FED] bg-[#EAF1FF] space-y-2.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-[#2F6FED]">
                            {activeSource.type === 'turn' ? 'Intake voice transcript' : 'Uploaded document'}
                          </span>
                          <span className="text-[#6B7A99] font-mono text-[10px]">
                            ID #{activeSource.id}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-[#1A2B4C]">
                          {activeSource.label}
                        </h4>

                        {activeSource.quote && (
                          <div className="p-3 rounded-xl bg-white border border-[#E2E8F4] text-[#1A2B4C]">
                            <span className="text-[10px] font-bold text-[#2F6FED] block mb-1">Evidence quote:</span>
                            <blockquote className="italic border-l-2 border-[#2F6FED] pl-2.5 text-xs text-[#1A2B4C]">
                              "{activeSource.quote}"
                            </blockquote>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[#6B7A99] text-xs italic">Select any clinical fact on the left to view grounding evidence.</p>
                    )}
                  </div>
                )}

                {/* TAB: ALL SOURCES */}
                {sidePanelTab === 'all' && (
                  <div className="space-y-4">
                    {/* Voice Turns Section */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-[#1A2B4C] flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-[#2F6FED]" />
                        <span>Intake transcript turns ({turns.length})</span>
                      </h4>
                      <div className="space-y-2">
                        {turns.map((t) => {
                          const isHighlighted = activeSource?.type === 'turn' && Number(activeSource.id) === t.id;
                          return (
                            <div
                              key={t.id}
                              ref={(el) => (turnRefs.current[t.id] = el)}
                              className={`p-3 rounded-xl border text-xs transition ${
                                isHighlighted
                                  ? 'border-[#2F6FED] bg-[#EAF1FF]'
                                  : 'border-[#E2E8F4] bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[10px] text-[#6B7A99] mb-1">
                                <span className="font-bold text-[#2F6FED]">{t.step}</span>
                                <span className="font-mono">Turn #{t.id}</span>
                              </div>
                              <p className="text-[11px] text-[#6B7A99]">{t.prompt}</p>
                              <p className="text-xs font-medium text-[#1A2B4C] mt-1">"{t.transcript}"</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Uploaded Documents Section */}
                    <div className="space-y-2 pt-2 border-t border-[#E2E8F4]">
                      <h4 className="text-xs font-bold text-[#1A2B4C] flex items-center gap-1.5">
                        <FileCheck className="w-3.5 h-3.5 text-[#2F6FED]" />
                        <span>Uploaded documents ({documents.length})</span>
                      </h4>
                      {documents.length === 0 ? (
                        <p className="text-[#6B7A99] text-xs italic">No documents uploaded.</p>
                      ) : (
                        <div className="space-y-2">
                          {documents.map((doc) => {
                            const badgeInfo = getFileBadgeInfo(doc);
                            const isPdf = isPdfDoc(doc);
                            const isImg = isImageDoc(doc);
                            const downloadUrl = getDocumentDownloadUrl(doc);
                            const isHighlighted = activeSource?.type === 'document' && Number(activeSource.id) === doc.id;

                            return (
                              <div
                                key={doc.id}
                                ref={(el) => (docRefs.current[doc.id] = el)}
                                onClick={() => handleOpenPreview(doc)}
                                className={`p-3.5 rounded-2xl border text-xs transition cursor-pointer space-y-2.5 ${
                                  isHighlighted
                                    ? 'border-[#2F6FED] bg-[#EAF1FF] ring-2 ring-[#2F6FED]/20'
                                    : 'border-[#E2E8F4] bg-white hover:border-[#2F6FED]/50 shadow-xs'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${badgeInfo.bg} ${badgeInfo.text} border ${badgeInfo.border}`}>
                                      {badgeInfo.badge}
                                    </span>
                                    <span className="font-bold text-[#1A2B4C] truncate" title={doc.filename}>
                                      {doc.label || doc.filename}
                                    </span>
                                  </div>
                                  <span className="font-mono text-[10px] text-[#6B7A99] px-2 py-0.5 rounded-full bg-[#F6F9FF] border border-[#E2E8F4]">
                                    Doc #{doc.id}
                                  </span>
                                </div>

                                <DocumentDetailSnippet doc={doc} />

                                <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F4]/80 gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenPreview(doc);
                                    }}
                                    className="flex items-center gap-1 text-[11px] font-bold text-[#2F6FED] hover:underline"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>{isPdf ? 'Open PDF' : isImg ? 'Preview' : 'View File'}</span>
                                  </button>

                                  <a
                                    href={downloadUrl}
                                    download={doc.filename}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-[#CBD5E1] hover:border-[#2F6FED] text-[#1A2B4C] hover:text-[#2F6FED] text-[11px] font-semibold transition shadow-xs"
                                    title={`Download ${doc.filename}`}
                                  >
                                    <Download className="w-3 h-3 text-[#2F6FED]" />
                                    <span>Download</span>
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full Document Viewer & Download Modal */}
      {previewDoc && (() => {
        const badgeInfo = getFileBadgeInfo(previewDoc);
        const isPdf = isPdfDoc(previewDoc);
        const isImg = isImageDoc(previewDoc);
        const rawUrl = getDocumentRawUrl(previewDoc);
        const downloadUrl = getDocumentDownloadUrl(previewDoc);

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Medical document preview"
            onClick={() => setPreviewDoc(null)}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-6 backdrop-blur-sm animate-fade-in"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-5xl max-h-[94vh] bg-white rounded-3xl border border-[#E2E8F4] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Top Bar */}
              <div className="px-6 py-4 border-b border-[#E2E8F4] bg-[#F8FAFC] flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase ${badgeInfo.bg} ${badgeInfo.text} border ${badgeInfo.border}`}>
                    {badgeInfo.badge}
                  </span>
                  <div className="truncate">
                    <h3 className="text-sm sm:text-base font-bold text-[#1A2B4C] truncate">
                      {previewDoc.label || previewDoc.filename}
                    </h3>
                    <span className="text-xs text-[#64748B] font-mono block truncate">
                      {previewDoc.filename} • Doc #{previewDoc.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#E2E8F4] bg-white text-xs font-semibold text-[#2F6FED] hover:bg-[#EAF1FF] transition shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in new tab</span>
                  </a>

                  <a
                    href={downloadUrl}
                    download={previewDoc.filename}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-bold transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="p-2 rounded-full hover:bg-[#E2E8F4] text-[#64748B] transition"
                    title="Close viewer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal Content Frame */}
              <div className="p-4 sm:p-6 overflow-auto flex-1 bg-[#F1F5F9]/50 flex items-center justify-center min-h-[60vh]">
                {isPdf ? (
                  <div className="w-full h-[78vh] flex flex-col rounded-2xl border border-[#CBD5E1] overflow-hidden bg-white shadow-inner">
                    <iframe
                      src={rawUrl}
                      title={previewDoc.filename}
                      className="w-full h-full border-0"
                    />
                  </div>
                ) : isImg ? (
                  <div className="max-h-[78vh] overflow-auto flex items-center justify-center w-full p-2 relative">
                    {imgLoading && !imgError && (
                      <div className="flex flex-col items-center justify-center p-12 space-y-3">
                        <div className="w-8 h-8 border-3 border-[#2F6FED] border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs text-[#64748B] font-medium">Loading high-resolution document preview...</p>
                      </div>
                    )}
                    {imgError ? (
                      <div className="p-8 text-center bg-white rounded-2xl border border-[#E2E8F4] shadow-sm max-w-md">
                        <AlertCircle className="w-10 h-10 text-[#E5484D] mx-auto mb-2" />
                        <h4 className="text-sm font-bold text-[#1A2B4C] mb-1">Couldn't load inline preview</h4>
                        <p className="text-xs text-[#64748B] mb-4">
                          The image format or connection prevented inline rendering. You can still download or open it in a new tab.
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <a
                            href={rawUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-1.5 rounded-full border border-[#E2E8F4] text-xs font-semibold text-[#2F6FED] hover:bg-[#EAF1FF]"
                          >
                            Open in new tab
                          </a>
                          <a
                            href={downloadUrl}
                            download={previewDoc.filename}
                            className="px-4 py-1.5 rounded-full bg-[#2F6FED] text-white text-xs font-bold hover:bg-[#255BC7]"
                          >
                            Download
                          </a>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={rawUrl || previewDoc.image_base64}
                        alt={previewDoc.filename}
                        onLoad={() => setImgLoading(false)}
                        onError={() => {
                          setImgLoading(false);
                          setImgError(true);
                        }}
                        className={`max-h-[76vh] max-w-full object-contain mx-auto rounded-2xl border border-[#CBD5E1] bg-white shadow-md transition-opacity duration-200 ${
                          imgLoading ? 'opacity-0 absolute' : 'opacity-100'
                        }`}
                      />
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center bg-white rounded-3xl border border-[#E2E8F4] shadow-lg max-w-md w-full animate-fade-in">
                    <div className="w-16 h-16 rounded-2xl bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center mx-auto mb-4 border border-[#2F6FED]/20 shadow-xs">
                      {badgeInfo.badge === 'DOC' ? (
                        <FileText className="w-8 h-8" />
                      ) : badgeInfo.badge === 'SHEET' ? (
                        <ClipboardList className="w-8 h-8" />
                      ) : (
                        <File className="w-8 h-8" />
                      )}
                    </div>
                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold uppercase tracking-wider ${badgeInfo.bg} ${badgeInfo.text} border ${badgeInfo.border} inline-block mb-2`}>
                      {badgeInfo.badge} DOCUMENT
                    </span>
                    <h4 className="text-base font-bold text-[#1A2B4C] mb-1 truncate px-2" title={previewDoc.filename}>
                      {previewDoc.label || previewDoc.filename}
                    </h4>
                    <p className="text-xs text-[#64748B] font-mono mb-4 truncate px-4">
                      {previewDoc.filename} • Doc #{previewDoc.id}
                    </p>
                    <p className="text-xs text-[#64748B] mb-6 leading-relaxed">
                      This file format cannot be rendered inline directly in the browser. Click below to download and view in Microsoft Word or your local application.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <a
                        href={downloadUrl}
                        download={previewDoc.filename}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2F6FED] text-white text-xs font-bold hover:bg-[#255BC7] transition shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download {previewDoc.filename}</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
        </>
      )}
    </div>
  );
}

// ─── Collapsible Tree / List Outline Table of Contents ──────────────────────
function DraftTableOfContents({
  sections,
  draft,
  collapsedSections,
  onToggleSection,
  onExpandAll,
  onCollapseAll,
  getSectionItems,
}) {
  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTree className="w-4 h-4 text-[#2F6FED]" />
          <h4 className="text-xs font-bold text-[#1A2B4C] uppercase tracking-wider">
            Case Draft Outline (8 Clinical Sections)
          </h4>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={onExpandAll}
            className="text-[#2F6FED] hover:underline font-semibold"
          >
            Expand all
          </button>
          <span className="text-[#E2E8F4]">•</span>
          <button
            type="button"
            onClick={onCollapseAll}
            className="text-[#6B7A99] hover:underline font-semibold"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {sections.map((sec) => {
          const items = getSectionItems(draft, sec.key);
          const isCollapsed = collapsedSections[sec.key];
          const Icon = sec.icon;
          const isRed = sec.isRedFlag && items.some((i) => i.fact && !i.fact.toLowerCase().includes('no red flag'));

          return (
            <a
              key={sec.key}
              href={`#section-${sec.key}`}
              onClick={(e) => {
                e.preventDefault();
                const el = document.getElementById(`section-${sec.key}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 text-xs ${
                isRed
                  ? 'border-[#E5484D]/40 bg-[#FEECEE] text-[#E5484D] font-bold'
                  : 'border-[#E2E8F4] bg-[#F6F9FF] hover:bg-[#EAF1FF] hover:border-[#2F6FED]/50 text-[#1A2B4C]'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isRed ? 'text-[#E5484D]' : 'text-[#2F6FED]'}`} />
                <span className="truncate font-semibold">{sec.title.split('. ')[1]}</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold flex-shrink-0 ${
                  isRed ? 'bg-[#E5484D] text-white' : 'bg-white text-[#6B7A99] border border-[#E2E8F4]'
                }`}
              >
                {items.length}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ─── Individual 8-Section Card Component ─────────────────────────────────────
function ClinicalSectionCard({
  section,
  items = [],
  sectionKey,
  selectedFactKey,
  onSelectFact,
  isMatched,
  isEditing,
  onItemChange,
  onAddItem,
  onDeleteItem,
  documents = [],
  isCollapsed,
  onToggleCollapse,
}) {
  const { title, subtitle, icon: Icon, fallbackNegative, isTimeline, isRedFlag } = section;
  const effectiveItems =
    items.length > 0
      ? items
      : fallbackNegative
      ? [{ fact: fallbackNegative, source: null, isFallback: true }]
      : [];

  return (
    <div
      id={`section-${sectionKey}`}
      className={`rounded-2xl border transition-all duration-200 bg-white shadow-soft space-y-4 scroll-mt-24 p-6 ${
        isRedFlag && items.some((i) => i.fact && !i.fact.toLowerCase().includes('no red flag'))
          ? 'border-[#E5484D]/40 bg-[#FFF9FA]'
          : 'border-[#E2E8F4]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-3 cursor-pointer select-none flex-1"
          onClick={onToggleCollapse}
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center ${
              isRedFlag && items.some((i) => i.fact && !i.fact.toLowerCase().includes('no red flag'))
                ? 'bg-[#FEECEE] text-[#E5484D]'
                : 'bg-[#EAF1FF] text-[#2F6FED]'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[#1A2B4C]">{title}</h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#F6F9FF] text-[#6B7A99] border border-[#E2E8F4]">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <p className="text-xs text-[#6B7A99]">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditing && (
            <button
              type="button"
              onClick={() => onAddItem(sectionKey)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#EAF1FF] hover:bg-[#2F6FED] text-[#2F6FED] hover:text-white text-xs font-bold transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add fact
            </button>
          )}

          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 rounded-full hover:bg-[#F6F9FF] text-[#6B7A99] transition"
            title={isCollapsed ? 'Expand section' : 'Collapse section'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-2.5 pt-1 animate-fade-in">
          {effectiveItems.map((item, idx) => {
            const factKey = `${sectionKey}-${idx}`;
            const isSelected = selectedFactKey === factKey;
            const matched = isMatched(item);
            const isAlertItem = isRedFlag && item.fact && !item.fact.toLowerCase().includes('no red flag');

            return (
              <div
                key={idx}
                onClick={() => !isEditing && !item.isFallback && onSelectFact(item, factKey)}
                className={`p-3.5 rounded-xl border transition text-xs ${
                  isEditing ? 'cursor-default' : item.isFallback ? 'cursor-default' : 'cursor-pointer'
                } ${
                  isSelected
                    ? 'border-[#2F6FED] bg-[#EAF1FF] ring-2 ring-[#2F6FED]/20'
                    : isAlertItem
                    ? 'border-[#E5484D]/40 bg-[#FEECEE] text-[#E5484D]'
                    : matched
                    ? 'border-[#E2E8F4] bg-[#F6F9FF] hover:border-[#2F6FED]/50 hover:bg-white'
                    : 'border-[#E2E8F4] bg-white opacity-40'
                }`}
              >
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.fact || ''}
                      onChange={(e) => onItemChange(sectionKey, idx, e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-white border border-[#E2E8F4] text-xs font-medium text-[#1A2B4C] focus:outline-none focus:border-[#2F6FED]"
                      placeholder="Enter clinical detail..."
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteItem(sectionKey, idx)}
                      className="p-2 text-[#6B7A99] hover:text-[#E5484D]"
                      title="Delete item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={`text-xs leading-relaxed font-medium flex-1 ${
                        isAlertItem
                          ? 'text-[#E5484D] font-semibold'
                          : item.isFallback
                          ? 'text-[#6B7A99] italic'
                          : 'text-[#1A2B4C]'
                      }`}
                    >
                      {item.fact}
                    </p>
                    {item.source && (
                      <span className="text-[10px] font-mono font-semibold text-[#2F6FED] bg-white px-2.5 py-0.5 rounded-full border border-[#E2E8F4] flex-shrink-0 shadow-xs">
                        {item.source.label ||
                          `${item.source.type === 'turn' ? 'Transcript' : 'Document'} #${item.source.id}`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Section 7: Embedded Medical Timeline */}
          {isTimeline && documents.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#E2E8F4] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1A2B4C]">Chronological Event Timeline</span>
                <span className="text-[11px] text-[#6B7A99]">{documents.length} records</span>
              </div>
              <MedicalTimeline documents={documents} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Document Detail Snippet ──────────────────────────────────────────────────
function DocumentDetailSnippet({ doc }) {
  const extracted = doc.extracted || doc.extracted_json || {};
  const drugs = extracted.drug_names || [];
  const diags = extracted.diagnoses || [];

  return (
    <div className="space-y-1 text-[11px] text-[#6B7A99]">
      {diags.length > 0 && (
        <div>
          <span className="font-semibold text-[#1A2B4C]">Diagnoses: </span>
          <span>{diags.map((d) => (typeof d === 'string' ? d : d.name || d.diagnosis)).join(', ')}</span>
        </div>
      )}
      {drugs.length > 0 && (
        <div>
          <span className="font-semibold text-[#1A2B4C]">Medications: </span>
          <span>{drugs.map((d) => d.name).join(', ')}</span>
        </div>
      )}
    </div>
  );
}
