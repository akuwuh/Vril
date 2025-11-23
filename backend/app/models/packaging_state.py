from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.core.redis import redis_service

PACKAGING_STATE_KEY = "packaging:current"


def _utcnow() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class PanelTexture(BaseModel):
    """Generated texture for a specific panel."""
    
    panel_id: str  # e.g., "front", "back", "body", etc.
    texture_url: str  # Base64 data URL or URL
    prompt: str
    generated_at: datetime = Field(default_factory=_utcnow)
    dimensions: Optional[Dict[str, float]] = None  # width, height in mm


class PackagingState(BaseModel):
    """Single-session source of truth for packaging design."""
    
    package_type: Literal["box", "cylinder"] = "box"
    package_dimensions: Dict[str, float] = Field(default_factory=dict)  # width, height, depth
    panel_textures: Dict[str, PanelTexture] = Field(default_factory=dict)  # panel_id -> texture
    in_progress: bool = False
    generating_panel: Optional[str] = None  # panel_id currently being generated (for single generation)
    generating_panels: List[str] = Field(default_factory=list)  # panel_ids being generated (for bulk generation)
    bulk_generation_in_progress: bool = False
    last_error: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    
    def as_json(self) -> dict:
        """Return a JSON-serializable dict."""
        return self.model_dump(mode="json")
    
    def mark_error(self, error_message: str) -> None:
        """Convenience helper when generation fails."""
        self.last_error = error_message
        self.in_progress = False
        self.generating_panel = None
        self.bulk_generation_in_progress = False
        self.generating_panels = []
        self.updated_at = _utcnow()
    
    def set_panel_texture(self, panel_id: str, texture: PanelTexture) -> None:
        """Set texture for a panel."""
        self.panel_textures[panel_id] = texture
        self.updated_at = _utcnow()
    
    def get_panel_texture(self, panel_id: str) -> Optional[PanelTexture]:
        """Get texture for a panel."""
        return self.panel_textures.get(panel_id)


def get_packaging_state() -> PackagingState:
    """Fetch the current session state from Redis or return a default object."""
    payload = redis_service.get_json(PACKAGING_STATE_KEY)
    if not payload:
        return PackagingState()
    return PackagingState.model_validate(payload)


def save_packaging_state(state: PackagingState) -> None:
    """Persist the session state back to Redis."""
    state.updated_at = _utcnow()
    redis_service.set_json(PACKAGING_STATE_KEY, state.as_json())


def clear_packaging_state() -> PackagingState:
    """Reset the stored state."""
    state = PackagingState()
    save_packaging_state(state)
    return state

