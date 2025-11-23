from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.core.redis import redis_service

PRODUCT_STATE_KEY = "product:current"
PRODUCT_STATUS_KEY = "product_status:current"


def _utcnow() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class TrellisArtifacts(BaseModel):
    """Latest Trellis asset bundle."""

    model_file: Optional[str] = None
    color_video: Optional[str] = None
    gaussian_ply: Optional[str] = None
    normal_video: Optional[str] = None
    combined_video: Optional[str] = None
    no_background_images: List[str] = Field(default_factory=list)


class ProductIteration(BaseModel):
    """Historical record for each create/edit pass."""

    id: str  # Must be set explicitly when creating
    type: Literal["create", "edit"] = "create"
    prompt: str
    images: List[str] = Field(default_factory=list)
    trellis_output: Optional[TrellisArtifacts] = None
    created_at: datetime = Field(default_factory=_utcnow)
    note: Optional[str] = None
    duration_seconds: Optional[float] = None


class ProductState(BaseModel):
    """Single-session source of truth for product generation."""

    prompt: Optional[str] = None
    latest_instruction: Optional[str] = None
    mode: Literal["idle", "create", "edit"] = "idle"
    status: str = "idle"
    message: Optional[str] = None
    in_progress: bool = False
    generation_started_at: Optional[datetime] = None  # For timer continuity across reloads
    image_count: int = 3
    images: List[str] = Field(default_factory=list)
    trellis_output: Optional[TrellisArtifacts] = None
    iterations: List[ProductIteration] = Field(default_factory=list)
    last_error: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    def as_json(self) -> dict:
        """Return a JSON-serializable dict."""
        return self.model_dump(mode="json")

    def mark_error(self, error_message: str) -> None:
        """Convenience helper when the pipeline fails."""
        self.status = "error"
        self.message = error_message
        self.last_error = error_message
        self.in_progress = False
        self.updated_at = _utcnow()

    def mark_complete(self, message: str = "Complete") -> None:
        self.status = "complete"
        self.message = message
        self.in_progress = False
        self.generation_started_at = None  # Clear timer on completion
        self.updated_at = _utcnow()

    def mark_progress(self, status: str, message: Optional[str] = None) -> None:
        self.status = status
        if message:
            self.message = message
        self.updated_at = _utcnow()


class ProductStatus(BaseModel):
    """Lightweight payload that the frontend polls frequently."""

    status: str = "idle"
    progress: int = 0
    message: Optional[str] = None
    error: Optional[str] = None
    model_file: Optional[str] = None
    preview_image: Optional[str] = None
    updated_at: datetime = Field(default_factory=_utcnow)

    def as_json(self) -> dict:
        return self.model_dump(mode="json")


def get_product_state() -> ProductState:
    """Fetch the current session state from Redis or return a default object."""
    payload = redis_service.get_json(PRODUCT_STATE_KEY)
    if not payload:
        return ProductState()
    return ProductState.model_validate(payload)


def save_product_state(state: ProductState) -> None:
    """Persist the session state back to Redis."""
    state.updated_at = _utcnow()
    redis_service.set_json(PRODUCT_STATE_KEY, state.as_json())


def clear_product_state() -> ProductState:
    """Reset the stored state."""
    state = ProductState()
    save_product_state(state)
    return state


def get_product_status() -> ProductStatus:
    payload = redis_service.get_json(PRODUCT_STATUS_KEY)
    if not payload:
        return ProductStatus()
    return ProductStatus.model_validate(payload)


def save_product_status(status: ProductStatus) -> None:
    status.updated_at = _utcnow()
    redis_service.set_json(PRODUCT_STATUS_KEY, status.as_json())


