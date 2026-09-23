import React, { useState, useRef } from 'react';
import {
  Upload,
  Camera,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Tag,
  Calendar,
  Eye,
  X,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import CriticalTriageModal from './CriticalTriageModal';

const API_BASE = '/api';

export default function DocumentUpload({
  visitId,
  patientId,
  language = 'en',
  onDocumentExtracted,
  onDocumentUploaded,
  extractedDocs = [],
  documents = [],
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [labelInput, setLabelInput] = useState('');
  const [previewImage, setPreviewImage] = useState(null);
  const [criticalTriage, setCriticalTriage] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Merge legacy prop extractedDocs with documents
  const allDocs = documents.length > 0 ? documents : extractedDocs;

  const handleFile = async (file) => {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'application/pdf'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif|bmp|pdf)$/i)) {
      setError(
        language === 'hi'
          ? 'कृपया इमेज (JPG, PNG, WebP) या PDF फ़ाइल अपलोड करें।'
          : 'Please upload an image (JPEG, PNG, WebP) or PDF file.'
      );
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError(
        language === 'hi'
          ? 'फ़ाइल का साइज़ 20MB से कम होना चाहिए।'
          : 'File size exceeds 20MB limit.'
      );
      return;
    }

    setError(null);
    setUploading(true);

    const formData = new FormData();
    if (visitId) formData.append('visit_id', visitId);
    if (patientId) formData.append('patient_id', patientId);
    if (labelInput.trim()) formData.append('label', labelInput.trim());
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed with status ${res.status}`);
      }

      const data = await res.json();

      // Check for immediate emergency/critical condition detection
      if (data.is_emergency || data.triage_evaluation?.is_emergency) {
        setCriticalTriage(
          data.triage_evaluation || {
            is_emergency: true,
            triage_level: 'CRITICAL',
            urgency_score: 5,
            detected_red_flags: ['High risk prescription/condition detected'],
            clinical_rationale: 'Clinical emergency triggers detected in uploaded document.',
            patient_warning_message: 'Immediate emergency medical attention required.',
            recommended_department: 'Emergency Medicine',
          }
        );
      }

      if (onDocumentUploaded) {
        onDocumentUploaded(data);
      } else if (onDocumentExtracted) {
        onDocumentExtracted(data);
      }

      setLabelInput('');
    } catch (err) {
      console.error('Document upload error:', err);
      setError(err.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const handleLoadDemo = () => {
    // Generate a clean sample prescription svg as base64
    const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" fill="#FFFFFF">
      <rect width="600" height="400" rx="16" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2"/>
      <rect x="24" y="24" width="552" height="70" rx="8" fill="#EAF1FF"/>
      <text x="44" y="55" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2B4C">Apex Medical Clinic - Prescription</text>
      <text x="44" y="78" font-family="sans-serif" font-size="13" fill="#6B7A99">Dr. S. Sharma, MD (Internal Medicine) • Reg #MC-88492</text>
      <line x1="24" y1="110" x2="576" y2="110" stroke="#E2E8F4" stroke-width="1.5"/>
      <text x="44" y="145" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2F6FED">Rx (Active Medications):</text>
      <text x="44" y="175" font-family="sans-serif" font-size="14" fill="#1A2B4C">1. Tab. Metformin HCl 500mg — 1 tab BD after meals</text>
      <text x="44" y="205" font-family="sans-serif" font-size="14" fill="#1A2B4C">2. Tab. Telmisartan 40mg — 1 tab OD morning</text>
      <text x="44" y="235" font-family="sans-serif" font-size="14" fill="#1A2B4C">3. Tab. Atorvastatin 10mg — 1 tab HS bedtime</text>
      <line x1="24" y1="270" x2="576" y2="270" stroke="#E2E8F4" stroke-width="1.5"/>
      <text x="44" y="305" font-family="sans-serif" font-size="13" fill="#6B7A99">Clinical Notes: Fasting Blood Sugar 132 mg/dL, Blood Pressure 138/84 mmHg</text>
      <text x="44" y="330" font-family="sans-serif" font-size="13" fill="#6B7A99">Date: ${new Date().toLocaleDateString()} • Next Review: 3 Months</text>
    </svg>`;
    const sampleB64 = `data:image/svg+xml;base64,${btoa(sampleSvg)}`;

    const demoDoc = {
      id: Date.now(),
      document_id: Date.now(),
      visit_id: visitId || null,
      patient_id: patientId || 1,
      filename: 'Sample_Prescription_Rx.png',
      mime_type: 'image/svg+xml',
      label: labelInput.trim() || 'Prescription - Sample Demo',
      image_base64: sampleB64,
      created_at: new Date().toISOString(),
    };

    if (onDocumentUploaded) {
      onDocumentUploaded(demoDoc);
    } else if (onDocumentExtracted) {
      onDocumentExtracted(demoDoc);
    }
    setLabelInput('');
    setError(null);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F4]">
        <div>
          <h3 className="text-base font-bold text-[#1A2B4C] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#2F6FED]" />
            {language === 'hi' ? 'दस्तावेज़ और पर्चे अपलोड' : 'Prescription & Report Upload'}
          </h3>
          <p className="text-xs text-[#6B7A99] mt-0.5">
            {language === 'hi'
              ? 'पुराने पर्चे या रिपोर्ट की फ़ोटो लें या अपलोड करें। डॉक्टर इन्हें सीधे समीक्षा करेंगे।'
              : 'Upload past prescriptions, lab reports, or discharge summaries to store on patient profile.'}
          </p>
        </div>

        <button
          onClick={handleLoadDemo}
          type="button"
          id="load-sample-doc-btn"
          className="text-xs px-4 py-2 rounded-full bg-[#EAF1FF] hover:bg-[#2F6FED] text-[#2F6FED] hover:text-white font-bold transition shadow-sm"
          title="Load sample medical prescription"
        >
          Load sample Rx
        </button>
      </div>

      {/* Optional Label / Tag Input */}
      <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#F6F9FF] border border-[#E2E8F4]">
        <Tag className="w-4 h-4 text-[#2F6FED] flex-shrink-0" />
        <input
          type="text"
          placeholder={
            language === 'hi'
              ? 'वैकल्पिक लेबल/टैग जोड़ें (उदा. "पर्चा - फरवरी 2026", "रक्त रिपोर्ट")'
              : 'Add optional label / tag (e.g. "Prescription - Feb 2026", "Lab report")'
          }
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          className="flex-1 bg-transparent text-xs text-[#1A2B4C] placeholder-[#6B7A99] focus:outline-none"
        />
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFile(e.target.files?.[0])}
        accept="image/*,.pdf"
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={(e) => handleFile(e.target.files?.[0])}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
          isDragging
            ? 'border-[#2F6FED] bg-[#EAF1FF]'
            : 'border-[#E2E8F4] bg-[#F6F9FF] hover:border-[#2F6FED]/50 hover:bg-white'
        }`}
      >
        {uploading ? (
          <div className="py-6 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#2F6FED] animate-spin" />
            <p className="text-sm font-bold text-[#1A2B4C]">
              {language === 'hi' ? 'दस्तावेज़ सहेजा जा रहा है...' : 'Saving document to patient profile...'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>

            <div>
              <p className="text-sm font-bold text-[#1A2B4C]">
                {language === 'hi' ? 'फ़ाइल यहाँ खींचें या चुनें' : 'Drag document photo/file here or browse'}
              </p>
              <p className="text-xs text-[#6B7A99] mt-0.5">
                JPEG, PNG, WebP, PDF up to 20MB
              </p>
            </div>

            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                id="browse-document-btn"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-full bg-white hover:bg-[#EAF1FF] text-[#1A2B4C] border border-[#E2E8F4] text-xs font-bold transition shadow-sm"
              >
                {language === 'hi' ? 'फ़ाइल चुनें' : 'Choose file'}
              </button>

              <button
                type="button"
                id="camera-photo-btn"
                onClick={() => cameraInputRef.current?.click()}
                className="px-5 py-2.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white font-bold text-xs transition shadow-sm"
              >
                {language === 'hi' ? 'फोटो लें' : 'Take photo'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl border border-[#E5484D]/30 bg-[#FEECEE] text-[#E5484D] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[#E5484D] font-bold">×</button>
        </div>
      )}

      {/* Stored Document Cards List */}
      {allDocs.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs text-[#6B7A99]">
            <span className="font-bold text-[#1A2B4C]">
              {language === 'hi' ? 'सहेजे गए दस्तावेज़' : 'Patient Documents on File'} ({allDocs.length})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allDocs.map((doc, i) => {
              const docId = doc.id || doc.document_id || i;
              const uploadDate = doc.created_at
                ? new Date(doc.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Recent';

              return (
                <div
                  key={docId}
                  className="p-4 rounded-2xl border border-[#E2E8F4] bg-white shadow-soft flex items-start justify-between gap-3 hover:border-[#2F6FED]/50 transition"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {doc.image_base64 ? (
                      <div
                        onClick={() => setPreviewImage(doc.image_base64)}
                        className="w-12 h-12 rounded-xl border border-[#E2E8F4] bg-[#F6F9FF] overflow-hidden flex-shrink-0 cursor-pointer hover:opacity-80 transition flex items-center justify-center"
                        title="Click to view full image"
                      >
                        <img
                          src={doc.image_base64}
                          alt={doc.filename}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-[#1A2B4C] block truncate">
                        {doc.filename || `Document #${i + 1}`}
                      </span>

                      {doc.label && (
                        <span className="inline-block px-2 py-0.5 mt-1 rounded-md text-[10px] font-semibold bg-[#EAF1FF] text-[#2F6FED] truncate max-w-full">
                          🏷️ {doc.label}
                        </span>
                      )}

                      <div className="flex items-center gap-2 text-[11px] text-[#6B7A99] mt-1">
                        <Calendar className="w-3 h-3" />
                        <span>{uploadDate}</span>
                      </div>
                    </div>
                  </div>

                  {doc.image_base64 && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(doc.image_base64)}
                      className="p-2 rounded-full border border-[#E2E8F4] bg-[#F6F9FF] hover:bg-[#EAF1FF] text-[#2F6FED] transition flex-shrink-0"
                      title="View full document"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl max-h-[90vh] bg-white p-3 rounded-3xl border border-[#E2E8F4] shadow-2xl"
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white border border-[#E2E8F4] text-[#1A2B4C] shadow-sm hover:bg-[#F6F9FF]"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewImage}
              alt="Medical document preview"
              className="max-h-[85vh] object-contain mx-auto rounded-2xl"
            />
          </div>
        </div>
      )}

      {/* Critical Emergency Triage Modal */}
      <CriticalTriageModal
        isOpen={!!criticalTriage}
        onClose={() => setCriticalTriage(null)}
        triageData={criticalTriage}
        language={language}
      />
    </div>
  );
}

