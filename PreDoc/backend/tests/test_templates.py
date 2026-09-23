import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from tests.db_test_utils import TestingSessionLocal, test_engine
from app.models.hospital_template import HospitalTemplate
from app.models.prescription import Prescription
from app.models.visit import Visit
from app.models.patient import Patient
from app.services.pdf_service import generate_prescription_pdf, generate_default_prescription_pdf

client = TestClient(app)


@pytest.fixture(autouse=True)
def db_session():
    from app.database import Base
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    yield db
    db.close()


def test_pdf_generation_fallback():
    """Test generating standard prescription PDF without template."""
    sample_rx = {
        "id": 101,
        "visit_id": 42,
        "patient_name": "Eleanor Vance",
        "patient_age": "34",
        "patient_gender": "Female",
        "doctor_name": "Dr. Sarah Lin, MD",
        "diagnosis": "Acute Bronchitis and Upper Respiratory Infection",
        "medicines": [
            {
                "name": "Amoxicillin 500mg",
                "dosage": "500mg",
                "frequency": "1-0-1 (Twice daily)",
                "duration": "5 days",
                "instructions": "After meals",
                "composition": "Amoxicillin Trihydrate",
            },
            {
                "name": "Paracetamol 650mg",
                "dosage": "650mg",
                "frequency": "SOS (As needed)",
                "duration": "3 days",
                "instructions": "With water",
                "composition": "Acetaminophen",
            },
        ],
        "general_advice": "Drink warm fluids, steam inhalation twice daily.",
        "follow_up": "Review after 5 days if fever persists.",
        "share_token": "test-token-123456",
    }

    pdf_bytes = generate_prescription_pdf(sample_rx, template=None)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF")


def test_pdf_generation_with_custom_template():
    """Test generating prescription PDF using custom percentage coordinate mapping."""
    from PIL import Image

    # Create a dummy letterhead image in memory
    img = Image.new("RGB", (800, 1100), color=(240, 244, 248))
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format="PNG")
    img_bytes = img_byte_arr.getvalue()

    # Upload letterhead
    response = client.post(
        "/api/templates/upload",
        files={"file": ("test_hospital_letterhead.png", img_bytes, "image/png")},
    )
    assert response.status_code == 200
    upload_data = response.json()
    assert "file_url" in upload_data
    assert "default_field_positions" in upload_data

    # Create template
    tmpl_payload = {
        "name": "City General Hospital Letterhead",
        "hospital_name": "City General Hospital",
        "template_file_url": upload_data["file_url"],
        "template_file_path": upload_data["file_path"],
        "mime_type": "image/png",
        "page_size": "A4",
        "field_positions_json": upload_data["default_field_positions"],
        "is_default": True,
    }

    create_resp = client.post("/api/templates", json=tmpl_payload)
    assert create_resp.status_code == 200
    created_tmpl = create_resp.json()
    assert created_tmpl["id"] is not None
    assert created_tmpl["name"] == "City General Hospital Letterhead"

    # Test template listing and active
    active_resp = client.get("/api/templates/active")
    assert active_resp.status_code == 200
    active_data = active_resp.json()
    assert active_data["id"] == created_tmpl["id"]

    # Test PDF generation endpoint with this template
    db = TestingSessionLocal()
    # Create or find a test visit and prescription
    patient = db.query(Patient).first()
    if not patient:
        patient = Patient(name="Test Patient", age=40, patient_code="PD-TEST01")
        db.add(patient)
        db.commit()

    visit = db.query(Visit).first()
    if not visit:
        visit = Visit(patient_id=patient.id, department="General Medicine", status="completed")
        db.add(visit)
        db.commit()

    rx = Prescription(
        visit_id=visit.id,
        patient_id=patient.id,
        doctor_name="Dr. Robert Chen",
        diagnosis="Hypertension Stage 1",
        medicines=[
            {"name": "Amlodipine 5mg", "dosage": "5mg", "frequency": "1-0-0", "duration": "30 days", "instructions": "Morning after breakfast"},
            {"name": "Telmisartan 40mg", "dosage": "40mg", "frequency": "0-0-1", "duration": "30 days", "instructions": "Night after dinner"},
        ],
        general_advice="Low sodium diet, daily 30 min brisk walk.",
        follow_up="Monthly BP check.",
    )
    db.add(rx)
    db.commit()
    db.refresh(rx)
    db.close()

    print_resp = client.get(f"/api/prescriptions/{rx.id}/print")
    assert print_resp.status_code == 200
    assert print_resp.headers["content-type"] == "application/pdf"
    assert len(print_resp.content) > 500
    assert print_resp.content.startswith(b"%PDF")


def test_print_custom_prescription_with_overrides():
    """Test POST /api/prescriptions/print with manual doctor field overrides."""
    db = TestingSessionLocal()
    patient = Patient(name="Rajesh Gupta", age=42, patient_code="PD-RG4201")
    db.add(patient)
    db.commit()

    visit = Visit(patient_id=patient.id, department="General Medicine", status="completed")
    db.add(visit)
    db.commit()

    rx = Prescription(
        visit_id=visit.id,
        patient_id=patient.id,
        doctor_name="Dr. Sarah Lin",
        diagnosis="Acute Bronchitis",
        medicines=[
            {"name": "Amoxicillin 500mg", "dosage": "500mg", "frequency": "1-0-1", "duration": "5 days", "instructions": "After food"},
            {"name": "Paracetamol 650mg", "dosage": "650mg", "frequency": "SOS", "duration": "3 days", "instructions": "After food"},
        ],
        general_advice="Drink warm water, take steam inhalation.",
        follow_up="Review in 5 days.",
    )
    db.add(rx)
    db.commit()
    db.refresh(rx)
    visit_id = visit.id
    rx_id = rx.id
    db.close()

    # Post overrides
    payload = {
        "visit_id": visit_id,
        "prescription_id": rx_id,
        "patient_name": "Rajesh Gupta (Edited)",
        "patient_age": "43",
        "doctor_name": "Dr. Sarah Lin, MD",
        "medicines": [
            {"name": "Amoxicillin 500mg", "dosage": "500mg", "frequency": "1-0-1", "duration": "5 days", "instructions": "After food"},
            {"name": "Paracetamol 650mg", "dosage": "650mg", "frequency": "SOS", "duration": "3 days", "instructions": "After food"},
            {"name": "Cetirizine 10mg", "dosage": "10mg", "frequency": "0-0-1", "duration": "5 days", "instructions": "Night"},
        ],
        "general_advice": "Hydrate well and rest.",
    }

    res = client.post("/api/prescriptions/print", json=payload)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert len(res.content) > 500
    assert res.content.startswith(b"%PDF")

