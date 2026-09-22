import os
import re
import uuid
import base64
import logging
import mimetypes
from typing import Optional, Tuple

logger = logging.getLogger("predoc.storage")

# Uploads directory path (backend/uploads)
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BACKEND_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Register custom MIME types
mimetypes.init()
mimetypes.add_type("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx")
mimetypes.add_type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx")
mimetypes.add_type("application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx")
mimetypes.add_type("application/msword", ".doc")
mimetypes.add_type("application/pdf", ".pdf")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/webp", ".webp")

ALLOWED_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".bmp",
    ".doc", ".docx", ".txt", ".csv", ".rtf", ".xls", ".xlsx"
}


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal and unsafe characters."""
    base = os.path.basename(filename or "document")
    clean = re.sub(r'[^a-zA-Z0-9_.\-\(\)\s]', '_', base).strip()
    return clean or "document"


def detect_mime_type(content: bytes, filename: str = "", fallback_mime: str = "") -> str:
    """
    Accurately sniff or detect MIME type from magic bytes and filename.
    Guarantees SVGs, PDFs, PNGs, JPEGs, and Word docs get their exact content type.
    """
    if not content:
        ext = os.path.splitext(filename or "")[1].lower()
        guessed, _ = mimetypes.guess_type(filename)
        return guessed or fallback_mime or "application/octet-stream"

    head = content[:1024].lstrip()
    ext = os.path.splitext(filename or "")[1].lower()

    # 1. Magic byte checks
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"RIFF") and b"WEBP" in head[:16]:
        return "image/webp"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return "image/gif"
    if head.startswith(b"BM"):
        return "image/bmp"
    if head.startswith(b"<svg") or b"<svg" in head[:512] or (head.startswith(b"<?xml") and b"<svg" in head[:512]):
        return "image/svg+xml"

    # Zip-based formats (DOCX, XLSX, etc.)
    if head.startswith(b"PK\x03\x04"):
        if ext == ".docx":
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if ext == ".xlsx":
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if ext == ".pptx":
            return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        return "application/zip"

    # OLECF legacy Microsoft formats
    if head.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        if ext == ".doc":
            return "application/msword"
        if ext == ".xls":
            return "application/vnd.ms-excel"
        if ext == ".ppt":
            return "application/vnd.ms-powerpoint"

    # 2. File extension fallback
    guessed, _ = mimetypes.guess_type(filename)
    if guessed:
        return guessed

    return fallback_mime or "application/octet-stream"


def save_file_to_disk(file_bytes: bytes, filename: str, mime_type: Optional[str] = None) -> dict:
    """
    Save uploaded raw bytes to backend/uploads directory.
    Returns file metadata including real path, accessible static URL, and resolved MIME type.
    """
    clean_name = sanitize_filename(filename)
    prefix = uuid.uuid4().hex[:8]
    stored_filename = f"{prefix}_{clean_name}"
    file_path = os.path.join(UPLOAD_DIR, stored_filename)

    with open(file_path, "wb") as f:
        f.write(file_bytes)

    resolved_mime = detect_mime_type(file_bytes, clean_name, mime_type or "")

    logger.info("Saved file to disk: %s (size: %d, mime: %s)", file_path, len(file_bytes), resolved_mime)

    return {
        "original_filename": clean_name,
        "stored_filename": stored_filename,
        "file_path": file_path,
        "file_url": f"/uploads/{stored_filename}",
        "mime_type": resolved_mime,
        "file_size": len(file_bytes),
    }


def resolve_document_content(doc) -> Tuple[bytes, str, str]:
    """
    Resolve and return (content_bytes, mime_type, filename) for any DocumentRecord or PatientDocument.
    Checks disk path first, static uploads folder second, base64 third.
    """
    if not doc:
        return b"", "application/octet-stream", "document"

    filename = getattr(doc, "filename", None) or f"document_{doc.id}"
    mime = getattr(doc, "mime_type", None) or "application/octet-stream"
    file_path = getattr(doc, "file_path", None)
    file_url = getattr(doc, "file_url", None)
    image_base64 = getattr(doc, "image_base64", None)

    # 1. Try file_path on disk
    if file_path and os.path.exists(file_path):
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            actual_mime = detect_mime_type(content, filename, mime)
            return content, actual_mime, filename
        except Exception as e:
            logger.warning("Error reading file_path %s: %s", file_path, e)

    # 2. Try file_url in UPLOAD_DIR
    if file_url and file_url.startswith("/uploads/"):
        disk_name = file_url.replace("/uploads/", "").strip()
        disk_path = os.path.join(UPLOAD_DIR, disk_name)
        if os.path.exists(disk_path):
            try:
                with open(disk_path, "rb") as f:
                    content = f.read()
                actual_mime = detect_mime_type(content, filename, mime)
                return content, actual_mime, filename
            except Exception as e:
                logger.warning("Error reading disk_path %s: %s", disk_path, e)

    # 3. Try base64 payload
    if image_base64:
        b64_str = image_base64
        if b64_str.startswith("data:"):
            header, encoded = b64_str.split(",", 1)
            if ";" in header:
                header_mime = header.split(";", 1)[0].replace("data:", "").strip()
                if header_mime:
                    mime = header_mime
        else:
            encoded = b64_str

        try:
            content = base64.b64decode(encoded)
            actual_mime = detect_mime_type(content, filename, mime)
            
            # Sync to disk if not yet saved on disk
            try:
                clean_name = sanitize_filename(filename)
                disk_name = f"doc_{doc.id}_{clean_name}"
                disk_path = os.path.join(UPLOAD_DIR, disk_name)
                if not os.path.exists(disk_path) and len(content) > 0:
                    with open(disk_path, "wb") as f:
                        f.write(content)
            except Exception:
                pass

            return content, actual_mime, filename
        except Exception as e:
            logger.warning("Base64 decode error for document %s: %s", getattr(doc, "id", None), e)

    return b"", mime, filename
