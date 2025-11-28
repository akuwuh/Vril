from __future__ import annotations

import asyncio
import base64
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Make trellis optional - only needed for product generation
try:
    from app.integrations.trellis import trellis_service
    TRELLIS_AVAILABLE = True
except ImportError:
    trellis_service = None
    TRELLIS_AVAILABLE = False
from app.integrations.gemini import gemini_image_service
from app.models.product_state import (
    ProductIteration,
    ProductState,
    ProductStatus,
    TrellisArtifacts,
    get_product_state,
    get_product_status,
    save_product_state,
    save_product_status,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

# Create artifacts directory for debug outputs
ARTIFACTS_DIR = Path(__file__).parent.parent.parent / "tests" / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


class ProductPipelineService:
    """Runs the create/edit pipeline for the single in-memory product session."""

    def __init__(self) -> None:
        self._default_image_count = 1
        # Model selection delegated to GeminiImageService based on workflow

    async def run_create(self, prompt: str, image_count: Optional[int] = None) -> None:
        """Execute the create pipeline end-to-end."""
        logger.info("[product-pipeline] Starting create flow")
        state = get_product_state()
        state.prompt = prompt
        state.mode = "create"
        state.image_count = image_count or state.image_count or self._default_image_count
        await self._execute_flow(state, prompt, mode="create")

    async def run_edit(self, instruction: str) -> None:
        """Execute the edit pipeline (assumes base assets exist)."""
        logger.info("[product-pipeline] Starting edit flow")
        state = get_product_state()
        if not state.prompt:
            raise RuntimeError("Cannot edit before creating an initial product")
        state.mode = "edit"
        state.latest_instruction = instruction
        await self._execute_flow(state, instruction, mode="edit")

    async def run_trellis_only(
        self,
        prompt: str,
        images: List[str],
        mode: str = "create",
    ) -> None:
        """
        Run ONLY the Trellis 3D generation with pre-provided images.
        
        Use this when you've pre-generated images externally (e.g., AI Studio)
        and just want to convert them to 3D models.
        
        Args:
            prompt: Description of the product (for state tracking)
            images: List of image URLs or base64 data URLs
            mode: "create" or "edit" - affects state tracking
        """
        logger.info(f"[product-pipeline] Starting Trellis-only flow with {len(images)} pre-generated images")
        flow_started_at = time.perf_counter()
        
        state = get_product_state()
        
        try:
            # Set up state
            if mode == "create":
                state.prompt = prompt
                state.iterations = []
            else:
                state.latest_instruction = prompt
            
            state.mode = mode
            state.in_progress = True
            state.images = images  # Use pre-provided images
            state.mark_progress("generating_model", "Generating 3D model with Trellis (using pre-generated images)")
            save_product_state(state)
            
            self._update_status(
                ProductStatus(
                    status="generating_model",
                    progress=30,
                    message="Generating 3D model with Trellis...",
                )
            )
            
            # Save pre-generated images to artifacts if enabled
            if settings.SAVE_ARTIFACTS_LOCALLY:
                self._save_gemini_images(images, f"{mode}_pregenerated")
            
            # Run Trellis
            trellis_output = await self._generate_trellis_model(images)
            artifacts = TrellisArtifacts.model_validate(trellis_output)
            
            duration_seconds = round(time.perf_counter() - flow_started_at, 2)
            iteration_id = f"iter_{int(time.time() * 1000)}"
            iteration = ProductIteration(
                id=iteration_id,
                type=mode,
                prompt=prompt,
                images=images,
                trellis_output=artifacts,
                duration_seconds=duration_seconds,
                note="Trellis-only (pre-generated images)",
            )
            
            state.trellis_output = artifacts
            state.iterations.append(iteration)
            state.mark_complete("3D asset generated from pre-generated images")
            save_product_state(state)
            
            # Save artifacts
            if settings.SAVE_ARTIFACTS_LOCALLY:
                self._save_trellis_model(artifacts, mode)
                self._save_product_state(state, mode)
            
            preview = self._determine_preview_image(state)
            self._update_status(
                ProductStatus(
                    status="complete",
                    progress=100,
                    message="3D asset generated",
                    model_file=artifacts.model_file,
                    preview_image=preview,
                )
            )
            
            logger.info(f"[product-pipeline] Trellis-only flow complete in {duration_seconds}s")
            
        except Exception as exc:
            logger.exception("Trellis-only pipeline failed: %s", exc)
            state.mark_error(str(exc))
            save_product_state(state)
            self._update_status(
                ProductStatus(
                    status="error",
                    progress=0,
                    message=str(exc),
                    error=str(exc),
                )
            )

    async def _execute_flow(self, state: ProductState, instruction: str, mode: str) -> None:
        flow_started_at = time.perf_counter()
        try:
            state.in_progress = True
            state.mark_progress("generating_images", "Generating concept images")
            save_product_state(state)
            self._update_status(
                ProductStatus(
                    status="generating_images",
                    progress=10,
                    message="Generating concept images",
                )
            )

            reference_images = state.images if mode == "edit" else None
            images = await gemini_image_service.generate_product_images(
                prompt=instruction,
                workflow=mode,  # "create" or "edit" - determines model selection
                image_count=state.image_count or self._default_image_count,
                reference_images=reference_images,
                base_description=state.prompt,
            )
            if not images:
                raise RuntimeError("Gemini image pipeline returned no images")
            state.images = images
            save_product_state(state)
            
            # Save Gemini images to artifacts for inspection (test mode only)
            if settings.SAVE_ARTIFACTS_LOCALLY:
                self._save_gemini_images(images, mode)

            state.mark_progress("generating_model", "Generating 3D model with Trellis")
            save_product_state(state)
            self._update_status(
                ProductStatus(
                    status="generating_model",
                    progress=45,
                    message="Generating 3D model with Trellis",
                )
            )

            trellis_output = await self._generate_trellis_model(images)
            artifacts = TrellisArtifacts.model_validate(trellis_output)
            duration_seconds = round(time.perf_counter() - flow_started_at, 2)
            iteration_id = f"iter_{int(time.time() * 1000)}"
            iteration = ProductIteration(
                id=iteration_id,
                type=mode,
                prompt=instruction,
                images=images,
                trellis_output=artifacts,
                duration_seconds=duration_seconds,
            )
            state.trellis_output = artifacts
            state.iterations.append(iteration)
            state.mark_complete("3D asset generated")
            save_product_state(state)
            
            # Save Trellis artifacts and state to filesystem (test/demo mode only)
            if settings.SAVE_ARTIFACTS_LOCALLY:
                self._save_trellis_model(artifacts, mode)
                self._save_product_state(state, mode)

            preview = self._determine_preview_image(state)
            self._update_status(
                ProductStatus(
                    status="complete",
                    progress=100,
                    message="3D asset generated",
                    model_file=artifacts.model_file,
                    preview_image=preview,
                )
            )
            logger.info("[product-pipeline] %s flow complete", mode)
        except Exception as exc:
            logger.exception("Product pipeline failed: %s", exc)
            state.mark_error(str(exc))
            save_product_state(state)
            self._update_status(
                ProductStatus(
                    status="error",
                    progress=0,
                    message="Pipeline failed",
                    error=str(exc),
                )
            )

    async def _generate_trellis_model(
        self,
        images: List[str],
        multi_image: Optional[bool] = None,
        multi_image_algo: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Call Trellis via the existing integration in a background thread."""
        if not TRELLIS_AVAILABLE or not trellis_service:
            raise RuntimeError("Trellis service is not available. Please install fal_client dependency.")
        
        def progress_callback(status: str, progress: int, message: str):
            """Update ProductStatus with Trellis progress in real-time."""
            self._update_status(
                ProductStatus(
                    status=status,
                    progress=progress,
                    message=message
                )
            )
        
        use_multi = (
            multi_image
            if multi_image is not None
            else (settings.TRELLIS_ENABLE_MULTI_IMAGE and len(images) > 1)
        )
        algo = multi_image_algo or settings.TRELLIS_MULTIIMAGE_ALGO

        return await asyncio.to_thread(
            trellis_service.generate_3d_asset,
            images=images,
            progress_callback=progress_callback,
            use_multi_image=use_multi,
            multiimage_algo=algo,
        )

    def _determine_preview_image(self, state: ProductState) -> Optional[str]:
        if state.trellis_output and state.trellis_output.no_background_images:
            return state.trellis_output.no_background_images[0]
        if state.images:
            return state.images[0]
        return None

    def _update_status(self, status: ProductStatus) -> None:
        """Persist the lightweight status payload."""
        payload = get_product_status()
        payload.status = status.status
        payload.progress = status.progress
        payload.message = status.message
        payload.error = status.error
        payload.model_file = status.model_file or payload.model_file
        payload.preview_image = status.preview_image or payload.preview_image
        payload.updated_at = status.updated_at
        save_product_status(payload)

    def _save_gemini_images(self, images: List[str], mode: str) -> None:
        """Save Gemini-generated images to filesystem for test inspection.
        
        Note: In normal operation, images are already stored in Redis as base64
        data URLs in ProductState.images. This method is for debugging only.
        """
        try:
            run_dir = ARTIFACTS_DIR / f"gemini_{mode}_{int(time.time())}"
            run_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"[product-pipeline] Saving {len(images)} Gemini images to {run_dir}")
            
            for idx, img in enumerate(images, start=1):
                logger.info(f"[product-pipeline] Processing image {idx}, type: {type(img)}, starts with data:image: {isinstance(img, str) and img.startswith('data:image')}")
                if isinstance(img, str) and img.startswith("data:image"):
                    try:
                        header, b64_data = img.split(",", 1)
                        mime = header.split(";")[0].split(":")[1] if ":" in header else "image/png"
                        extension = mime.split("/")[-1] if "/" in mime else "png"
                        dest = run_dir / f"gemini_view_{idx}.{extension}"
                        dest.write_bytes(base64.b64decode(b64_data))
                        logger.info(f"[product-pipeline] ✓ Saved Gemini image {idx} to {dest}")
                    except Exception as exc:
                        logger.warning(f"[product-pipeline] Failed to save Gemini image {idx}: {exc}")
                else:
                    logger.warning(f"[product-pipeline] Skipping image {idx} - not a data URL (preview: {str(img)[:100]})")
        except Exception as exc:
            logger.warning(f"[product-pipeline] Failed to create artifacts dir: {exc}")

    def _save_trellis_model(self, artifacts: TrellisArtifacts, mode: str) -> None:
        """Download and save Trellis artifacts to filesystem for test/demo inspection.
        
        Note: In normal operation, Trellis URLs are already stored in Redis via
        ProductState.trellis_output. This method downloads and saves for debugging/demo.
        """
        try:
            if not artifacts.model_file:
                logger.warning("[product-pipeline] No model_file to save")
                return
            
            run_dir = ARTIFACTS_DIR / f"trellis_{mode}_{int(time.time())}"
            run_dir.mkdir(parents=True, exist_ok=True)
            
            import urllib.request
            from urllib.error import URLError
            
            # Download GLB model
            glb_path = run_dir / "model.glb"
            logger.info("[product-pipeline] Downloading GLB from %s...", artifacts.model_file[:80])
            with urllib.request.urlopen(artifacts.model_file) as response:
                glb_path.write_bytes(response.read())
            logger.info("[product-pipeline] ✓ Saved GLB model to %s (%.1f KB)", glb_path, glb_path.stat().st_size / 1024)
            
            # Download videos if available
            video_assets = [
                ("color_video", "trellis_color.mp4"),
                ("normal_video", "trellis_normal.mp4"),
                ("combined_video", "trellis_combined.mp4"),
            ]
            for attr_name, filename in video_assets:
                url = getattr(artifacts, attr_name, None)
                if url:
                    try:
                        video_path = run_dir / filename
                        logger.info(f"[product-pipeline] Downloading {attr_name}...")
                        with urllib.request.urlopen(url) as response:
                            video_path.write_bytes(response.read())
                        logger.info(f"[product-pipeline] ✓ Saved {filename} (%.1f KB)", video_path.stat().st_size / 1024)
                    except URLError as exc:
                        logger.warning(f"[product-pipeline] Failed to download {attr_name}: {exc}")
            
            # Download no-background images if available
            if artifacts.no_background_images:
                no_bg_dir = run_dir / "no_background"
                no_bg_dir.mkdir(exist_ok=True)
                for idx, img_url in enumerate(artifacts.no_background_images, start=1):
                    try:
                        img_path = no_bg_dir / f"no_bg_{idx}.png"
                        logger.info(f"[product-pipeline] Downloading no-bg image {idx}...")
                        with urllib.request.urlopen(img_url) as response:
                            img_path.write_bytes(response.read())
                        logger.info(f"[product-pipeline] ✓ Saved no_bg_{idx}.png (%.1f KB)", img_path.stat().st_size / 1024)
                    except URLError as exc:
                        logger.warning(f"[product-pipeline] Failed to download no-bg image {idx}: {exc}")
                
        except Exception as exc:
            logger.warning(f"[product-pipeline] Failed to save Trellis artifacts: {exc}")

    def _save_product_state(self, state: ProductState, mode: str) -> None:
        """Save the full product state as JSON for test/demo inspection.
        
        This creates a comprehensive snapshot of the entire generation session
        including all iterations, prompts, and artifact URLs.
        """
        try:
            import json
            
            # Find the most recent Trellis artifact directory
            trellis_dirs = sorted(ARTIFACTS_DIR.glob(f"trellis_{mode}_*"), key=lambda p: p.name)
            if not trellis_dirs:
                logger.warning("[product-pipeline] No Trellis artifact directory found for state save")
                return
            
            run_dir = trellis_dirs[-1]  # Most recent
            state_path = run_dir / "state.json"
            
            # Convert state to JSON-serializable dict
            state_dict = state.as_json()
            
            state_path.write_text(json.dumps(state_dict, indent=2))
            logger.info(f"[product-pipeline] ✓ Saved product state to {state_path}")
            
        except Exception as exc:
            logger.warning(f"[product-pipeline] Failed to save product state: {exc}")


product_pipeline_service = ProductPipelineService()


