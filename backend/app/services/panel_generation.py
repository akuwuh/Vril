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
    ) -> Optional[str]:
        """Generate a texture for a specific panel.
        
        Args:
            panel_id: Panel identifier (e.g., "front", "back", "body")
            prompt: User's design prompt
            package_type: "box" or "cylinder"
            panel_dimensions: Panel-specific dimensions (width, height in mm)
            package_dimensions: Full package dimensions
            
        Returns:
            Base64-encoded image data URL or None if generation fails
        """
        try:
            # Build enhanced prompt for panel-specific generation
            enhanced_prompt = self._build_panel_prompt(
                panel_id, prompt, package_type, panel_dimensions, package_dimensions
            )
            
            logger.info(f"[panel-gen] Generating texture for panel {panel_id} with prompt: {prompt[:100]}...")
            
            # Use Gemini to generate the texture
            # For panel textures, we want flat designs suitable for wrapping
            # Pass is_texture=True to bypass "product photograph" enhancement
            images = await self.gemini_service.generate_product_images(
                prompt=enhanced_prompt,
                workflow="create",  # Always create new designs
                image_count=1,
                reference_images=None,
                is_texture=True,  # This is a texture, not a product photo
            )
            
            if images and len(images) > 0:
                logger.info(f"[panel-gen] Successfully generated texture for panel {panel_id}")
                return images[0]
            else:
                logger.warning(f"[panel-gen] No image returned for panel {panel_id}")
                return None
                
        except GeminiError as e:
            logger.error(f"[panel-gen] Gemini error generating panel {panel_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"[panel-gen] Unexpected error generating panel {panel_id}: {e}", exc_info=True)
            raise
    
    def _build_panel_prompt(
        self,
        panel_id: str,
        user_prompt: str,
        package_type: str,
        panel_dimensions: dict,
        package_dimensions: dict,
    ) -> str:
        """Build an enhanced prompt for panel texture generation."""
        
        # Panel-specific context
        panel_context = self._get_panel_context(panel_id, package_type)
        
        # Dimensions info
        width = panel_dimensions.get("width", 0)
        height = panel_dimensions.get("height", 0)
        dimensions_text = f"{width}mm × {height}mm"
        
        # Check if user wants a simple solid color and extract the exact color
        import re
        user_lower = user_prompt.lower()
        
        # Extract color from common patterns
        color_match = re.search(r'\b(black|white|red|blue|green|yellow|orange|purple|pink|gray|grey|brown)\b', user_lower)
        extracted_color = color_match.group(1) if color_match else None
        
        is_simple_color = any(keyword in user_lower for keyword in [
            "black", "white", "red", "blue", "green", "yellow", "orange", "purple", "pink",
            "gray", "grey", "brown", "paint it", "make it", "color it", "turn it", "solid", "plain"
        ])
        
        if is_simple_color and extracted_color:
            # For simple color requests, use a very explicit prompt with exact color
            enhanced = (
                f"Generate a flat, solid {extracted_color} color texture for a packaging panel. "
                f"This is the {panel_context} panel with dimensions {dimensions_text}. "
                f"\n\n"
                f"CRITICAL REQUIREMENTS:\n"
                f"- The entire surface must be exactly {extracted_color} color, nothing else\n"
                f"- No borders, no edges, no frames, no outlines\n"
                f"- No gradients, no patterns, no designs, no shadows\n"
                f"- The color must extend edge-to-edge, covering 100% of the {dimensions_text} area\n"
                f"- Every single pixel must be the exact same {extracted_color} color\n"
                f"- This is a flat 2D texture, not a 3D object or photograph\n"
                f"- No lighting effects, no depth, no perspective\n"
                f"- The texture must be completely uniform and seamless\n"
                f"- Think of it like a solid color swatch or paint sample - pure {extracted_color} from edge to edge"
            )
        elif is_simple_color:
            # Color detected but couldn't extract - use generic prompt
            enhanced = (
                f"Generate a flat, solid color texture for a packaging panel. "
                f"This is the {panel_context} panel with dimensions {dimensions_text}. "
                f"The user wants: {user_prompt}\n\n"
                f"CRITICAL REQUIREMENTS:\n"
                f"- The entire surface must be a single, uniform color covering 100% of the area\n"
                f"- No borders, no edges, no frames, no outlines\n"
                f"- No gradients, no patterns, no designs, no shadows\n"
                f"- The color must extend edge-to-edge, covering the full {dimensions_text} area\n"
                f"- This is a flat 2D texture, not a 3D object or photograph\n"
                f"- No lighting effects, no depth, no perspective\n"
                f"- The texture must be completely uniform and seamless"
            )
        else:
            # For complex design requests, use the detailed prompt
            enhanced = (
                f"Create a professional packaging design texture for a {package_type} package panel. "
                f"This is the {panel_context} panel with dimensions {dimensions_text}. "
                f"{user_prompt}\n\n"
                f"The design should be suitable for printing on packaging material. "
                f"Create a flat, seamless design that covers 100% of the {dimensions_text} surface area. "
                f"Ensure the design is high-quality, print-ready, and visually appealing. "
                f"The design must fill the entire panel area without any gaps, borders, or empty spaces. "
                f"Avoid any 3D effects or perspective - this is a flat texture that will be applied to a surface."
            )
        
        return enhanced
    
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

