import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Move,
  RotateCcw,
  Save,
  Printer,
  Sparkles,
  Eye,
  Trash2,
  Layers,
  Info,
  Check,
  RefreshCw,
  Plus,
  Maximize2,
  Sliders,
  Edit3,
  Download,
  User,
  Calendar,
} from 'lucide-react';

const API_BASE = '/api';

const DEFAULT_FIELD_DEFINITIONS = [
  { id: 'patient_name', label: 'Patient Name', defaultX: 12, defaultY: 18.5, width: 35, height: 4.5, color: '#2F6FED', defaultSample: 'Patient Name' },
  { id: 'age_gender', label: 'Age & Gender', defaultX: 12, defaultY: 23.5, width: 25, height: 4, color: '#0EA5E9', defaultSample: '35 yrs / Male' },
  { id: 'doctor_name', label: 'Attending Doctor', defaultX: 62, defaultY: 18.5, width: 30, height: 4.5, color: '#2FAE60', defaultSample: 'Dr. Attending Physician' },
  { id: 'date', label: 'Prescription Date', defaultX: 62, defaultY: 23.5, width: 25, height: 4, color: '#F5A623', defaultSample: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
  { id: 'visit_id', label: 'Visit #', defaultX: 62, defaultY: 28, width: 20, height: 4, color: '#8B5CF6', defaultSample: 'Visit #1' },
  { id: 'diagnosis', label: 'Diagnosis / Impression', defaultX: 12, defaultY: 29, width: 45, height: 5, color: '#EC4899', defaultSample: 'Clinical Consultation' },
  { id: 'medicines_table', label: 'Medicines Table (Rx)', defaultX: 10, defaultY: 38, width: 80, height: 32, color: '#2F6FED', isTable: true },
  { id: 'advice', label: 'Dietary & Lifestyle Advice', defaultX: 10, defaultY: 76, width: 80, height: 6, color: '#64748B', defaultSample: 'Drink plenty of water and rest.' },
  { id: 'follow_up', label: 'Follow-Up Instructions', defaultX: 10, defaultY: 84, width: 80, height: 5, color: '#64748B', defaultSample: 'Review after 5 days if symptoms persist.' },
];

const DRAFT_STORAGE_KEY = 'predoc_letterhead_draft';

function getStoredDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraftToStorage(draft) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch (err) {
    console.warn('Could not save letterhead draft to sessionStorage:', err);
  }
}

function clearDraftFromStorage() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (err) {
    console.warn('Could not clear letterhead draft from sessionStorage:', err);
  }
}

