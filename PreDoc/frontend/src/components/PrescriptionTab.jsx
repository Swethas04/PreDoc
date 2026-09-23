import React, { useState, useEffect, useRef } from 'react';
import {
  Pill,
  Plus,
  Trash2,
  Edit3,
  Save,
  CheckCircle2,
  Printer,
  AlertCircle,
  FileText,
  X,
  RefreshCw,
  Info,
  Check,
  ChevronDown,
} from 'lucide-react';

const API_BASE = '/api';

const FREQUENCY_OPTIONS = [
  '1-0-1 (Twice daily)',
  '1-0-0 (Morning only)',
  '0-0-1 (Night only)',
  '1-1-1 (Thrice daily)',
  'Once daily (OD)',
  'SOS (As needed)',
];

const DURATION_OPTIONS = [
  '3 days',
  '5 days',
  '7 days',
  '10 days',
  '14 days',
  '1 month',
];

const INSTRUCTION_OPTIONS = [
  'After food',
  'Before food',
  'With plenty of water',
  'At bedtime',
];

const QUICK_DOSAGE_OPTIONS = [
  '650mg',
  '500mg',
  '250mg',
  '100mg',
  '10mg',
  '5ml',
  '10ml',
  '1 tablet',
];

export default function PrescriptionTab({
  visitId = 1,
  patientData,
  doctorName = 'Dr. Attending Physician',
  authToken,
  onAuthError,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Medicine Form Fields (Direct typing in Medicine Name triggers autocomplete suggestions)
  const [medicineName, setMedicineName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('1-0-1 (Twice daily)');
  const [duration, setDuration] = useState('5 days');
  const [instructions, setInstructions] = useState('After food');
  const [composition, setComposition] = useState('');
  const [manufacturer, setManufacturer] = useState('');

  // Autocomplete Suggestions State
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState(null);

  // Prescription General Fields
  const [diagnosis, setDiagnosis] = useState('');
  const [generalAdvice, setGeneralAdvice] = useState('');
  const [followUp, setFollowUp] = useState('Review after 5 days if symptoms persist');
  const [medicinesList, setMedicinesList] = useState([]);

  // Refs
  const medicineInputRef = useRef(null);
  const suggestionsBoxRef = useRef(null);
  const loadedVisitIdRef = useRef(null);

  // ── Load Prescription Once on Mount or Visit Change ─────────────────────────
  useEffect(() => {
    if (!visitId || loadedVisitIdRef.current === visitId) return;

    let isMounted = true;
    async function loadPrescription() {
      try {
        setLoading(true);
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const res = await fetch(`${API_BASE}/prescriptions/visit/${visitId}`, { headers });
        if (res.status === 401 && onAuthError) {
          onAuthError();
          return;
        }

        if (res.ok && isMounted) {
          const data = await res.json();
          if (data) {
            setDiagnosis(data.diagnosis || '');
            setGeneralAdvice(data.general_advice || '');
            setFollowUp(data.follow_up || 'Review after 5 days if symptoms persist');
            if (Array.isArray(data.medicines) && data.medicines.length > 0) {
              setMedicinesList(data.medicines);
            }
          }
          loadedVisitIdRef.current = visitId;
        }
      } catch (err) {
        console.error('Failed to load prescription:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadPrescription();
    return () => {
      isMounted = false;
    };
  }, [visitId, authToken, onAuthError]);

  // ── Close suggestions on outside click ─────────────────────────────────────
  useEffect(() => {
    function handleDocClick(e) {
      if (
        suggestionsBoxRef.current &&
        !suggestionsBoxRef.current.contains(e.target) &&
        medicineInputRef.current &&
        !medicineInputRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  // ── Autocomplete Suggestions as doctor types directly in Medicine Name ───────
  useEffect(() => {
    const query = medicineName.trim();
    if (!query) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Only query if the dropdown should be visible (e.g. user is actively typing)
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `${API_BASE}/prescriptions/medicines/search?q=${encodeURIComponent(query)}&limit=12`
        );
        if (res.ok) {
          const list = await res.json();
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
        }
      } catch (err) {
        console.error('Autocomplete search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [medicineName]);

  // ── When Doctor selects a suggestion ──────────────────────────────────────
  const handleSelectSuggestion = (med) => {
    setMedicineName(med.name);
    setComposition(med.composition || '');
    setManufacturer(med.manufacturer || '');
    if (med.dosage) {
      setDosage(med.dosage);
    } else if (!dosage) {
      setDosage('1 tablet');
    }
    setShowSuggestions(false);
    setSuggestions([]);
  };

  // ── Add or Update Medicine in Prescription List ────────────────────────────
  const handleAddMedicine = (e) => {
    if (e) e.preventDefault();

    const trimmedName = medicineName.trim();
    if (!trimmedName) {
      setErrorMessage('Please type or select a medicine name before adding.');
      if (medicineInputRef.current) medicineInputRef.current.focus();
      return;
    }

    const item = {
      id: editingId || `med-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: trimmedName,
      composition: composition.trim(),
      dosage: dosage.trim() || '1 tablet',
      frequency: frequency.trim() || '1-0-1 (Twice daily)',
      duration: duration.trim() || '5 days',
      instructions: instructions.trim() || 'After food',
      manufacturer: manufacturer.trim(),
    };

    if (editingId) {
      // Update existing item
      setMedicinesList((prev) =>
        prev.map((m) => (m.id === editingId ? item : m))
      );
      setEditingId(null);
    } else {
      // Add new medicine item (allows adding 1, 2, 3, 4... multiple medicines)
      setMedicinesList((prev) => [...prev, item]);
    }

    // Reset medicine form for next entry
    setMedicineName('');
    setDosage('');
    setComposition('');
    setManufacturer('');
    setFrequency('1-0-1 (Twice daily)');
    setDuration('5 days');
    setInstructions('After food');
    setShowSuggestions(false);
    setSuggestions([]);
    setErrorMessage(null);

    // Keep focus on medicine name input so doctor can immediately type next medicine
    setTimeout(() => {
      if (medicineInputRef.current) medicineInputRef.current.focus();
    }, 50);
  };

  // ── Edit Medicine ─────────────────────────────────────────────────────────
  const handleEdit = (item) => {
    setEditingId(item.id);
    setMedicineName(item.name || '');
    setDosage(item.dosage || '');
    setComposition(item.composition || '');
    setManufacturer(item.manufacturer || '');
    setFrequency(item.frequency || '1-0-1 (Twice daily)');
    setDuration(item.duration || '5 days');
    setInstructions(item.instructions || 'After food');
    setShowSuggestions(false);
    if (medicineInputRef.current) medicineInputRef.current.focus();
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setMedicineName('');
    setDosage('');
    setComposition('');
    setManufacturer('');
    setFrequency('1-0-1 (Twice daily)');
    setDuration('5 days');
    setInstructions('After food');
  };

  // ── Remove Medicine ───────────────────────────────────────────────────────
  const handleRemove = (idToRemove) => {
    setMedicinesList((prev) => prev.filter((m) => m.id !== idToRemove));
    if (editingId === idToRemove) {
      handleCancelEdit();
    }
  };

  // ── Save Prescription to Backend ──────────────────────────────────────────
  const handleSavePrescription = async () => {
    if (medicinesList.length === 0) {
      setErrorMessage('Please add at least one medicine before saving.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      const payload = {
        doctor_name: doctorName || 'Dr. Attending Physician',
        diagnosis: diagnosis.trim() || 'Clinical Consultation',
        medicines: medicinesList,
        general_advice: generalAdvice.trim(),
        follow_up: followUp.trim(),
      };

      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${API_BASE}/prescriptions/visit/${visitId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.status === 401 && onAuthError) {
        onAuthError();
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server error (${res.status}) saving prescription.`);
      }

      const saved = await res.json();
      if (saved && Array.isArray(saved.medicines)) {
        setMedicinesList(saved.medicines);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err) {
      console.error('Save prescription failed:', err);
      setErrorMessage(err.message || 'Could not save prescription. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const patientName = patientData?.name || `Patient #${visitId}`;
  const patientAge = patientData?.age ? `${patientData.age} yrs` : 'N/A';

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="p-6 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#2F6FED] text-white flex items-center justify-center flex-shrink-0 shadow-md">
            <Pill className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-extrabold text-[#1A2B4C] tracking-tight">
                Prescription & Medication Orders
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#EAF1FF] text-[#2F6FED]">
                Visit #{visitId}
              </span>
            </div>
            <p className="text-xs text-[#6B7A99] mt-0.5">
              Type the medicine name below to get instant suggestions from 11,800+ medicines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {medicinesList.length > 0 && (
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white hover:bg-[#F6F9FF] border border-[#CBD5E1] text-[#1A2B4C] text-xs font-bold transition shadow-xs"
            >
              <Printer className="w-4 h-4 text-[#2F6FED]" />
              <span>Print Rx</span>
            </button>
          )}

          <button
            id="save-prescription-top-btn"
            type="button"
            disabled={saving || medicinesList.length === 0}
            onClick={handleSavePrescription}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs font-extrabold transition shadow-md disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{saving ? 'Saving...' : saveSuccess ? 'Saved to Record!' : 'Save Prescription'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="p-4 rounded-2xl bg-[#EAF7EE] border border-[#2FAE60]/40 text-[#2FAE60] flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-bold">
              ✓ Prescription successfully saved to Patient record (Visit #{visitId})!
            </span>
          </div>
          <span className="text-xs opacity-75">{medicinesList.length} medicine(s) recorded</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-[#FEECEE] border border-[#E5484D]/40 text-[#E5484D] flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-semibold">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Form: Direct Medicine Entry with In-Line Suggestions (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 sm:p-7 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F4]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2F6FED]"></span>
                <h3 className="font-extrabold text-base text-[#1A2B4C]">
                  {editingId ? 'Edit Medicine' : 'Add Medicine'}
                </h3>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs font-semibold text-[#6B7A99] hover:text-[#E5484D]"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {/* DIRECT MEDICINE NAME INPUT WITH AUTOCOMPLETE */}
            <div className="space-y-1.5 relative">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#1A2B4C]">
                  Medicine Name *
                </label>
                {isSearching && (
                  <span className="text-[10px] text-[#2F6FED] font-medium flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Searching dataset...
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  ref={medicineInputRef}
                  id="direct-medicine-name-input"
                  type="text"
                  placeholder="Start typing medicine name (e.g. D, Dol, Dolo, Doxy, Diclo, Augmentin)..."
                  value={medicineName}
                  onChange={(e) => {
                    setMedicineName(e.target.value);
                    if (!showSuggestions && e.target.value.trim().length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowSuggestions(false);
                    if (e.key === 'Enter' && !showSuggestions) {
                      e.preventDefault();
                      handleAddMedicine();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-2xl bg-[#F8FAFC] border-2 border-[#CBD5E1] text-sm font-semibold text-[#1A2B4C] placeholder-[#94A3B8] focus:outline-none focus:border-[#2F6FED] focus:bg-white transition"
                  autoComplete="off"
                />

                {medicineName && (
                  <button
                    type="button"
                    onClick={() => {
                      setMedicineName('');
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#94A3B8] hover:text-[#1A2B4C]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* DIRECT SUGGESTIONS DROPDOWN (Directly below the Medicine Name field) */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsBoxRef}
                  className="absolute z-50 left-0 right-0 top-full mt-1 bg-white rounded-2xl border border-[#CBD5E1] shadow-2xl overflow-hidden max-h-72 overflow-y-auto"
                >
                  <div className="px-3.5 py-1.5 bg-[#F1F5F9] border-b border-[#E2E8F4] flex items-center justify-between text-[11px] font-bold text-[#64748B]">
                    <span>Matching medicines ({suggestions.length})</span>
                    <span className="text-[10px] text-[#2F6FED] font-semibold">Click to select</span>
                  </div>

                  <ul className="divide-y divide-[#F1F5F9]">
                    {suggestions.map((med, idx) => (
                      <li
                        key={idx}
                        onClick={() => handleSelectSuggestion(med)}
                        className="px-4 py-2.5 hover:bg-[#EAF1FF] cursor-pointer transition flex items-start justify-between gap-3 group"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-[#1A2B4C] group-hover:text-[#2F6FED] transition truncate">
                              {med.name}
                            </span>
                            {med.dosage && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#E2E8F4] text-[#334155] flex-shrink-0">
                                {med.dosage}
                              </span>
                            )}
                          </div>
                          {med.composition && (
                            <p className="text-[11px] text-[#6B7A99] truncate mt-0.5">
                              {med.composition}
                            </p>
                          )}
                          {med.uses && (
                            <p className="text-[10px] text-[#2FAE60] truncate mt-0.5">
                              💊 {med.uses}
                            </p>
                          )}
                        </div>
                        {med.manufacturer && (
                          <span className="text-[10px] text-[#94A3B8] flex-shrink-0 text-right">
                            {med.manufacturer.length > 20 ? `${med.manufacturer.slice(0, 18)}...` : med.manufacturer}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Composition badge if selected */}
              {composition && (
                <div className="mt-1 p-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F4] text-xs text-[#475569] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[#2F6FED] flex-shrink-0" />
                  <span className="truncate"><strong>Formula:</strong> {composition}</span>
                </div>
              )}
            </div>

            {/* Dosage / Strength Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1A2B4C]">
                Dosage / Strength *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {QUICK_DOSAGE_OPTIONS.map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setDosage(d)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      dosage === d
                        ? 'bg-[#2F6FED] text-white shadow-xs'
                        : 'bg-[#F1F5F9] hover:bg-[#E2E8F4] text-[#475569]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="e.g. 650mg, 500mg, 1 tablet, 10ml"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-semibold text-[#1A2B4C] focus:outline-none focus:border-[#2F6FED]"
              />
            </div>

            {/* Frequency (Schedule) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1A2B4C]">
                Frequency (Schedule) *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {FREQUENCY_OPTIONS.map((f) => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setFrequency(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      frequency === f
                        ? 'bg-[#2F6FED] text-white shadow-xs'
                        : 'bg-[#F1F5F9] hover:bg-[#E2E8F4] text-[#475569]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="Or custom frequency"
                className="w-full px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A2B4C]"
              />
            </div>

            {/* Duration & Instructions in 2 columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#1A2B4C]">
                  Duration *
                </label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {DURATION_OPTIONS.map((dur) => (
                    <button
                      type="button"
                      key={dur}
                      onClick={() => setDuration(dur)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                        duration === dur
                          ? 'bg-[#2FAE60] text-white'
                          : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F4]'
                      }`}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 5 days"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A2B4C]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#1A2B4C]">
                  Instructions
                </label>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {INSTRUCTION_OPTIONS.map((inst) => (
                    <button
                      type="button"
                      key={inst}
                      onClick={() => setInstructions(inst)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                        instructions === inst
                          ? 'bg-[#6366F1] text-white'
                          : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F4]'
                      }`}
                    >
                      {inst}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. After food"
                  className="w-full px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A2B4C]"
                />
              </div>
            </div>

            {/* ADD MEDICINE BUTTON */}
            <div className="pt-2">
              <button
                id="add-medicine-btn"
                type="button"
                onClick={handleAddMedicine}
                className="w-full py-3.5 rounded-2xl bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-md hover:shadow-lg active:scale-[0.99]"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>{editingId ? 'Update Medicine' : '+ Add Medicine to Prescription'}</span>
              </button>
            </div>
          </div>

          {/* Diagnosis & Doctor Notes Card */}
          <div className="p-6 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft space-y-4">
            <h4 className="font-extrabold text-sm text-[#1A2B4C] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#2F6FED]" />
              Diagnosis & Doctor Advice
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#6B7A99] mb-1">
                  Diagnosis / Clinical Impression
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acute Viral Pharyngitis / Fever with Body Ache"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A2B4C]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B7A99] mb-1">
                  Dietary / General Advice
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Rest adequately, drink 2-3 liters of fluids, avoid cold water."
                  value={generalAdvice}
                  onChange={(e) => setGeneralAdvice(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A2B4C]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#6B7A99] mb-1">
                  Follow-Up Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Review after 5 days if fever persists"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-xs text-[#1A2B4C]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Prescription Order Sheet (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 sm:p-7 rounded-3xl bg-white border border-[#E2E8F4] shadow-soft space-y-5 sticky top-20">
            {/* Rx Paper Header */}
            <div className="pb-4 border-b border-[#E2E8F4]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-[#1A2B4C]">Medical Prescription</h3>
                  <p className="text-[11px] text-[#6B7A99]">Official Physician Rx Order</p>
                </div>
                <div className="text-right">
                  <span className="text-base font-serif font-black text-[#2F6FED]">℞</span>
                  <p className="text-[10px] text-[#94A3B8]">{new Date().toLocaleDateString()}</p>
                </div>
              </div>

              <div className="mt-3 p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F4] text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-[#94A3B8] block">Patient:</span>
                  <span className="font-bold text-[#1A2B4C] truncate block">{patientName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#94A3B8] block">Age:</span>
                  <span className="font-bold text-[#1A2B4C]">{patientAge}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#94A3B8] block">Doctor:</span>
                  <span className="font-medium text-[#475569] truncate block">{doctorName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#94A3B8] block">Visit:</span>
                  <span className="font-mono text-[#2F6FED]">#{visitId}</span>
                </div>
              </div>
            </div>

            {/* Prescribed Medicines Count & List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#6B7A99]">
                  Prescribed Medicines ({medicinesList.length})
                </span>
                {medicinesList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMedicinesList([])}
                    className="text-[11px] text-[#E5484D] hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {medicinesList.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border-2 border-dashed border-[#E2E8F4] bg-[#F8FAFC] text-[#94A3B8] space-y-2">
                  <Pill className="w-8 h-8 mx-auto text-[#CBD5E1]" />
                  <p className="text-xs font-semibold text-[#64748B]">No medicines added yet</p>
                  <p className="text-[11px]">
                    Type a medicine name on the left and click &ldquo;+ Add Medicine&rdquo;. You can add as many medicines as needed.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {medicinesList.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F4] hover:border-[#2F6FED]/50 transition group space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#EAF1FF] text-[#2F6FED] font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-extrabold text-xs text-[#1A2B4C] leading-snug truncate">
                              {item.name}
                            </span>
                          </div>
                          {item.composition && (
                            <p className="text-[10px] text-[#6B7A99] ml-7 truncate">
                              {item.composition}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#2F6FED] hover:bg-[#EAF1FF]"
                            title="Edit this medicine"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemove(item.id)}
                            className="p-1.5 rounded-lg text-[#64748B] hover:text-[#E5484D] hover:bg-[#FEECEE]"
                            title="Remove this medicine"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Dosage, Frequency, Duration badges */}
                      <div className="ml-7 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="px-2 py-0.5 rounded-md font-bold bg-[#E2E8F4] text-[#334155]">
                          {item.dosage || '1 tab'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md font-semibold bg-[#EAF1FF] text-[#2F6FED]">
                          {item.frequency}
                        </span>
                        <span className="px-2 py-0.5 rounded-md font-semibold bg-[#EAF7EE] text-[#2FAE60]">
                          {item.duration}
                        </span>
                      </div>

                      {item.instructions && (
                        <p className="ml-7 text-[10px] text-[#64748B] italic">
                          📝 {item.instructions}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Actions: Save Prescription */}
            <div className="pt-3 border-t border-[#E2E8F4] space-y-2">
              <button
                type="button"
                id="save-prescription-bottom-btn"
                disabled={saving || medicinesList.length === 0}
                onClick={handleSavePrescription}
                className="w-full py-3.5 rounded-2xl bg-[#2F6FED] hover:bg-[#255BC7] text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>
                  {saving ? 'Saving...' : saveSuccess ? '✓ Prescription Saved!' : 'Save Prescription to Record'}
                </span>
              </button>

              <p className="text-[10px] text-center text-[#94A3B8]">
                Prescription becomes part of Visit #{visitId} patient record.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
