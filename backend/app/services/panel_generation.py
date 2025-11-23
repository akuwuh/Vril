import asyncio
import logging
from typing import Optional

from app.integrations.gemini import gemini_image_service, GeminiError
from app.models.packaging_state import (
    PackagingState,
    PanelTexture,
    get_packaging_state,
    save_packaging_state,
)
from app.services.panel_prompt_templates import panel_prompt_builder

logger = logging.getLogger(__name__)


class PanelGenerationService:
    """Service for generating panel textures using Gemini."""
    
    def __init__(self):
        self.gemini_service = gemini_image_service
    
    async def generate_panel_texture(
        self,
        panel_id: str,
        prompt: str,
        package_type: str,
        panel_dimensions: dict,
        package_dimensions: dict,
        reference_mockup: Optional[str] = None,
    ) -> Optional[str]:
        """Generate a texture for a specific panel using structured prompts with guardrails.
        
        Args:
            panel_id: Panel identifier (e.g., "front", "back", "body")
            prompt: User's design prompt
            package_type: "box" or "cylinder"
            panel_dimensions: Panel-specific dimensions (width, height in mm)
            package_dimensions: Full package dimensions (width, height, depth in mm)
            reference_mockup: Optional base64 reference mockup image for style matching
            
        Returns:
            Base64-encoded image data URL or None if generation fails
        """
        try:
            # Validate and build structured prompt with guardrails
            enhanced_prompt = self._build_structured_prompt(
                panel_id=panel_id,
                user_prompt=prompt,
                package_type=package_type,
                panel_dimensions=panel_dimensions,
                package_dimensions=package_dimensions,
                has_reference=bool(reference_mockup),
            )
            
            logger.info(f"[panel-gen] Generating texture for panel {panel_id}")
            logger.info(f"[panel-gen] User prompt: {prompt[:100]}...")
            logger.info(f"[panel-gen] Using structured prompt template: {'WITH' if reference_mockup else 'WITHOUT'} reference mockup")
            
            # Prepare reference images if mockup is provided
            reference_images = [reference_mockup] if reference_mockup else None
            
            # Use Gemini to generate the texture
            # For panel textures, we want flat designs suitable for wrapping
            # Pass is_texture=True to bypass "product photograph" enhancement
            images = await self.gemini_service.generate_product_images(
                prompt=enhanced_prompt,
                workflow="create",  # Always create new designs
                image_count=1,
                reference_images=reference_images,
                is_texture=True,  # This is a texture, not a product photo
            )
            
            if images and len(images) > 0:
                logger.info(f"[panel-gen] Successfully generated texture for panel {panel_id}")
                return images[0]
            else:
                logger.warning(f"[panel-gen] No image returned for panel {panel_id}")
                return None
                
        except ValueError as e:
            # Prompt validation errors
            logger.error(f"[panel-gen] Prompt validation error for panel {panel_id}: {e}")
            raise
        except GeminiError as e:
            logger.error(f"[panel-gen] Gemini error generating panel {panel_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"[panel-gen] Unexpected error generating panel {panel_id}: {e}", exc_info=True)
            raise
    
    def _build_structured_prompt(
        self,
        panel_id: str,
        user_prompt: str,
        package_type: str,
        panel_dimensions: dict,
        package_dimensions: dict,
        has_reference: bool,
    ) -> str:
        """
        Build a structured prompt using the master panel prompt template system.
        
        This enforces guardrails, validates input, and creates consistent prompts.
        """
        # Extract dimensions
        panel_width = panel_dimensions.get("width", 0)
        panel_height = panel_dimensions.get("height", 0)
        box_width = package_dimensions.get("width", 0)
        box_height = package_dimensions.get("height", 0)
        box_depth = package_dimensions.get("depth", 0)
        
        # Validate dimensions
        if panel_width <= 0 or panel_height <= 0:
            raise ValueError(f"Invalid panel dimensions: {panel_width}mm × {panel_height}mm")
        
        if box_width <= 0 or box_height <= 0 or box_depth <= 0:
            logger.warning(f"[panel-gen] Invalid box dimensions, using panel dimensions as fallback")
            # Fallback to simple prompt if box dimensions are invalid
            return panel_prompt_builder.build_simple_prompt(
                face_name=panel_id,
                panel_width_mm=panel_width,
                panel_height_mm=panel_height,
                user_prompt=user_prompt,
            )
        
        # Build the master prompt with all context
        try:
            prompt = panel_prompt_builder.build_master_prompt(
                face_name=panel_id,
                panel_width_mm=panel_width,
                panel_height_mm=panel_height,
                box_width_mm=box_width,
                box_height_mm=box_height,
                box_depth_mm=box_depth,
                user_prompt=user_prompt,
                has_reference_mockup=has_reference,
            )
            return prompt
        except ValueError as e:
            # Prompt validation failed - re-raise with context
            logger.error(f"[panel-gen] Prompt validation failed: {e}")
            raise ValueError(f"Your prompt needs improvement: {e}")
    
    def _get_panel_context(self, panel_id: str, package_type: str) -> str:
        """Get descriptive context for a panel."""
        if package_type == "box":
            contexts = {
                "front": "front face (primary visible panel)",
                "back": "back face (opposite side)",
                "left": "left side panel",
                "right": "right side panel",
                "top": "top face (lid/opening area)",
                "bottom": "bottom face (base)",
            }
        else:  # cylinder
            contexts = {
                "body": "cylindrical body wrap (curved surface)",
                "top": "top circular cap",
                "bottom": "bottom circular base",
            }
        
        return contexts.get(panel_id, panel_id)


# Initialize service
panel_generation_service = PanelGenerationService()

