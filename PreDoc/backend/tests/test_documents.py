import unittest
import io
from fastapi.testclient import TestClient
from tests.db_test_utils import TestingSessionLocal, test_engine
from app.database import Base
from app.main import app
from app.models.patient import Patient
from app.models.visit import Visit
from app.models.case_draft import CaseDraft
from app.models.intake_turn import IntakeTurn
from app.models.document_record import DocumentRecord


class TestDocumentsWorkflow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=test_engine)
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

        # Create a test patient with 2 separate visits
        self.patient = Patient(name="Ananya Roy", age=45, language="en")
        self.db.add(self.patient)
        self.db.commit()
        self.db.refresh(self.patient)

        self.visit1 = Visit(
            patient_id=self.patient.id,
            status="completed",
            urgency_flag=False,
            department="General Medicine",
        )
        self.visit2 = Visit(
            patient_id=self.patient.id,
            status="pending",
            urgency_flag=False,
            department="General Medicine",
        )
        self.db.add_all([self.visit1, self.visit2])
        self.db.commit()
        self.db.refresh(self.visit1)
        self.db.refresh(self.visit2)

    def tearDown(self):
        self.db.close()

    def test_direct_document_upload_and_patient_linking(self):
        """Test POST /api/documents/upload stores file directly and links to patient_id without OCR delay."""
        fake_image_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00"
        files = {
            "file": ("blood_test_jan2026.jpg", io.BytesIO(fake_image_bytes), "image/jpeg"),
        }
        data = {
            "patient_id": str(self.patient.id),
            "visit_id": str(self.visit1.id),
            "label": "CBC Blood Test Report",
        }

        response = self.client.post("/api/documents/upload", files=files, data=data)
        self.assertEqual(response.status_code, 200, response.text)
        res_data = response.json()

        self.assertEqual(res_data["status"], "success")
        self.assertEqual(res_data["filename"], "blood_test_jan2026.jpg")
        self.assertEqual(res_data["patient_id"], self.patient.id)
        self.assertEqual(res_data["visit_id"], self.visit1.id)
        self.assertEqual(res_data["label"], "CBC Blood Test Report")
        self.assertIn("data:image/jpeg;base64,", res_data["image_base64"])

        # Check DB record
        doc = self.db.query(DocumentRecord).filter(DocumentRecord.id == res_data["document_id"]).first()
        self.assertIsNotNone(doc)
        self.assertEqual(doc.patient_id, self.patient.id)
        self.assertEqual(doc.visit_id, self.visit1.id)
        self.assertEqual(doc.label, "CBC Blood Test Report")

    def test_cross_visit_document_persistence_and_retrieval(self):
        """Verify documents uploaded in Visit 1 and Visit 2 both appear under patient_id across all visits."""
        # 1. Upload Doc in Visit 1
        fake_img1 = b"\xff\xd8\xff\xe0\x00\x10JFIF1"
        self.client.post(
            "/api/documents/upload",
            files={"file": ("visit1_prescription.png", io.BytesIO(fake_img1), "image/png")},
            data={"patient_id": str(self.patient.id), "visit_id": str(self.visit1.id), "label": "Visit 1 Rx"},
        )

        # 2. Upload Doc in Visit 2
        fake_img2 = b"\xff\xd8\xff\xe0\x00\x10JFIF2"
        self.client.post(
            "/api/documents/upload",
            files={"file": ("visit2_mri.jpg", io.BytesIO(fake_img2), "image/jpeg")},
            data={"patient_id": str(self.patient.id), "visit_id": str(self.visit2.id), "label": "Visit 2 MRI"},
        )

        # 3. Query GET /api/documents/patient/{patient_id}
        resp = self.client.get(f"/api/documents/patient/{self.patient.id}")
        self.assertEqual(resp.status_code, 200)
        docs_data = resp.json()
        self.assertEqual(docs_data["patient_id"], self.patient.id)
        self.assertEqual(docs_data["total"], 2)
        docs = docs_data["documents"]
        self.assertEqual(len(docs), 2)

        # Newest first sorting check
        self.assertEqual(docs[0]["filename"], "visit2_mri.jpg")
        self.assertEqual(docs[0]["label"], "Visit 2 MRI")
        self.assertEqual(docs[1]["filename"], "visit1_prescription.png")
        self.assertEqual(docs[1]["label"], "Visit 1 Rx")

        # 4. Check case context for Visit 2: should include ALL documents for the patient
        case_resp = self.client.get(f"/api/visits/{self.visit2.id}/case-context")
        self.assertEqual(case_resp.status_code, 200)
        case_data = case_resp.json()
        self.assertEqual(len(case_data["documents"]), 2)

    def test_extract_endpoint_backward_compatibility(self):
        """Test POST /api/documents/extract stores file directly without calling OCR."""
        fake_img = b"\xff\xd8\xff\xe0\x00\x10JFIF_EXTRACT"
        files = {"file": ("rx_legacy.jpg", io.BytesIO(fake_img), "image/jpeg")}
        data = {"visit_id": str(self.visit1.id), "label": "Legacy Rx"}

        resp = self.client.post("/api/documents/extract", files=files, data=data)
        self.assertEqual(resp.status_code, 200)
        res_json = resp.json()
        self.assertEqual(res_json["status"], "success")
        self.assertEqual(res_json["filename"], "rx_legacy.jpg")
        self.assertEqual(res_json["patient_id"], self.patient.id)

    def test_case_draft_objective_notes_document_count_without_ocr(self):
        """Verify SOAP generation notes document count in Objective without OCR field extraction."""
        # Add an intake turn
        turn = IntakeTurn(
            visit_id=self.visit2.id,
            step="chief_complaint",
            question="What symptoms are you experiencing?",
            transcript="I have a chronic dry cough for 3 weeks.",
            language="en",
        )
        self.db.add(turn)

        # Add a document for patient
        doc = DocumentRecord(
            patient_id=self.patient.id,
            visit_id=self.visit2.id,
            filename="chest_xray_report.jpg",
            mime_type="image/jpeg",
            label="Chest X-Ray",
            image_base64="data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        )
        self.db.add(doc)
        self.db.commit()

        # Generate draft
        gen_res = self.client.post(f"/api/visits/{self.visit2.id}/generate-draft")
        self.assertEqual(gen_res.status_code, 200)
        draft_data = gen_res.json()

        objective_items = draft_data["content"]["objective"]
        self.assertTrue(len(objective_items) > 0)
        # Check that objective references documents on file for physician review
        doc_item = next((item for item in objective_items if "document" in item["fact"].lower() or "panel" in item["fact"].lower() or "file" in item["fact"].lower()), None)
        self.assertIsNotNone(doc_item)
        self.assertIn("document", doc_item["fact"].lower())

    def test_multi_format_document_storage_and_static_serving(self):
        """Verify image, PDF, and DOCX uploads, raw endpoint, download endpoint, and static file serving."""
        # 1. Test DOCX upload
        fake_docx_bytes = b"PK\x03\x04\x14\x00\x06\x00[DOCX CONTENT]"
        docx_res = self.client.post(
            "/api/documents/upload",
            files={"file": ("clinical_history.docx", io.BytesIO(fake_docx_bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            data={"patient_id": str(self.patient.id), "visit_id": str(self.visit1.id), "label": "Clinical History Doc"},
        )
        self.assertEqual(docx_res.status_code, 200, docx_res.text)
        docx_data = docx_res.json()
        docx_id = docx_data["document_id"]
        self.assertEqual(docx_data["filename"], "clinical_history.docx")

        # Test DOCX raw & download
        raw_docx = self.client.get(f"/api/documents/{docx_id}/raw")
        self.assertEqual(raw_docx.status_code, 200)
        self.assertIn("officedocument.wordprocessingml", raw_docx.headers["content-type"])
        self.assertEqual(raw_docx.content, fake_docx_bytes)

        down_docx = self.client.get(f"/api/documents/{docx_id}/download")
        self.assertEqual(down_docx.status_code, 200)
        self.assertIn("attachment", down_docx.headers["content-disposition"])
        self.assertIn("clinical_history.docx", down_docx.headers["content-disposition"])

        # 2. Test PNG image upload and static file URL
        fake_png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
        png_res = self.client.post(
            "/api/documents/upload",
            files={"file": ("scan_mri.png", io.BytesIO(fake_png_bytes), "image/png")},
            data={"patient_id": str(self.patient.id), "visit_id": str(self.visit2.id), "label": "Brain MRI Scan"},
        )
        self.assertEqual(png_res.status_code, 200)
        png_data = png_res.json()
        png_id = png_data["document_id"]

        # Verify static file URL access
        static_url = png_data["file_url"]  # /api/documents/{id}/raw or /uploads/...
        static_resp = self.client.get(static_url)
        self.assertEqual(static_resp.status_code, 200)
        self.assertEqual(static_resp.headers["content-type"], "image/png")
        self.assertEqual(static_resp.content, fake_png_bytes)


if __name__ == "__main__":
    unittest.main()
