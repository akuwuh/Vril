from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Literal, Optional

from app.integrations.trellis import trellis_service, TrellisOutput
from app.core.redis import redis_service
import logging
import traceback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trellis", tags=["trellis"])
STATUS_KEY = "trellis_status:current"

TRELLIS_PRESETS = {
    "balanced": {
        "texture_size": 1024,
        "mesh_simplify": 0.92,
        "ss_sampling_steps": 14,
        "ss_guidance_strength": 7.5,
        "slat_sampling_steps": 14,
        "slat_guidance_strength": 3.5,
    },
    "high_quality": {
        "texture_size": 2048,
        "mesh_simplify": 0.95,
        "ss_sampling_steps": 20,
        "ss_guidance_strength": 8.0,
        "slat_sampling_steps": 20,
        "slat_guidance_strength": 3.5,
    },
}

class Generate3DRequest(BaseModel):
    images: List[str]
    seed: int = 1337
    texture_size: Optional[int] = None
    mesh_simplify: Optional[float] = None
    ss_sampling_steps: Optional[int] = None
    ss_guidance_strength: Optional[float] = None
    slat_sampling_steps: Optional[int] = None
    slat_guidance_strength: Optional[float] = None
    quality: Literal["balanced", "high_quality"] = "balanced"
    use_multi_image: Optional[bool] = None
    multiimage_algo: Literal["stochastic", "multidiffusion"] = "stochastic"

@router.post("/generate", response_model=TrellisOutput)
async def generate_3d_asset(request: Generate3DRequest):
    """
    Generate a 3D asset from input images using Trellis.
    
    Returns various outputs based on the generation flags:
    - model_file: GLB 3D model (if generate_model=True)
    - color_video: Color render video (if generate_color=True)
    - gaussian_ply: Gaussian point cloud (if save_gaussian_ply=True)
    - normal_video: Normal render video (if generate_normal=True)
    - combined_video: Combined video
    - no_background_images: Preprocessed images (if return_no_background=True)
    """
    try:
        logger.info("=" * 80)
        logger.info("TRELLIS REQUEST PARAMETERS:")
        logger.info(f"  images: {request.images}")
        logger.info("=" * 80)

        _set_status(
            {
                "status": "processing",
                "progress": 5,
                "message": "Submitting job to Trellis…",
            }
        )

        preset = TRELLIS_PRESETS.get(request.quality, TRELLIS_PRESETS["balanced"]).copy()
        config = {**preset}
        overrides = {
            "texture_size": request.texture_size,
            "mesh_simplify": request.mesh_simplify,
            "ss_sampling_steps": request.ss_sampling_steps,
            "ss_guidance_strength": request.ss_guidance_strength,
            "slat_sampling_steps": request.slat_sampling_steps,
            "slat_guidance_strength": request.slat_guidance_strength,
        }
        for key, value in overrides.items():
            if value is not None:
                config[key] = value

        use_multi = request.use_multi_image if request.use_multi_image is not None else len(request.images) > 1
        multi_algo = request.multiimage_algo

        output = trellis_service.generate_3d_asset(
            images=request.images,
            seed=request.seed,
            texture_size=config["texture_size"],
            mesh_simplify=config["mesh_simplify"],
            ss_sampling_steps=config["ss_sampling_steps"],
            ss_guidance_strength=config["ss_guidance_strength"],
            slat_sampling_steps=config["slat_sampling_steps"],
            slat_guidance_strength=config["slat_guidance_strength"],
            use_multi_image=use_multi,
            multiimage_algo=multi_algo,
        )
        logger.info("Successfully generated 3D asset")
        _set_status(
            {
                "status": "complete",
                "progress": 100,
                "message": "3D model generated successfully!",
                "model_file": output.get("model_file"),
                "color_video": output.get("color_video"),
                "no_background_images": output.get("no_background_images", []),
            }
        )
        return output
    except Exception as e:
        logger.error(f"Error generating 3D asset: {str(e)}")
        logger.error(traceback.format_exc())
        _set_status(
            {
                "status": "error",
                "progress": 0,
                "message": f"Generation failed: {str(e)}",
            }
        )
        raise HTTPException(status_code=500, detail=f"Failed to generate 3D asset: {str(e)}")


@router.get("/status")
async def get_generation_status():
    """
    Retrieve the status of the most recent Trellis generation job.
    """
    status = redis_service.get_json(STATUS_KEY)
    if not status:
        return {"status": "idle", "progress": 0, "message": "No generation started"}
    return status


def _set_status(payload: Dict[str, Any]) -> None:
    redis_service.set_json(STATUS_KEY, payload, ex=3600)


