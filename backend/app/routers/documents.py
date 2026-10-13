"""Document upload, listing, lifecycle and download.

POST /documents, GET /documents and GET /documents/stats are real and
database-backed (US-008-1): an admin uploads a supported file, its original
bytes go to object storage (or local disk when S3 is not configured -- see
`app/storage.py`), and a `Document` row is created with status
'processing'. The worker component (text extraction, OCR, chunking,
embedding) that later moves a document to 'ready' or 'failed' does not
exist yet -- that is later development-sprint work (US-009, US-016,
US-020); `/documents/{id}/download`, `/documents/{id}/reprocess` and
`DELETE /documents/{id}` stay stubs here for the same reason.

`/stats` is declared ahead of the `{document_id}` routes so a literal path
segment is never swallowed by a path parameter.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.deps import current_user, require_admin
from app.models import Chunk, Document, User
from app.schemas import (
    DocumentCreateOut,
    DocumentOut,
    DocumentStatsOut,
    ReprocessRequest,
    StubResponse,
)
from app.storage import store_object

router = APIRouter(prefix="/documents", tags=["documents"])

logger = logging.getLogger(__name__)

# AC-016: these are the only formats accepted, by extension or content type.
_ACCEPTED_EXTENSIONS = {".pdf": "pdf", ".docx": "docx", ".txt": "txt", ".md": "md"}
_ACCEPTED_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
}
_ACCEPTED_LABEL = "PDF, DOCX, TXT, MD"
_MAX_SIZE_BYTES = 25 * 1024 * 1024  # AC-017


def _resolve_file_type(filename: str, content_type: str | None) -> str | None:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in _ACCEPTED_EXTENSIONS:
        return _ACCEPTED_EXTENSIONS[ext]
    if content_type and content_type.lower() in _ACCEPTED_CONTENT_TYPES:
        return _ACCEPTED_CONTENT_TYPES[content_type.lower()]
    return None


@router.post("", response_model=DocumentCreateOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),  # noqa: B008
    db: DBSession = Depends(get_db),  # noqa: B008
    user: User = Depends(require_admin),  # noqa: B008
) -> Document:
    filename = file.filename or "upload"
    file_type = _resolve_file_type(filename, file.content_type)
    if file_type is None:
        # AC-016: nothing is read/stored/persisted for an unsupported type.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type; accepted formats are {_ACCEPTED_LABEL}.",
        )

    data = await file.read()
    if len(data) > _MAX_SIZE_BYTES:
        # AC-017: nothing is stored and no row is created for an oversize file.
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the 25 MB size limit.",
        )

    key = f"documents/{uuid.uuid4()}/{filename}"
    store_object(key, data)

    document = Document(
        filename=filename,
        file_type=file_type,
        size_bytes=len(data),
        s3_key=key,
        status="processing",
        uploaded_by=user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.get("", response_model=list[DocumentOut])
async def list_documents(
    q: str | None = None,
    status: str | None = None,
    type: str | None = None,
    db: DBSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(current_user),  # noqa: B008
) -> list[DocumentOut]:
    query = db.query(Document)
    if q:
        query = query.filter(Document.filename.ilike(f"%{q}%"))
    if status:
        query = query.filter(Document.status == status)
    if type:
        query = query.filter(Document.file_type == type)
    documents = query.order_by(Document.created_at.desc()).all()

    chunk_counts = dict(
        db.query(Chunk.document_id, func.count(Chunk.id)).group_by(Chunk.document_id).all()
    )
    uploader_names = {u.id: u.email for u in db.query(User.id, User.email).all()}

    return [
        DocumentOut(
            id=document.id,
            filename=document.filename,
            file_type=document.file_type,
            size_bytes=document.size_bytes,
            status=document.status,
            failure_reason=document.failure_reason,
            notes=document.notes,
            chunk_count=chunk_counts.get(document.id, 0),
            uploaded_by=uploader_names.get(document.uploaded_by, "unknown"),
            created_at=document.created_at,
        )
        for document in documents
    ]


@router.get("/stats", response_model=DocumentStatsOut)
async def document_stats(
    db: DBSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(current_user),  # noqa: B008
) -> DocumentStatsOut:
    total = db.query(func.count(Document.id)).scalar() or 0
    ready = db.query(func.count(Document.id)).filter(Document.status == "ready").scalar() or 0
    processing = (
        db.query(func.count(Document.id)).filter(Document.status == "processing").scalar() or 0
    )
    failed = db.query(func.count(Document.id)).filter(Document.status == "failed").scalar() or 0
    chunks = db.query(func.count(Chunk.id)).scalar() or 0
    total_bytes = db.query(func.coalesce(func.sum(Document.size_bytes), 0)).scalar() or 0

    return DocumentStatsOut(
        total=total,
        ready=ready,
        processing=processing,
        failed=failed,
        chunks=chunks,
        bytes=total_bytes,
    )


@router.get("/{document_id}/download", response_model=StubResponse)
async def download_document(document_id: str) -> StubResponse:
    return StubResponse(endpoint="GET /documents/{id}/download")


@router.post("/{document_id}/reprocess", response_model=StubResponse)
async def reprocess_document(document_id: str, payload: ReprocessRequest) -> StubResponse:
    return StubResponse(endpoint="POST /documents/{id}/reprocess")


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: str) -> Response:
    return Response(status_code=204)
