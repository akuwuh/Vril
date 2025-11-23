import asyncio
import logging
from typing import Set

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.models.product_state import (
    ProductState,
    ProductStatus,
    get_product_state,
    get_product_status,
    save_product_state,
    save_product_status,
    _utcnow,
)
from app.services.product_pipeline import product_pipeline_service
from app.services.file_export import (
    export_product_formats,
    get_export_file_path,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/product", tags=["product"])
_background_tasks: Set[asyncio.Task] = set()


class ProductCreateRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=2000)
    image_count: int = Field(1, ge=1, le=6)


class ProductEditRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)


def _has_active_tasks() -> bool:
    return any(not task.done() for task in _background_tasks)


def _auto_recover_if_needed(state: ProductState) -> bool:
    """
    If Redis says a generation is running but we have no active background tasks
    (e.g. the server restarted or the worker crashed), clear the stale flag so
    users can start a new run without manual intervention.
    """
    if not state.in_progress:
        return False

    if _has_active_tasks():
        return False

    logger.warning("[product-router] Auto-recovering stale in-progress state")
    state.in_progress = False
    state.status = "idle"
    state.message = "Recovered from interrupted generation"
    state.generation_started_at = None
    save_product_state(state)

    status_payload = ProductStatus(
        status="idle",
        progress=0,
        message="Recovered from interrupted generation",
    )
    save_product_status(status_payload)
    return True


def _ensure_not_busy(state: ProductState) -> None:
    if state.in_progress:
        if _auto_recover_if_needed(state):
            return
        raise HTTPException(status_code=409, detail="Generation already running")


def _track_background_task(task: asyncio.Task) -> None:
    """Keep a reference to background work so it isn’t GC’d prematurely."""
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


@router.post("/create")
async def start_create(request: ProductCreateRequest):
    """Start the create pipeline and return the initial status payload."""
    state = get_product_state()
    _ensure_not_busy(state)

    logger.info("[product-router] Queuing create request")
    state.prompt = request.prompt
    state.latest_instruction = request.prompt
    state.mode = "create"
    state.status = "pending"
    state.message = "Preparing product generation"
    state.in_progress = True
    state.generation_started_at = _utcnow()  # Track start time for frontend timer
    state.image_count = request.image_count
    state.images = []
    state.trellis_output = None
    state.iterations = []
    state.last_error = None
    save_product_state(state)

    payload = ProductStatus(status="pending", progress=0, message="Preparing product generation")
    save_product_status(payload)

    task = asyncio.create_task(product_pipeline_service.run_create(request.prompt, request.image_count))
    _track_background_task(task)
    return payload.model_dump(mode="json")


@router.post("/edit")
async def start_edit(request: ProductEditRequest):
    """Start the edit pipeline using the existing context."""
    state = get_product_state()
    _ensure_not_busy(state)

    if not state.prompt or not state.images:
        raise HTTPException(status_code=400, detail="No base product available to edit")

    logger.info("[product-router] Queuing edit request")
    state.latest_instruction = request.prompt
    state.mode = "edit"
    state.status = "pending"
    state.message = "Preparing edit request"
    state.in_progress = True
    state.generation_started_at = _utcnow()  # Track start time for frontend timer
    save_product_state(state)

    payload = ProductStatus(status="pending", progress=0, message="Preparing edit request")
    save_product_status(payload)

    task = asyncio.create_task(product_pipeline_service.run_edit(request.prompt))
    _track_background_task(task)
    return payload.model_dump(mode="json")


@router.get("")
async def fetch_product_state():
    """Return the entire persisted state blob for the frontend to hydrate."""
    state = get_product_state()
    return state.model_dump(mode="json")


@router.get("/status")
async def fetch_product_status():
    """Return the lightweight status payload (small + poll-friendly)."""
    status = get_product_status()
    return status.model_dump(mode="json")


