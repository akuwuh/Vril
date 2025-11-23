from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.core.redis import redis_service

logger = logging.getLogger(__name__)

PACKAGING_STATE_KEY = "packaging:current"


def _utcnow() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


def _default_box_dimensions() -> Dict[str, float]:
    """Return default box dimensions."""
    return {"width": 100.0, "height": 150.0, "depth": 100.0}


def _default_cylinder_dimensions() -> Dict[str, float]:
    """Return default cylinder dimensions."""
    return {"width": 80.0, "height": 150.0, "depth": 80.0}


class ShapeState(BaseModel):
    """State for a specific shape type (box or cylinder)."""
    dimensions: Dict[str, float] = Field(default_factory=dict)
    panel_textures: Dict[str, PanelTexture] = Field(default_factory=dict)


class PanelTexture(BaseModel):
    """Generated texture for a specific panel."""
    
    panel_id: str  # e.g., "front", "back", "body", etc.
    texture_url: str  # Base64 data URL or URL
    prompt: str
    generated_at: datetime = Field(default_factory=_utcnow)
    dimensions: Optional[Dict[str, float]] = None  # width, height in mm


class PackagingState(BaseModel):
    """Single-session source of truth for packaging design.
    
    Stores separate state for box and cylinder shapes so switching between
    them preserves dimensions and textures independently.
    """
    
    # Current active shape type
    current_package_type: Literal["box", "cylinder"] = "box"
    
    # Separate state stores for each shape type
    box_state: ShapeState = Field(default_factory=lambda: ShapeState(dimensions=_default_box_dimensions()))
    cylinder_state: ShapeState = Field(default_factory=lambda: ShapeState(dimensions=_default_cylinder_dimensions()))
    
    # Generation state (shared across shapes)
    in_progress: bool = False
    generating_panel: Optional[str] = None
    generating_panels: List[str] = Field(default_factory=list)
    bulk_generation_in_progress: bool = False
    last_error: Optional[str] = None
    
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    
    # Convenience properties for backward compatibility
    @property
    def package_type(self) -> str:
        """Get current package type."""
        return self.current_package_type
    
    @package_type.setter
    def package_type(self, value: str) -> None:
        """Set current package type."""
        self.current_package_type = value
    
    @property
    def package_dimensions(self) -> Dict[str, float]:
        """Get dimensions for current shape type."""
        if self.current_package_type == "cylinder":
            return self.cylinder_state.dimensions
        return self.box_state.dimensions
    
    @package_dimensions.setter
    def package_dimensions(self, value: Dict[str, float]) -> None:
        """Set dimensions for current shape type."""
        if self.current_package_type == "cylinder":
            self.cylinder_state.dimensions = value
        else:
            self.box_state.dimensions = value
    
    @property
    def panel_textures(self) -> Dict[str, PanelTexture]:
        """Get panel textures for current shape type."""
        if self.current_package_type == "cylinder":
            return self.cylinder_state.panel_textures
        return self.box_state.panel_textures
    
    @panel_textures.setter
    def panel_textures(self, value: Dict[str, PanelTexture]) -> None:
        """Set panel textures for current shape type."""
        if self.current_package_type == "cylinder":
            self.cylinder_state.panel_textures = value
        else:
            self.box_state.panel_textures = value
    
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
        """Set texture for a panel on current shape type."""
        if self.current_package_type == "cylinder":
            self.cylinder_state.panel_textures[panel_id] = texture
        else:
            self.box_state.panel_textures[panel_id] = texture
        self.updated_at = _utcnow()
    
    def get_panel_texture(self, panel_id: str) -> Optional[PanelTexture]:
        """Get texture for a panel from current shape type."""
        if self.current_package_type == "cylinder":
            return self.cylinder_state.panel_textures.get(panel_id)
        return self.box_state.panel_textures.get(panel_id)
    
    def atomic_update_textures(
        self, 
        new_textures: Dict[str, PanelTexture],
        replace: bool = False
    ) -> None:
        """
        Atomically update panel textures.
        Args:
            new_textures: Dict of panel_id -> PanelTexture to add/update
            replace: If True, replace all textures. If False, merge with existing.
        """
        if replace:
            self.panel_textures = new_textures
        else:
            self.panel_textures.update(new_textures)
        self.updated_at = _utcnow()
    
    def rollback_generation(self) -> None:
        """Reset generation state without losing textures."""
        self.in_progress = False
        self.generating_panel = None
        self.generating_panels = []
        self.bulk_generation_in_progress = False
        self.updated_at = _utcnow()
    
    def has_valid_dimensions(self, shape_type: Optional[str] = None) -> bool:
        """Check if dimensions for a shape type have all required fields."""
        required = {"width", "height", "depth"}
        target_type = shape_type or self.current_package_type
        
        if target_type == "cylinder":
            dims = self.cylinder_state.dimensions
        else:
            dims = self.box_state.dimensions
        
        return (
            isinstance(dims, dict) and
            required.issubset(dims.keys()) and
            all(isinstance(dims[k], (int, float)) for k in required)
        )
    
    def ensure_valid_dimensions(self) -> None:
        """Ensure dimensions are valid for both shape types, reset to defaults if not."""
        # Check and fix box state
        if not self.has_valid_dimensions("box"):
            logger.warning("Invalid box dimensions detected, resetting to defaults")
            self.box_state.dimensions = _default_box_dimensions()
        
        # Check and fix cylinder state
        if not self.has_valid_dimensions("cylinder"):
            logger.warning("Invalid cylinder dimensions detected, resetting to defaults")
            self.cylinder_state.dimensions = _default_cylinder_dimensions()


def get_packaging_state() -> PackagingState:
    """Fetch the current session state from Redis or return a default object."""
    payload = redis_service.get_json(PACKAGING_STATE_KEY)
    if not payload:
        state = PackagingState()
        state.ensure_valid_dimensions()
        return state
    state = PackagingState.model_validate(payload)
    state.ensure_valid_dimensions()  # Ensure dimensions are always valid
    return state


def save_packaging_state(state: PackagingState) -> None:
    """Persist the session state back to Redis."""
    state.updated_at = _utcnow()
    redis_service.set_json(PACKAGING_STATE_KEY, state.as_json())


def clear_packaging_state() -> PackagingState:
    """Reset the stored state."""
    state = PackagingState()
    save_packaging_state(state)
    return state


def atomic_save_packaging_state(state: PackagingState) -> bool:
    """
    Save state to Redis atomically.
    Returns True if successful, False if Redis unavailable.
    """
    try:
        state.updated_at = _utcnow()
        redis_service.set_json(PACKAGING_STATE_KEY, state.as_json())
        return True
    except Exception as e:
        logger.error(f"Failed to save packaging state: {e}")
        return False

