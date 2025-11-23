import fal_client
import logging
import os
import time
from typing import Optional, List
from typing_extensions import TypedDict
from app.core.config import settings

logger = logging.getLogger(__name__)

class TrellisOutput(TypedDict, total=False):
    """Output schema from Trellis model."""
    model_file: str
    color_video: str
    gaussian_ply: str
    normal_video: str
    combined_video: str
    no_background_images: List[str]

class TrellisService:
    def __init__(self):
        self.api_key = settings.FAL_KEY
        if self.api_key:
            # Set environment variable for fal_client library
            os.environ["FAL_KEY"] = self.api_key
            # Log first 10 chars for debugging (never log full API keys in production!)
            logger.info(f"fal.ai API key configured: {self.api_key[:10]}...")
        else:
            logger.warning("No fal.ai API key found in settings")
    
    def generate_3d_asset(
        self,
        images: List[str],
        seed: int = 1337,
        texture_size: int = 1536,
        mesh_simplify: float = 0.92,
        ss_sampling_steps: int = 14,
        ss_guidance_strength: float = 7.5,
        slat_sampling_steps: int = 14,
        slat_guidance_strength: float = 3.5,
        progress_callback = None,
    ) -> TrellisOutput:
        """
        Generate a 3D asset from input images using Trellis via fal.ai.
        
        Note: Only the first image is used as fal.ai's Trellis API accepts single images.
        
        Parameters optimized for quality/speed balance (slightly favor quality):
        - texture_size: 1536 (sweet spot - better than 1024, faster than 2048)
        - mesh_simplify: 0.92 (92% mesh retention for better detail)
        - ss_sampling_steps: 14 (good geometry quality, still faster than 16)
        - slat_sampling_steps: 14 (better latent detail, matches ss_steps)
        - ss_guidance_strength: 7.5 (maintain geometry fidelity)
        - slat_guidance_strength: 3.5 (enhanced detail for better textures)
        
        Balance: ~30% faster than original 2048/16 settings with visibly better quality than 1024/12.
        """
        try:
            if not images or len(images) == 0:
                raise ValueError("No images provided")
            
            # Use only the first image (fal.ai accepts single image_url)
            image_url = images[0]
            if len(images) > 1:
                logger.warning(f"Multiple images provided ({len(images)}), using only the first one")
            
            logger.info("=" * 80)
            logger.info("🎨 TRELLIS SERVICE - Submitting request to fal.ai")
            logger.info(f"  Image URL length: {len(image_url)}")
            logger.info(f"  Image URL preview: {image_url[:100]}...")
            logger.info(f"  seed: {seed}")
            logger.info(f"  texture_size: {texture_size}")
            logger.info(f"  mesh_simplify: {mesh_simplify}")
            logger.info(f"  ss_sampling_steps: {ss_sampling_steps}")
            logger.info(f"  ss_guidance_strength: {ss_guidance_strength}")
            logger.info(f"  slat_sampling_steps: {slat_sampling_steps}")
            logger.info(f"  slat_guidance_strength: {slat_guidance_strength}")
            logger.info("=" * 80)
            
            # Store callback for use in _handle_queue_update
            self._progress_callback = progress_callback
            
            # Track generation time
            start_time = time.time()
            
            # Submit request and get result using fal_client.subscribe
            # This handles submission, polling, and result retrieval automatically
            result = fal_client.subscribe(
                "fal-ai/trellis",
                arguments={
                    "image_url": image_url,
                    "seed": seed,
                    "texture_size": texture_size,
                    "mesh_simplify": mesh_simplify,
                    "ss_sampling_steps": ss_sampling_steps,
                    "ss_guidance_strength": ss_guidance_strength,
                    "slat_sampling_steps": slat_sampling_steps,
                    "slat_guidance_strength": slat_guidance_strength
                },
                with_logs=True,
                on_queue_update=lambda update: self._handle_queue_update(update)
            )
            
            # Calculate generation time
            generation_time = time.time() - start_time
            
            logger.info("=" * 80)
            logger.info("✓ Request completed successfully")
            logger.info(f"⏱️  GENERATION TIME: {generation_time:.2f} seconds ({generation_time/60:.2f} minutes)")
            logger.info("=" * 80)
            logger.info(f"Result keys: {list(result.keys()) if isinstance(result, dict) else 'not a dict'}")
            
            # Log fal.ai timings if available
            if isinstance(result, dict) and "timings" in result:
                logger.info(f"📊 Fal.ai Timings: {result['timings']}")
            
            logger.info(f"Full result: {result}")
            
            # Map fal.ai output to TrellisOutput schema
            # fal.ai returns: {"model_mesh": {"url": "...", ...}, "timings": {...}}
            output = {}
            
            if isinstance(result, dict):
                # Check for model_mesh in the result
                if "model_mesh" in result and result["model_mesh"]:
                    model_mesh = result["model_mesh"]
                    if isinstance(model_mesh, dict) and "url" in model_mesh:
                        output["model_file"] = model_mesh["url"]
                        logger.info(f"🎯 Model file URL: {output['model_file']}")
                    elif isinstance(model_mesh, str):
                        output["model_file"] = model_mesh
                        logger.info(f"🎯 Model file URL: {output['model_file']}")
            
            if not output:
                raise Exception(f"No valid output received from fal.ai. Result was: {result}")
            
            logger.info(f"✅ Successfully generated 3D asset in {generation_time:.2f}s: {output}")
            return output
            
        except Exception as e:
            logger.exception(f"Failed to generate 3D asset: {str(e)}")
            raise Exception(f"Failed to generate 3D asset: {str(e)}")
    
    def _handle_queue_update(self, update):
        """Handle queue status updates and log progress."""
        status_msg = None
        progress_val = None
        
        if hasattr(update, 'status'):
            logger.info(f"Queue status: {update.status}")
            status_msg = update.status
            
            # Map Fal.ai statuses to progress percentages
            if update.status == 'IN_QUEUE':
                progress_val = 50
            elif update.status == 'IN_PROGRESS':
                progress_val = 70
                
        if hasattr(update, 'logs') and update.logs:
            for log in update.logs:
                if hasattr(log, 'message'):
                    logger.info(f"  Progress: {log.message}")
                    status_msg = log.message
                elif isinstance(log, dict) and 'message' in log:
                    logger.info(f"  Progress: {log['message']}")
                    status_msg = log['message']
                elif isinstance(log, str):
                    logger.info(f"  Progress: {log}")
                    status_msg = log
        
        # Call the progress callback if provided
        if self._progress_callback and status_msg:
            self._progress_callback(
                status="generating_model",
                progress=progress_val or 60,
                message=f"Trellis: {status_msg}"
            )

trellis_service = TrellisService()
