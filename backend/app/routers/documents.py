"""Document upload, listing, lifecycle and download.

The worker component (text extraction, OCR, chunking, embedding) consumes
the jobs this router will enqueue; neither the enqueue call nor the worker
itself exist yet -- both are development-sprint work (US-008, US-009,
US-016, US-020). `/stats` is declared ahead of the `{document_id}` routes so
a literal path segment is never swallowed by a path parameter.
"""

from fastapi import APIRouter, File, Response, UploadFile

from app.schemas import ReprocessRequest, StubResponse

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=StubResponse, status_code=202)
async def upload_document(file: UploadFile = File(...)) -> StubResponse:  # noqa: B008
    return StubResponse(endpoint="POST /documents")


@router.get("", response_model=list[StubResponse])
async def list_documents(
    q: str | None = None,
    status: str | None = None,
    type: str | None = None,
) -> list[StubResponse]:
    return [StubResponse(endpoint="GET /documents")]


@router.get("/stats", response_model=StubResponse)
async def document_stats() -> StubResponse:
    return StubResponse(endpoint="GET /documents/stats")


@router.get("/{document_id}/download", response_model=StubResponse)
async def download_document(document_id: str) -> StubResponse:
    return StubResponse(endpoint="GET /documents/{id}/download")


@router.post("/{document_id}/reprocess", response_model=StubResponse)
async def reprocess_document(document_id: str, payload: ReprocessRequest) -> StubResponse:
    return StubResponse(endpoint="POST /documents/{id}/reprocess")


@router.delete("/{document_id}", status_code=204)
async def delete_document(document_id: str) -> Response:
    return Response(status_code=204)
