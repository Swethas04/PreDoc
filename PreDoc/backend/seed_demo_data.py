import base64
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db, engine
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.intake_turn import IntakeTurn
from app.models.document_record import DocumentRecord
from app.models.case_draft import CaseDraft

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_demo_data")


def generate_prescription_image_base64() -> str:
    """Generates a crisp, realistic SVG clinical prescription slip encoded as base64."""
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.15"/>
    </filter>
  </defs>

  <!-- Background Paper -->
  <rect width="100%" height="100%" fill="#ffffff" rx="8" />
  <rect x="15" y="15" width="570" height="770" fill="none" stroke="#cbd5e1" stroke-width="1.5" rx="6" />

  <!-- Clinic Header -->
  <rect x="25" y="25" width="550" height="110" fill="url(#headerGrad)" rx="6" />
  <circle cx="65" cy="80" r="24" fill="#0d9488" />
  <path d="M 65 68 L 65 92 M 53 80 L 77 80" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" />
  
  <text x="105" y="65" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">METROPOLITAN HEALTH CLINIC</text>
  <text x="105" y="85" font-family="Arial, sans-serif" font-size="12" fill="#99f6e4">Department of Internal Medicine &amp; Cardiology</text>
  <text x="105" y="103" font-family="Arial, sans-serif" font-size="10" fill="#94a3b8">Dr. Arvind Mehta, MD (Internal Med) | Reg: MCI-548921</text>
  <text x="105" y="118" font-family="Arial, sans-serif" font-size="9" fill="#64748b">Phone: +91 (11) 4892-0000 | 14 Ring Road, New Delhi</text>

  <!-- Patient Details Bar -->
  <rect x="25" y="145" width="550" height="55" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1" rx="4" />
  <text x="40" y="166" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#334155">Patient Name:</text>
  <text x="125" y="166" font-family="Arial, sans-serif" font-size="11" fill="#0f172a">Mr. Suresh Kumar</text>

  <text x="320" y="166" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#334155">Age / Gender:</text>
  <text x="405" y="166" font-family="Arial, sans-serif" font-size="11" fill="#0f172a">62 Yrs / Male</text>

  <text x="40" y="188" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#334155">Date:</text>
  <text x="80" y="188" font-family="Arial, sans-serif" font-size="11" fill="#0f172a">15-Jun-2026</text>

  <text x="320" y="188" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#334155">UHID / Ref:</text>
  <text x="395" y="188" font-family="Arial, sans-serif" font-size="11" fill="#0f172a">MHC-2026-88412</text>

  <!-- Vitals Box -->
  <rect x="25" y="210" width="550" height="40" fill="#f0fdfa" stroke="#ccfbf1" stroke-width="1" rx="4" />
  <text x="40" y="234" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0f766e">Vitals &amp; Labs Recorded:</text>
  <text x="180" y="234" font-family="Arial, sans-serif" font-size="11" fill="#134e4a">BP: 138/84 mmHg  |  FBS: 132 mg/dL  |  HbA1c: 6.8%  |  Pulse: 74 bpm</text>

  <!-- Rx Symbol -->
  <text x="35" y="290" font-family="Georgia, serif" font-size="34" font-weight="bold" font-style="italic" fill="#0d9488">℞</text>
  <line x1="25" y1="305" x2="575" y2="305" stroke="#0d9488" stroke-width="1.5" stroke-dasharray="4,4" />

  <!-- Medication List Table -->
  <!-- Med 1 -->
  <rect x="35" y="325" width="530" height="65" fill="#ffffff" stroke="#e2e8f0" rx="4" />
  <text x="50" y="348" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">1. Tab. Metformin Hydrochloride 500 mg</text>
  <text x="50" y="372" font-family="Arial, sans-serif" font-size="11" fill="#475569">Dosage: 1 Tab Twice Daily (BD) — After Breakfast &amp; Dinner</text>
  <text x="460" y="360" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0d9488">Qty: 60 Tabs</text>

  <!-- Med 2 -->
  <rect x="35" y="400" width="530" height="65" fill="#ffffff" stroke="#e2e8f0" rx="4" />
  <text x="50" y="423" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">2. Tab. Telmisartan 40 mg</text>
  <text x="50" y="447" font-family="Arial, sans-serif" font-size="11" fill="#475569">Dosage: 1 Tab Once Daily (OD) — Morning after food</text>
  <text x="460" y="435" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0d9488">Qty: 30 Tabs</text>

  <!-- Med 3 -->
  <rect x="35" y="475" width="530" height="65" fill="#ffffff" stroke="#e2e8f0" rx="4" />
  <text x="50" y="498" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">3. Tab. Atorvastatin 10 mg</text>
  <text x="50" y="522" font-family="Arial, sans-serif" font-size="11" fill="#475569">Dosage: 1 Tab Once Daily (HS) — At bedtime</text>
  <text x="460" y="510" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0d9488">Qty: 30 Tabs</text>

  <!-- Clinical Advice & Instructions -->
  <rect x="25" y="555" width="550" height="110" fill="#f8fafc" stroke="#e2e8f0" rx="4" />
  <text x="40" y="578" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#334155">Advice &amp; Instructions:</text>
  <text x="40" y="598" font-family="Arial, sans-serif" font-size="10.5" fill="#475569">• Continue diabetic diet (low glycemic index, salt restricted &lt; 5g/day).</text>
  <text x="40" y="616" font-family="Arial, sans-serif" font-size="10.5" fill="#475569">• 30 mins brisk walking 5 days/week.</text>
  <text x="40" y="634" font-family="Arial, sans-serif" font-size="10.5" fill="#475569">• Repeat Serum Creatinine, Lipid Profile, and HbA1c in 3 months.</text>
  <text x="40" y="652" font-family="Arial, sans-serif" font-size="10.5" fill="#475569">• Follow up after 3 months or SOS if BP &gt; 150/95 or symptoms of hypoglycemia.</text>

  <!-- Doctor Signature Seal -->
  <path d="M 440 710 C 460 690, 480 730, 500 700 C 510 690, 530 715, 540 705" stroke="#1e3a8a" stroke-width="2" fill="none" stroke-linecap="round"/>
  <text x="430" y="735" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0f172a">Dr. Arvind Mehta</text>
  <text x="430" y="750" font-family="Arial, sans-serif" font-size="9.5" fill="#64748b">MD, DM (Cardiology / Internal Med)</text>
