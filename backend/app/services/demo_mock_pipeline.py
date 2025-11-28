"""Mock pipeline for demo mode - simulates generation with hardcoded timing."""

import asyncio
import json
import logging
import time
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings
from app.models.product_state import (
    ProductState,
    ProductStatus,
    ProductIteration,
    TrellisArtifacts,
    get_product_state,
    save_product_state,
    save_product_status,
)

logger = logging.getLogger(__name__)

FIXTURES_PATH = Path(__file__).parents[2] / "demo_fixtures.json"

TRELLIS_MOCK_PROGRESS = [
    ("Sampling: 21%|██▏       | 3/14", 55),
    ("Sampling: 43%|████▎     | 6/14", 65),
    ("Sampling: 64%|██████▍   | 9/14", 75),
    ("Sampling: 86%|████████▌ | 12/14", 85),
    ("Sampling: 100%|██████████| 14/14", 92),
]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _load_fixtures() -> dict:
    """Load demo fixtures from file."""
    if not FIXTURES_PATH.exists():
        logger.error(f"[demo-mock] Fixtures file not found: {FIXTURES_PATH}")
        return {}
    try:
        return json.loads(FIXTURES_PATH.read_text())
    except json.JSONDecodeError as e:
        logger.error(f"[demo-mock] Invalid fixtures JSON: {e}")
        return {}


