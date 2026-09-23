import io
import os
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from reportlab.lib.pagesizes import A4, letter
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm

try:
    import pypdf
except ImportError:
    pypdf = None

from app.services.document_storage import UPLOAD_DIR

logger = logging.getLogger("predoc.pdf_service")

# A4 dimensions in points: 595.27 x 841.89
PAGE_WIDTH, PAGE_HEIGHT = A4


def _get_color(hex_or_color: Any, default=colors.HexColor("#1A2B4C")):
    if isinstance(hex_or_color, colors.Color):
        return hex_or_color
    if isinstance(hex_or_color, str) and hex_or_color.startswith("#"):
        try:
            return colors.HexColor(hex_or_color)
        except Exception:
            return default
    return default


def resolve_letterhead_image_path(template) -> Optional[str]:
    """Resolve the absolute filesystem path for the letterhead template."""
    if not template:
        return None

    # Check template_file_path directly
    if getattr(template, "template_file_path", None) and os.path.exists(template.template_file_path):
        return template.template_file_path

    # Check template_file_url in UPLOAD_DIR
    file_url = getattr(template, "template_file_url", None)
    if file_url:
        filename = os.path.basename(file_url.split("?")[0])
        disk_path = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(disk_path):
            return disk_path

    # Check preview_image_url
    preview_url = getattr(template, "preview_image_url", None)
    if preview_url:
        filename = os.path.basename(preview_url.split("?")[0])
        disk_path = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(disk_path):
            return disk_path

    return None


def _format_date(dt_val: Any) -> str:
    if isinstance(dt_val, datetime):
        return dt_val.strftime("%d %b %Y, %I:%M %p")
    if isinstance(dt_val, str) and dt_val:
        try:
            parsed = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
            return parsed.strftime("%d %b %Y")
        except Exception:
            return dt_val
    return datetime.utcnow().strftime("%d %b %Y")


# ==============================================================================
# 1. CUSTOM TEMPLATE OVERLAY PDF GENERATION
# ==============================================================================

