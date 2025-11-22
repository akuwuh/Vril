import json
import asyncio
import logging
import base64
from typing import Dict, Any, List, Optional

from pydantic import ValidationError

import google.generativeai as genai
from google.genai import types
from google.genai import Client as GenaiClient
from google.generativeai.types import HarmCategory, HarmBlockThreshold

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

class GeminiChatService:
    """Service for text-based chat and data extraction using Gemini."""
    
    def __init__(self):
        if not settings.GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY not found in settings")
            self.configured = False
        else:
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self.configured = True
        
        self.pro_model = settings.GEMINI_MODEL
        self.flash_model = settings.GEMINI_FLASH_MODEL
        self.current_model = self.flash_model
        
        # No safety settings - disabled for unrestricted operation
        self.safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }
        
        self.request_count = 0
        self.error_count = 0

    def _get_generation_config(self, task_type: str = "default") -> Dict[str, Any]:
        """Get generation config optimized for task type."""
        base_config = {
            "temperature": settings.GEMINI_TEMPERATURE,
            "max_output_tokens": settings.GEMINI_MAX_TOKENS,
        }

        if task_type == "extraction":
            base_config.update({"temperature": 0.1, "max_output_tokens": 4096})
        elif task_type == "creative":
            base_config.update({"temperature": 0.8, "max_output_tokens": 8192})
        elif task_type == "analysis":
            base_config.update({"temperature": 0.3, "max_output_tokens": 6144})

        return base_config

    async def generate_content(
        self,
        prompt: str,
        task_type: str = "default",
        response_schema: Optional[Dict[str, Any]] = None,
        max_retries: int = None
    ) -> Dict[str, Any]:
        """
        Generate content with retries and monitoring.
        """
        if not self.configured:
            raise GeminiError("Gemini API key not configured")
            
        max_retries = max_retries or settings.GEMINI_MAX_RETRIES
        model_name = self.flash_model
        generation_config = self._build_generation_config(task_type, response_schema)

        for attempt in range(max_retries):
            try:
                self.request_count += 1
                model = genai.GenerativeModel(
                    model_name=model_name,
                    generation_config=generation_config,
                    safety_settings=self.safety_settings,
                )
                
                response = await model.generate_content_async(prompt)
                parsed = self._parse_response(response, response_schema)
                if parsed is not None:
                    return parsed
            
            except Exception as e:  # noqa: BLE001
                self.error_count += 1
                logger.warning(f"Gemini attempt {attempt + 1} failed: {str(e)}")
                if attempt == max_retries - 1:
                    raise GeminiError(f"Max retries exceeded: {str(e)}")
                await asyncio.sleep(2 ** attempt)
                
        return {"error": "Failed to generate content"}

    def _build_generation_config(
        self,
        task_type: str,
        response_schema: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        config = self._get_generation_config(task_type)
        if response_schema:
            config = {**config}
            config.update(
                {
                    "response_mime_type": "application/json",
                    "response_schema": response_schema,
                }
            )
        return config

    def _parse_response(
        self,
        response,
        response_schema: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if not response.text:
            return None
        if not response_schema:
            return {"text": response.text}
        return self._parse_structured_response(response.text)

    def _parse_structured_response(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            cleaned = self._strip_markdown_fence(text)
            if not cleaned or cleaned == text:
                logger.warning("JSON parse error for Gemini response")
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                return None

    @staticmethod
    def _strip_markdown_fence(text: str) -> str:
        cleaned = text.strip()
        if cleaned.startswith("```") and cleaned.endswith("```"):
            lines = cleaned.split("\n")
            if len(lines) > 2:
                return "\n".join(lines[1:-1])
        return cleaned


class GeminiImageService:
    """Service for product asset generation using Gemini 3 Image API."""
    
    def __init__(self):
        if settings.GEMINI_API_KEY:
            self.client = GenaiClient(api_key=settings.GEMINI_API_KEY)
        else:
            self.client = None
            logger.warning("Gemini API key not found for Image Service")
        self.asset_model = settings.GEMINI_IMAGE_MODEL
        self.default_thinking_level = settings.GEMINI_THINKING_LEVEL
        self.image_size = settings.GEMINI_IMAGE_SIZE
        self.aspect_ratio = settings.GEMINI_IMAGE_ASPECT_RATIO

    def generate_product_images_sync(
        self,
        prompt: str,
        image_count: int = 3,
        reference_images: Optional[List[str]] = None,
        thinking_level: Optional[str] = None,
    ) -> List[str]:
        """Generate clean product views using Gemini 3 Image API (synchronous)."""
        if not self.client:
            raise GeminiError("Gemini client not initialized for product images")
        
        thinking = thinking_level or self.default_thinking_level
        valid_images = []
        
        # For /create flow: generate first image, then use it as reference for additional angles
        # For /edit flow: use provided reference_images for all generations
        is_create_flow = not reference_images
        
        for i in range(image_count):
            try:
                # For create flow: first image establishes the product, subsequent use it as reference
                if is_create_flow and i == 0:
                    # First view: establish the product design
                    img = self._generate_single_image(prompt, None, thinking, angle_index=i)
                elif is_create_flow and i > 0:
                    # Subsequent views: same product from different angles
                    img = self._generate_single_image(prompt, valid_images[:1], thinking, angle_index=i)
                else:
                    # Edit flow: use provided reference
                    img = self._generate_single_image(prompt, reference_images, thinking, angle_index=i)
                
                if img:
                    valid_images.append(img)
                    logger.info(f"[gemini] Image {i+1}/{image_count} generated successfully")
                else:
                    logger.warning(f"[gemini] Image {i+1}/{image_count} generation returned None")
            except Exception as exc:
                logger.error(f"[gemini] Image {i+1}/{image_count} generation failed: {exc}")
        
        logger.info(f"[gemini] Generated {len(valid_images)}/{image_count} valid product images")
        return valid_images
    
    async def generate_product_images(
        self,
        prompt: str,
        image_count: int = 3,
        reference_images: Optional[List[str]] = None,
        thinking_level: Optional[str] = None,
    ) -> List[str]:
        """Generate clean product views using Gemini 3 Image API (async wrapper)."""
        return await asyncio.to_thread(
            self.generate_product_images_sync,
            prompt,
            image_count,
            reference_images,
            thinking_level,
        )

    def _generate_single_image(
        self,
        prompt: str,
        reference_images: Optional[List[str]],
        thinking_level: Optional[str],
        angle_index: int = 0,
    ) -> Optional[str]:
        # Define camera angles for multi-view 3D reconstruction
        # These angles provide maximum surface coverage for photogrammetry
        angles = [
            "front view at eye level, perfectly centered",
            "45-degree angle from upper right, showing top and right side",
            "side profile view from the left at eye level"
        ]
        angle_description = angles[angle_index] if angle_index < len(angles) else "alternate angle"
        
        # Enhance prompt for clean, 3D-ready product shots
        if reference_images:
            # Subsequent views or edit flow: maintain consistency with reference
            enhanced_prompt = (
                f"Generate a product photograph matching the EXACT same product shown in the reference image.\n"
                f"Show the product from a {angle_description}.\n\n"
                f"Product description: {prompt}\n\n"
                "Requirements:\n"
                "- IDENTICAL product design, colors, materials, and details as the reference\n"
                "- Clean, pure white background (#FFFFFF)\n"
                "- Professional studio lighting with soft shadows\n"
                "- Sharp focus on the product\n"
                "- Clear, well-defined edges optimized for 3D model generation\n"
                "- No text, watermarks, or distracting elements\n"
                "- Product centered in frame"
            )
        else:
            # First view: establish the product
            enhanced_prompt = (
                f"Generate a high-quality product photograph of: {prompt}\n"
                f"Camera angle: {angle_description}\n\n"
                "Requirements:\n"
                "- Clean, pure white background (#FFFFFF)\n"
                "- Professional studio lighting with soft shadows\n"
                "- Sharp focus on the product\n"
                "- Clear, well-defined edges optimized for 3D model generation\n"
                "- No text, watermarks, or distracting elements\n"
                "- Product centered in frame\n"
                "- Consistent design that can be photographed from multiple angles"
            )
        
        contents: List[types.Part | str] = [enhanced_prompt]
        if reference_images:
            part = _image_to_part(reference_images[0])
            if part:
                contents.insert(1, part)  # Reference image after enhanced prompt
        config_kwargs: Dict[str, Any] = {}
        if thinking_level:
            config_kwargs["thinking_config"] = types.ThinkingConfig(
                thinking_level=thinking_level
            )
        image_config_kwargs: Dict[str, Any] = {}
        if self.aspect_ratio:
            image_config_kwargs["aspect_ratio"] = self.aspect_ratio
        if self.image_size:
            image_config_kwargs["image_size"] = self.image_size
        if image_config_kwargs:
            try:
                config_kwargs["image_config"] = types.ImageConfig(**image_config_kwargs)
            except (AttributeError, ValidationError, TypeError) as exc:
                logger.warning("Gemini image config not applied: %s", exc)
        response = self.client.models.generate_content(
            model=self.asset_model,
            contents=contents,
            config=types.GenerateContentConfig(**config_kwargs) if config_kwargs else None,
        )
        return _extract_first_image(response)


def _extract_first_image(response) -> Optional[str]:
    try:
        if hasattr(response, "candidates") and response.candidates:
            candidate = response.candidates[0]
            if hasattr(candidate, "content") and candidate.content.parts:
                for part in candidate.content.parts:
                    if getattr(part, "inline_data", None):
                        image_b64 = base64.b64encode(part.inline_data.data).decode()
                        logger.info(f"[gemini] Extracted image from response ({len(image_b64)} chars)")
                        return f"data:image/png;base64,{image_b64}"
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


# Initialize services
gemini_chat_service = GeminiChatService()
gemini_image_service = GeminiImageService()