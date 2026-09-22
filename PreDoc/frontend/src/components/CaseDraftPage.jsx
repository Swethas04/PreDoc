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
} from 'lucide-react';

const API_BASE = '/api';

export default function CaseDraftPage({
  visitId: propVisitId,
  onBack,
  onNavigateVisit,
  onBackToDoctorQueue,
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
      const res = await fetch(`${API_BASE}/visits`);
      if (res.ok) {
        const data = await res.json();
        setAllVisits(data);
      }
    } catch (err) {
      console.warn('Could not load visits list:', err);
    }
  }, []);

  const fetchCaseContext = useCallback(async (vid) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/visits/${vid}/case`);
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

      if (data.draft?.content?.subjective?.length > 0) {
        const first = data.draft.content.subjective[0];
        setSelectedFactKey('subjective-0');
        setActiveSource(first.source);
      }
    } catch (err) {
      setError(err.message || 'Error loading case details');
    } finally {
      setLoading(false);
    }
  }, []);

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
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Generation failed (HTTP ${res.status})`);
      }
      const draftResult = await res.json();
      setSuccessMessage('✨ SOAP case draft generated with grounded citations.');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editContent,
        }),
      });

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_name: 'Dr. Attending Physician',
          final_notes: editContent ? JSON.stringify(editContent) : undefined,
        }),
      });

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
      '',
      '=== SUBJECTIVE (S) ===',
      ...(c.subjective || []).map((f) => `• ${f.fact}`),
      '',
      '=== OBJECTIVE (O) ===',
      ...(c.objective || []).map((f) => `• ${f.fact}`),
      '',
      '=== ASSESSMENT (A) ===',
      ...(c.assessment || []).map((f) => `• ${f.fact}`),
      '',
      '=== PLAN (P) ===',
      ...(c.plan || []).map((f) => `• ${f.fact}`),
    ];

    if (c.clinical_summary) {
      textLines.splice(3, 0, `SUMMARY: ${c.clinical_summary}`, '');
    }

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
              {caseData?.patient?.name ? caseData.patient.name.charAt(0).toUpperCase() : 'P'}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A2B4C] tracking-tight">
                  {caseData?.patient?.name || (loading ? 'Loading patient chart...' : 'Patient Consultation')}
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
                {caseData?.approved_by && (
                  <>
                    <span>•</span>
                    <span className="text-[#2FAE60] font-medium">Approved by: {caseData.approved_by}</span>
                  </>
                )}
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
                  <option key={v.visit_id} value={v.visit_id}>
                    Visit #{v.visit_id} - {v.patient_name} {v.is_approved ? '✓ Approved' : '(Pending)'}
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

          {/* Individual SOAP Section Cards */}
          {draft && (
            <div className="space-y-5">
              <SOAPCard
                title="Subjective (S)"
                subtitle="Patient-reported symptoms, timeline, chief complaint & medical history"
                icon={Mic}
                items={draft.subjective || []}
                sectionKey="subjective"
                selectedFactKey={selectedFactKey}
                onSelectFact={handleFactClick}
                isMatched={isFactMatchedByFilter}
                isEditing={isEditing}
                onItemChange={handleItemChange}
                onAddItem={handleAddItem}
                onDeleteItem={handleDeleteItem}
              />

              <SOAPCard
                title="Objective (O)"
                subtitle="Prescription records, lab measurements, vitals & documentary evidence"
                icon={Activity}
                items={draft.objective || []}
                sectionKey="objective"
                selectedFactKey={selectedFactKey}
                onSelectFact={handleFactClick}
                isMatched={isFactMatchedByFilter}
                isEditing={isEditing}
                onItemChange={handleItemChange}
                onAddItem={handleAddItem}
                onDeleteItem={handleDeleteItem}
              />

              <SOAPCard
                title="Assessment (A)"
                subtitle="Clinical impression, differential diagnoses & risk factors"
                icon={HeartPulse}
                items={draft.assessment || []}
                sectionKey="assessment"
                selectedFactKey={selectedFactKey}
                onSelectFact={handleFactClick}
                isMatched={isFactMatchedByFilter}
                isEditing={isEditing}
                onItemChange={handleItemChange}
                onAddItem={handleAddItem}
                onDeleteItem={handleDeleteItem}
              />

              <SOAPCard
                title="Plan (P)"
                subtitle="Medication reconciliation, diagnostic investigations & follow-up instructions"
                icon={ClipboardList}
                items={draft.plan || []}
                sectionKey="plan"
                selectedFactKey={selectedFactKey}
                onSelectFact={handleFactClick}
                isMatched={isFactMatchedByFilter}
                isEditing={isEditing}
                onItemChange={handleItemChange}
                onAddItem={handleAddItem}
                onDeleteItem={handleDeleteItem}
              />
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
                      <p className="text-[#6B7A99] text-xs italic">No prescription images uploaded.</p>
                    ) : (
                      documents.map((doc) => (
                        <div key={doc.id} className="p-4 rounded-2xl border border-[#E2E8F4] bg-[#F6F9FF] space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#1A2B4C] text-xs">{doc.filename}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EAF1FF] text-[#2F6FED] font-mono">Doc #{doc.id}</span>
                          </div>

                          {doc.image_base64 ? (
                            <div className="relative border border-[#E2E8F4] bg-white rounded-xl overflow-hidden">
                              <img
                                src={doc.image_base64}
                                alt={doc.filename}
                                className="w-full max-h-52 object-contain mx-auto"
                              />
                              <button
                                onClick={() => setExpandedImage(doc.image_base64)}
                                className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-white text-[#1A2B4C] border border-[#E2E8F4] text-[10px] font-bold shadow-sm"
                              >
                                View full
                              </button>
                            </div>
                          ) : (
                            <div className="p-4 bg-white border border-[#E2E8F4] rounded-xl text-center text-[#6B7A99]">
                              <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
                              <p className="text-[11px]">Preview not available</p>
                            </div>
                          )}

                          <DocumentDetailSnippet doc={doc} />
                        </div>
                      ))
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
                            const isHighlighted = activeSource?.type === 'document' && Number(activeSource.id) === doc.id;
                            return (
                              <div
                                key={doc.id}
                                ref={(el) => (docRefs.current[doc.id] = el)}
                                className={`p-3 rounded-xl border text-xs transition ${
                                  isHighlighted
                                    ? 'border-[#2F6FED] bg-[#EAF1FF]'
                                    : 'border-[#E2E8F4] bg-white'
                                }`}
                              >
                                <div className="flex items-center justify-between text-[10px] text-[#6B7A99] mb-1">
                                  <span className="font-bold text-[#1A2B4C]">{doc.filename}</span>
                                  <span className="font-mono">Doc #{doc.id}</span>
                                </div>
                                <DocumentDetailSnippet doc={doc} />
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

      {/* Fullscreen Image Lightbox Modal */}
      {expandedImage && (
        <div
          onClick={() => setExpandedImage(null)}
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white p-3 rounded-3xl border border-[#E2E8F4] shadow-2xl">
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white border border-[#E2E8F4] text-[#1A2B4C] shadow-sm hover:bg-[#F6F9FF]"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={expandedImage}
              alt="Expanded medical record"
              className="max-h-[85vh] object-contain mx-auto rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Individual SOAP Card Component ───────────────────────────────────────────
function SOAPCard({
  title,
  subtitle,
  icon: Icon,
  items = [],
  sectionKey,
  selectedFactKey,
  onSelectFact,
  isMatched,
  isEditing,
  onItemChange,
  onAddItem,
  onDeleteItem,
}) {
  return (
    <div className="rounded-2xl border border-[#E2E8F4] bg-white p-6 shadow-soft space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#1A2B4C]">{title}</h3>
            <p className="text-xs text-[#6B7A99]">{subtitle}</p>
          </div>
        </div>
        {isEditing && (
          <button
            type="button"
            onClick={() => onAddItem(sectionKey)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#EAF1FF] hover:bg-[#2F6FED] text-[#2F6FED] hover:text-white text-xs font-bold transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add fact
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[#6B7A99] italic">No items recorded in this section.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item, idx) => {
            const factKey = `${sectionKey}-${idx}`;
            const isSelected = selectedFactKey === factKey;
            const matched = isMatched(item);

            return (
              <div
                key={idx}
                onClick={() => !isEditing && onSelectFact(item, factKey)}
                className={`p-3.5 rounded-xl border transition cursor-pointer text-xs ${
                  isSelected
                    ? 'border-[#2F6FED] bg-[#EAF1FF] ring-2 ring-[#2F6FED]/20'
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
                      placeholder="Enter clinical fact..."
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
                    <p className="text-[#1A2B4C] text-xs leading-relaxed font-medium flex-1">
                      {item.fact}
                    </p>
                    {item.source && (
                      <span className="text-[10px] font-mono font-semibold text-[#2F6FED] bg-white px-2.5 py-0.5 rounded-full border border-[#E2E8F4] flex-shrink-0">
                        {item.source.type === 'turn' ? 'Transcript' : 'Doc'} #{item.source.id}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
