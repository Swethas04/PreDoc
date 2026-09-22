import React, { useState, useRef } from 'react';
import {
  Upload,
  Camera,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pill,
  Activity,
  Calendar,
  Sparkles,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const API_BASE = '/api';

export default function DocumentUpload({
  visitId,
  language = 'en',
  onDocumentExtracted,
  extractedDocs = [],
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState(null);
  const [activeDocId, setActiveDocId] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)) {
      setError(
        language === 'hi'
          ? 'कृपया केवल इमेज फ़ाइल (JPG, PNG, WebP) अपलोड करें।'
          : 'Please upload an image file (JPEG, PNG, WebP).'
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
    setUploadProgress(
      language === 'hi'
        ? 'दस्तावेज़ का विश्लेषण किया जा रहा है...'
        : 'Analyzing medical document...'
    );

    const formData = new FormData();
    formData.append('visit_id', visitId || 1);
    formData.append('file', file);

    const token = sessionStorage.getItem('predoc_patient_token') || sessionStorage.getItem('predoc_auth_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch(`${API_BASE}/documents/extract`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed with status ${res.status}`);
      }

      const data = await res.json();
      setUploadProgress(language === 'hi' ? 'डेटा निकाला गया' : 'Clinical data extracted');

      if (onDocumentExtracted) {
        onDocumentExtracted(data);
      }
      setActiveDocId(data.document_id || Date.now());
    } catch (err) {
      console.error('Extraction error:', err);
      setError(err.message || 'Failed to extract clinical data from image.');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleLoadDemo = () => {
    const demoDoc = {
      document_id: Date.now(),
      visit_id: visitId || 1,
      filename: 'Sample_Prescription_Rx.jpg',
      created_at: new Date().toISOString(),
      extracted: {
        drug_names: [
          {
            name: 'Metformin HCl',
            dosage: '500mg',
            frequency: 'Twice daily after meals',
            dosage_normalized: {
              value: 500,
              unit: 'mg',
              value_mg: 500,
              display: '500 mg',
            },
          },
          {
            name: 'Paracetamol',
            dosage: '1g',
            frequency: 'SOS (as needed for fever)',
            dosage_normalized: {
              value: 1,
              unit: 'g',
              value_mg: 1000,
              display: '1.0 g (1000 mg)',
            },
          },
          {
            name: 'Amlodipine',
            dosage: '5mg',
            frequency: 'Once daily morning',
            dosage_normalized: {
              value: 5,
              unit: 'mg',
              value_mg: 5,
              display: '5 mg',
            },
          },
        ],
        diagnoses: [
          'Type 2 Diabetes Mellitus',
          'Primary Hypertension',
          'Viral Upper Respiratory Infection',
        ],
        dates: [
          {
            label: 'Prescription date',
            value: '2024-01-15',
            timestamp_ms: new Date('2024-01-15').getTime(),
          },
          {
            label: 'Follow-up consultation',
            value: '2024-04-10',
            timestamp_ms: new Date('2024-04-10').getTime(),
          },
          {
            label: 'Recent lab review',
            value: '2024-08-22',
            timestamp_ms: new Date('2024-08-22').getTime(),
          },
        ],
        measurements: [
          {
            type: 'Blood Pressure',
            raw: '135/88 mmHg',
            systolic: 135,
            diastolic: 88,
            unit: 'mmHg',
          },
          {
            type: 'Heart Rate',
            raw: '78 bpm',
            value: 78,
            unit: 'bpm',
          },
        ],
      },
    };

    if (onDocumentExtracted) {
      onDocumentExtracted(demoDoc);
    }
    setActiveDocId(demoDoc.document_id);
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
              ? 'पुराने पर्चे या रिपोर्ट की फ़ोटो लें या अपलोड करें।'
              : 'Photograph or upload past prescriptions & lab reports for automatic clinical extraction.'}
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

      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFile(e.target.files?.[0])}
        accept="image/*"
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
            <p className="text-sm font-bold text-[#1A2B4C]">{uploadProgress}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>

            <div>
              <p className="text-sm font-bold text-[#1A2B4C]">
                {language === 'hi' ? 'फ़ाइल यहाँ खींचें या चुनें' : 'Drag prescription photo here or browse'}
              </p>
              <p className="text-xs text-[#6B7A99] mt-0.5">
                JPEG, PNG, WebP up to 20MB
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

      {/* Extracted Document Cards */}
      {extractedDocs.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-xs text-[#6B7A99]">
            <span className="font-bold text-[#1A2B4C]">
              {language === 'hi' ? 'निकाले गए दस्तावेज़' : 'Extracted documents'} ({extractedDocs.length})
            </span>
          </div>

          <div className="space-y-3">
            {extractedDocs.map((doc, i) => {
              const docId = doc.document_id || doc.id || i;
              const isExpanded = activeDocId === docId || extractedDocs.length === 1;
              const extracted = doc.extracted || doc.extracted_json || {};
              const drugs = extracted.drug_names || [];
              const diagnoses = extracted.diagnoses || [];
              const dates = extracted.dates || [];
              const measurements = extracted.measurements || [];

              return (
                <div
                  key={docId}
                  className="rounded-2xl border border-[#E2E8F4] bg-white shadow-soft overflow-hidden"
                >
                  <button
                    onClick={() => setActiveDocId(isExpanded ? null : docId)}
                    className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-[#F6F9FF] transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#EAF1FF] text-[#2F6FED] flex items-center justify-center">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#1A2B4C]">
                          {doc.filename || `Prescription #${i + 1}`}
                        </span>
                        <div className="text-[11px] text-[#6B7A99] mt-0.5">
                          {drugs.length} drugs • {diagnoses.length} diagnoses • {dates.length} dates
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#EAF7EE] text-[#2FAE60] font-semibold">
                        Extracted
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#6B7A99]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#6B7A99]" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-5 pt-2 border-t border-[#E2E8F4] space-y-4 text-xs bg-[#F6F9FF]">
                      {drugs.length > 0 && (
                        <div>
                          <span className="text-xs font-bold text-[#1A2B4C] block mb-2">
                            Extracted medications
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {drugs.map((drug, dIdx) => (
                              <div
                                key={dIdx}
                                className="p-3 rounded-xl border border-[#E2E8F4] bg-white shadow-sm flex items-start justify-between"
                              >
                                <div>
                                  <p className="font-bold text-[#1A2B4C]">{drug.name}</p>
                                  {drug.dosage && (
                                    <p className="text-[#6B7A99] text-[11px] mt-0.5">
                                      Dosage: <span className="font-mono font-medium text-[#1A2B4C]">{drug.dosage}</span>
                                    </p>
                                  )}
                                  {drug.frequency && (
                                    <p className="text-[#6B7A99] text-[10px]">{drug.frequency}</p>
                                  )}
                                </div>
                                {drug.dosage_normalized && (
                                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#EAF1FF] text-[#2F6FED]">
                                    {drug.dosage_normalized.display || `${drug.dosage_normalized.value_mg} mg`}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {diagnoses.length > 0 && (
                        <div>
                          <span className="text-xs font-bold text-[#1A2B4C] block mb-2">
                            Diagnoses
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {diagnoses.map((diag, dIdx) => {
                              const label = typeof diag === 'string' ? diag : diag.name || diag.diagnosis;
                              return (
                                <span
                                  key={dIdx}
                                  className="px-3 py-1 rounded-full bg-white border border-[#E2E8F4] text-[#1A2B4C] text-xs font-medium shadow-sm"
                                >
                                  {label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {(dates.length > 0 || measurements.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E2E8F4]">
                          {dates.length > 0 && (
                            <div>
                              <span className="text-xs font-bold text-[#1A2B4C] block mb-1.5">
                                Extracted dates
                              </span>
                              <div className="space-y-1.5">
                                {dates.map((d, dIdx) => (
                                  <div
                                    key={dIdx}
                                    className="flex items-center justify-between text-[11px] bg-white px-3 py-1.5 rounded-lg border border-[#E2E8F4]"
                                  >
                                    <span className="text-[#6B7A99]">{d.label || 'Date'}:</span>
                                    <span className="font-mono font-semibold text-[#1A2B4C]">{d.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {measurements.length > 0 && (
                            <div>
                              <span className="text-xs font-bold text-[#1A2B4C] block mb-1.5">
                                Measurements
                              </span>
                              <div className="space-y-1.5">
                                {measurements.map((m, mIdx) => (
                                  <div
                                    key={mIdx}
                                    className="flex items-center justify-between text-[11px] bg-white px-3 py-1.5 rounded-lg border border-[#E2E8F4]"
                                  >
                                    <span className="text-[#6B7A99]">{m.type || 'Measurement'}:</span>
                                    <span className="font-mono font-semibold text-[#2F6FED]">
                                      {m.raw || (m.unit ? `${m.value} ${m.unit}` : '-')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
