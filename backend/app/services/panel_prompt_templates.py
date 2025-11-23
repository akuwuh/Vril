"""
Panel Generation Prompt Templates

This module contains the master panel prompt template system for generating
packaging panels with strict style, dimension, and quality controls.
"""

import logging
from typing import Optional, Dict
from fractions import Fraction

logger = logging.getLogger(__name__)


class PanelPromptBuilder:
    """Builds structured prompts for panel generation with strict guardrails."""
    
    # Master panel prompt template
    MASTER_TEMPLATE = """You are a packaging panel layout model. A 3D mockup image of the box is attached as reference.

Use it as the strict style and pattern-scale reference.

========================
VARIABLES (filled by pipeline)
========================

FACE_NAME: {face_name}
PANEL_WIDTH_IN: {panel_width_in:.2f}
PANEL_HEIGHT_IN: {panel_height_in:.2f}
ASPECT_RATIO_LOCK: {aspect_ratio_lock}

Box context (do not change):
- W = {box_width_in:.1f} in, H = {box_height_in:.1f} in, L = {box_depth_in:.1f} in.

========================
GLOBAL STYLE LOCK (must apply exactly)
========================

1) Style source
   - The attached 3D mockup is the authoritative reference for:
     a) checker/tile pattern scale
     b) tile sharpness and spacing
     c) black tone / contrast
   - Do not reinterpret or restyle the pattern.

2) Pattern definition
   - Uniform black checker / tiled texture.
   - Grid is axis-aligned (no rotation).
   - Tile size must visually match the mockup across all panels.

3) Flat print panel rules
   - Orthographic, straight-on, flat design only.
   - No perspective, no shadows, no lighting, no 3D cues.
   - No fold lines, no die-cut marks, no guides.
   - No text, logos, symbols, or extra graphics.

4) Full-bleed, edge-flush rule
   - Pattern must extend to every edge with zero margin.
   - No borders, padding, or safe-area inset.
   - Tiles must meet the edges cleanly. No faded or clipped edge band.

========================
PANEL SPEC (this call only)
========================

Render the face: FACE_NAME = {face_name}

Physical size (inches):
- width  = {panel_width_in:.2f}
- height = {panel_height_in:.2f}

Aspect ratio lock (hard constraint):
- REQUIRED aspect ratio = {aspect_ratio_lock}
- You MUST generate the panel at this exact ratio.
- Do NOT crop, pad, letterbox, or alter proportions.
- If you pick pixel sizes, compute from inches using a single DPI
  so the final image ratio is exactly {aspect_ratio_lock}.

Edge alignment intent:
- Treat this as part of a continuous wrap.
- Keep the checker grid aligned so edges can match adjacent faces later.

========================
OUTPUT RULES
========================

- Output exactly ONE image for this panel.
- The image must be the flat panel only.
- Label internally as {face_name}. Do not add visible text on the panel.
- No extra commentary, no extra images. One image only.

========================
USER CUSTOMIZATION
========================

{user_prompt}
"""

    # Simple texture template (for basic requests without reference mockup)
    SIMPLE_TEMPLATE = """Generate a flat packaging panel texture with the following specifications:

Panel: {face_name}
Dimensions: {panel_width_in:.2f}" × {panel_height_in:.2f}" ({panel_width_mm}mm × {panel_height_mm}mm)
Aspect Ratio: {aspect_ratio_lock} (MUST be exact)

CRITICAL REQUIREMENTS:
1. Create a flat, orthographic design (no perspective, shadows, or 3D effects)
2. The design MUST be exactly {aspect_ratio_lock} aspect ratio
3. Full-bleed: design extends to all edges with zero margin
4. No borders, frames, fold lines, or cut marks
5. Suitable for printing on packaging material
6. High-quality, print-ready artwork
7. The entire {panel_width_mm}mm × {panel_height_mm}mm area must be filled

USER REQUEST:
{user_prompt}

OUTPUT: Generate exactly ONE flat panel texture at {aspect_ratio_lock} aspect ratio.
"""

    @staticmethod
    def mm_to_inches(mm: float) -> float:
        """Convert millimeters to inches."""
        return mm / 25.4
    
    @staticmethod
    def calculate_aspect_ratio(width: float, height: float) -> str:
        """
        Calculate aspect ratio as a simplified fraction string (e.g., "16:9").
        
        Args:
            width: Width in any unit
            height: Height in any unit
            
        Returns:
            Aspect ratio string like "16:9" or "4:3"
        """
        # Handle edge cases
        if width <= 0 or height <= 0:
            return "1:1"
        
        # Use Fraction to find the simplified ratio
        # Multiply by 1000 to handle decimals, then simplify
        w_int = int(round(width * 1000))
        h_int = int(round(height * 1000))
        
        fraction = Fraction(w_int, h_int)
        
        # If the fraction is already simple enough, use it
        if fraction.denominator <= 100:
            return f"{fraction.numerator}:{fraction.denominator}"
        
        # Otherwise, round to a common aspect ratio
        ratio_value = width / height
        
        # Common aspect ratios
        common_ratios = {
            1.0: "1:1",
            1.33: "4:3",
            1.5: "3:2",
            1.6: "16:10",
            1.78: "16:9",
            2.0: "2:1",
            2.35: "21:9",
        }
        
        # Find closest common ratio
        closest = min(common_ratios.keys(), key=lambda x: abs(x - ratio_value))
        if abs(closest - ratio_value) < 0.1:
            return common_ratios[closest]
        
        # Fallback: use simplified fraction with max denominator
        fraction_limited = fraction.limit_denominator(20)
        return f"{fraction_limited.numerator}:{fraction_limited.denominator}"
    
    @staticmethod
    def validate_user_prompt(prompt: str) -> tuple[bool, Optional[str]]:
        """
        Validate user prompt for quality and appropriateness.
        
        Returns:
            (is_valid, error_message)
        """
        prompt = prompt.strip()
        
        # Check minimum length
        if len(prompt) < 3:
            return False, "Prompt is too short. Please provide more detail about what you want."
        
        # Check maximum length
        if len(prompt) > 2000:
            return False, "Prompt is too long. Please keep it under 2000 characters."
        
        # Warn about overly vague prompts
        vague_prompts = ["logo", "design", "texture", "pattern", "cool", "nice", "good"]
        if prompt.lower() in vague_prompts:
            return False, (
                f"Prompt '{prompt}' is too vague. Please be more specific about:\n"
                "- What style or theme you want\n"
                "- What colors or patterns to use\n"
                "- Any specific elements to include\n"
                "Example: 'blue geometric pattern with white lines' or 'vintage cardboard texture'"
            )
        
        return True, None
    
    def build_master_prompt(
        self,
        face_name: str,
        panel_width_mm: float,
        panel_height_mm: float,
        box_width_mm: float,
        box_height_mm: float,
        box_depth_mm: float,
        user_prompt: str,
        has_reference_mockup: bool = False,
    ) -> str:
        """
        Build the master panel prompt with all specifications.
        
        Args:
            face_name: Panel face identifier (front, back, left, right, top, bottom)
            panel_width_mm: Panel width in millimeters
            panel_height_mm: Panel height in millimeters
            box_width_mm: Full box width in millimeters
            box_height_mm: Full box height in millimeters
            box_depth_mm: Full box depth in millimeters
            user_prompt: User's custom design request
            has_reference_mockup: Whether a reference mockup image is provided
            
        Returns:
            Complete structured prompt
        """
        # Validate user prompt first
        is_valid, error = self.validate_user_prompt(user_prompt)
        if not is_valid:
            raise ValueError(error)
        
        # Convert to inches
        panel_width_in = self.mm_to_inches(panel_width_mm)
        panel_height_in = self.mm_to_inches(panel_height_mm)
        box_width_in = self.mm_to_inches(box_width_mm)
        box_height_in = self.mm_to_inches(box_height_mm)
        box_depth_in = self.mm_to_inches(box_depth_mm)
        
        # Calculate aspect ratio
        aspect_ratio = self.calculate_aspect_ratio(panel_width_mm, panel_height_mm)
        
        # Log the generation details
        logger.info(f"[prompt-builder] Building prompt for {face_name} panel")
        logger.info(f"[prompt-builder] Dimensions: {panel_width_mm}mm × {panel_height_mm}mm ({panel_width_in:.2f}\" × {panel_height_in:.2f}\")")
        logger.info(f"[prompt-builder] Aspect ratio: {aspect_ratio}")
        logger.info(f"[prompt-builder] Has reference mockup: {has_reference_mockup}")
        
        # Choose template based on whether we have a reference mockup
        if has_reference_mockup:
            template = self.MASTER_TEMPLATE
        else:
            template = self.SIMPLE_TEMPLATE
        
        # Fill in the template
        prompt = template.format(
            face_name=face_name,
            panel_width_in=panel_width_in,
            panel_height_in=panel_height_in,
            panel_width_mm=int(panel_width_mm),
            panel_height_mm=int(panel_height_mm),
            aspect_ratio_lock=aspect_ratio,
            box_width_in=box_width_in,
            box_height_in=box_height_in,
            box_depth_in=box_depth_in,
            user_prompt=user_prompt,
        )
        
        logger.info(f"[prompt-builder] Generated prompt length: {len(prompt)} characters")
        
        return prompt
    
    def build_simple_prompt(
        self,
        face_name: str,
        panel_width_mm: float,
        panel_height_mm: float,
        user_prompt: str,
    ) -> str:
        """
        Build a simple prompt for basic texture generation without full context.
        
        This is a fallback when full box dimensions aren't available.
        """
        # Validate user prompt
        is_valid, error = self.validate_user_prompt(user_prompt)
        if not is_valid:
            raise ValueError(error)
        
        panel_width_in = self.mm_to_inches(panel_width_mm)
        panel_height_in = self.mm_to_inches(panel_height_mm)
        aspect_ratio = self.calculate_aspect_ratio(panel_width_mm, panel_height_mm)
        
        prompt = self.SIMPLE_TEMPLATE.format(
            face_name=face_name,
            panel_width_in=panel_width_in,
            panel_height_in=panel_height_in,
            panel_width_mm=int(panel_width_mm),
            panel_height_mm=int(panel_height_mm),
            aspect_ratio_lock=aspect_ratio,
            user_prompt=user_prompt,
        )
        
        return prompt


# Global instance
panel_prompt_builder = PanelPromptBuilder()

