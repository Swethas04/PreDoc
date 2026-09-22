import unittest
from fastapi.testclient import TestClient
from tests.db_test_utils import TestingSessionLocal
from app.main import app
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.case_draft import CaseDraft
from app.models.intake_turn import IntakeTurn
from app.models.document_record import DocumentRecord


class TestDoctorWorkflow(unittest.TestCase):
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

        # Create test patient
        self.patient = Patient(name="Ramesh Patel", age=58, language="English")
        self.db.add(self.patient)
        self.db.commit()
        self.db.refresh(self.patient)

        # Create test visit
        self.visit = Visit(
            patient_id=self.patient.id,
            status="pending",
            urgency_flag=True,
            department="Cardiology",
        )
        self.db.add(self.visit)
        self.db.commit()
        self.db.refresh(self.visit)

        # Create test case draft
        self.initial_content = {
            "chief_complaint": "Chest tightness on climbing stairs",
            "subjective": [
                {
                    "fact": "Patient reports retrosternal tightness for 3 days",
                    "source": {"type": "transcript", "id": 1, "turn_index": 0, "quote": "I have chest tightness"},
                }
            ],
            "objective": [
                {
                    "finding": "ECG shows sinus rhythm, BP 140/90",
                    "source": {"type": "document", "id": 1, "filename": "ecg_report.jpg"},
                }
            ],
            "assessment": [
                {
                    "diagnosis": "Suspected Angina Pectoris",
                    "source": {"type": "transcript", "id": 1, "quote": "I have chest tightness"},
                }
            ],
            "plan": [
                {
                    "step": "Schedule 2D Echocardiogram and cardiology consult",
                    "source": {"type": "transcript", "id": 1},
                }
            ],
        }
        self.draft = CaseDraft(
            visit_id=self.visit.id,
            content_json=self.initial_content,
            source_links_json={"guidelines": ["AHA 2023 Chest Pain Protocol"]},
            is_approved=False,
        )
        self.db.add(self.draft)

        # Add intake turn
        self.intake_turn = IntakeTurn(
            visit_id=self.visit.id,
            step="chief_complaint",
            question="What brings you to the hospital today?",
            transcript="I have chest tightness when climbing stairs.",
            language="en",
        )
        self.db.add(self.intake_turn)

        # Add document record with base64 image
        self.doc = DocumentRecord(
            visit_id=self.visit.id,
            filename="ecg_report.jpg",
            mime_type="image/jpeg",
            raw_text="ECG Report: Sinus rhythm, HR 72, BP 140/90",
            extracted_json={"diagnoses": ["Sinus rhythm"], "measurements": [{"type": "BP", "raw": "140/90"}]},
            image_base64="data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        )
        self.db.add(self.doc)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_doctor_queue_listing(self):
        """Test GET /api/visits/doctor-queue returns the visit with draft metadata."""
        response = self.client.get("/api/visits/doctor-queue")
        self.assertEqual(response.status_code, 200)
        queue = response.json()
        self.assertGreaterEqual(len(queue), 1)

        matched = next((v for v in queue if v["id"] == self.visit.id), None)
        self.assertIsNotNone(matched)
        self.assertEqual(matched["patient_name"], "Ramesh Patel")
        self.assertEqual(matched["patient_age"], 58)
        self.assertEqual(matched["department"], "Cardiology")
        self.assertTrue(matched["urgency_flag"])
        self.assertTrue(matched["has_draft"])
        self.assertFalse(matched["is_approved"])
        self.assertIn("Chest tightness", matched["chief_complaint"])

    def test_inline_case_draft_edit(self):
        """Test PUT /api/visits/{id}/case-draft allows modifying SOAP content before approval."""
        updated_content = dict(self.initial_content)
        updated_content["chief_complaint"] = "Exertional chest tightness with mild dyspnea"
        updated_content["assessment"] = [
            {
                "diagnosis": "Atypical Angina / Coronary Artery Disease Workup",
                "source": {"type": "transcript", "id": 1},
            }
        ]
        updated_content["plan"] = [
            {
                "step": "Order urgent Trop-T, 2D Echo, and start Aspirin 75mg stat",
                "source": {"type": "doctor_edit"},
            }
        ]

        payload = {
            "content": updated_content,
            "source_links": {"guidelines": ["ESC 2024 Chronic Coronary Syndromes Guidelines"]},
        }

        response = self.client.put(f"/api/visits/{self.visit.id}/case-draft", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["content"]["chief_complaint"], "Exertional chest tightness with mild dyspnea")
        self.assertEqual(data["content"]["assessment"][0]["diagnosis"], "Atypical Angina / Coronary Artery Disease Workup")
        self.assertFalse(data["is_approved"])

        # Verify persisted in database
        self.db.refresh(self.draft)
        self.assertEqual(self.draft.content_json["chief_complaint"], "Exertional chest tightness with mild dyspnea")

    def test_approve_draft_and_lock(self):
        """Test POST /api/visits/{id}/approve sets status='approved', locks draft, and blocks edits."""
        # 1. Approve the visit draft
        approve_payload = {"approved_by": "Dr. Sarah Rao, MD"}
        response = self.client.post(f"/api/visits/{self.visit.id}/approve", json=approve_payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["visit_status"], "approved")
        self.assertTrue(data["is_approved"])
        self.assertEqual(data["approved_by"], "Dr. Sarah Rao, MD")
        self.assertIsNotNone(data["approved_at"])

        # 2. Verify visit status in DB is 'approved'
        self.db.refresh(self.visit)
        self.assertEqual(self.visit.status, "approved")
        self.db.refresh(self.draft)
        self.assertTrue(self.draft.is_approved)

        # 3. Verify that attempting to edit an approved draft is rejected
        edit_payload = {
            "content": self.initial_content,
            "source_links": {},
        }
        reject_res = self.client.put(f"/api/visits/{self.visit.id}/case-draft", json=edit_payload)
        self.assertEqual(reject_res.status_code, 400)
        self.assertIn("Cannot edit an approved case draft", reject_res.json()["detail"])

    def test_case_context_includes_evidence_and_images(self):
        """Test GET /api/visits/{id}/case-context returns full transcripts, base64 images, and approval info."""
        response = self.client.get(f"/api/visits/{self.visit.id}/case-context")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["visit"]["id"], self.visit.id)
        self.assertEqual(data["patient"]["name"], "Ramesh Patel")
        self.assertGreaterEqual(len(data["transcripts"]), 1)
        self.assertGreaterEqual(len(data["documents"]), 1)
        self.assertEqual(data["documents"][0]["image_base64"], "data:image/jpeg;base64,/9j/4AAQSkZJRg==")
        self.assertIsNotNone(data["draft"])
        self.assertFalse(data["draft"]["is_approved"])


if __name__ == "__main__":
    unittest.main()
