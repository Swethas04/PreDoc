import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.main import app
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.intake_turn import IntakeTurn
from app.models.document_record import DocumentRecord
from app.models.case_draft import CaseDraft
from tests.db_test_utils import TestingSessionLocal, test_engine


class TestVisitsAndCaseDraft(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=test_engine)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        pass

    def setUp(self):
        Base.metadata.create_all(bind=test_engine)
        self.db = TestingSessionLocal()
        # Seed test patient and visit
        patient = Patient(name="Sunita Sharma", age=52, language="en")
        self.db.add(patient)
        self.db.flush()

        visit = Visit(patient_id=patient.id, status="intake_complete", urgency_flag=False)
        self.db.add(visit)
        self.db.flush()

        # Seed intake turns
        turn1 = IntakeTurn(
            visit_id=visit.id,
            step="chief_complaint",
            question="What brings you in today?",
            transcript="I have severe throbbing headache and mild dizziness for the past 4 days.",
            language="en",
        )
        turn2 = IntakeTurn(
            visit_id=visit.id,
            step="past_history",
            question="Do you have any past medical history?",
            transcript="I was diagnosed with high blood pressure 3 years ago.",
            language="en",
        )
        self.db.add_all([turn1, turn2])

        # Seed document record
        doc = DocumentRecord(
            visit_id=visit.id,
            filename="prescription_nov2023.jpg",
            mime_type="image/jpeg",
            extracted_json={
                "drug_names": [
                    {"name": "Telmisartan", "dosage": "40mg", "frequency": "Once daily morning"},
                    {"name": "Aspirin", "dosage": "75mg", "frequency": "Once daily night"},
                ],
                "diagnoses": ["Essential Hypertension"],
                "measurements": [
                    {"raw": "BP 145/92 mmHg", "type": "Blood Pressure"},
                    {"raw": "Pulse 82 bpm", "type": "Heart Rate"},
                ],
                "dates": [{"label": "Prescription Date", "value": "2023-11-20"}],
            },
            raw_text="Telmisartan 40mg, Aspirin 75mg, BP 145/92 mmHg",
        )
        self.db.add(doc)
        self.db.commit()

        self.visit_id = visit.id
        self.patient_id = patient.id

    def tearDown(self):
        self.db.query(CaseDraft).delete()
        self.db.query(DocumentRecord).delete()
        self.db.query(IntakeTurn).delete()
        self.db.query(Visit).delete()
        self.db.query(Patient).delete()
        self.db.commit()
        self.db.close()

    def test_generate_draft_endpoint(self):
        response = self.client.post(f"/api/visits/{self.visit_id}/generate-draft")
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()

        # Validate top-level response structure
        self.assertEqual(data["visit_id"], self.visit_id)
        self.assertIn("draft_id", data)
        self.assertIn("content", data)
        self.assertIn("source_links", data)
        self.assertEqual(data["patient_name"], "Sunita Sharma")

        # Validate SOAP content
        content = data["content"]
        self.assertIn("subjective", content)
        self.assertIn("objective", content)
        self.assertIn("assessment", content)
        self.assertIn("plan", content)
        self.assertTrue(len(content["subjective"]) > 0)
        self.assertTrue(len(content["objective"]) > 0)

        # Validate every SOAP item has valid fact and source attribution
        for section in ("subjective", "objective", "assessment", "plan"):
            for item in content[section]:
                self.assertIn("fact", item)
                self.assertTrue(len(item["fact"]) > 0)
                self.assertIn("source", item)
                src = item["source"]
                self.assertIn(src["type"], ["turn", "document"])
                self.assertIsInstance(src["id"], int)
                self.assertIn("label", src)

        # Verify saved in database
        saved_draft = self.db.query(CaseDraft).filter(CaseDraft.visit_id == self.visit_id).first()
        self.assertIsNotNone(saved_draft)
        self.assertIsNotNone(saved_draft.content_json)

        # Verify visit status updated
        visit = self.db.query(Visit).filter(Visit.id == self.visit_id).first()
        self.assertEqual(visit.status, "draft_generated")

    def test_get_case_context(self):
        # Generate draft first
        self.client.post(f"/api/visits/{self.visit_id}/generate-draft")

        # Now fetch case context
        response = self.client.get(f"/api/visits/{self.visit_id}/case")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["visit_id"], self.visit_id)
        self.assertEqual(data["patient"]["name"], "Sunita Sharma")
        self.assertEqual(len(data["turns"]), 2)
        self.assertEqual(len(data["documents"]), 1)
        self.assertIsNotNone(data["draft"])
        self.assertEqual(data["draft"]["visit_id"], self.visit_id)

    def test_list_visits(self):
        response = self.client.get("/api/visits")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(len(data) >= 1)
        visit_entry = next((v for v in data if v["visit_id"] == self.visit_id), None)
        self.assertIsNotNone(visit_entry)
        self.assertEqual(visit_entry["patient_name"], "Sunita Sharma")
        self.assertEqual(visit_entry["turn_count"], 2)
        self.assertEqual(visit_entry["doc_count"], 1)


if __name__ == "__main__":
    unittest.main()