class DemoMockPipelineService:
    """Mock pipeline that simulates product generation for demos."""
    
    async def run_mock_create(self, prompt: str, image_count: int = 3) -> None:  # noqa: ARG002
        """
        Simulate the create flow with fake loading states.
        
        This updates status in real-time to simulate the actual pipeline,
        then loads the pre-seeded "product_create" data from fixtures.
        """
        logger.info(f"[demo-mock] 🎭 Starting MOCK create flow")
        logger.info(f"[demo-mock] Prompt: {prompt}")
        
        fixtures = _load_fixtures()
        create_data = fixtures.get("product_create", {})
        
        if not create_data.get("model_url") or create_data["model_url"].startswith("PASTE"):
            logger.error("[demo-mock] No valid product_create data in fixtures!")
            self._update_status("error", 0, "Demo fixtures not configured")
            return
        
        total_delay = settings.DEMO_CREATE_DELAY
        
        # Get current state
        state = get_product_state()
        state.prompt = prompt
        state.mode = "create"
        state.status = "generating_images"
        state.message = "Generating product images..."
        state.in_progress = True
        state.generation_started_at = _utcnow()
        state.last_error = None
        save_product_state(state)
        
        # Phase 1: Generating images (40% of time)
        self._update_status("generating_images", 10, "Generating product images with AI...")
        await asyncio.sleep(total_delay * 0.2)
        
        self._update_status("generating_images", 25, "Creating multiple views...")
        await asyncio.sleep(total_delay * 0.2)
        
        # Phase 2: Generating 3D model (50% of time)
        self._update_status("generating_model", 45, "Generating 3D model with Trellis...")
        await asyncio.sleep(total_delay * 0.2)
        
        self._update_status("generating_model", 65, "Processing geometry and textures...")
        await asyncio.sleep(total_delay * 0.2)
        
        self._update_status("generating_model", 85, "Finalizing 3D asset...")
        await asyncio.sleep(total_delay * 0.2)
        
        # Complete - load fixture data
        iteration = ProductIteration(
            id=f"demo_create_{int(time.time())}",
            type="create",
            prompt=prompt,
            images=create_data.get("preview_images", []),
            trellis_output=TrellisArtifacts(
                model_file=create_data["model_url"],
                no_background_images=create_data.get("no_background_images", []),
            ),
            created_at=_utcnow(),
            duration_seconds=total_delay,
            note="Demo mock generation",
        )
        
        state = get_product_state()
        state.mode = "idle"
        state.status = "complete"
        state.message = "3D asset generated"
        state.in_progress = False
        state.generation_started_at = None
        state.images = create_data.get("preview_images", [])
        state.trellis_output = iteration.trellis_output
        state.iterations.append(iteration)
        save_product_state(state)
        
        self._update_status(
            "complete", 100, "3D asset generated",
            model_file=create_data["model_url"],
            preview_image=create_data.get("preview_images", [None])[0]
        )
        
        logger.info("[demo-mock] ✅ Mock create complete!")
    
    async def run_mock_edit(self, prompt: str) -> None:
        """
        Simulate the edit flow with fake loading states.
        
        This updates status in real-time to simulate the actual pipeline,
        then loads the pre-seeded "product_edit" data from fixtures.
        """
        logger.info(f"[demo-mock] 🎭 Starting MOCK edit flow")
        logger.info(f"[demo-mock] Edit prompt: {prompt}")
        
        fixtures = _load_fixtures()
        edit_data = fixtures.get("product_edit", {})
        
        if not edit_data.get("model_url") or edit_data["model_url"].startswith("PASTE"):
            logger.error("[demo-mock] No valid product_edit data in fixtures!")
            self._update_status("error", 0, "Demo edit fixtures not configured")
            return
        
        configured_delay = getattr(settings, "DEMO_EDIT_DELAY", 3.0)
        if not configured_delay:
            configured_delay = 3.0
        total_delay = min(configured_delay, 3.0)
        
        # Get current state
        state = get_product_state()
        state.latest_instruction = prompt
        state.mode = "edit"
        state.status = "generating_images"
        state.message = "Analyzing edit request..."
        state.in_progress = True
        state.generation_started_at = _utcnow()
        state.last_error = None
        save_product_state(state)
        
        # Phase 1: Analyzing and generating edited images (40% of time)
        self._update_status("generating_images", 15, "Analyzing edit request...")
        await asyncio.sleep(total_delay * 0.15)
        
        self._update_status("generating_images", 30, "Generating edited product images...")
        await asyncio.sleep(total_delay * 0.25)
        
        # Phase 2: Generating edited 3D model (remaining time)
        trellis_duration = max(total_delay - (total_delay * 0.4), 0.3)
        per_step_delay = trellis_duration / len(TRELLIS_MOCK_PROGRESS)
        for message, progress in TRELLIS_MOCK_PROGRESS:
            self._update_status("generating_model", progress, message)
            await asyncio.sleep(per_step_delay)
        
        # Complete - load fixture data
        iteration = ProductIteration(
            id=f"demo_edit_{int(time.time())}",
            type="edit",
            prompt=prompt,
            images=edit_data.get("preview_images", []),
            trellis_output=TrellisArtifacts(
                model_file=edit_data["model_url"],
                no_background_images=edit_data.get("no_background_images", []),
            ),
            created_at=_utcnow(),
            duration_seconds=total_delay,
            note="Demo mock edit",
        )
        
        state = get_product_state()
        state.latest_instruction = prompt
        state.mode = "idle"
        state.status = "complete"
        state.message = "Edit complete"
        state.in_progress = False
        state.generation_started_at = None
        state.images = edit_data.get("preview_images", [])
        state.trellis_output = iteration.trellis_output
        state.iterations.append(iteration)
        save_product_state(state)
        
        self._update_status(
            "complete", 100, "Edit complete",
            model_file=edit_data["model_url"],
            preview_image=edit_data.get("preview_images", [None])[0]
        )
        
        logger.info("[demo-mock] ✅ Mock edit complete!")
    
    def _update_status(
        self,
        status: str,
        progress: int,
        message: str,
        model_file: Optional[str] = None,
        preview_image: Optional[str] = None,
    ) -> None:
        """Update the product status for frontend polling."""
        status_obj = ProductStatus(
            status=status,
            progress=progress,
            message=message,
            model_file=model_file,
            preview_image=preview_image,
        )
        save_product_status(status_obj)
        logger.info(f"[demo-mock] Status: {status} ({progress}%) - {message}")


demo_mock_pipeline = DemoMockPipelineService()