@router.post("/recover")
async def recover_state():
    """
    Recover from stale in_progress state (e.g. after page reload during generation).
    Checks if there are any active background tasks. If not, clears the in_progress flag.
    """
    state = get_product_state()
    
    recovered = _auto_recover_if_needed(state)

    return {
        "recovered": recovered,
        "in_progress": state.in_progress,
        "has_active_tasks": _has_active_tasks(),
    }


@router.post("/rewind/{iteration_index}")
async def rewind_product(iteration_index: int):
    """Revert the product state to a specific iteration."""
    state = get_product_state()

    if state.in_progress:
        raise HTTPException(status_code=409, detail="Cannot rewind while generation is running")

    if iteration_index < 0 or iteration_index >= len(state.iterations):
        raise HTTPException(status_code=400, detail="Invalid iteration index")

    target_iteration = state.iterations[iteration_index]
    state.iterations = state.iterations[: iteration_index + 1]
    state.images = target_iteration.images.copy()
    state.trellis_output = target_iteration.trellis_output
    state.latest_instruction = target_iteration.prompt
    if target_iteration.type == "create":
        state.prompt = target_iteration.prompt
    state.mode = target_iteration.type
    state.status = "idle"
    state.message = "Rewound to previous version"
    state.in_progress = False
    state.last_error = None
    save_product_state(state)

    preview = None
    if target_iteration.trellis_output and target_iteration.trellis_output.no_background_images:
        preview = target_iteration.trellis_output.no_background_images[0]
    status_payload = ProductStatus(
        status="idle",
        progress=0,
        message="Rewound to previous version",
        model_file=target_iteration.trellis_output.model_file if target_iteration.trellis_output else None,
        preview_image=preview,
    )
    save_product_status(status_payload)

    return {
        "status": "rewound",
        "iteration_index": iteration_index,
        "total_iterations": len(state.iterations),
    }


@router.post("/export")
async def trigger_product_export():
    """Generate export files for product (blend/stl/jpg)."""
    state = get_product_state()
    
    if not state.trellis_output or not state.trellis_output.model_file:
        raise HTTPException(status_code=400, detail="No product model available for export")
    
    # Generate session ID from state updated_at timestamp
    session_id = str(int(state.updated_at.timestamp()))
    
    try:
        export_files = export_product_formats(state, session_id)
        
        # Update state with export file paths
        state.export_files = {fmt: str(path) for fmt, path in export_files.items()}
        save_product_state(state)
        
        return {
            "status": "success",
            "files": {fmt: str(path) for fmt, path in export_files.items()},
        }
    except Exception as e:
        logger.error(f"[product-router] Export failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/export/{format}")
async def download_product_export(format: str):
    """Download exported product file."""
    if format not in ["blend", "stl", "jpg"]:
        raise HTTPException(status_code=400, detail=f"Invalid format: {format}")
    
    state = get_product_state()
    
    if not state.trellis_output or not state.trellis_output.model_file:
        raise HTTPException(status_code=400, detail="No product model available for export")
    
    session_id = str(int(state.updated_at.timestamp()))
    
    file_path = get_export_file_path(session_id, "product", format)
    
    if not file_path or not file_path.exists():
        # Try to generate if not exists
        try:
            export_files = export_product_formats(state, session_id)
            state.export_files = {fmt: str(path) for fmt, path in export_files.items()}
            save_product_state(state)
            file_path = export_files.get(format)
        except Exception as e:
            logger.error(f"[product-router] Export generation failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Export generation failed: {str(e)}")
    
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Export file not found: {format}")
    
    media_type_map = {
        "blend": "application/octet-stream",  # OBJ file
        "stl": "application/octet-stream",
        "jpg": "image/jpeg",
    }
    
    return FileResponse(
        str(file_path),
        media_type=media_type_map.get(format, "application/octet-stream"),
        filename=f"product.{format if format != 'blend' else 'obj'}",
    )