def generate_custom_template_pdf(
    rx_data: Dict[str, Any],
    template: Any,
) -> bytes:
    """
    Render prescription data directly on top of the hospital's uploaded letterhead.
    Coordinates in field_positions_json are percentage-based:
      x: 0.0 to 100.0 (% from left)
      y: 0.0 to 100.0 (% from top)
      width: optional % width
      fontSize: optional pt size
    """
    field_positions: Dict[str, Any] = getattr(template, "field_positions_json", {}) or {}
    page_size_name = getattr(template, "page_size", "A4").upper()
    page_size = letter if page_size_name == "LETTER" else A4
    page_w, page_h = page_size

    bg_path = resolve_letterhead_image_path(template)
    mime_type = (getattr(template, "mime_type", "") or "").lower()
    is_pdf_background = (
        mime_type == "application/pdf"
        or (bg_path and bg_path.lower().endswith(".pdf"))
    )

    styles = getSampleStyleSheet()
    normal_style = styles["Normal"]

    # Extract dynamic field values
    patient_name = str(rx_data.get("patient_name") or "Patient")
    patient_age = str(rx_data.get("patient_age") or "")
    patient_gender = str(rx_data.get("patient_gender") or "")
    age_gender_str = rx_data.get("age_gender") or ""
    if not age_gender_str:
        age_gender_str = f"{patient_age} yrs" if patient_age else ""
        if patient_gender:
            age_gender_str += f" / {patient_gender}" if age_gender_str else patient_gender

    doctor_name = str(rx_data.get("doctor_name") or "Dr. Attending Physician")
    visit_id = str(rx_data.get("visit_id") or "")
    visit_str = rx_data.get("visit_number") or (f"Visit #{visit_id}" if visit_id else "")
    date_str = rx_data.get("date") or _format_date(rx_data.get("issued_at") or rx_data.get("created_at"))
    diagnosis = str(rx_data.get("diagnosis") or "").strip()
    advice = str(rx_data.get("general_advice") or rx_data.get("advice") or "").strip()
    follow_up = str(rx_data.get("follow_up") or "").strip()
    medicines: List[Dict[str, Any]] = rx_data.get("medicines") or []

    # Map field keys to values and default styling
    field_values = {
        "patient_name": (patient_name, 11, True),
        "age_gender": (age_gender_str or patient_age, 10, False),
        "age": (patient_age, 10, False),
        "doctor_name": (doctor_name, 11, True),
        "date": (date_str, 10, False),
        "visit_id": (visit_str, 10, True),
        "diagnosis": (diagnosis, 10, False),
        "advice": (advice, 9.5, False),
        "follow_up": (follow_up, 9.5, False),
    }

    # Generate the overlay PDF using ReportLab
    overlay_buffer = io.BytesIO()
    c = canvas.Canvas(overlay_buffer, pagesize=page_size)

    def draw_background_image():
        if bg_path and not is_pdf_background and os.path.exists(bg_path):
            try:
                c.drawImage(
                    bg_path,
                    0,
                    0,
                    width=page_w,
                    height=page_h,
                    preserveAspectRatio=False,
                    mask="auto",
                )
            except Exception as e:
                logger.warning("Failed to draw background image %s: %s", bg_path, e)

    # Draw letterhead image on first page if it's an image
    draw_background_image()

    # Draw individual text fields
    for field_key, (val_text, default_size, is_bold) in field_values.items():
        if not val_text or field_key not in field_positions:
            continue

        pos = field_positions[field_key]
        if not isinstance(pos, dict):
            continue

        x_pct = float(pos.get("x", 10.0))
        y_pct = float(pos.get("y", 10.0))
        font_size = float(pos.get("fontSize") or default_size)
        font_color = _get_color(pos.get("fontColor"), colors.HexColor("#1A2B4C"))
        width_pct = float(pos.get("width") or 40.0)

        # Calculate ReportLab coordinates (origin bottom-left)
        x_pt = (x_pct / 100.0) * page_w
        y_pt = page_h - (y_pct / 100.0) * page_h

        # Multi-line fields use Paragraph for proper wrapping
        if field_key in ["diagnosis", "advice", "follow_up"] or len(val_text) > 40:
            box_width = (width_pct / 100.0) * page_w
            p_style = ParagraphStyle(
                name=f"Field_{field_key}",
                parent=normal_style,
                fontName="Helvetica-Bold" if is_bold else "Helvetica",
                fontSize=font_size,
                leading=font_size * 1.25,
                textColor=font_color,
            )
            prefix = ""
            if field_key == "diagnosis" and not val_text.lower().startswith("dx"):
                prefix = "<b>Diagnosis: </b>"
            elif field_key == "advice" and not val_text.lower().startswith("advice"):
                prefix = "<b>Advice: </b>"
            elif field_key == "follow_up" and not val_text.lower().startswith("follow"):
                prefix = "<b>Follow-Up: </b>"

            p = Paragraph(f"{prefix}{val_text}", p_style)
            w, h = p.wrap(box_width, page_h)
            p.drawOn(c, x_pt, y_pt - h)
        else:
            c.setFont("Helvetica-Bold" if is_bold else "Helvetica", font_size)
            c.setFillColor(font_color)
            c.drawString(x_pt, y_pt - font_size, val_text)

    # ── Handle Medicines Table Dynamic Placement ─────────────────────────────
    med_pos = field_positions.get("medicines_table", {})
    if isinstance(med_pos, dict) and med_pos:
        x_pct = float(med_pos.get("x", 10.0))
        y_pct = float(med_pos.get("y", 38.0))
        width_pct = float(med_pos.get("width", 80.0))

        table_x = (x_pct / 100.0) * page_w
        table_y = page_h - (y_pct / 100.0) * page_h
        table_width = (width_pct / 100.0) * page_w

        # Column widths distribution for table_width
        col_no_w = 24
        col_dose_w = 60
        col_freq_w = 85
        col_dur_w = 60
        col_inst_w = 90
        col_name_w = max(110, table_width - (col_no_w + col_dose_w + col_freq_w + col_dur_w + col_inst_w))

        col_widths = [col_no_w, col_name_w, col_dose_w, col_freq_w, col_dur_w, col_inst_w]

        # Table Header
        header_style = ParagraphStyle(
            name="MedHeader",
            parent=normal_style,
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=10,
            textColor=colors.HexColor("#1A2B4C"),
        )
        cell_style = ParagraphStyle(
            name="MedCell",
            parent=normal_style,
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#2C3E50"),
        )
        med_title_style = ParagraphStyle(
            name="MedTitle",
            parent=normal_style,
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#1A2B4C"),
        )
        sub_style = ParagraphStyle(
            name="MedSub",
            parent=normal_style,
            fontName="Helvetica",
            fontSize=7.5,
            leading=9,
            textColor=colors.HexColor("#64748B"),
        )

        table_rows = [
            [
                Paragraph("#", header_style),
                Paragraph("Medicine & Composition", header_style),
                Paragraph("Dosage", header_style),
                Paragraph("Frequency", header_style),
                Paragraph("Duration", header_style),
                Paragraph("Instructions", header_style),
            ]
        ]

        if medicines:
            for idx, m in enumerate(medicines):
                name = m.get("name") or "Medicine"
                comp = m.get("composition") or ""
                name_cell = [Paragraph(name, med_title_style)]
                if comp:
                    name_cell.append(Paragraph(comp, sub_style))

                table_rows.append([
                    Paragraph(str(idx + 1), cell_style),
                    name_cell,
                    Paragraph(m.get("dosage") or "1 tab", cell_style),
                    Paragraph(m.get("frequency") or "1-0-1", cell_style),
                    Paragraph(m.get("duration") or "5 days", cell_style),
                    Paragraph(m.get("instructions") or "-", cell_style),
                ])
        else:
            table_rows.append([
                Paragraph("-", cell_style),
                Paragraph("<i>No medications prescribed.</i>", cell_style),
                Paragraph("-", cell_style),
                Paragraph("-", cell_style),
                Paragraph("-", cell_style),
                Paragraph("-", cell_style),
            ])

        med_table = Table(table_rows, colWidths=col_widths)
        med_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1A2B4C")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#CBD5E1")),
            ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ]))

        # Calculate table height and draw
        w, h = med_table.wrap(table_width, page_h)
        
        # Check if table fits on current page (allow 40pt bottom margin)
        if table_y - h >= 40:
            med_table.drawOn(c, table_x, table_y - h)
        else:
            # Multi-page handling: Draw table on current page and overflow onto page 2
            med_table.drawOn(c, table_x, max(40, table_y - h))

    c.showPage()
    c.save()
    overlay_buffer.seek(0)
    overlay_pdf_bytes = overlay_buffer.getvalue()

    # If background is a PDF file, merge background PDF with ReportLab overlay using pypdf
    if is_pdf_background and bg_path and os.path.exists(bg_path) and pypdf is not None:
        try:
            bg_reader = pypdf.PdfReader(bg_path)
            overlay_reader = pypdf.PdfReader(io.BytesIO(overlay_pdf_bytes))
            writer = pypdf.PdfWriter()

            for page_idx in range(len(overlay_reader.pages)):
                overlay_page = overlay_reader.pages[page_idx]
                if page_idx < len(bg_reader.pages):
                    bg_page = bg_reader.pages[page_idx]
                    bg_page.merge_page(overlay_page)
                    writer.add_page(bg_page)
                else:
                    # Repeat first background page if multi-page prescription
                    bg_page = bg_reader.pages[0]
                    bg_page.merge_page(overlay_page)
                    writer.add_page(bg_page)

            out_buf = io.BytesIO()
            writer.write(out_buf)
            return out_buf.getvalue()
        except Exception as e:
            logger.warning("Error merging PDF letterhead background with overlay: %s", e)

    return overlay_pdf_bytes


