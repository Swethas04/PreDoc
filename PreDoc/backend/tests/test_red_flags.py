import unittest
from fastapi.testclient import TestClient
from app.database import Base
from app.main import app
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.intake_turn import IntakeTurn
from app.services.red_flag_checker import evaluate_red_flags
from tests.db_test_utils import TestingSessionLocal, test_engine


class TestRedFlagChecker(unittest.TestCase):
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
        patient = Patient(name="Ramesh Gupta", age=58, language="en")
        self.db.add(patient)
        self.db.flush()

        visit = Visit(patient_id=patient.id, status="intake_in_progress", urgency_flag=False)
        self.db.add(visit)
        self.db.flush()

        # Seed initial pending turn
        turn = IntakeTurn(
            visit_id=visit.id,
            step="chief_complaint",
            question="What brings you in today?",
            transcript=None,
            language="en",
        )
        self.db.add(turn)
        self.db.commit()

        self.visit_id = visit.id
        self.patient_id = patient.id

    def tearDown(self):
        self.db.query(IntakeTurn).delete()
        self.db.query(Visit).delete()
        self.db.query(Patient).delete()
        self.db.commit()
        self.db.close()

    def test_direct_rules_evaluation(self):
        # 1. Cardiac combination: chest pain + breathlessness
        res1 = evaluate_red_flags(["I have heavy chest pain", "and severe breathlessness"])
        self.assertTrue(res1.is_urgent)
        self.assertEqual(res1.department, "Cardiology")
        self.assertIn("chest pain", res1.matched_triggers[0].lower())
        self.assertIn("breathlessness", res1.matched_triggers[1].lower())

        # 2. Neuro combination: sudden severe headache + vision changes
        res2 = evaluate_red_flags(["sudden severe headache since morning", "also experiencing blurred vision"])
        self.assertTrue(res2.is_urgent)
        self.assertEqual(res2.department, "Neurology")

        # 3. Hindi Cardiac combination
        res3 = evaluate_red_flags(["सीने में दर्द हो रहा है", "और सांस की तकलीफ है"])
        self.assertTrue(res3.is_urgent)
        self.assertEqual(res3.department, "Cardiology")

        # 4. Hindi Neuro combination
        res4 = evaluate_red_flags(["तेज सिरदर्द है", "और दृष्टि में बदलाव या धुंधला दिख रहा है"])
        self.assertTrue(res4.is_urgent)
        self.assertEqual(res4.department, "Neurology")

        # 5. Non-urgent standard complaint (isolated symptoms)
        res_safe = evaluate_red_flags(["mild cough for 2 days", "no other symptoms"])
        self.assertFalse(res_safe.is_urgent)
        self.assertIsNone(res_safe.department)

    def test_intake_respond_triggers_red_flag_in_db(self):
        # Turn 1: Chief complaint with chest pain
        resp1 = self.client.post(
            "/api/intake/respond",
            data={
                "visit_id": self.visit_id,
                "step": "chief_complaint",
                "language": "en",
                "transcript_text": "I have pressing chest pain on the left side.",
            },
        )
        self.assertEqual(resp1.status_code, 200)
        data1 = resp1.json()
        # Single isolated symptom might not trigger combination yet
        self.assertEqual(data1["visit_id"], self.visit_id)

        # Turn 2: Associated symptoms with breathlessness (triggers the combination!)
        resp2 = self.client.post(
            "/api/intake/respond",
            data={
                "visit_id": self.visit_id,
                "step": "duration",
                "language": "en",
                "transcript_text": "It started suddenly today with severe breathlessness.",
            },
        )
        self.assertEqual(resp2.status_code, 200)
        data2 = resp2.json()

        # Check response has urgency_flag and department
        self.assertTrue(data2["urgency_flag"])
        self.assertEqual(data2["department"], "Cardiology")
        self.assertIsNotNone(data2["urgency_reason"])

        # Check database visit record was immediately updated
        visit = self.db.query(Visit).filter(Visit.id == self.visit_id).first()
        self.db.refresh(visit)
        self.assertTrue(visit.urgency_flag)
        self.assertEqual(visit.department, "Cardiology")
        self.assertIsNotNone(visit.urgency_reason)

    def test_triage_endpoints(self):
        # Trigger red flag on visit
        visit = self.db.query(Visit).filter(Visit.id == self.visit_id).first()
        visit.urgency_flag = True
        visit.department = "Cardiology"
        visit.urgency_reason = "Chest pain combined with breathlessness"
        self.db.commit()

        # Test GET /api/visits/triage
        triage_resp = self.client.get("/api/visits/triage")
        self.assertEqual(triage_resp.status_code, 200)
        triage_data = triage_resp.json()
        self.assertTrue(len(triage_data) >= 1)
        item = next((v for v in triage_data if v["visit_id"] == self.visit_id), None)
        self.assertIsNotNone(item)
        self.assertEqual(item["patient_name"], "Ramesh Gupta")
        self.assertEqual(item["department"], "Cardiology")
        self.assertTrue(item["urgency_flag"])

        # Test PATCH /api/visits/{id}/triage to acknowledge/mark triaged
        patch_resp = self.client.patch(
            f"/api/visits/{self.visit_id}/triage",
            json={"status": "triaged", "department": "Cardiology (ICU)"},
        )
        self.assertEqual(patch_resp.status_code, 200)
        patch_data = patch_resp.json()
        self.assertEqual(patch_data["status"], "triaged")
    def test_emergency_triage_evaluation(self):
        # 1. Test rescue prescription: Nitroglycerin / Sorbitrate
        rx_text = "Prescription: Tab Sorbitrate 10mg sublingual SOS for acute chest pain"
        from app.services.red_flag_checker import evaluate_emergency_rules
        res = evaluate_emergency_rules(rx_text)
        self.assertTrue(res["is_emergency"])
        self.assertEqual(res["triage_level"], "CRITICAL")
        self.assertEqual(res["urgency_score"], 5)
        self.assertIn("sorbitrate", " ".join(res["detected_red_flags"]).lower())

        # 2. Test stroke FAST symptoms
        stroke_text = "Patient has sudden facial droop and slurred speech"
        res2 = evaluate_emergency_rules(stroke_text)
        self.assertTrue(res2["is_emergency"])
        self.assertEqual(res2["triage_level"], "CRITICAL")

        # 3. Test routine symptoms
        routine_text = "Mild runny nose and sneezing since yesterday"
        res3 = evaluate_emergency_rules(routine_text)
        self.assertFalse(res3["is_emergency"])
        self.assertEqual(res3["triage_level"], "ROUTINE")

    def test_evaluate_emergency_api_endpoint(self):
        resp = self.client.post(
            "/api/intake/evaluate-emergency",
            json={
                "text": "Crushing chest pain radiating to left arm with dyspnea",
                "visit_id": self.visit_id,
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["is_emergency"])
        self.assertEqual(data["triage_level"], "CRITICAL")
        self.assertEqual(data["urgency_score"], 5)
        self.assertIn("108", data["patient_warning_message"])

        # Check visit urgency flag updated in DB
        visit = self.db.query(Visit).filter(Visit.id == self.visit_id).first()
        self.db.refresh(visit)
        self.assertTrue(visit.urgency_flag)


if __name__ == "__main__":
    unittest.main()

