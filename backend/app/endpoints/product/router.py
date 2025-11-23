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


