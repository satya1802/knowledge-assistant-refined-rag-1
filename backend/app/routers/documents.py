"""Document upload, listing, lifecycle and download.

POST /documents, GET /documents, GET /documents/stats and DELETE
/documents/{id} are real and database-backed (US-008-1/US-010-1): an admin
uploads a supported file, its original bytes go to object storage (or local
disk when S3 is not configured -- see `app/storage.py`), and a `Document`
row is created with status 'processing'. That row is then handed to the
background worker (`app/worker.py`, US-019-2/US-020) via
`enqueue_processing` -- the request returns as soon as the row is
committed, never waiting on extraction, chunking or embedding, and the
worker later moves the row to 'ready' or 'failed' on its own, independent
of this request's session or the uploading client staying connected. A
document the worker marks 'failed' keeps both its row and its stored
object -- nothing here or in the worker ever deletes either on failure
(AC-020); only an explicit `DELETE /documents/{id}` removes them.

`/documents/{id}/download` and `/documents/{id}/reprocess` stay stubs here
for later development-sprint work.

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
from app.storage import delete_object, store_object
from app.worker import enqueue_processing

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

_DOCUMENT_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")


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

    # AC-047: handed to the background worker; this request never waits on
    # extraction, chunking or embedding.
    enqueue_processing(document.id)

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


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    db: DBSession = Depends(get_db),  # noqa: B008
    _user: User = Depends(require_admin),  # noqa: B008
) -> Response:
    """Removes a document and everything that depends on it (US-010-1):
    its `Chunk` rows, the `Document` row itself, and the original object
    `app/storage.py` wrote for it. Admin-only (401 unauthenticated, 403
    signed-in non-admin via `require_admin`); an id that does not name an
    existing document is 404."""
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError as exc:
        raise _DOCUMENT_NOT_FOUND from exc

    document = db.query(Document).filter(Document.id == doc_uuid).first()
    if document is None:
        raise _DOCUMENT_NOT_FOUND

    s3_key = document.s3_key

    db.query(Chunk).filter(Chunk.document_id == document.id).delete()
    db.delete(document)
    db.commit()

    # Deletion of the stored object goes through app/storage.py only -- no
    # inline boto3/file calls here.
    delete_object(s3_key)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
