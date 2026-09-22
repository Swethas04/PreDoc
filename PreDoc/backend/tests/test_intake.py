import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from tests.db_test_utils import TestingSessionLocal, test_engine
from app.database import Base
from app.main import app
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.intake_turn import IntakeTurn
from app.models.case_draft import CaseDraft
from app.models.document_record import DocumentRecord


class TestIntakeEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=test_engine)
        cls.client = TestClient(app)

    def setUp(self):
        self.question_patcher = patch(
            "app.routers.intake.get_next_question",
            return_value="How long have you had these symptoms?"
        )
        self.question_patcher.start()
        self.db = TestingSessionLocal()
        self.db.query(CaseDraft).delete()
        self.db.query(DocumentRecord).delete()
        self.db.query(IntakeTurn).delete()
        self.db.query(Visit).delete()
        self.db.query(Patient).delete()
        self.db.commit()

    def tearDown(self):
        self.question_patcher.stop()
        self.db.close()

    def test_start_intake_flow(self):
        """Test POST /api/intake/start initiates consultation session."""
        payload = {
            "patient_name": "Aarav Sharma",
            "patient_age": 32,
            "language": "en"
        }
        res = self.client.post("/api/intake/start", json=payload)
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertIn("visit_id", data)
        self.assertIn("patient_id", data)
        self.assertEqual(data["first_step"], "chief_complaint")
        self.assertTrue(len(data["first_question"]) > 0)
        self.assertEqual(len(data["steps"]), 6)

        visit_id = data["visit_id"]

        # Verify visit and turn created in DB
        visit = self.db.query(Visit).filter(Visit.id == visit_id).first()
        self.assertIsNotNone(visit)
        self.assertEqual(visit.status, "intake_in_progress")

        turns = self.db.query(IntakeTurn).filter(IntakeTurn.visit_id == visit_id).all()
        self.assertEqual(len(turns), 1)
        self.assertEqual(turns[0].step, "chief_complaint")
        self.assertIsNone(turns[0].transcript)

    def test_respond_intake_tap_mode_advances_step(self):
        """Test POST /api/intake/respond in Tap mode with transcript_text advances to Step 2."""
        # 1. Start intake
        start_res = self.client.post("/api/intake/start", json={"patient_name": "Meera Patel", "patient_age": 45, "language": "en"})
        self.assertEqual(start_res.status_code, 200)
        visit_id = start_res.json()["visit_id"]

        # 2. Respond to Step 1 (chief_complaint) via /respond
        respond_res = self.client.post(
            "/api/intake/respond",
            data={
                "visit_id": str(visit_id),
                "step": "chief_complaint",
                "language": "en",
                "transcript_text": "I am experiencing fever and cough.",
            }
        )
        self.assertEqual(respond_res.status_code, 200, respond_res.text)
        data = respond_res.json()
        self.assertEqual(data["visit_id"], visit_id)
        self.assertEqual(data["step"], "chief_complaint")
        self.assertEqual(data["transcript"], "I am experiencing fever and cough.")
        self.assertEqual(data["next_step"], "duration")
        self.assertFalse(data["is_complete"])
        self.assertIsNotNone(data["next_question"])

    def test_respond_intake_using_transcript_alias(self):
        """Test POST /api/intake/respond accepts 'transcript' field as alias."""
        start_res = self.client.post("/api/intake/start", json={"patient_name": "Rohan Verma", "patient_age": 29, "language": "en"})
        visit_id = start_res.json()["visit_id"]

        respond_res = self.client.post(
            "/api/intake/respond",
            data={
                "visit_id": str(visit_id),
                "step": "chief_complaint",
                "language": "en",
                "transcript": "Severe throbbing headache for 2 days",
            }
        )
        self.assertEqual(respond_res.status_code, 200, respond_res.text)
        data = respond_res.json()
        self.assertEqual(data["transcript"], "Severe throbbing headache for 2 days")
        self.assertEqual(data["next_step"], "duration")

    def test_respond_intake_turn_route_alias(self):
        """Test POST /api/intake/turn alias route works identically to /respond."""
        start_res = self.client.post("/api/intake/start", json={"patient_name": "Kiran Rao", "patient_age": 50, "language": "en"})
        visit_id = start_res.json()["visit_id"]

        turn_res = self.client.post(
            "/api/intake/turn",
            data={
                "visit_id": str(visit_id),
                "step": "chief_complaint",
                "language": "en",
                "transcript_text": "Back pain and stiff neck",
            }
        )
        self.assertEqual(turn_res.status_code, 200, turn_res.text)
        data = turn_res.json()
        self.assertEqual(data["step"], "chief_complaint")
        self.assertEqual(data["next_step"], "duration")

    def test_speak_mode_fallback_transcript(self):
        """Test POST /api/intake/respond with client_transcript fallback when voice transcription is provided."""
        start_res = self.client.post("/api/intake/start", json={"patient_name": "Ananya Roy", "patient_age": 24, "language": "en"})
        visit_id = start_res.json()["visit_id"]

        respond_res = self.client.post(
            "/api/intake/respond",
            data={
                "visit_id": str(visit_id),
                "step": "chief_complaint",
                "language": "en",
                "client_transcript": "Chest tightness and breathlessness",
            }
        )
        self.assertEqual(respond_res.status_code, 200, respond_res.text)
        data = respond_res.json()
        self.assertEqual(data["transcript"], "Chest tightness and breathlessness")
        # Chest tightness + breathlessness triggers cardiology red flag
        self.assertTrue(data["urgency_flag"])
        self.assertEqual(data["department"], "Cardiology")


    def test_update_patient_demographics(self):
        """Test PATCH /api/intake/patient/{visit_id} updates patient name and age."""
        start_res = self.client.post("/api/intake/start", json={"patient_name": "Patient", "patient_age": 35, "language": "en"})
        self.assertEqual(start_res.status_code, 200)
        visit_id = start_res.json()["visit_id"]

        patch_res = self.client.patch(
            f"/api/intake/patient/{visit_id}",
            json={"name": "Priya Sharma", "age": 28}
        )
        self.assertEqual(patch_res.status_code, 200, patch_res.text)
        data = patch_res.json()
        self.assertEqual(data["name"], "Priya Sharma")
        self.assertEqual(data["age"], 28)

        # Verify persisted in database
        visit = self.db.query(Visit).filter(Visit.id == visit_id).first()
        self.assertEqual(visit.patient.name, "Priya Sharma")
        self.assertEqual(visit.patient.age, 28)

    def test_parse_demographics_endpoint_success(self):
        """Test POST /api/intake/parse-demographics extracts name and age from spoken text."""
        res = self.client.post(
            "/api/intake/parse-demographics",
            data={
                "transcript_text": "My name is Rajesh Gupta and I am 54 years old",
                "language": "en",
            }
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["name"], "Rajesh Gupta")
        self.assertEqual(data["age"], 54)
        self.assertFalse(data["is_inaudible"])

    def test_parse_demographics_inaudible_handling(self):
        """Test POST /api/intake/parse-demographics flags inaudible / empty speech."""
        res = self.client.post(
            "/api/intake/parse-demographics",
            data={
                "transcript_text": "[inaudible]",
                "language": "en",
            }
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data["is_inaudible"])
        self.assertIsNone(data["name"])

    def test_inaudible_voice_input_does_not_advance_turn(self):
        """Test POST /api/intake/respond flags inaudible audio, does NOT advance question or commit turn."""
        start_res = self.client.post("/api/intake/start", json={"patient_name": "Test Patient", "patient_age": 40, "language": "en"})
        visit_id = start_res.json()["visit_id"]

        # Send inaudible speech response
        res = self.client.post(
            "/api/intake/respond",
            data={
                "visit_id": str(visit_id),
                "step": "chief_complaint",
                "language": "en",
                "transcript_text": "[inaudible]",
            }
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data["is_inaudible"])
        # Next step should remain on chief_complaint (no advance)
        self.assertEqual(data["next_step"], "chief_complaint")
        self.assertFalse(data["is_complete"])

        # Confirm that DB still has unfilled turn for chief_complaint
        turn = self.db.query(IntakeTurn).filter(IntakeTurn.visit_id == visit_id, IntakeTurn.step == "chief_complaint").first()
        self.assertIsNotNone(turn)
        self.assertIsNone(turn.transcript)


if __name__ == "__main__":
    unittest.main()
