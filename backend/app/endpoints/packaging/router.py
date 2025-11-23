import asyncio
import logging
from typing import Set, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.packaging_state import (
    PackagingState,
    PanelTexture,
    get_packaging_state,
    save_packaging_state,
)
from app.services.panel_generation import panel_generation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/packaging", tags=["packaging"])
_background_tasks: Set[asyncio.Task] = set()


class PanelGenerateRequest(BaseModel):
    panel_id: str = Field(..., description="Panel identifier (e.g., 'front', 'back', 'body')")
    prompt: str = Field(..., min_length=3, max_length=2000, description="Design prompt for the panel")
    package_type: str = Field(..., description="Package type: 'box' or 'cylinder'")
    panel_dimensions: dict = Field(..., description="Panel dimensions: {width, height} in mm")
    package_dimensions: dict = Field(..., description="Full package dimensions: {width, height, depth} in mm")


def _track_background_task(task: asyncio.Task) -> None:
    """Keep a reference to background work so it isn't GC'd prematurely."""
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


@router.post("/panels/generate")
async def generate_panel_texture(request: PanelGenerateRequest):
    """Generate a texture for a specific panel."""
    logger.info(f"[packaging-router] Received texture generation request for panel {request.panel_id}")
    logger.info(f"[packaging-router] Request details: prompt='{request.prompt[:50]}...', package_type={request.package_type}")
    
    state = get_packaging_state()
    
    # Update state with current package info
    state.package_type = request.package_type
    state.package_dimensions = request.package_dimensions
    state.in_progress = True
    state.generating_panel = request.panel_id
    state.last_error = None
    save_packaging_state(state)
    
    logger.info(f"[packaging-router] Starting texture generation for panel {request.panel_id}")
    
    # Run generation in background
    async def _generate():
        try:
            texture_url = await panel_generation_service.generate_panel_texture(
                panel_id=request.panel_id,
                prompt=request.prompt,
                package_type=request.package_type,
                panel_dimensions=request.panel_dimensions,
                package_dimensions=request.package_dimensions,
            )
            
            # Get fresh state to avoid race conditions
            current_state = get_packaging_state()
            
            if texture_url:
                texture = PanelTexture(
                    panel_id=request.panel_id,
                    texture_url=texture_url,
                    prompt=request.prompt,
                    dimensions=request.panel_dimensions,
                )
                current_state.set_panel_texture(request.panel_id, texture)
                current_state.in_progress = False
                current_state.generating_panel = None
                current_state.last_error = None
                save_packaging_state(current_state)
                logger.info(f"[packaging-router] Successfully generated texture for panel {request.panel_id}")
            else:
                error_msg = "Texture generation returned no image - Gemini API may have failed or returned empty result"
                current_state.mark_error(error_msg)
                save_packaging_state(current_state)
                logger.error(f"[packaging-router] Texture generation returned no image for panel {request.panel_id}")
        except Exception as e:
            # Get fresh state for error handling
            current_state = get_packaging_state()
            error_message = f"{type(e).__name__}: {str(e)}"
            current_state.mark_error(error_message)
            save_packaging_state(current_state)
            logger.error(f"[packaging-router] Error generating texture for panel {request.panel_id}: {error_message}", exc_info=True)
    
    task = asyncio.create_task(_generate())
    _track_background_task(task)
    
    return {
        "status": "generating",
        "panel_id": request.panel_id,
        "message": f"Generating texture for {request.panel_id} panel",
    }


@router.get("/state")
async def get_packaging_state_endpoint():
    """Get the current packaging state."""
    state = get_packaging_state()
    return state.as_json()


@router.get("/panels/{panel_id}/texture")
async def get_panel_texture(panel_id: str):
    """Get the texture for a specific panel."""
    state = get_packaging_state()
    texture = state.get_panel_texture(panel_id)
    
    if not texture:
        # Check if generation is in progress for this panel
        if state.in_progress and state.generating_panel == panel_id:
            # Generation in progress - return 202 Accepted instead of 404
            raise HTTPException(status_code=202, detail=f"Texture generation in progress for panel {panel_id}")
        # No texture and not generating - return 404
        raise HTTPException(status_code=404, detail=f"No texture found for panel {panel_id}")
    
    return {
        "panel_id": panel_id,
        "texture_url": texture.texture_url,
        "prompt": texture.prompt,
        "generated_at": texture.generated_at.isoformat(),
        "dimensions": texture.dimensions,
    }


@router.delete("/panels/{panel_id}/texture")
async def delete_panel_texture(panel_id: str):
    """Remove texture from a panel."""
    state = get_packaging_state()
    if panel_id in state.panel_textures:
        del state.panel_textures[panel_id]
        save_packaging_state(state)
    return {"status": "deleted", "panel_id": panel_id}

