import unittest
from fastapi.testclient import TestClient
from tests.db_test_utils import TestingSessionLocal
from app.main import app
from seed_demo_data import seed_demo_patients
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.case_draft import CaseDraft
from app.models.intake_turn import IntakeTurn
from app.models.document_record import DocumentRecord


class TestEndToEndDemo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.db = TestingSessionLocal()
        # Clean up database
        self.db.query(CaseDraft).delete()
        self.db.query(DocumentRecord).delete()
        self.db.query(IntakeTurn).delete()
        self.db.query(Visit).delete()
        self.db.query(Patient).delete()
        self.db.commit()

        # Execute seed function into the test database session
        seed_demo_patients(db=self.db)

    def tearDown(self):
        self.db.close()

    def test_routine_patient_priya_sharma(self):
        """Verify Routine Patient 1 (Priya Sharma): complete intake turns, draft, edit and approval flow."""
        patient = self.db.query(Patient).filter(Patient.name == "Priya Sharma").first()
        self.assertIsNotNone(patient)
        self.assertEqual(patient.age, 28)

        visit = self.db.query(Visit).filter(Visit.patient_id == patient.id).first()
        self.assertIsNotNone(visit)
        self.assertFalse(visit.urgency_flag)
        self.assertEqual(visit.department, "General Medicine")
        self.assertEqual(visit.status, "pending")

        # Verify multi-turn intake history
        turns = self.db.query(IntakeTurn).filter(IntakeTurn.visit_id == visit.id).all()
        self.assertGreaterEqual(len(turns), 4)

        # Retrieve case context via API
        res = self.client.get(f"/api/visits/{visit.id}/case")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["patient"]["name"], "Priya Sharma")
        self.assertIsNotNone(data["draft"])
        self.assertIn("Allergic Rhinitis", data["draft"]["content"]["assessment"][0]["diagnosis"])

        # Test Doctor inline edit
        draft_content = data["draft"]["content"]
        draft_content["plan"].append({
            "step": "Follow up in 2 weeks if nasal symptoms persist despite antihistamines",
            "category": "Follow-up",
            "source": {"type": "doctor_edit"},
        })
        edit_res = self.client.put(f"/api/visits/{visit.id}/case-draft", json={"content": draft_content})
        self.assertEqual(edit_res.status_code, 200)

        # Test Doctor final approval
        approve_res = self.client.post(f"/api/visits/{visit.id}/approve", json={"doctor_name": "Dr. Sarah Rao, MD"})
        self.assertEqual(approve_res.status_code, 200)
        self.assertEqual(approve_res.json()["status"], "approved")
        self.assertTrue(approve_res.json()["is_approved"])

    def test_prescription_upload_patient_suresh_kumar(self):
        """Verify Patient 2 (Suresh Kumar): uploaded prescription image, OCR extraction, and side-by-side evidence."""
        patient = self.db.query(Patient).filter(Patient.name == "Suresh Kumar").first()
        self.assertIsNotNone(patient)
        self.assertEqual(patient.age, 62)

        visit = self.db.query(Visit).filter(Visit.patient_id == patient.id).first()
        self.assertIsNotNone(visit)

        # Verify document record with base64 image and medication extractions
        doc = self.db.query(DocumentRecord).filter(DocumentRecord.visit_id == visit.id).first()
        self.assertIsNotNone(doc)
        self.assertIn("Prescription", doc.filename)
        self.assertTrue(doc.image_base64.startswith("data:image/"))

        extracted = doc.extracted_json
        drug_names = [d["name"] for d in extracted["drug_names"]]
        self.assertIn("Metformin Hydrochloride", drug_names)
        self.assertIn("Telmisartan", drug_names)
        self.assertIn("Atorvastatin", drug_names)

        # Retrieve full case context via API
        res = self.client.get(f"/api/visits/{visit.id}/case")
        self.assertEqual(res.status_code, 200)
        case_data = res.json()
        self.assertGreaterEqual(len(case_data["documents"]), 1)
        self.assertTrue(case_data["documents"][0]["image_base64"].startswith("data:image/"))

    def test_red_flag_urgent_patient_rajesh_gupta(self):
        """Verify Patient 3 (Rajesh Gupta): acute chest pain red-flag trigger, cardiology department, and triage queue presence."""
        patient = self.db.query(Patient).filter(Patient.name == "Rajesh Gupta").first()
        self.assertIsNotNone(patient)
        self.assertEqual(patient.age, 54)

        visit = self.db.query(Visit).filter(Visit.patient_id == patient.id).first()
        self.assertIsNotNone(visit)
        self.assertTrue(visit.urgency_flag)
        self.assertEqual(visit.department, "Cardiology")
        self.assertIn("Chest pain", visit.urgency_reason)

        # Check /api/visits/triage queue
        triage_res = self.client.get("/api/visits/triage")
        self.assertEqual(triage_res.status_code, 200)
        triage_list = triage_res.json()
        matched = next((v for v in triage_list if v["visit_id"] == visit.id), None)
        self.assertIsNotNone(matched)
        self.assertEqual(matched["patient_name"], "Rajesh Gupta")
        self.assertEqual(matched["department"], "Cardiology")
        self.assertTrue(matched["urgency_flag"])

        # Check /api/visits/doctor-queue
        doc_queue_res = self.client.get("/api/visits/doctor-queue")
        self.assertEqual(doc_queue_res.status_code, 200)
        queue_list = doc_queue_res.json()
        doc_matched = next((v for v in queue_list if v["id"] == visit.id), None)
        self.assertIsNotNone(doc_matched)
        self.assertTrue(doc_matched["urgency_flag"])
        self.assertEqual(doc_matched["department"], "Cardiology")


if __name__ == "__main__":
    unittest.main()
