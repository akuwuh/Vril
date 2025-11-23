import asyncio
import logging
import base64
from typing import Dict, Any, List, Optional

from pydantic import ValidationError

from google import genai
from google.genai import types

from app.core.config import settings

logger = logging.getLogger(__name__)

class GeminiError(Exception):
    """Gemini service errors."""
    pass

class QuotaExceededError(GeminiError):
    """API quota exceeded."""
    pass

class SafetyError(GeminiError):
    """Content blocked by safety filters."""
    pass

class GeminiImageService:
    """Service for product asset generation using Gemini 3 Image API."""
    
    def __init__(self):
        if settings.GEMINI_API_KEY:
            self.client = genai.Client(api_key=settings.GEMINI_API_KEY)
        else:
            self.client = None
            logger.warning("Gemini API key not found for Image Service")
        
        # Model references (workflow determines which to use)
        self.flash_model = settings.GEMINI_FLASH_MODEL
        self.pro_model = settings.GEMINI_PRO_MODEL
        
        # Image generation settings
        self.image_size = settings.GEMINI_IMAGE_SIZE
        self.aspect_ratio = settings.GEMINI_IMAGE_ASPECT_RATIO
        
        logger.info(f"[gemini-image] Initialized with Pro model: {self.pro_model}, Flash model: {self.flash_model}")

    def generate_product_images_sync(
        self,
        prompt: str,
        workflow: str,
        image_count: int = 1,
        reference_images: Optional[List[str]] = None,
        is_texture: bool = False,
    ) -> List[str]:
        """Generate clean product views using Gemini Image API (synchronous).
        
        Args:
            prompt: Description of the product or edit instruction
            workflow: "create" or "edit" - determines model selection
            image_count: Number of images to generate
            reference_images: Reference images for edit workflow
            
        Returns:
            List of base64-encoded image data URLs
        """
        if not self.client:
            raise GeminiError("Gemini client not initialized for product images")
        
        # Workflow-based model selection (hardcoded policy)
        # Note: Image generation models don't support thinking levels, so we disable it
        if workflow == "create":
            model_to_use = self.pro_model
            thinking = None  # Image generation models don't support thinking
            logger.info(f"[gemini] CREATE workflow: using {model_to_use} (thinking disabled for image models)")
        elif workflow == "edit":
            model_to_use = self.flash_model
            thinking = None  # Flash doesn't support thinking
            logger.info(f"[gemini] EDIT workflow: using {model_to_use} (thinking disabled)")
        else:
            raise ValueError(f"Unknown workflow: {workflow}. Expected 'create' or 'edit'")
        
        valid_images = []
        
        # For /create flow: generate first image, then use it as reference for additional angles
        # For /edit flow: use provided reference_images for all generations
        is_create_flow = workflow == "create"
        
        for i in range(image_count):
            try:
                # For create flow: first image establishes the product, subsequent use it as reference
                if is_create_flow and i == 0:
                    # First view: establish the product design
                    img = self._generate_single_image(prompt, None, thinking, model_to_use, angle_index=i, is_texture=is_texture)
                elif is_create_flow and i > 0:
                    # Subsequent views: same product from different angles
                    img = self._generate_single_image(prompt, valid_images[:1], thinking, model_to_use, angle_index=i, is_texture=is_texture)
                else:
                    # Edit flow: use provided reference
                    img = self._generate_single_image(prompt, reference_images, thinking, model_to_use, angle_index=i, is_texture=is_texture)
                
                if img:
                    valid_images.append(img)
                    logger.info(f"[gemini] Image {i+1}/{image_count} generated successfully with model {model_to_use}")
                else:
                    logger.warning(f"[gemini] Image {i+1}/{image_count} generation returned None")
            except Exception as exc:
                logger.error(f"[gemini] Image {i+1}/{image_count} generation failed: {exc}")
        
        logger.info(f"[gemini] Generated {len(valid_images)}/{image_count} valid product images using {model_to_use}")
        return valid_images
    
    async def generate_product_images(
        self,
        prompt: str,
        workflow: str,
        image_count: int = 1,
        reference_images: Optional[List[str]] = None,
        is_texture: bool = False,
    ) -> List[str]:
        """Generate clean product views using Gemini Image API (async wrapper).
        
        Args:
            prompt: Description of the product or edit instruction
            workflow: "create" or "edit" - determines model selection
            image_count: Number of images to generate
            reference_images: Reference images for edit workflow
            is_texture: If True, bypass "product photograph" enhancement (for flat textures)
            
        Returns:
            List of base64-encoded image data URLs
        """
        return await asyncio.to_thread(
            self.generate_product_images_sync,
            prompt,
            workflow,
            image_count,
            reference_images,
            is_texture,
        )

    def _generate_single_image(
        self,
        prompt: str,
        reference_images: Optional[List[str]],
        thinking_level: Optional[str],
        model: str,
        angle_index: int = 0,
        is_texture: bool = False,
    ) -> Optional[str]:
        # Define camera angles for multi-view 3D reconstruction
        # These angles provide maximum surface coverage for photogrammetry
        angles = [
            "front view at eye level, perfectly centered",
            "45-degree angle from upper right, showing top and right side",
            "side profile view from the left at eye level"
        ]
        angle_description = angles[angle_index] if angle_index < len(angles) else "alternate angle"
        
        # Enhance prompt for clean, 3D-ready product shots OR flat textures
        # Following Gemini best practices: conversational prompts with clear intent
        if is_texture:
            # For textures: use the prompt as-is (it's already been enhanced in panel_generation.py)
            # Don't add "product photograph" prefix - this is a flat texture, not a 3D product
            enhanced_prompt = prompt
        elif reference_images:
            # Subsequent views or edit flow: maintain consistency with reference
            # Using image+text-to-image approach for consistency
            enhanced_prompt = (
                f"Create a professional product photograph of the exact same product shown in the reference image, "
                f"photographed from a {angle_description}. {prompt}\n\n"
                f"Match the reference image precisely in terms of design, colors, materials, and all details. "
                f"Photograph the product on a clean white studio background with professional lighting that creates "
                f"soft shadows. Ensure sharp focus throughout with well-defined edges. "
                f"Center the product in the frame and fill the frame while keeping the entire product visible - "
                f"no parts should be cropped or cut off. Avoid any text, watermarks, or distracting elements."
            )
        else:
            # First view: establish the product
            # Using text-to-image with clear, natural description
            enhanced_prompt = (
                f"Create a professional studio product photograph of {prompt}, "
                f"shot from a {angle_description}. "
                f"Photograph the product on a pure white background with professional studio lighting that creates "
                f"soft, subtle shadows. Use sharp focus to capture clear, well-defined edges. "
                f"Center the product in the frame and fill the frame while ensuring the entire product is visible - "
                f"nothing should be cropped or cut off. The design should be consistent and suitable for viewing "
                f"from multiple camera angles. Avoid any text overlays, watermarks, or distracting elements."
            )
        
        contents: List[types.Part | str] = [enhanced_prompt]
        if reference_images:
            part = _image_to_part(reference_images[0])
            if part:
                contents.insert(1, part)  # Reference image after enhanced prompt
        # We use model_construct to BYPASS Pydantic validation because the SDK v1.47.0 
        # is missing fields like 'thinking_level' and 'image_size' that the API supports.
        
        thinking_cfg = None
        if thinking_level:
            # Create ThinkingConfig with extra fields allowed
            thinking_cfg = types.ThinkingConfig.model_construct(
                thinking_level=thinking_level
            )
            
        image_cfg = None
        image_config_kwargs: Dict[str, Any] = {"aspect_ratio": "1:1"}
        if self.image_size:
            image_config_kwargs["image_size"] = self.image_size
        
        if image_config_kwargs:
            image_cfg = types.ImageConfig.model_construct(**image_config_kwargs)

        # Construct main config bypassing validation
        config = types.GenerateContentConfig.model_construct(
            thinking_config=thinking_cfg,
            image_config=image_cfg
        )

        try:
            logger.info(f"[gemini] Calling Gemini API with model: {model}, prompt length: {len(enhanced_prompt)}")
            logger.info(f"[gemini] Prompt preview: {enhanced_prompt[:200]}...")
            response = self.client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            logger.info(f"[gemini] Received response from Gemini API. Response type: {type(response)}")
            return _extract_first_image(response)
        except Exception as exc:
            logger.error(f"[gemini] Gemini API call failed: {exc}", exc_info=True)
            raise GeminiError(f"Gemini API call failed: {exc}") from exc