export default function TemplateEditor({
  visitId: propVisitId = 1,
  currentUser,
  authToken,
  onAuthError,
}) {
  const initialDraft = getStoredDraft();

  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(() => initialDraft?.activeTemplateId || null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isDraft, setIsDraft] = useState(() => Boolean(initialDraft?.imageUrl));

  // Template Form / Layout State
  const [templateName, setTemplateName] = useState(() => initialDraft?.templateName || 'Hospital Letterhead');
  const [hospitalName, setHospitalName] = useState(() => initialDraft?.hospitalName || 'PreDoc Medical Center');
  const [imageUrl, setImageUrl] = useState(() => initialDraft?.imageUrl || '');
  const [imagePath, setImagePath] = useState(() => initialDraft?.imagePath || '');
  const [mimeType, setMimeType] = useState(() => initialDraft?.mimeType || 'image/png');
  const [pageSize, setPageSize] = useState(() => initialDraft?.pageSize || 'A4');
  const [isDefault, setIsDefault] = useState(() => initialDraft?.isDefault || false);
  const [fieldPositions, setFieldPositions] = useState(() => initialDraft?.fieldPositions || {});

  // Refs to avoid stale closures & unnecessary re-render triggers
  const onAuthErrorRef = useRef(onAuthError);
  useEffect(() => {
    onAuthErrorRef.current = onAuthError;
  }, [onAuthError]);

  const hasLoadedInitialTemplateRef = useRef(Boolean(initialDraft?.imageUrl));
  const isDraftRef = useRef(Boolean(initialDraft?.imageUrl));
  useEffect(() => {
    isDraftRef.current = isDraft;
  }, [isDraft]);

  const imageUrlRef = useRef(imageUrl);
  useEffect(() => {
    imageUrlRef.current = imageUrl;
  }, [imageUrl]);

  // Editor Interaction State
  const [draggingField, setDraggingField] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [previewMode, setPreviewMode] = useState(false);
  const [activeFieldTab, setActiveFieldTab] = useState(null);

  // Real Data & Live Editing State
  const [allVisits, setAllVisits] = useState([]);
  const [selectedVisitId, setSelectedVisitId] = useState(propVisitId || 1);
  const [realDataFetched, setRealDataFetched] = useState(null);
  const [liveValues, setLiveValues] = useState({
    patient_name: 'Patient',
    patient_age: '',
    patient_gender: '',
    age_gender: '',
    doctor_name: 'Dr. Attending Physician',
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    visit_number: `Visit #${propVisitId || 1}`,
    diagnosis: '',
    advice: '',
    follow_up: '',
    medicines: [],
  });

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sync draft to sessionStorage whenever changes occur if in draft mode
  const syncDraft = useCallback((overrides = {}) => {
    const draftPayload = {
      templateName,
      hospitalName,
      imageUrl,
      imagePath,
      mimeType,
      pageSize,
      isDefault,
      fieldPositions,
      activeTemplateId,
      ...overrides,
    };
    if (draftPayload.imageUrl) {
      saveDraftToStorage(draftPayload);
      setIsDraft(true);
    }
  }, [templateName, hospitalName, imageUrl, imagePath, mimeType, pageSize, isDefault, fieldPositions, activeTemplateId]);

  // Helper for auth headers
  const getAuthHeaders = useCallback((extra = {}) => ({
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...extra,
  }), [authToken]);

  // ── Load Templates on Mount ────────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await fetch(`${API_BASE}/templates`, { headers: getAuthHeaders() });
      if (res.status === 401 && onAuthErrorRef.current) {
        onAuthErrorRef.current();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setTemplates(data || []);
        // Only populate editor from server if no draft exists and nothing has been loaded yet
        if (!hasLoadedInitialTemplateRef.current && !isDraftRef.current && !imageUrlRef.current) {
          hasLoadedInitialTemplateRef.current = true;
          if (data && data.length > 0) {
            const def = data.find((t) => t.is_default) || data[0];
            loadTemplateIntoEditor(def, false);
          } else {
            resetToNewTemplate(false);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
      setErrorMsg('Failed to load letterhead templates.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // ── Load Visits List ───────────────────────────────────────────────────────
  useEffect(() => {
    async function loadVisits() {
      try {
        const res = await fetch(`${API_BASE}/visits`, { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setAllVisits(data || []);
        }
      } catch (err) {
        console.warn('Could not load visits list in TemplateEditor:', err);
      }
    }
    loadVisits();
  }, [getAuthHeaders]);

  useEffect(() => {
    if (propVisitId) {
      setSelectedVisitId(Number(propVisitId));
    }
  }, [propVisitId]);

  // ── Fetch Real Clinical Data for Active Visit ──────────────────────────────
  const fetchRealVisitData = useCallback(async (vid) => {
    if (!vid) return;
    try {
      const [caseRes, rxRes] = await Promise.all([
        fetch(`${API_BASE}/visits/${vid}/case`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/prescriptions/visit/${vid}`, { headers: getAuthHeaders() }),
      ]);

      let patientName = 'Patient';
      let patientAge = '';
      let patientGender = '';
      let docName = 'Dr. Attending Physician';
      let diagnosis = '';
      let advice = '';
      let followUp = '';
      let medicines = [];

      // Determine logged in doctor's name
      if (currentUser?.name && currentUser.name.trim()) {
        docName = currentUser.name.startsWith('Dr.') ? currentUser.name : `Dr. ${currentUser.name}`;
      } else if (currentUser?.username) {
        const clean = currentUser.username.replace('_demo', '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        docName = `Dr. ${clean}`;
      }

      if (caseRes.ok) {
        const caseData = await caseRes.json();
        if (caseData?.patient?.name && caseData.patient.name !== 'Patient') {
          patientName = caseData.patient.name;
        }
        if (caseData?.patient?.age) {
          patientAge = String(caseData.patient.age);
        }
        if (caseData?.patient?.gender) {
          patientGender = caseData.patient.gender;
        }
        if (caseData?.approved_by && caseData.approved_by !== 'Dr. Physician' && !currentUser?.name) {
          docName = caseData.approved_by;
        }
      }

      if (rxRes.ok) {
        const rxData = await rxRes.json();
        if (rxData) {
          if (rxData.diagnosis) diagnosis = rxData.diagnosis;
          if (rxData.general_advice) advice = rxData.general_advice;
          if (rxData.follow_up) followUp = rxData.follow_up;
          if (Array.isArray(rxData.medicines) && rxData.medicines.length > 0) {
            medicines = rxData.medicines;
          }
          if (rxData.doctor_name && rxData.doctor_name !== 'Dr. Attending Physician' && !currentUser?.name) {
            docName = rxData.doctor_name;
          }
        }
      }

      const ageGenderFormatted = patientAge
        ? `${patientAge} yrs${patientGender ? ` / ${patientGender}` : ''}`
        : (patientGender || '');

      const formattedDate = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      const populated = {
        patient_name: patientName,
        patient_age: patientAge,
        patient_gender: patientGender,
        age_gender: ageGenderFormatted,
        doctor_name: docName,
        date: formattedDate,
        visit_number: `Visit #${vid}`,
        diagnosis: diagnosis || 'Clinical Consultation & Evaluation',
        advice: advice || 'Hydrate well with 2–3 liters of water daily. Take medicines as prescribed.',
        follow_up: followUp || 'Review after 5 days if symptoms persist.',
        medicines: medicines.length > 0 ? medicines : [
          {
            name: 'Amoxicillin 500mg',
            composition: 'Amoxicillin Trihydrate',
            dosage: '500mg (1 cap)',
            frequency: '1-0-1 (Twice daily)',
            duration: '5 days',
            instructions: 'After food',
          },
          {
            name: 'Paracetamol 650mg',
            composition: 'Acetaminophen',
            dosage: '650mg (1 tab)',
            frequency: 'SOS (As needed)',
            duration: '3 days',
            instructions: 'With plenty of water',
          },
        ],
      };

      setRealDataFetched(populated);
      setLiveValues(populated);
    } catch (err) {
      console.error('Error fetching real visit data for template editor:', err);
    }
  }, [getAuthHeaders, currentUser]);

  useEffect(() => {
    if (selectedVisitId) {
      fetchRealVisitData(selectedVisitId);
    }
  }, [selectedVisitId, fetchRealVisitData]);

  const loadTemplateIntoEditor = (tmpl, clearDraft = true) => {
    if (!tmpl) return;
    if (clearDraft) {
      clearDraftFromStorage();
      setIsDraft(false);
    }
    hasLoadedInitialTemplateRef.current = true;
    setSelectedTemplate(tmpl);
    setActiveTemplateId(tmpl.id);
    setTemplateName(tmpl.name || 'Hospital Letterhead');
    setHospitalName(tmpl.hospital_name || 'PreDoc Medical Center');
    setImageUrl(tmpl.template_file_url || tmpl.preview_image_url || '');
    setImagePath(tmpl.template_file_path || '');
    setMimeType(tmpl.mime_type || 'image/png');
    setPageSize(tmpl.page_size || 'A4');
    setIsDefault(Boolean(tmpl.is_default));
    setFieldPositions(tmpl.field_positions_json || {});
    setSaveSuccess(false);
  };

  const resetToNewTemplate = (clearDraft = true) => {
    if (clearDraft) {
      clearDraftFromStorage();
      setIsDraft(false);
    }
    hasLoadedInitialTemplateRef.current = true;
    setSelectedTemplate(null);
    setActiveTemplateId(null);
    setTemplateName('Hospital Letterhead');
    setHospitalName('PreDoc Medical Center');
    setImageUrl('');
    setImagePath('');
    setMimeType('image/png');
    setPageSize('A4');
    setIsDefault(templates.length === 0);

    const initialPositions = {};
    DEFAULT_FIELD_DEFINITIONS.forEach((f) => {
      initialPositions[f.id] = {
        x: f.defaultX,
        y: f.defaultY,
        width: f.width,
        height: f.height,
        fontSize: f.isTable ? 9.0 : 10.5,
        fontColor: '#1A2B4C',
        label: f.label,
      };
    });
    setFieldPositions(initialPositions);
    setSaveSuccess(false);
  };

  // ── File Upload Handler ────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setErrorMsg(null);
      const formData = new FormData();
      formData.append('file', file);

      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${API_BASE}/templates/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await res.json();
      
      const newImageUrl = data.file_url;
      const newImagePath = data.file_path;
      const newMimeType = data.mime_type;
      const newPositions = (!selectedTemplate && data.default_field_positions) 
        ? data.default_field_positions 
        : (Object.keys(fieldPositions).length > 0 ? fieldPositions : data.default_field_positions);

      let newTmplName = templateName;
      if (!templateName || templateName === 'Hospital Letterhead') {
        const cleanBase = (data.original_filename || 'Letterhead').replace(/\.[^/.]+$/, '');
        newTmplName = `${cleanBase} Template`;
      }

      setImageUrl(newImageUrl);
      setImagePath(newImagePath);
      setMimeType(newMimeType);
      setFieldPositions(newPositions);
      setTemplateName(newTmplName);
      setIsDraft(true);
      hasLoadedInitialTemplateRef.current = true;

      // Persist draft immediately into sessionStorage
      saveDraftToStorage({
        templateName: newTmplName,
        hospitalName,
        imageUrl: newImageUrl,
        imagePath: newImagePath,
        mimeType: newMimeType,
        pageSize,
        isDefault,
        fieldPositions: newPositions,
        activeTemplateId,
      });

    } catch (err) {
      console.error('File upload error:', err);
      setErrorMsg(err.message || 'Failed to upload letterhead file.');
    } finally {
      setUploading(false);
    }
  };

  // ── Drag and Drop Position Logic ──────────────────────────────────────────
  const handleMouseDown = (e, fieldId) => {
    if (previewMode) return;
    e.preventDefault();
    e.stopPropagation();

    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const currentPos = fieldPositions[fieldId] || { x: 10, y: 10 };

    const mouseX = ((e.clientX - canvasRect.left) / canvasRect.width) * 100;
    const mouseY = ((e.clientY - canvasRect.top) / canvasRect.height) * 100;

    setDraggingField(fieldId);
    setDragOffset({
      x: mouseX - currentPos.x,
      y: mouseY - currentPos.y,
    });
    setActiveFieldTab(fieldId);
  };

  const handleMouseMove = (e) => {
    if (!draggingField || !canvasRef.current || previewMode) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - canvasRect.left) / canvasRect.width) * 100;
    const mouseY = ((e.clientY - canvasRect.top) / canvasRect.height) * 100;

    let newX = Math.round((mouseX - dragOffset.x) * 10) / 10;
    let newY = Math.round((mouseY - dragOffset.y) * 10) / 10;

    newX = Math.max(1, Math.min(95, newX));
    newY = Math.max(1, Math.min(95, newY));

    setFieldPositions((prev) => ({
      ...prev,
      [draggingField]: {
        ...(prev[draggingField] || {}),
        x: newX,
        y: newY,
      },
    }));
  };

  const handleMouseUp = () => {
    if (draggingField) {
      setDraggingField(null);
    }
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingField, dragOffset]);

  // ── Save Template Handler ──────────────────────────────────────────────────
  const handleSaveTemplate = async () => {
    if (!imageUrl) {
      setErrorMsg('Please upload a letterhead image or PDF before saving.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      setSaveSuccess(false);

      const payload = {
        name: templateName.trim() || 'Hospital Letterhead',
        hospital_name: hospitalName.trim() || 'PreDoc Medical Center',
        template_file_url: imageUrl,
        template_file_path: imagePath,
        preview_image_url: imageUrl,
        mime_type: mimeType,
        page_size: pageSize,
        field_positions_json: fieldPositions,
        is_default: isDefault,
      };

      let res;
      if (activeTemplateId) {
        res = await fetch(`${API_BASE}/templates/${activeTemplateId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE}/templates`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to save template.');
      }

      const savedData = await res.json();
      setSaveSuccess(true);
      clearDraftFromStorage();
      setIsDraft(false);
      fetchTemplates();
      setSelectedTemplate(savedData);
      setActiveTemplateId(savedData.id);
    } catch (err) {
      console.error('Save template error:', err);
      setErrorMsg(err.message || 'Error saving template.');
    } finally {
      setSaving(false);
    }
  };

  // ── Set Active Default ─────────────────────────────────────────────────────
  const handleSetDefault = async (tmplId) => {
    try {
      const res = await fetch(`${API_BASE}/templates/${tmplId}/set-default`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        fetchTemplates();
      }
    } catch (err) {
      console.error('Set default error:', err);
    }
  };

  // ── Delete Template ────────────────────────────────────────────────────────
  const handleDeleteTemplate = async (tmplId) => {
    if (!window.confirm('Are you sure you want to delete this prescription template?')) return;
    try {
      const res = await fetch(`${API_BASE}/templates/${tmplId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        fetchTemplates();
      }
    } catch (err) {
      console.error('Delete template error:', err);
    }
  };

  // ── Reset Layout Positions to Default ─────────────────────────────────────
  const handleResetPositions = () => {
    const initialPositions = {};
    DEFAULT_FIELD_DEFINITIONS.forEach((f) => {
      initialPositions[f.id] = {
        x: f.defaultX,
        y: f.defaultY,
        width: f.width,
        height: f.height,
        fontSize: f.isTable ? 9.0 : 10.5,
        fontColor: '#1A2B4C',
        label: f.label,
      };
    });
    setFieldPositions(initialPositions);
  };

  // ── Reset Live Values to Original Fetched Data ────────────────────────────
  const handleResetLiveValues = () => {
    if (realDataFetched) {
      setLiveValues({ ...realDataFetched });
    }
  };

  // ── Live Editing Field Value Updaters ──────────────────────────────────────
  const handleLiveValueChange = (fieldKey, value) => {
    setLiveValues((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const handleLiveMedicineChange = (index, key, value) => {
    setLiveValues((prev) => {
      const updated = [...(prev.medicines || [])];
      if (updated[index]) {
        updated[index] = { ...updated[index], [key]: value };
      }
      return { ...prev, medicines: updated };
    });
  };

  const handleAddLiveMedicineRow = () => {
    setLiveValues((prev) => ({
      ...prev,
      medicines: [
        ...(prev.medicines || []),
        {
          name: 'New Medicine',
          composition: '',
          dosage: '1 tablet',
          frequency: '1-0-1',
          duration: '5 days',
          instructions: 'After food',
        },
      ],
    }));
  };

  const handleDeleteLiveMedicineRow = (index) => {
    setLiveValues((prev) => {
      const updated = [...(prev.medicines || [])];
      updated.splice(index, 1);
      return { ...prev, medicines: updated };
    });
  };

  // ── Print PDF with Live Real Values & Doctor Overrides ─────────────────────
  const handlePrintPrescription = async () => {
    try {
      setPrinting(true);
      setErrorMsg(null);

      const payload = {
        template_id: activeTemplateId || (selectedTemplate?.id || null),
        visit_id: selectedVisitId,
        patient_name: liveValues.patient_name,
        patient_age: liveValues.patient_age,
        patient_gender: liveValues.patient_gender,
        doctor_name: liveValues.doctor_name,
        date: liveValues.date,
        visit_number: liveValues.visit_number,
        diagnosis: liveValues.diagnosis,
        general_advice: liveValues.advice,
        follow_up: liveValues.follow_up,
        medicines: liveValues.medicines,
      };

      const res = await fetch(`${API_BASE}/prescriptions/print`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Could not generate prescription PDF');
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const newTab = window.open(blobUrl, '_blank');
      if (!newTab) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `Prescription_Visit_${selectedVisitId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Print custom prescription failed:', err);
      setErrorMsg(err.message || 'Failed to print prescription PDF.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="p-6 sm:p-7 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-8 h-8 rounded-xl bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center font-bold text-sm shadow-xs">
              <Layers className="w-4 h-4" />
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-[#1A2B4C] tracking-tight">
              Prescription Letterhead & Template Editor
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#6B7A99]">
            Upload your hospital&apos;s prescription letterhead, adjust placeholders, and preview/edit live clinical data before printing.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Visit Selector for Live Preview & Print */}
          {allVisits.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC]">
              <User className="w-3.5 h-3.5 text-[#2F6FED]" />
              <select
                aria-label="Select consultation visit for live preview"
                value={selectedVisitId}
                onChange={(e) => setSelectedVisitId(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-[#1A2B4C] focus:outline-none cursor-pointer"
              >
                {allVisits.map((v) => (
                  <option key={v.visit_id || v.id} value={v.visit_id || v.id}>
                    Visit #{v.visit_id || v.id} — {v.patient_name || 'Patient'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isDraft && (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FEF6E9] text-[#F5A623] border border-[#F5A623]/30 flex items-center gap-1.5 shadow-xs animate-pulse">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Draft (Unsaved)</span>
              </span>
              <button
                type="button"
                onClick={() => resetToNewTemplate(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E5484D]/30 bg-[#FEECEE] hover:bg-[#E5484D] text-[#E5484D] hover:text-white text-xs font-bold transition shadow-xs"
                title="Discard current unsaved draft"
              >
                <Trash2 className="w-3 h-3" />
                <span>Discard Draft</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => resetToNewTemplate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#EAF1FF] text-[#1A2B4C] hover:text-[#2F6FED] text-xs font-bold transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Letterhead</span>
          </button>

          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={saving || !imageUrl}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-extrabold transition shadow-md hover:shadow-lg disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saving ? 'Saving...' : saveSuccess ? '✓ Saved!' : 'Save Template'}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-[#FEECEE] border border-[#E5484D]/30 text-[#E5484D] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Left Controls (4 cols), Right Visual Canvas (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template Config & Field Coordinates */}
        <div className="lg:col-span-4 space-y-6">
          {/* Template Selector List */}
          <div className="p-5 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft space-y-3">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#6B7A99] flex items-center justify-between">
              <span>Saved Templates ({templates.length})</span>
              {loading && <RefreshCw className="w-3 h-3 animate-spin text-[#2F6FED]" />}
            </h3>

            {templates.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-dashed border-[#CBD5E1] text-center text-xs text-[#94A3B8]">
                No templates saved yet. Upload a letterhead to create your first template.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {templates.map((t) => {
                  const isSelected = activeTemplateId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => loadTemplateIntoEditor(t)}
                      className={`p-3 rounded-2xl border text-xs cursor-pointer transition flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-[#EAF1FF] border-[#2F6FED] text-[#1A2B4C] font-bold shadow-xs'
                          : 'bg-[#F8FAFC] border-[#E2E8F4] text-[#475569] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{t.name}</span>
                          {t.is_default && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-[#EAF7EE] text-[#2FAE60]">
                              Default
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#94A3B8] block truncate">
                          {t.hospital_name || 'Hospital Template'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {!t.is_default && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetDefault(t.id);
                            }}
                            className="p-1 rounded-lg text-[#64748B] hover:text-[#2FAE60] hover:bg-[#EAF7EE]"
                            title="Set as active default"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(t.id);
                          }}
                          className="p-1 rounded-lg text-[#64748B] hover:text-[#E5484D] hover:bg-[#FEECEE]"
                          title="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Letterhead Upload Panel */}
          <div className="p-5 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft space-y-4">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#6B7A99]">
              Letterhead File Upload
            </h3>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-6 rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#EAF1FF]/40 hover:border-[#2F6FED] transition cursor-pointer text-center space-y-2 group"
            >
              <div className="w-10 h-10 rounded-full bg-white shadow-xs mx-auto flex items-center justify-center text-[#2F6FED] group-hover:scale-110 transition">
                {uploading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Upload className="w-5 h-5" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-[#1A2B4C]">
                  {uploading ? 'Uploading Letterhead...' : imageUrl ? 'Replace Letterhead File' : 'Click to Upload Letterhead'}
                </p>
                <p className="text-[10px] text-[#94A3B8]">PNG, JPG, WebP, or 1-page PDF</p>
              </div>
            </div>

            {/* Template Info Inputs */}
            <div className="space-y-3 pt-2 border-t border-[#E2E8F4]">
              <div>
                <label className="block text-[11px] font-bold text-[#6B7A99] mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTemplateName(val);
                    syncDraft({ templateName: val });
                  }}
                  placeholder="e.g. Apollo Hospital Official Letterhead"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A2B4C]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#6B7A99] mb-1">
                  Hospital / Clinic Name
                </label>
                <input
                  type="text"
                  value={hospitalName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHospitalName(val);
                    syncDraft({ hospitalName: val });
                  }}
                  placeholder="e.g. City General Hospital"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A2B4C]"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="text-xs font-bold text-[#1A2B4C] flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setIsDefault(val);
                      syncDraft({ isDefault: val });
                    }}
                    className="w-4 h-4 rounded text-[#2F6FED] focus:ring-[#2F6FED]"
                  />
                  <span>Set as default letterhead</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    handleResetPositions();
                    syncDraft();
                  }}
                  className="text-[11px] font-bold text-[#64748B] hover:text-[#2F6FED] flex items-center gap-1"
                  title="Reset placeholders to standard positions"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Layout</span>
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Field Position List */}
          <div className="p-5 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#6B7A99]">
                Dynamic Placeholders
              </h3>
              <span className="text-[10px] text-[#94A3B8]">
                {previewMode ? 'Live values active' : 'Drag boxes to reposition'}
              </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {DEFAULT_FIELD_DEFINITIONS.map((f) => {
                const pos = fieldPositions[f.id] || { x: f.defaultX, y: f.defaultY };
                const isActive = activeFieldTab === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFieldTab(f.id)}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition ${
                      isActive
                        ? 'bg-[#EAF1FF] border-[#2F6FED]'
                        : 'bg-[#F8FAFC] border-[#E2E8F4] hover:border-[#CBD5E1]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="font-bold text-[#1A2B4C] text-[11px] truncate">
                        {f.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-[#64748B] font-mono">
                      <span>X:{pos.x}%</span>
                      <span>Y:{pos.y}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Visual Interactive Canvas (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Canvas Controls Toolbar */}
          <div className="p-4 rounded-2xl bg-white border border-[#E2E8F4] shadow-soft flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode(false)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  !previewMode
                    ? 'bg-[#2F6FED] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#6B7A99] hover:text-[#1A2B4C]'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>Coordinate Editor</span>
              </button>

              <button
                type="button"
                onClick={() => setPreviewMode(true)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  previewMode
                    ? 'bg-[#2F6FED] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#6B7A99] hover:text-[#1A2B4C]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Live Rx Preview</span>
              </button>
            </div>

            {/* Live Rx Mode Actions */}
            {previewMode ? (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleResetLiveValues}
                  className="px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#EAF1FF] text-[#6B7A99] hover:text-[#2F6FED] text-xs font-bold transition flex items-center gap-1"
                  title="Reset any edits back to auto-filled intake record"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Overrides</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintPrescription}
                  disabled={printing}
                  className="px-4 py-2 rounded-xl bg-[#2FAE60] hover:bg-[#258d4e] text-white text-xs font-extrabold transition shadow-md flex items-center gap-1.5 disabled:opacity-50"
                  title="Generate print-ready PDF with real data and custom overrides"
                >
                  {printing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Printer className="w-3.5 h-3.5" />
                  )}
                  <span>{printing ? 'Generating PDF...' : 'Print Letterhead Prescription'}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
                <span className="px-2.5 py-1 rounded-md bg-[#F1F5F9] font-mono font-semibold">
                  Paper: A4 (Portrait)
                </span>
              </div>
            )}
          </div>

          {previewMode && (
            <div className="p-3 bg-[#EAF7EE] border border-[#2FAE60]/30 rounded-2xl text-[#2FAE60] text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 flex-shrink-0 text-[#2FAE60]" />
                <span className="font-medium">
                  <strong>Doctor Override Mode:</strong> Real intake values are auto-filled below. You can click and edit any field (name, date, medicines) directly before printing.
                </span>
              </div>
            </div>
          )}

          {/* Interactive Visual Canvas with A4 Aspect Ratio */}
          <div className="p-4 sm:p-6 rounded-3xl bg-[#CBD5E1]/30 border border-[#CBD5E1] flex justify-center items-center overflow-x-auto">
            <div
              ref={canvasRef}
              id="prescription-template-canvas"
              style={{
                width: '100%',
                maxWidth: '620px',
                aspectRatio: '1 / 1.414', // Exact A4 aspect ratio (595 / 842)
                position: 'relative',
              }}
              className="bg-white rounded-xl shadow-2xl border border-[#94A3B8] overflow-hidden select-none"
            >
              {/* Letterhead Background Layer */}
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Hospital Letterhead"
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-[#94A3B8] bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9]">
                  <div className="p-4 rounded-full bg-white shadow-sm mb-3">
                    <FileText className="w-10 h-10 text-[#CBD5E1]" />
                  </div>
                  <h4 className="font-extrabold text-sm text-[#475569]">No Letterhead Uploaded</h4>
                  <p className="text-xs text-[#94A3B8] max-w-xs mt-1">
                    Upload your hospital&apos;s header & footer letterhead image on the left to see it here.
                  </p>
                </div>
              )}

              {/* Dynamic Field Placeholders / Live Overlays */}
              {DEFAULT_FIELD_DEFINITIONS.map((field) => {
                const pos = fieldPositions[field.id] || {
                  x: field.defaultX,
                  y: field.defaultY,
                  width: field.width,
                  height: field.height,
                };
                const isDragging = draggingField === field.id;
                const isTable = field.isTable;

                if (previewMode) {
                  // Live Realistic Print Preview Mode with Inline Doctor Editing
                  if (isTable) {
                    const meds = liveValues.medicines || [];
                    return (
                      <div
                        key={field.id}
                        style={{
                          position: 'absolute',
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                          width: `${pos.width || 80}%`,
                        }}
                        className="bg-white/95 backdrop-blur-xs rounded-md border border-[#CBD5E1] p-2 text-[10px] space-y-1.5 shadow-sm select-text"
                      >
                        <div className="font-bold text-[#1A2B4C] pb-1 border-b border-[#CBD5E1] flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <span>Prescribed Medications</span>
                            <span className="text-[9px] font-normal text-[#64748B]">({meds.length} items)</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleAddLiveMedicineRow}
                              className="px-1.5 py-0.5 rounded bg-[#EAF1FF] text-[#2F6FED] hover:bg-[#2F6FED] hover:text-white text-[9px] font-bold transition flex items-center gap-0.5"
                              title="Add medicine row"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>Add Rx</span>
                            </button>
                            <span className="font-serif italic font-black text-[#2F6FED]">℞</span>
                          </div>
                        </div>

                        {meds.length === 0 ? (
                          <div className="p-2 text-center text-[#94A3B8] italic text-[9px]">
                            No medications added. Click &quot;+ Add Rx&quot; to prescribe.
                          </div>
                        ) : (
                          <div className="space-y-1 text-[9px] max-h-48 overflow-y-auto pr-0.5">
                            {meds.map((m, idx) => (
                              <div
                                key={idx}
                                className="p-1 rounded bg-[#F8FAFC] border border-[#E2E8F4] flex items-center justify-between gap-1 group/row"
                              >
                                <div className="flex-1 min-w-0 grid grid-cols-12 gap-1 items-center">
                                  <div className="col-span-6 flex items-center gap-1">
                                    <span className="font-bold text-[#64748B] text-[8px]">{idx + 1}.</span>
                                    <input
                                      type="text"
                                      value={m.name || ''}
                                      onChange={(e) => handleLiveMedicineChange(idx, 'name', e.target.value)}
                                      placeholder="Medicine name"
                                      className="w-full font-bold text-[#1A2B4C] bg-transparent border-b border-transparent hover:border-[#CBD5E1] focus:border-[#2F6FED] focus:outline-none truncate text-[9px]"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <input
                                      type="text"
                                      value={m.dosage || ''}
                                      onChange={(e) => handleLiveMedicineChange(idx, 'dosage', e.target.value)}
                                      placeholder="Dosage"
                                      className="w-full text-[#475569] bg-transparent border-b border-transparent hover:border-[#CBD5E1] focus:border-[#2F6FED] focus:outline-none text-[8.5px]"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <input
                                      type="text"
                                      value={m.frequency || ''}
                                      onChange={(e) => handleLiveMedicineChange(idx, 'frequency', e.target.value)}
                                      placeholder="Frequency"
                                      className="w-full font-mono text-[#2F6FED] bg-transparent border-b border-transparent hover:border-[#CBD5E1] focus:border-[#2F6FED] focus:outline-none text-[8.5px]"
                                    />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLiveMedicineRow(idx)}
                                  className="text-[#94A3B8] hover:text-[#E5484D] p-0.5 rounded transition opacity-60 hover:opacity-100"
                                  title="Remove medicine"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Field mapping for real live values
                  let val = '';
                  let changeHandler = (v) => {};

                  if (field.id === 'patient_name') {
                    val = liveValues.patient_name;
                    changeHandler = (v) => handleLiveValueChange('patient_name', v);
                  } else if (field.id === 'age_gender') {
                    val = liveValues.age_gender || (liveValues.patient_age ? `${liveValues.patient_age} yrs` : '');
                    changeHandler = (v) => handleLiveValueChange('age_gender', v);
                  } else if (field.id === 'doctor_name') {
                    val = liveValues.doctor_name;
                    changeHandler = (v) => handleLiveValueChange('doctor_name', v);
                  } else if (field.id === 'date') {
                    val = liveValues.date;
                    changeHandler = (v) => handleLiveValueChange('date', v);
                  } else if (field.id === 'visit_id') {
                    val = liveValues.visit_number;
                    changeHandler = (v) => handleLiveValueChange('visit_number', v);
                  } else if (field.id === 'diagnosis') {
                    val = liveValues.diagnosis;
                    changeHandler = (v) => handleLiveValueChange('diagnosis', v);
                  } else if (field.id === 'advice') {
                    val = liveValues.advice;
                    changeHandler = (v) => handleLiveValueChange('advice', v);
                  } else if (field.id === 'follow_up') {
                    val = liveValues.follow_up;
                    changeHandler = (v) => handleLiveValueChange('follow_up', v);
                  } else {
                    val = field.defaultSample;
                  }

                  const isMultiLine = field.id === 'advice' || field.id === 'follow_up' || field.id === 'diagnosis';

                  return (
                    <div
                      key={field.id}
                      style={{
                        position: 'absolute',
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        width: `${pos.width || 35}%`,
                      }}
                      className="text-[#1A2B4C] text-[10px] leading-tight select-text"
                    >
                      {isMultiLine ? (
                        <textarea
                          rows={2}
                          value={val || ''}
                          onChange={(e) => changeHandler(e.target.value)}
                          className="w-full bg-white/90 hover:bg-white focus:bg-white backdrop-blur-xs px-1.5 py-0.5 rounded border border-transparent hover:border-[#CBD5E1] focus:border-[#2F6FED] focus:outline-none text-[9.5px] resize-none font-medium transition"
                          placeholder={`Enter ${field.label}...`}
                        />
                      ) : (
                        <input
                          type="text"
                          value={val || ''}
                          onChange={(e) => changeHandler(e.target.value)}
                          className="w-full bg-white/90 hover:bg-white focus:bg-white backdrop-blur-xs px-1.5 py-0.5 rounded border border-transparent hover:border-[#CBD5E1] focus:border-[#2F6FED] focus:outline-none font-bold text-[10px] truncate transition"
                          placeholder={`Enter ${field.label}...`}
                        />
                      )}
                    </div>
                  );
                }

                // Coordinate Editor Wireframe Mode (Draggable Boxes)
                return (
                  <div
                    key={field.id}
                    onMouseDown={(e) => handleMouseDown(e, field.id)}
                    style={{
                      position: 'absolute',
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      width: `${pos.width || (isTable ? 80 : 30)}%`,
                      minHeight: isTable ? '18%' : '3.8%',
                      borderColor: field.color,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      zIndex: isDragging ? 30 : 10,
                    }}
                    className={`rounded-lg border-2 bg-white/90 backdrop-blur-xs p-1.5 text-[9px] shadow-sm flex flex-col justify-between transition-shadow select-none group ${
                      isDragging ? 'ring-2 ring-[#2F6FED] shadow-lg' : 'hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <Move className="w-2.5 h-2.5 text-[#64748B] flex-shrink-0" />
                        <span className="font-extrabold truncate" style={{ color: field.color }}>
                          {field.label}
                        </span>
                      </div>
                      <span className="text-[8px] font-mono font-bold text-[#94A3B8]">
                        {pos.x}%, {pos.y}%
                      </span>
                    </div>

                    {isTable && (
                      <div className="mt-1 p-1 rounded bg-[#F8FAFC] border border-dashed border-[#CBD5E1] text-[8px] text-[#64748B] text-center">
                        Medicines Table (Auto-expands downwards)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
