import asyncio
import logging
from typing import Set

from fastapi import APIRouter, HTTPException
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/product", tags=["product"])
_background_tasks: Set[asyncio.Task] = set()


class ProductCreateRequest(BaseModel):
    prompt: str = Field(..., min_length=5, max_length=2000)
    image_count: int = Field(1, ge=1, le=6)


class ProductEditRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000)


def _ensure_not_busy(state: ProductState) -> None:
    if state.in_progress:
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
    
    # Check if there are any active background tasks
    has_active_tasks = any(not task.done() for task in _background_tasks)
    
    if state.in_progress and not has_active_tasks:
        logger.warning("[product-router] Recovering from stale in_progress state")
        state.in_progress = False
        state.status = "idle"
        state.message = "Recovered from interrupted generation"
        save_product_state(state)
        
        status_payload = ProductStatus(
            status="idle",
            progress=0,
            message="Recovered from interrupted generation"
        )
        save_product_status(status_payload)
        
        return {
            "recovered": True,
            "message": "Cleared stale in_progress state"
        }
    
    return {
        "recovered": False,
        "in_progress": state.in_progress,
        "has_active_tasks": has_active_tasks
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