def _extract_first_image(response) -> Optional[str]:
    try:
        logger.info(f"[gemini] Extracting image from response. Response type: {type(response)}")
        logger.info(f"[gemini] Response has 'candidates' attr: {hasattr(response, 'candidates')}")
        
        if hasattr(response, "candidates") and response.candidates:
            logger.info(f"[gemini] Found {len(response.candidates)} candidate(s)")
            candidate = response.candidates[0]
            logger.info(f"[gemini] Candidate has 'content' attr: {hasattr(candidate, 'content')}")
            
            if hasattr(candidate, "content") and candidate.content.parts:
                logger.info(f"[gemini] Found {len(candidate.content.parts)} part(s) in content")
                for i, part in enumerate(candidate.content.parts):
                    logger.info(f"[gemini] Part {i}: type={type(part)}, has inline_data={bool(getattr(part, 'inline_data', None))}")
                    if getattr(part, "inline_data", None):
                        image_b64 = base64.b64encode(part.inline_data.data).decode()
                        logger.info(f"[gemini] Successfully extracted image from response ({len(image_b64)} chars)")
                        return f"data:image/png;base64,{image_b64}"
            else:
                logger.warning(f"[gemini] Candidate has no content.parts. Content: {getattr(candidate, 'content', None)}")
        else:
            logger.warning(f"[gemini] No candidates found in response. Response: {response}")
            
        # Check for finish_reason or error messages
        if hasattr(response, "candidates") and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, "finish_reason"):
                logger.warning(f"[gemini] Finish reason: {candidate.finish_reason}")
            if hasattr(candidate, "safety_ratings"):
                logger.warning(f"[gemini] Safety ratings: {candidate.safety_ratings}")
                
        logger.warning(f"[gemini] No inline_data found in response. Candidates: {bool(getattr(response, 'candidates', None))}")
        return None
    except Exception as exc:
        logger.error(f"[gemini] Image extraction failed: {exc}", exc_info=True)
        return None


def _image_to_part(image_str: str) -> Optional[types.Part]:
    """Convert a data URL/base64 string into a Gemini content part."""
    try:
        if image_str.startswith("data:image"):
            header, b64_data = image_str.split(",", 1)
            mime = header.split(";")[0].split(":")[1]
            image_bytes = base64.b64decode(b64_data)
            return types.Part.from_bytes(data=image_bytes, mime_type=mime)
    except ValueError as exc:
        logger.warning(f"Failed to convert reference image for Gemini input: {exc}")
    return None


# Initialize service
gemini_image_service = GeminiImageService()