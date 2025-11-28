"""Demo seeding endpoints for pre-loading product and packaging state."""

import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.product_state import (
    ProductState,
    ProductStatus,
    ProductIteration,
    TrellisArtifacts,
    save_product_state,
    save_product_status,
    clear_product_state,
)
from app.models.packaging_state import (
    PackagingState,
    PanelTexture,
    save_packaging_state,
    clear_packaging_state,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/demo", tags=["demo"])

FIXTURES_PATH = Path(__file__).parents[3] / "demo_fixtures.json"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SeedProductRequest(BaseModel):
    """Request to seed product state with pre-generated data."""
    prompt: str = "Demo Product"
    model_url: str
    preview_images: list[str] = []
    no_background_images: list[str] = []


class SeedPackagingRequest(BaseModel):
    """Request to seed packaging state with pre-generated textures."""
    package_type: str = "box"
    dimensions: dict = {"width": 100.0, "height": 150.0, "depth": 100.0}
    panel_textures: dict[str, dict] = {}  # panel_id -> {texture_url, prompt}


@router.post("/seed-product")
async def seed_product(request: SeedProductRequest):
    """
    Seed product state with a pre-generated model.
    
    Use this to pre-load a product for demos so you don't have to wait
    for generation during the presentation.
    """
    logger.info(f"[demo] Seeding product with model: {request.model_url[:50]}...")
    
    # Clear existing state
    clear_product_state()
    
    # Create pre-loaded state
    iteration = ProductIteration(
        id=f"demo_{int(_utcnow().timestamp())}",
        type="create",
        prompt=request.prompt,
        images=request.preview_images,
        trellis_output=TrellisArtifacts(
            model_file=request.model_url,
            no_background_images=request.no_background_images,
        ),
        created_at=_utcnow(),
        note="Pre-loaded for demo",
    )
    
    state = ProductState(
        prompt=request.prompt,
        mode="idle",
        status="complete",
        message="Demo product loaded",
        in_progress=False,
        images=request.preview_images,
        trellis_output=iteration.trellis_output,
        iterations=[iteration],
    )
    
    save_product_state(state)
    
    # Update status for frontend polling
    status = ProductStatus(
        status="complete",
        progress=100,
        message="Demo product ready",
        model_file=request.model_url,
        preview_image=request.preview_images[0] if request.preview_images else None,
    )
    save_product_status(status)
    
    logger.info("[demo] ✅ Product state seeded successfully")
    return {
        "message": "Product seeded for demo",
        "prompt": request.prompt,
        "model_url": request.model_url,
    }


@router.post("/seed-packaging")
async def seed_packaging(request: SeedPackagingRequest):
    """
    Seed packaging state with pre-generated panel textures.
    
    Use this to pre-load packaging textures for demos so the 3D box
    already has designs when you show it.
    """
    logger.info(f"[demo] Seeding packaging with {len(request.panel_textures)} textures...")
    
    # Clear existing state
    clear_packaging_state()
    
    # Create pre-loaded state
    state = PackagingState(
        current_package_type=request.package_type,
        in_progress=False,
        bulk_generation_in_progress=False,
    )
    
    # Set dimensions
    if request.package_type == "box":
        state.box_state.dimensions = request.dimensions
    else:
        state.cylinder_state.dimensions = request.dimensions
    
    # Add panel textures
    for panel_id, texture_data in request.panel_textures.items():
        texture = PanelTexture(
            panel_id=panel_id,
            texture_url=texture_data.get("texture_url", ""),
            prompt=texture_data.get("prompt", f"Demo {panel_id} panel"),
            dimensions=request.dimensions,
        )
        state.set_panel_texture(panel_id, texture)
    
    save_packaging_state(state)
    
    logger.info("[demo] ✅ Packaging state seeded successfully")
    return {
        "message": "Packaging seeded for demo",
        "package_type": request.package_type,
        "panels_loaded": list(request.panel_textures.keys()),
    }


@router.post("/seed-from-fixtures")
async def seed_from_fixtures():
    """
    Load demo state from demo_fixtures.json file.
    
    This reads the fixtures file and seeds both product and packaging state.
    Make sure to populate demo_fixtures.json with valid URLs first!
    """
    if not FIXTURES_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Fixtures file not found: {FIXTURES_PATH}"
        )
    
    try:
        fixtures = json.loads(FIXTURES_PATH.read_text())
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid JSON in fixtures file: {e}"
        )
    
    results = {"product": None, "packaging": None}
    
    # Seed product if configured
    product_data = fixtures.get("product") or fixtures.get("product_create") or {}
    if product_data.get("model_url") and not product_data["model_url"].startswith("PASTE"):
        await seed_product(SeedProductRequest(
            prompt=product_data.get("prompt", "Demo Product"),
            model_url=product_data["model_url"],
            preview_images=product_data.get("preview_images", []),
            no_background_images=product_data.get("no_background_images", []),
        ))
        results["product"] = "Seeded"
    else:
        results["product"] = "Skipped (no valid model_url)"
    
    # Seed packaging if configured
    packaging_data = fixtures.get("packaging") or fixtures.get("packaging_fixtures") or {}
    panel_textures = packaging_data.get("panel_textures", {})
    
    # Filter out placeholder URLs
    valid_textures = {
        panel_id: data
        for panel_id, data in panel_textures.items()
        if data.get("texture_url") and not data["texture_url"].startswith("PASTE")
    }
    
    if valid_textures:
        await seed_packaging(SeedPackagingRequest(
            package_type=packaging_data.get("package_type", "box"),
            dimensions=packaging_data.get("dimensions", {"width": 100, "height": 150, "depth": 100}),
            panel_textures=valid_textures,
        ))
        results["packaging"] = f"Seeded {len(valid_textures)} panels"
    else:
        results["packaging"] = "Skipped (no valid texture URLs)"
    
    logger.info(f"[demo] Fixtures loaded: {results}")
    return {
        "message": "Demo fixtures loaded",
        "results": results,
    }


