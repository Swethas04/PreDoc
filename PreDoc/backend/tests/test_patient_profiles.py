import unittest
import io
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from tests.db_test_utils import TestingSessionLocal, test_engine
from app.database import Base
from app.main import app
from app.models.user import User
from app.models.patient_profile import PatientProfile
from app.models.patient_document import PatientDocument
from app.models.consultation import Consultation
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.case_draft import CaseDraft
from app.models.intake_turn import IntakeTurn
from app.models.prescription import Prescription
from app.services.auth import create_token_for_user, create_patient_token, hash_password


class TestPatientProfilesAndConsultations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=test_engine)
        cls.client = TestClient(app)

    def setUp(self):
        self.db = TestingSessionLocal()
        # Clean up database
        self.db.query(Prescription).delete()
        self.db.query(Consultation).delete()
        self.db.query(PatientDocument).delete()
        self.db.query(CaseDraft).delete()
        self.db.query(IntakeTurn).delete()
        self.db.query(Visit).delete()
        self.db.query(PatientProfile).delete()
        self.db.query(Patient).delete()
        self.db.query(User).delete()
        self.db.commit()

        # Seed Doctor
        self.doctor = User(
            email="dr.sarah@predoc.ai",
            name="Dr. Sarah Rao, MD",
            role="doctor",
            password_hash=hash_password("password123"),
        )
        self.db.add(self.doctor)
        self.db.commit()
        self.db.refresh(self.doctor)
        self.doc_token = f"Bearer {create_token_for_user(self.doctor)}"

        # Seed Patient 1 (Anita)
        self.patient1_user = User(
            email="anita@predoc.ai",
            name="Anita Desai",
            role="patient",
            password_hash=hash_password("password123"),
        )
        self.db.add(self.patient1_user)
        self.db.commit()
        self.db.refresh(self.patient1_user)
        self.patient1_token = f"Bearer {create_token_for_user(self.patient1_user)}"

        self.profile1 = PatientProfile(
            user_id=self.patient1_user.id,
            name="Anita Desai",
            age=34,
            gender="Female",
            phone="+91 98765 43210",
            language="en",
        )
        self.db.add(self.profile1)

        # Seed Patient 2 (Kavita)
        self.patient2_user = User(
            email="kavita@predoc.ai",
            name="Kavita Patel",
            role="patient",
            password_hash=hash_password("password123"),
        )
        self.db.add(self.patient2_user)
        self.db.commit()
        self.db.refresh(self.patient2_user)
        self.patient2_token = f"Bearer {create_token_for_user(self.patient2_user)}"

        self.profile2 = PatientProfile(
            user_id=self.patient2_user.id,
            name="Kavita Patel",
            age=48,
            gender="Female",
            phone="+91 98765 11111",
            language="en",
        )
        self.db.add(self.profile2)
        self.db.commit()
        self.db.refresh(self.profile1)
        self.db.refresh(self.profile2)

        # Create visit for Anita
        self.visit1 = Visit(
            patient_profile_id=self.profile1.id,
            status="pending",
            urgency_flag=False,
            department="General Medicine",
        )
        self.db.add(self.visit1)
        self.db.commit()
        self.db.refresh(self.visit1)

    def tearDown(self):
        self.db.close()

    def test_auth_login_and_auto_profile(self):
        """Test logging in as patient returns token and linked profile ID."""
        resp = self.client.post("/api/auth/login", json={"email": "anita@predoc.ai", "password": "password123"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("token", data)
        self.assertEqual(data["user"]["role"], "patient")
        self.assertEqual(data["user"]["patient_profile_id"], self.profile1.id)

    def test_patient_profile_update(self):
        """Test POST /api/patients/profile updates demographic info."""
        headers = {"Authorization": self.patient1_token}
        resp = self.client.post(
            "/api/patients/profile",
            json={"age": 35, "phone": "+91 99999 88888"},
            headers=headers,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["age"], 35)
        self.assertEqual(data["phone"], "+91 99999 88888")

    def test_document_upload_standalone_and_with_visit(self):
        """Test uploading documents to patient profile with and without active visit_id."""
        fake_file1 = b"\xff\xd8\xff\xe0\x00\x10JFIF_VISIT_DOC"
        fake_file2 = b"\xff\xd8\xff\xe0\x00\x10JFIF_STANDALONE"

        headers = {"Authorization": self.patient1_token}

        # 1. Upload during active visit
        resp1 = self.client.post(
            f"/api/patients/{self.profile1.id}/documents",
            files={"file": ("prescription_current.jpg", io.BytesIO(fake_file1), "image/jpeg")},
            data={"visit_id": str(self.visit1.id), "label": "Active Visit Rx"},
            headers=headers,
        )
        self.assertEqual(resp1.status_code, 200)
        self.assertEqual(resp1.json()["visit_id"], self.visit1.id)

        # 2. Upload standalone (no visit_id) by Doctor
        doc_headers = {"Authorization": self.doc_token}
        resp2 = self.client.post(
            f"/api/patients/{self.profile1.id}/documents",
            files={"file": ("past_lab_report.png", io.BytesIO(fake_file2), "image/png")},
            data={"label": "Old Physical Lab 2024"},
            headers=doc_headers,
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertIsNone(resp2.json()["visit_id"])
        self.assertEqual(resp2.json()["uploaded_by"], "Dr. Sarah Rao, MD")

        # 3. Retrieve full patient profile
        profile_resp = self.client.get(f"/api/patients/{self.profile1.id}", headers=doc_headers)
        self.assertEqual(profile_resp.status_code, 200)
        prof_data = profile_resp.json()
        self.assertEqual(len(prof_data["documents"]), 2)
        # Verify newest first ordering
        self.assertEqual(prof_data["documents"][0]["filename"], "past_lab_report.png")
        self.assertEqual(prof_data["documents"][1]["filename"], "prescription_current.jpg")

    def test_consultation_creation_on_case_draft_approval(self):
        """Test that approving a case draft creates a consultation record for the patient profile."""
        # Add a draft for visit1
        draft = CaseDraft(
            visit_id=self.visit1.id,
            content_json={"chief_complaint": "Acute migraine", "subjective": [], "objective": [], "assessment": [], "plan": []},
            is_approved=False,
        )
        self.db.add(draft)
        self.db.commit()

        # Approve draft as Doctor
        approve_resp = self.client.post(
            f"/api/visits/{self.visit1.id}/approve",
            json={"doctor_name": "Dr. Sarah Rao, MD", "notes": "Prescribed sumatriptan and lifestyle changes."},
            headers={"Authorization": self.doc_token},
        )
        self.assertEqual(approve_resp.status_code, 200)
        self.assertTrue(approve_resp.json()["is_approved"])

        # Check consultation history for patient
        consult_resp = self.client.get(f"/api/consultations/patient/{self.profile1.id}")
        self.assertEqual(consult_resp.status_code, 200)
        c_data = consult_resp.json()
        self.assertEqual(c_data["total"], 1)
        self.assertEqual(c_data["consultations"][0]["doctor_name"], "Dr. Sarah Rao, MD")
        self.assertEqual(c_data["consultations"][0]["visit_id"], self.visit1.id)
        self.assertEqual(c_data["consultations"][0]["case_draft_id"], draft.id)

    def test_access_control_patient_cannot_access_other_profile(self):
        """Verify Patient 1 is forbidden from viewing or uploading to Patient 2's profile."""
        patient1_headers = {"Authorization": self.patient1_token}

        # Attempt to view Patient 2's profile
        forbidden_get = self.client.get(f"/api/patients/{self.profile2.id}", headers=patient1_headers)
        self.assertEqual(forbidden_get.status_code, 403)

        # Attempt to upload to Patient 2's profile
        fake_file = b"\xff\xd8\xff\xe0\x00\x10JFIF_FORBIDDEN"
        forbidden_post = self.client.post(
            f"/api/patients/{self.profile2.id}/documents",
            files={"file": ("hack.jpg", io.BytesIO(fake_file), "image/jpeg")},
            headers=patient1_headers,
        )
        self.assertEqual(forbidden_post.status_code, 403)

        # Doctor CAN view Patient 2's profile
        doc_headers = {"Authorization": self.doc_token}
        allowed_get = self.client.get(f"/api/patients/{self.profile2.id}", headers=doc_headers)
        self.assertEqual(allowed_get.status_code, 200)

    def test_patient_prescriptions_retrieval_and_access_control(self):
        """Test GET /api/patients/{patient_id}/prescriptions and patient-session access control."""
        # Create Patient records with PIN and tokens
        patient_obj1 = Patient(
            name="Anita Desai",
            age=45,
            patient_code="PD-ANITA1",
            pin_hash=hash_password("1234"),
        )
        patient_obj2 = Patient(
            name="Rahul Sharma",
            age=52,
            patient_code="PD-RAHUL2",
            pin_hash=hash_password("5678"),
        )
        self.db.add_all([patient_obj1, patient_obj2])
        self.db.commit()
        self.db.refresh(patient_obj1)
        self.db.refresh(patient_obj2)

        p1_token = f"Bearer {create_patient_token(patient_obj1)}"
        p2_token = f"Bearer {create_patient_token(patient_obj2)}"

        # Save Prescription for Patient 1 via Visit
        rx_payload = {
            "doctor_name": "Dr. Sarah Rao, MD",
            "diagnosis": "Acute Migraine & Tension Headache",
            "medicines": [
                {
                    "name": "Sumatriptan 50mg",
                    "composition": "Sumatriptan Succinate",
                    "dosage": "1 tablet",
                    "frequency": "SOS (As needed)",
                    "duration": "3 days",
                    "instructions": "At onset of headache",
                },
                {
                    "name": "Naproxen 500mg",
                    "composition": "Naproxen Sodium",
                    "dosage": "500mg",
                    "frequency": "1-0-1 (Twice daily)",
                    "duration": "5 days",
                    "instructions": "After food",
                },
            ],
            "general_advice": "Rest in a quiet, dark room. Hydrate well.",
            "follow_up": "Review after 7 days if migraines recur.",
        }

        # Set visit patient_id
        self.visit1.patient_id = patient_obj1.id
        self.db.commit()

        # Doctor saves prescription for visit1
        save_resp = self.client.post(
            f"/api/prescriptions/visit/{self.visit1.id}",
            json=rx_payload,
            headers={"Authorization": self.doc_token},
        )
        self.assertEqual(save_resp.status_code, 200)
        saved_rx = save_resp.json()
        self.assertEqual(saved_rx["doctor_name"], "Dr. Sarah Rao, MD")
        self.assertEqual(len(saved_rx["medicines"]), 2)
        self.assertEqual(saved_rx["patient_id"], patient_obj1.id)

        # 1. Patient 1 fetches their own prescriptions -> 200 OK with list of prescriptions
        p1_resp = self.client.get(
            f"/api/patients/{patient_obj1.id}/prescriptions",
            headers={"Authorization": p1_token},
        )
        self.assertEqual(p1_resp.status_code, 200)
        p1_rxs = p1_resp.json()
        self.assertEqual(len(p1_rxs), 1)
        self.assertEqual(p1_rxs[0]["doctor_name"], "Dr. Sarah Rao, MD")
        self.assertEqual(p1_rxs[0]["visit_id"], self.visit1.id)
        self.assertEqual(len(p1_rxs[0]["medicines"]), 2)
        self.assertEqual(p1_rxs[0]["medicines"][0]["name"], "Sumatriptan 50mg")

        # 2. Patient 2 attempts to fetch Patient 1's prescriptions -> 403 Forbidden
        p2_forbidden = self.client.get(
            f"/api/patients/{patient_obj1.id}/prescriptions",
            headers={"Authorization": p2_token},
        )
        self.assertEqual(p2_forbidden.status_code, 403)
        self.assertIn("Access denied", p2_forbidden.json()["detail"])

        # 3. Doctor fetches Patient 1's prescriptions -> 200 OK
        doc_resp = self.client.get(
            f"/api/patients/{patient_obj1.id}/prescriptions",
            headers={"Authorization": self.doc_token},
        )
        self.assertEqual(doc_resp.status_code, 200)
        self.assertEqual(len(doc_resp.json()), 1)

        # 4. Public read-only endpoint (no auth header) via share_token
        share_token = p1_rxs[0]["share_token"]
        self.assertTrue(bool(share_token))
        self.assertGreaterEqual(len(share_token), 20)

        public_resp = self.client.get(f"/api/prescriptions/share/{share_token}")
        self.assertEqual(public_resp.status_code, 200)
        pub_data = public_resp.json()
        self.assertEqual(pub_data["patient_name"], "Anita Desai")
        self.assertEqual(pub_data["patient_code"], "PD-ANITA1")
        self.assertEqual(pub_data["doctor_name"], "Dr. Sarah Rao, MD")
        self.assertEqual(len(pub_data["medicines"]), 2)
        self.assertTrue(pub_data["is_verified"])
        self.assertFalse(pub_data["is_expired"])

        # 5. Invalid token -> 404
        invalid_resp = self.client.get("/api/prescriptions/share/invalid_token_99999")
        self.assertEqual(invalid_resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()