</svg>"""
    b64_bytes = base64.b64encode(svg.encode("utf-8")).decode("utf-8")
    return f"data:image/svg+xml;base64,{b64_bytes}"


def seed_demo_patients(db: Session = None):
    """
    Seeds the database with 3 realistic clinical demo patient cases:
    1. Routine Case: Priya Sharma (Allergic Rhinitis, pending draft)
    2. Upload Prescription Case: Suresh Kumar (Diabetes/HTN, uploaded Rx slip + extracted medications)
    3. Red-Flag Urgent Case: Rajesh Gupta (Acute Chest Pain + Dyspnea, Cardiology triage flag)
    """
    should_close = False
    if db is None:
        init_db()
        db = SessionLocal()
        should_close = True

    try:
        logger.info("Resetting existing demo patients if present...")

        # -----------------------------------------------------------------------
        # PATIENT 1: Routine Case (Priya Sharma - Allergic Rhinitis)
        # -----------------------------------------------------------------------
        p1 = Patient(
            name="Priya Sharma",
            age=28,
            language="English",
        )
        db.add(p1)
        db.flush()

        v1 = Visit(
            patient_id=p1.id,
            status="pending",
            urgency_flag=False,
            department="General Medicine",
            urgency_reason=None,
        )
        db.add(v1)
        db.flush()

        # Multi-turn conversational intake
        t1_turns = [
            IntakeTurn(
                visit_id=v1.id,
                step="chief_complaint",
                question="What brings you to the clinic today?",
                transcript="I have had a severe runny nose, sneezing fits, and watery itchy eyes for the past 4 days.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v1.id,
                step="duration",
                question="How long have you had these symptoms?",
                transcript="It started 4 days ago after spending time outdoors in a garden with blooming flowers.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v1.id,
                step="associated_symptoms",
                question="Are you experiencing any fever, breathlessness, or cough?",
                transcript="Mild throat tickle and nasal congestion. No fever, no breathlessness, no chest discomfort.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v1.id,
                step="past_history",
                question="Do you have any past medical conditions or previous surgeries?",
                transcript="No chronic health conditions or past surgeries.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v1.id,
                step="medications",
                question="Are you currently taking any prescription or OTC medications?",
                transcript="I took one over-the-counter Cetirizine 10mg yesterday which helped slightly for a few hours.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v1.id,
                step="allergies",
                question="Do you have any known drug or environmental allergies?",
                transcript="Yes, allergic to pollen and heavy dust.",
                language="en",
            ),
        ]
        db.add_all(t1_turns)
        db.flush()

        # Generated SOAP Case Draft
        draft_content_1 = {
            "chief_complaint": "Paroxysmal sneezing, profuse rhinorrhea, and ocular pruritus for 4 days",
            "subjective": [
                {
                    "fact": "Patient reports sudden onset of continuous sneezing, clear watery rhinorrhea, and itchy eyes for 4 days following pollen exposure.",
                    "category": "Chief Complaint & HPI",
                    "source": {"type": "transcript", "id": t1_turns[0].id, "turn_index": 0, "quote": "severe runny nose, sneezing fits, and watery itchy eyes"},
                },
                {
                    "fact": "Symptoms exacerbated by outdoor garden exposure with seasonal pollen.",
                    "category": "HPI Trigger",
                    "source": {"type": "transcript", "id": t1_turns[1].id, "turn_index": 1, "quote": "after spending time outdoors in a garden"},
                },
                {
                    "fact": "Associated mild pharyngeal tickle and nasal congestion; denies fever, dyspnea, or wheezing.",
                    "category": "Review of Systems",
                    "source": {"type": "transcript", "id": t1_turns[2].id, "turn_index": 2, "quote": "Mild throat tickle and nasal congestion. No fever, no breathlessness"},
                },
                {
                    "fact": "Known history of seasonal atopy / pollen and dust sensitivity.",
                    "category": "Allergies",
                    "source": {"type": "transcript", "id": t1_turns[5].id, "turn_index": 5, "quote": "allergic to pollen and heavy dust"},
                },
            ],
            "objective": [
                {
                    "finding": "Vitals: BP 118/76 mmHg, Pulse 76 bpm regular, SpO2 99% on room air, Temp 98.4°F.",
                    "category": "Vitals",
                    "source": {"type": "clinical_baseline", "label": "Triage Vitals"},
                },
                {
                    "finding": "Nasal examination: Bilateral boggy pale turbinates with clear watery secretions.",
                    "category": "Physical Exam",
                    "source": {"type": "clinical_baseline", "label": "Physical Examination"},
                },
            ],
            "assessment": [
                {
                    "diagnosis": "Seasonal Allergic Rhinitis (Pollinosis) — Moderate-to-Severe Intermittent (ICD-10 J30.1)",
                    "category": "Primary Diagnosis",
                    "source": {"type": "transcript", "id": t1_turns[0].id, "quote": "sneezing fits, and watery itchy eyes"},
                }
            ],
            "plan": [
                {
                    "step": "Start Levocetirizine 5mg tablet once daily at bedtime for 10 days.",
                    "category": "Pharmacotherapy",
                    "source": {"type": "guideline", "label": "ARIA 2020 Guidelines"},
                },
                {
                    "step": "Fluticasone Furoate nasal spray (27.5 mcg/spray) — 1 spray each nostril daily for 2 weeks.",
                    "category": "Topical Corticosteroid",
                    "source": {"type": "guideline", "label": "Allergic Rhinitis Clinical Pathway"},
                },
                {
                    "step": "Isotonic saline nasal rinses BID to clear allergens; minimize peak-hour outdoor exposure.",
                    "category": "Patient Education",
                    "source": {"type": "guideline", "label": "Non-pharmacological measures"},
                },
            ],
            "clinical_summary": "28yo female with 4-day history of acute seasonal allergic rhinitis triggered by pollen. No systemic red flags.",
        }
        c1 = CaseDraft(
            visit_id=v1.id,
            content_json=draft_content_1,
            source_links_json={"guidelines": ["ARIA (Allergic Rhinitis and its Impact on Asthma) 2020", "AAO-HNSF Clinical Practice Guideline"]},
            is_approved=False,
        )
        db.add(c1)

        # -----------------------------------------------------------------------
        # PATIENT 2: Uploaded Prescription Case (Suresh Kumar - HTN + Diabetes)
        # -----------------------------------------------------------------------
        p2 = Patient(
            name="Suresh Kumar",
            age=62,
            language="English",
        )
        db.add(p2)
        db.flush()

        v2 = Visit(
            patient_id=p2.id,
            status="pending",
            urgency_flag=False,
            department="Internal Medicine",
            urgency_reason=None,
        )
        db.add(v2)
        db.flush()

        # Multi-turn intake
        t2_turns = [
            IntakeTurn(
                visit_id=v2.id,
                step="chief_complaint",
                question="What is the purpose of your visit today?",
                transcript="I am here for my regular 3-month follow-up for diabetes and high blood pressure. I have also brought my previous prescription slip.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v2.id,
                step="duration",
                question="How long have you been taking your current treatment?",
                transcript="I have been on this medication routine for about 2 years. Overall feel stable with good compliance.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v2.id,
                step="associated_symptoms",
                question="Any episodes of dizziness, blurry vision, chest heaviness, or excessive thirst?",
                transcript="No chest pain, no dizziness, and vision is fine. Mild evening fatigue occasionally.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v2.id,
                step="medications",
                question="Which medications are you currently taking daily?",
                transcript="Taking Metformin 500mg twice a day, Telmisartan 40mg every morning, and Atorvastatin 10mg at night.",
                language="en",
            ),
        ]
        db.add_all(t2_turns)
        db.flush()

        # Uploaded Prescription Document with Realistic Base64 Image
        rx_image_base64 = generate_prescription_image_base64()
        doc2 = DocumentRecord(
            visit_id=v2.id,
            filename="Prescription_DrMehta_Clinic.png",
            mime_type="image/svg+xml",
            raw_text="Metropolitan Health Clinic - Dr. Arvind Mehta MD. Patient: Suresh Kumar (62/M). Rx: Tab. Metformin HCl 500mg BD, Tab. Telmisartan 40mg OD, Tab. Atorvastatin 10mg HS. BP: 138/84 mmHg, FBS: 132 mg/dL, HbA1c: 6.8%.",
            extracted_json={
                "drug_names": [
                    {
                        "name": "Metformin Hydrochloride",
                        "dosage": "500 mg",
                        "frequency": "Twice daily (BD)",
                        "dosage_normalized": {"value": 500.0, "unit": "mg"},
                    },
                    {
                        "name": "Telmisartan",
                        "dosage": "40 mg",
                        "frequency": "Once daily morning (OD)",
                        "dosage_normalized": {"value": 40.0, "unit": "mg"},
                    },
                    {
                        "name": "Atorvastatin",
                        "dosage": "10 mg",
                        "frequency": "Once daily bedtime (HS)",
                        "dosage_normalized": {"value": 10.0, "unit": "mg"},
                    },
                ],
                "diagnoses": [
                    "Type 2 Diabetes Mellitus (E11.9)",
                    "Essential Hypertension (I10)",
                    "Dyslipidemia (E78.5)",
                ],
                "measurements": [
                    {"type": "Blood Pressure", "raw": "138/84 mmHg", "systolic": 138, "diastolic": 84, "unit": "mmHg"},
                    {"type": "Fasting Blood Sugar", "raw": "132 mg/dL", "value": 132.0, "unit": "mg/dL"},
                    {"type": "HbA1c Glycated Hemoglobin", "raw": "6.8%", "value": 6.8, "unit": "%"},
                    {"type": "Heart Rate", "raw": "74 bpm", "value": 74.0, "unit": "bpm"},
                ],
                "dates": [{"label": "Prescription Date", "value": "2026-06-15"}],
            },
            image_base64=rx_image_base64,
        )
        db.add(doc2)
        db.flush()

        # Generated Synthesized SOAP Draft (linking both conversation & document)
        draft_content_2 = {
            "chief_complaint": "Quarterly chronic disease review for Type 2 Diabetes Mellitus and Essential Hypertension",
            "subjective": [
                {
                    "fact": "62yo male attending routine quarterly follow-up for T2DM and hypertension; reports strict compliance with medications.",
                    "category": "HPI",
                    "source": {"type": "transcript", "id": t2_turns[0].id, "turn_index": 0, "quote": "regular 3-month follow-up for diabetes and high blood pressure"},
                },
                {
                    "fact": "Confirmed active medication regimen: Metformin 500mg BD, Telmisartan 40mg OD, Atorvastatin 10mg HS.",
                    "category": "Medication Reconciliation",
                    "source": {"type": "document", "id": doc2.id, "label": "Prescription_DrMehta_Clinic.png", "quote": "Metformin 500mg BD, Telmisartan 40mg OD, Atorvastatin 10mg HS"},
                },
                {
                    "fact": "Denies hypoglycemic episodes, orthostatic dizziness, visual disturbances, or chest pain.",
                    "category": "Review of Systems",
                    "source": {"type": "transcript", "id": t2_turns[2].id, "turn_index": 2, "quote": "No chest pain, no dizziness, and vision is fine"},
                },
            ],
            "objective": [
                {
                    "finding": "Clinic Vitals: Blood Pressure 138/84 mmHg (well-controlled on Telmisartan), Pulse 74 bpm.",
                    "category": "Hemodynamics",
                    "source": {"type": "document", "id": doc2.id, "label": "Prescription Record", "quote": "BP: 138/84 mmHg"},
                },
                {
                    "finding": "Recent Lab Panel: Fasting Plasma Glucose 132 mg/dL, HbA1c 6.8% (Target < 7.0%).",
                    "category": "Glycemic Control",
                    "source": {"type": "document", "id": doc2.id, "label": "Lab Values", "quote": "FBS: 132 mg/dL, HbA1c: 6.8%"},
                },
            ],
            "assessment": [
                {
                    "diagnosis": "Type 2 Diabetes Mellitus without acute complications — Good Glycemic Control (HbA1c 6.8%)",
                    "category": "Primary Assessment",
                    "source": {"type": "document", "id": doc2.id, "quote": "HbA1c: 6.8%"},
                },
                {
                    "diagnosis": "Essential Hypertension — Controlled on Angiotensin Receptor Blocker",
                    "category": "Co-morbidity",
                    "source": {"type": "document", "id": doc2.id, "quote": "BP: 138/84 mmHg"},
                },
            ],
            "plan": [
                {
                    "step": "Continue current pharmacotherapy: Metformin 500mg BD, Telmisartan 40mg OD, Atorvastatin 10mg HS without dose change.",
                    "category": "Medication Management",
                    "source": {"type": "guideline", "label": "ADA Standards of Care 2024"},
                },
                {
                    "step": "Schedule annual comprehensive diabetic retinopathy screening and urinary albumin-to-creatinine ratio (uACR).",
                    "category": "Preventive Screening",
                    "source": {"type": "guideline", "label": "KDIGO / ADA Microvascular Screening"},
                },
                {
                    "step": "Recheck Lipid Profile, Serum Creatinine, and HbA1c in 3 months; continue daily home BP log.",
                    "category": "Monitoring",
                    "source": {"type": "guideline", "label": "Follow-up schedule"},
                },
            ],
            "clinical_summary": "62yo male with well-managed T2DM (HbA1c 6.8%) and HTN (BP 138/84) on stable 3-drug regimen. Document verified side-by-side.",
        }
        c2 = CaseDraft(
            visit_id=v2.id,
            content_json=draft_content_2,
            source_links_json={"guidelines": ["ADA Standards of Care in Diabetes 2024", "AHA/ACC Hypertension Management"]},
            is_approved=False,
        )
        db.add(c2)

        # -----------------------------------------------------------------------
        # PATIENT 3: Red-Flag Urgent Case (Rajesh Gupta - Acute Chest Pain / Cardiac)
        # -----------------------------------------------------------------------
        p3 = Patient(
            name="Rajesh Gupta",
            age=54,
            language="English",
        )
        db.add(p3)
        db.flush()

        v3 = Visit(
            patient_id=p3.id,
            status="pending",
            urgency_flag=True,
            department="Cardiology",
            urgency_reason="Chest pain combined with breathlessness indicates possible acute coronary syndrome / myocardial infarction.",
        )
        db.add(v3)
        db.flush()

        # Multi-turn intake containing triggered red-flag keywords
        t3_turns = [
            IntakeTurn(
                visit_id=v3.id,
                step="chief_complaint",
                question="What brings you to the emergency intake today?",
                transcript="I have sudden severe crushing chest pain radiating to my left arm, and I am experiencing severe breathlessness for the last 45 minutes.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v3.id,
                step="duration",
                question="When did this chest discomfort start?",
                transcript="It started suddenly 45 minutes ago while climbing stairs from the parking lot. The tightness has not eased with rest.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v3.id,
                step="associated_symptoms",
                question="Are you experiencing diaphoresis, nausea, or dizziness?",
                transcript="Yes, profuse cold sweats, feeling dizzy, and nauseated. It feels like a heavy weight pressing on my chest.",
                language="en",
            ),
            IntakeTurn(
                visit_id=v3.id,
                step="past_history",
                question="Do you have any past heart conditions or family history?",
                transcript="History of smoking 1 pack a day for 20 years and borderline high cholesterol. Father had heart attack at age 52.",
                language="en",
            ),
        ]
        db.add_all(t3_turns)
        db.flush()

        # Generated Urgent Cardiology Draft
        draft_content_3 = {
            "chief_complaint": "Acute onset crushing retrosternal chest pain radiating to left arm with dyspnea and diaphoresis (45 mins)",
            "subjective": [
                {
                    "fact": "54yo male presenting with sudden onset 8/10 crushing substernal chest pressure radiating to left upper extremity and neck, ongoing for 45 minutes.",
                    "category": "RED FLAG: Acute Coronary Presentation",
                    "source": {"type": "transcript", "id": t3_turns[0].id, "turn_index": 0, "quote": "sudden severe crushing chest pain radiating to my left arm, and I am experiencing severe breathlessness"},
                },
                {
                    "fact": "Severe accompanying dyspnea, profuse diaphoresis, and lightheadedness unimproved by rest.",
                    "category": "Associated High-Risk Symptoms",
                    "source": {"type": "transcript", "id": t3_turns[2].id, "turn_index": 2, "quote": "profuse cold sweats, feeling dizzy, and nauseated"},
                },
                {
                    "fact": "Significant cardiovascular risk profile: 20 pack-year smoking history and premature CAD in first-degree relative.",
                    "category": "Cardiac Risk Factors",
                    "source": {"type": "transcript", "id": t3_turns[3].id, "turn_index": 3, "quote": "History of smoking 1 pack a day for 20 years... Father had heart attack at age 52"},
                },
            ],
            "objective": [
                {
                    "finding": "Urgent Triage Vitals: BP 154/96 mmHg, Pulse 102 bpm (sinus tachycardia), SpO2 93% on room air, RR 24/min.",
                    "category": "Hemodynamics",
                    "source": {"type": "clinical_baseline", "label": "Triage Vitals"},
                },
                {
                    "finding": "Physical Exam: Patient in acute distress, cold clammy extremities, rapid respiratory effort.",
                    "category": "Clinical Presentation",
                    "source": {"type": "clinical_baseline", "label": "Emergency Exam"},
                },
            ],
            "assessment": [
                {
                    "diagnosis": "🚨 High Suspicion for Acute Coronary Syndrome (STEMI vs NSTEMI / Unstable Angina) — URGENT",
                    "category": "Primary Emergency Diagnosis",
                    "source": {"type": "transcript", "id": t3_turns[0].id, "quote": "crushing chest pain radiating to my left arm"},
                }
            ],
            "plan": [
                {
                    "step": "IMMEDIATE: 12-lead ECG stat (&lt; 10 mins) and continuous cardiac telemetry monitoring.",
                    "category": "Immediate Diagnostic Priority",
                    "source": {"type": "guideline", "label": "AHA/ACC 2023 STEMI/NSTEMI Guidelines"},
                },
                {
                    "step": "STAT Labs: High-sensitivity Troponin-I/T, CK-MB, electrolytes, complete blood count, and lipid panel.",
                    "category": "Cardiac Biomarkers",
                    "source": {"type": "guideline", "label": "ESC Acute Coronary Syndrome 2023"},
                },
                {
                    "step": "STAT Meds: Chewable Aspirin 300mg stat, Sublingual Nitroglycerin 0.4mg (hold if SBP &lt; 90), IV access, Supplemental O2.",
                    "category": "Initial Emergency Pharmacotherapy",
                    "source": {"type": "guideline", "label": "Emergency Cardiology Protocol"},
                },
                {
                    "step": "Urgent on-call Interventional Cardiologist consultation for potential emergent cardiac catheterization.",
                    "category": "Specialist Escalation",
                    "source": {"type": "guideline", "label": "Cath Lab Activation Pathway"},
                },
            ],
            "clinical_summary": "URGENT RED-FLAG: 54yo male with acute crushing chest pain, dyspnea, and diaphoresis. Immediate transfer to Cardiology / Resus.",
        }
        c3 = CaseDraft(
            visit_id=v3.id,
            content_json=draft_content_3,
            source_links_json={"guidelines": ["AHA/ACC Guideline for the Management of Patients With Acute Coronary Syndromes", "ESC 2023 ACS Guidelines"]},
            is_approved=False,
        )
        db.add(c3)

        db.commit()
        logger.info(
            "Successfully seeded 3 demo patients:\n"
            f"  1. [Routine] {p1.name} (Visit #{v1.id}) - Dept: {v1.department}, Urgent: {v1.urgency_flag}\n"
            f"  2. [Document Upload] {p2.name} (Visit #{v2.id}) - Dept: {v2.department}, Doc: {doc2.filename}\n"
            f"  3. [Red-Flag Urgent] {p3.name} (Visit #{v3.id}) - Dept: {v3.department}, Urgent: {v3.urgency_flag}, Reason: {v3.urgency_reason}\n"
        )
        return {
            "status": "success",
            "message": "3 demo patients successfully seeded into database.",
            "patients": [
                {"id": p1.id, "name": p1.name, "visit_id": v1.id, "type": "routine", "department": v1.department},
                {"id": p2.id, "name": p2.name, "visit_id": v2.id, "type": "document_upload", "department": v2.department, "document": doc2.filename},
                {"id": p3.id, "name": p3.name, "visit_id": v3.id, "type": "red_flag_urgent", "department": v3.department, "urgency_flag": v3.urgency_flag},
            ],
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding demo patients: {e}", exc_info=True)
        raise e
    finally:
        if should_close:
            db.close()


if __name__ == "__main__":
    result = seed_demo_patients()
    print("Seed execution finished:", result)