# ==============================================================================
# 2. DEFAULT PROFESSIONAL MEDICAL PRESCRIPTION LAYOUT (FALLBACK)
# ==============================================================================

def generate_default_prescription_pdf(rx_data: Dict[str, Any]) -> bytes:
    """
    Generate a clean, modern, professional medical prescription PDF.
    Matches the PreDoc "Medical Prescription / Official Physician Rx Order" UI.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    story = []
    styles = getSampleStyleSheet()

    # Custom typography styles
    primary_color = colors.HexColor("#1A2B4C")
    accent_color = colors.HexColor("#2F6FED")
    text_muted = colors.HexColor("#64748B")
    border_color = colors.HexColor("#E2E8F4")
    bg_subtle = colors.HexColor("#F8FAFC")

    title_style = ParagraphStyle(
        name="HeaderTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=accent_color,
    )
    subtitle_style = ParagraphStyle(
        name="HeaderSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=text_muted,
    )
    rx_symbol_style = ParagraphStyle(
        name="RxSymbol",
        parent=styles["Normal"],
        fontName="Times-BoldItalic",
        fontSize=26,
        leading=28,
        textColor=accent_color,
        alignment=2,  # Right aligned
    )
    section_heading = ParagraphStyle(
        name="SectionHeading",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=primary_color,
    )
    label_style = ParagraphStyle(
        name="MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=text_muted,
    )
    val_bold_style = ParagraphStyle(
        name="MetaValBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=12,
        textColor=primary_color,
    )
    val_style = ParagraphStyle(
        name="MetaVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=12,
        textColor=primary_color,
    )
    body_text_style = ParagraphStyle(
        name="BodyText",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=primary_color,
    )

    # ── 1. Top Clinic Letterhead Header ─────────────────────────────────────────
    clinic_name = rx_data.get("clinic_name") or "PreDoc Medical Center"
    clinic_dept = rx_data.get("clinic_department") or "Department of Internal Medicine & Clinical Triage"

    header_table_data = [
        [
            [
                Paragraph(clinic_name, title_style),
                Paragraph(f"{clinic_dept} • Official Medical Order", subtitle_style),
                Paragraph("24/7 Clinical Desk: +1 (800) 555-DOCS • support@predoc.health", subtitle_style),
            ],
            [
                Paragraph("℞", rx_symbol_style),
                Paragraph(f"<b>Date:</b> {_format_date(rx_data.get('issued_at') or rx_data.get('created_at'))}", ParagraphStyle("DateTxt", parent=label_style, alignment=2)),
            ],
        ]
    ]
    header_table = Table(header_table_data, colWidths=[380, 140])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=accent_color, spaceBefore=2, spaceAfter=8))

    # ── 2. Patient & Doctor Meta Card ──────────────────────────────────────────
    patient_name = rx_data.get("patient_name") or "Patient"
    patient_age = str(rx_data.get("patient_age") or "-")
    patient_gender = str(rx_data.get("patient_gender") or "-")
    doctor_name = rx_data.get("doctor_name") or "Dr. Attending Physician"
    visit_id = rx_data.get("visit_id") or "1"
    share_token = rx_data.get("share_token") or ""

    meta_grid = [
        [
            Paragraph("PATIENT NAME:", label_style),
            Paragraph(str(patient_name), val_bold_style),
            Paragraph("ATTENDING DOCTOR:", label_style),
            Paragraph(str(doctor_name), val_bold_style),
        ],
        [
            Paragraph("AGE / GENDER:", label_style),
            Paragraph(f"{patient_age} yrs / {patient_gender}", val_style),
            Paragraph("VISIT / ENCOUNTER:", label_style),
            Paragraph(f"Visit #{visit_id}", val_bold_style),
        ],
    ]
    meta_table = Table(meta_grid, colWidths=[100, 160, 120, 140])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg_subtle),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("BOX", (0, 0), (-1, -1), 1, border_color),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, border_color),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # ── 3. Clinical Diagnosis / Impression ────────────────────────────────────
    diagnosis = rx_data.get("diagnosis")
    if diagnosis:
        dx_card = [
            [
                Paragraph("<b>Clinical Diagnosis / Impression:</b>", val_bold_style),
            ],
            [
                Paragraph(str(diagnosis), body_text_style),
            ]
        ]
        dx_table = Table(dx_card, colWidths=[520])
        dx_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#BFDBFE")),
        ]))
        story.append(dx_table)
        story.append(Spacer(1, 10))

    # ── 4. Prescribed Medicines Table ─────────────────────────────────────────
    story.append(Paragraph("Prescribed Medications & Dosage Schedule", section_heading))
    story.append(Spacer(1, 5))

    medicines: List[Dict[str, Any]] = rx_data.get("medicines") or []
    if not medicines:
        empty_p = Paragraph("<i>No medications prescribed.</i>", label_style)
        story.append(empty_p)
    else:
        th_style = ParagraphStyle(
            name="RxTH",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=10,
            textColor=colors.HexColor("#FFFFFF"),
        )
        tb_name = ParagraphStyle(
            name="RxMedName",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=primary_color,
        )
        tb_comp = ParagraphStyle(
            name="RxMedComp",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9,
            textColor=text_muted,
        )
        tb_cell = ParagraphStyle(
            name="RxCell",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=primary_color,
        )

        rx_rows = [
            [
                Paragraph("#", th_style),
                Paragraph("Medicine Name & Composition", th_style),
                Paragraph("Dosage", th_style),
                Paragraph("Frequency", th_style),
                Paragraph("Duration", th_style),
                Paragraph("Instructions", th_style),
            ]
        ]

        for idx, med in enumerate(medicines):
            name = med.get("name") or "Medicine"
            comp = med.get("composition") or ""
            med_cell = [Paragraph(name, tb_name)]
            if comp:
                med_cell.append(Paragraph(comp, tb_comp))

            rx_rows.append([
                Paragraph(str(idx + 1), tb_cell),
                med_cell,
                Paragraph(med.get("dosage") or "1 tab", tb_cell),
                Paragraph(med.get("frequency") or "1-0-1", tb_cell),
                Paragraph(med.get("duration") or "5 days", tb_cell),
                Paragraph(med.get("instructions") or "After food", tb_cell),
            ])

        col_w = [25, 175, 60, 95, 65, 100]
        med_tbl = Table(rx_rows, colWidths=col_w)
        med_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), accent_color),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("GRID", (0, 0), (-1, -1), 0.5, border_color),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, bg_subtle]),
        ]))
        story.append(med_tbl)

    story.append(Spacer(1, 10))

    # ── 5. General Advice & Follow-Up ─────────────────────────────────────────
    advice = rx_data.get("general_advice")
    follow_up = rx_data.get("follow_up")

    if advice or follow_up:
        advice_cells = []
        if advice:
            advice_cells.append([
                Paragraph("<b>Dietary & Lifestyle Advice:</b>", val_bold_style),
                Paragraph(str(advice), body_text_style),
            ])
        if follow_up:
            advice_cells.append([
                Paragraph("<b>Follow-Up Plan:</b>", val_bold_style),
                Paragraph(str(follow_up), body_text_style),
            ])

        advice_tbl = Table(advice_cells, colWidths=[140, 380])
        advice_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg_subtle),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("BOX", (0, 0), (-1, -1), 1, border_color),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, border_color),
        ]))
        story.append(advice_tbl)
        story.append(Spacer(1, 15))

    # ── 6. Doctor Signature & Verification Footer ─────────────────────────────
    sig_block = [
        [
            [
                Paragraph("<b>Digital Verification:</b>", label_style),
                Paragraph(f"Share Token: <code>{share_token[:16]}...</code>" if share_token else "Verified via PreDoc Electronic Health Record", label_style),
                Paragraph("Scan or present QR code at pharmacy to verify authenticity.", label_style),
            ],
            [
                Paragraph("<b>Physician Signature:</b>", label_style),
                Spacer(1, 18),
                Paragraph(f"<b>{doctor_name}</b>", val_bold_style),
                Paragraph("Licensed Medical Practitioner", label_style),
            ]
        ]
    ]
    sig_tbl = Table(sig_block, colWidths=[320, 200])
    sig_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(KeepTogether(sig_tbl))

    # Build document
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


# ==============================================================================
# 3. HIGH LEVEL DISPATCHER
# ==============================================================================

def generate_prescription_pdf(
    rx_data: Dict[str, Any],
    template: Optional[Any] = None,
) -> bytes:
    """
    Main entry point: Generates PDF using custom hospital template overlay if provided,
    or falls back to the default professional Rx layout.
    """
    if template and getattr(template, "field_positions_json", None):
        try:
            return generate_custom_template_pdf(rx_data, template)
        except Exception as e:
            logger.error("Error generating custom template PDF, falling back to default layout: %s", e)
            return generate_default_prescription_pdf(rx_data)

    return generate_default_prescription_pdf(rx_data)