@router.post("/clear")
async def clear_demo():
    """Clear all demo state (both product and packaging)."""
    clear_product_state()
    clear_packaging_state()
    
    logger.info("[demo] ✅ All demo state cleared")
    return {"message": "Demo state cleared"}


@router.get("/export-current")
async def export_current_state():
    """
    Export current product and packaging state as fixture-ready JSON.
    
    Use this after generating a product/packaging you like, then copy
    the URLs into demo_fixtures.json for future demos.
    
    Note: For mock mode, you need BOTH product_create and product_edit.
    Generate create first, export, then edit, export again.
    """
    from app.models.product_state import get_product_state
    from app.models.packaging_state import get_packaging_state
    
    product_state = get_product_state()
    packaging_state = get_packaging_state()
    
    # Determine if this is a create or edit based on iterations
    latest_iteration = product_state.iterations[-1] if product_state.iterations else None
    iteration_type = latest_iteration.type if latest_iteration else "create"
    
    product_data = {
        "prompt": product_state.prompt if iteration_type == "create" else product_state.latest_instruction,
        "model_url": product_state.trellis_output.model_file if product_state.trellis_output else None,
        "preview_images": product_state.images[:3] if product_state.images else [],
        "no_background_images": (
            product_state.trellis_output.no_background_images[:3]
            if product_state.trellis_output and product_state.trellis_output.no_background_images
            else []
        ),
    }
    
    export = {
        "_comment": f"This is a {iteration_type.upper()} export. Copy to product_{iteration_type} in demo_fixtures.json",
        "_iteration_type": iteration_type,
        f"product_{iteration_type}": product_data,
        "packaging": {
            "package_type": packaging_state.current_package_type,
            "dimensions": packaging_state.package_dimensions,
            "panel_textures": {
                panel_id: {
                    "texture_url": texture.texture_url,
                    "prompt": texture.prompt,
                }
                for panel_id, texture in packaging_state.panel_textures.items()
            },
        },
    }
    
    return export


@router.get("/mock-status")
async def get_mock_status():
    """Check if demo mock mode is enabled and show current configuration."""
    from app.core.config import settings
    
    return {
        "demo_mock_mode": settings.DEMO_MOCK_MODE,
        "create_delay_seconds": settings.DEMO_CREATE_DELAY,
        "edit_delay_seconds": settings.DEMO_EDIT_DELAY,
        "fixtures_path": str(FIXTURES_PATH),
        "fixtures_exist": FIXTURES_PATH.exists(),
    }

