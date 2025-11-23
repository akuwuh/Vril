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
    clear_packaging_state,
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
    reference_mockup: Optional[str] = Field(None, description="Optional base64-encoded reference mockup image for style matching")


class BulkPanelGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000, description="Design prompt for all panels")
    package_type: str = Field(..., description="Package type: 'box' or 'cylinder'")
    package_dimensions: dict = Field(..., description="Full package dimensions: {width, height, depth} in mm")
    panel_ids: list[str] = Field(..., description="List of panel IDs to generate")
    panels_info: dict = Field(..., description="Map of panel_id to panel dimensions {panel_id: {width, height}}")
    reference_mockup: Optional[str] = Field(None, description="Optional base64-encoded reference mockup image for style matching")


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
    
    # Detect create vs edit workflow
    existing_texture = state.get_panel_texture(request.panel_id)
    workflow = "edit" if existing_texture else "create"
    old_texture_url = existing_texture.texture_url if existing_texture else None
    
    # Update state with current package info
    state.package_type = request.package_type
    state.package_dimensions = request.package_dimensions
    state.in_progress = True
    state.generating_panel = request.panel_id
    state.last_error = None
    save_packaging_state(state)
    
    logger.info(f"[packaging-router] Starting {workflow} for panel {request.panel_id}")
    
    # Run generation in background
    async def _generate():
        try:
            texture_url = await panel_generation_service.generate_panel_texture(
                panel_id=request.panel_id,
                prompt=request.prompt,
                package_type=request.package_type,
                panel_dimensions=request.panel_dimensions,
                package_dimensions=request.package_dimensions,
                reference_mockup=request.reference_mockup,
                workflow=workflow,
                old_texture_url=old_texture_url,
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


@router.post("/panels/generate-all")
async def generate_all_panels(request: BulkPanelGenerateRequest):
    """Generate textures for all panels at once."""
    logger.info(f"[packaging-router] Received bulk generation request for {len(request.panel_ids)} panels")
    logger.info(f"[packaging-router] Panels: {request.panel_ids}")
    logger.info(f"[packaging-router] Prompt: '{request.prompt[:50]}...'")
    
    state = get_packaging_state()
    
    # DON'T clear old textures - keep them visible during generation
    # New textures will atomically replace old ones when all panels complete
    # This allows reload during generation to still show previous textures
    
    # Update state for bulk generation
    state.package_type = request.package_type
    state.package_dimensions = request.package_dimensions
    state.bulk_generation_in_progress = True
    state.generating_panels = request.panel_ids.copy()
    state.last_error = None
    save_packaging_state(state)
    
    logger.info(f"[packaging-router] Starting bulk texture generation for {len(request.panel_ids)} panels")
    
    # Run generation in background with two-phase approach
    async def _generate_all():
        generated_textures = {}
        failed_panels = []
        
        # Determine workflow (create vs edit)
        has_existing = any(state.get_panel_texture(pid) for pid in request.panel_ids)
        workflow = "edit" if has_existing else "create"
        
        # PHASE 1: Generate 3D mockup of the entire box as master reference
        logger.info(f"[packaging-router] PHASE 1: Generating 3D mockup reference ({workflow})")
        
        try:
            from app.integrations.gemini import gemini_image_service
            
            # Build 3D mockup prompt (different for create vs edit)
            reference_for_mockup = None
            
            if workflow == "edit":
                # EDIT FLOW: Modify existing design
                # Use first existing texture as reference
                for pid in request.panel_ids:
                    existing = state.get_panel_texture(pid)
                    if existing:
                        reference_for_mockup = existing.texture_url
                        break
                
                box_prompt = f"""Modify the package design shown in the reference image.

MODIFICATIONS REQUESTED:
{request.prompt}

CRITICAL DESIGN REQUIREMENTS:
- Maintain full-bleed coverage on all visible faces (no white borders)
- The design MUST extend completely to all edges
- Graphics and patterns should reach the very edges of each panel

OUTPUT REQUIREMENTS:
- Generate a 3D product photograph showing the modified design
- Show from a 3/4 angle view with multiple visible faces
- Apply the requested changes while maintaining edge-to-edge coverage
- Professional product photography style with good lighting
- Dimensions: {request.package_dimensions.get('width', 100)}mm × {request.package_dimensions.get('height', 150)}mm × {request.package_dimensions.get('depth', 100)}mm

Generate the modified 3D mockup with complete edge-to-edge design coverage."""
            
            else:
                # CREATE FLOW: New design from scratch
                if request.reference_mockup:
                    reference_for_mockup = request.reference_mockup
                
                box_prompt = f"""Generate a realistic 3D product photograph of a {request.package_type} package.

DESIGN BRIEF:
{request.prompt}

SPECIFICATIONS:
- Package type: {request.package_type}
- Dimensions: {request.package_dimensions.get('width', 100)}mm × {request.package_dimensions.get('height', 150)}mm × {request.package_dimensions.get('depth', 100)}mm

CRITICAL DESIGN REQUIREMENTS:
- The design MUST cover ALL visible faces completely from edge to edge
- NO white borders or margins on the package faces
- Graphics and patterns should extend to the very edges of each panel
- Full-bleed coverage on all sides (top, front, back, left, right)

OUTPUT REQUIREMENTS:
- Show from a 3/4 angle view with multiple visible faces
- Display the complete design concept with edge-to-edge coverage
- Professional product photography style
- Good lighting and shadows
- Clear, sharp, high-quality rendering

Generate a complete 3D mockup with full-coverage design on all faces."""
            
            # Generate 3D mockup
            mockup_images = await gemini_image_service.generate_product_images(
                prompt=box_prompt,
                workflow=workflow,
                image_count=1,
                reference_images=[reference_for_mockup] if reference_for_mockup else None,
                is_texture=False,  # This is a 3D product photo, not a flat texture
            )
            
            if not mockup_images or len(mockup_images) == 0:
                logger.error("[packaging-router] Failed to generate 3D mockup")
                # Fallback: use reference_mockup if available
                master_mockup_url = request.reference_mockup
            else:
                master_mockup_url = mockup_images[0]
                logger.info(f"[packaging-router] ✅ 3D mockup generated successfully")
                
        except Exception as e:
            logger.error(f"[packaging-router] Error generating 3D mockup: {e}", exc_info=True)
            master_mockup_url = request.reference_mockup  # Fallback
        
        # PHASE 2: Parallelize all panels using 3D mockup as reference
        logger.info(f"[packaging-router] PHASE 2: Generating {len(request.panel_ids)} panels in parallel")
        
        # Create parallel tasks for ALL panels
        async def generate_panel(panel_id: str):
            try:
                current_state = get_packaging_state()
                current_state.generating_panel = panel_id
                save_packaging_state(current_state)
                
                panel_dims = request.panels_info.get(panel_id, {})
                texture_url = await panel_generation_service.generate_panel_texture(
                    panel_id=panel_id,
                    prompt=request.prompt,
                    package_type=request.package_type,
                    panel_dimensions=panel_dims,
                    package_dimensions=request.package_dimensions,
                    reference_mockup=master_mockup_url,  # Use 3D mockup as reference for all
                    workflow=workflow,
                    old_texture_url=None,  # 3D mockup is the reference now
                )
                
                if texture_url:
                    # Remove from generating list
                    current_state = get_packaging_state()
                    if panel_id in current_state.generating_panels:
                        current_state.generating_panels.remove(panel_id)
                        save_packaging_state(current_state)
                    return (panel_id, texture_url, panel_dims)
                else:
                    return (panel_id, None, panel_dims)
            except Exception as e:
                logger.error(f"[packaging-router] Error generating panel {panel_id}: {e}")
                return (panel_id, None, None)
        
        # Run ALL panels in parallel
        results = await asyncio.gather(*[generate_panel(pid) for pid in request.panel_ids], return_exceptions=True)
        
        # Process results
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"[packaging-router] Task exception: {result}")
                continue
            
            panel_id, texture_url, panel_dims = result
            if texture_url:
                generated_textures[panel_id] = PanelTexture(
                    panel_id=panel_id,
                    texture_url=texture_url,
                    prompt=request.prompt,
                    dimensions=panel_dims,
                )
            else:
                failed_panels.append(panel_id)
        
        logger.info(f"[packaging-router] ✅ Parallel generation complete: {len(generated_textures)}/{len(request.panel_ids)} succeeded")
        
        # ATOMIC UPDATE: Save all textures at once
        final_state = get_packaging_state()
        if generated_textures:
            final_state.atomic_update_textures(generated_textures, replace=False)
        
        final_state.bulk_generation_in_progress = False
        final_state.generating_panel = None
        final_state.generating_panels = []
        
        if failed_panels:
            succeeded_count = len(generated_textures)
            total_count = len(request.panel_ids)
            error_msg = f"Generated {succeeded_count}/{total_count} textures. Failed: {', '.join(failed_panels)} (old textures retained)"
            final_state.last_error = error_msg
            logger.error(f"[packaging-router] Bulk generation completed with errors: {error_msg}")
        else:
            final_state.last_error = None
            logger.info(f"[packaging-router] Bulk generation completed successfully for all {len(request.panel_ids)} panels")
        
        save_packaging_state(final_state)
    
    task = asyncio.create_task(_generate_all())
    _track_background_task(task)
    
    return {
        "status": "generating",
        "panel_ids": request.panel_ids,
        "message": f"Generating textures for {len(request.panel_ids)} panels",
        "total_panels": len(request.panel_ids),
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


class UpdateDimensionsRequest(BaseModel):
    """Request model for updating package dimensions."""
    package_type: str = Field(..., description="Package type: 'box' or 'cylinder'")
    dimensions: dict = Field(..., description="Dimensions dict with width, height, depth")


@router.post("/update-dimensions")
async def update_dimensions(request: UpdateDimensionsRequest):
    """Update package dimensions and type."""
    logger.info(f"[packaging-router] Received update: type={request.package_type}, dims={request.dimensions}")
    
    state = get_packaging_state()
    state.package_type = request.package_type
    state.package_dimensions = request.dimensions
    save_packaging_state(state)
    
    logger.info(f"[packaging-router] ✅ Updated and saved to Redis")
    return {"status": "updated", "package_type": request.package_type, "dimensions": request.dimensions}


@router.get("/status")
async def get_packaging_status():
    """Get the current packaging generation status for polling."""
    state = get_packaging_state()
    return {
        "in_progress": state.in_progress or state.bulk_generation_in_progress,
        "generating_panel": state.generating_panel,
        "generating_panels": state.generating_panels,
        "last_error": state.last_error,
        "updated_at": state.updated_at.isoformat(),
    }


@router.post("/reset-current-shape")
async def reset_current_shape():
    """Reset the current active shape to default dimensions and clear its textures."""
    logger.info("[packaging-router] Resetting current shape to defaults")
    
    state = get_packaging_state()
    current_type = state.current_package_type
    
    # Reset current shape's state to defaults
    if current_type == "box":
        state.box_state.dimensions = {"width": 100.0, "height": 150.0, "depth": 100.0}
        state.box_state.panel_textures = {}
    else:  # cylinder
        state.cylinder_state.dimensions = {"width": 80.0, "height": 150.0, "depth": 80.0}
        state.cylinder_state.panel_textures = {}
    
    save_packaging_state(state)
    
    logger.info(f"[packaging-router] Reset {current_type} to defaults")
    return {
        "message": f"Reset {current_type} to default state",
        "package_type": current_type,
        "dimensions": state.box_state.dimensions if current_type == "box" else state.cylinder_state.dimensions,
    }


@router.post("/clear")
async def clear_state():
    """Reset packaging state to defaults."""
    state = clear_packaging_state()
    logger.info("[packaging-router] Cleared packaging state")
    return state.as_json()

