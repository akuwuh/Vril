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
SCALE AND COMPOSITION GUIDANCE
========================

{scale_guidance}

Visual harmony for this panel:
- Scale patterns/elements appropriately for the {panel_size_description} {orientation} panel
- Ensure composition looks balanced at the actual physical size ({panel_width_mm}mm × {panel_height_mm}mm)
- Pattern density and element sizing should match the reference mockup's visual scale

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

    # Universal template for extracting panels from 3D mockup (both create and edit flows)
    MOCKUP_EXTRACTION_TEMPLATE = """Extract the {face_name} panel design from the 3D product mockup.

Panel: {face_name}
Size: {panel_width_mm}mm × {panel_height_mm}mm
Aspect Ratio: {aspect_ratio_lock} (maintain exactly)

CRITICAL - FULL BLEED REQUIREMENTS:
- The design MUST fill the ENTIRE image from edge to edge
- NO white borders, NO margins, NO padding
- Design extends completely to all 4 edges (top, bottom, left, right)
- Every pixel of the {panel_width_mm}mm × {panel_height_mm}mm area must be covered
- Background and design elements reach all corners

TASK:
1. Study the 3D mockup to see the {face_name} panel design
2. Extract that exact design as a flat texture
3. Scale it to fill the ENTIRE frame edge-to-edge
4. Ensure zero white space around edges

OUTPUT:
Flat, print-ready panel texture at {aspect_ratio_lock} ratio with complete edge-to-edge coverage."""

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

SCALE AND COMPOSITION GUIDANCE:
{scale_guidance}

VISUAL HARMONY:
- Scale patterns/elements to look balanced at {panel_width_mm}mm × {panel_height_mm}mm physical size
- Consider the {orientation} orientation when composing the design
- Ensure text (if any) is sized to be readable at the actual physical dimensions
- Make patterns/elements proportional to the panel's real-world scale
- Avoid elements that would look too small or too large on a {panel_size_description} panel

USER REQUEST:
{user_prompt}

OUTPUT: Generate exactly ONE flat panel texture at {aspect_ratio_lock} aspect ratio, with composition and scale appropriate for a {panel_size_description} {orientation} panel.
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
    def get_panel_size_description(width_mm: float, height_mm: float) -> str:
        """Get a descriptive size category for the panel."""
        area_cm2 = (width_mm / 10) * (height_mm / 10)
        max_dim = max(width_mm, height_mm)
        
        if max_dim < 50:
            return "very small"
        elif max_dim < 100:
            return "small"
        elif max_dim < 200:
            return "medium"
        elif max_dim < 300:
            return "large"
        else:
            return "very large"
    
    @staticmethod
    def get_panel_orientation(width_mm: float, height_mm: float) -> str:
        """Determine panel orientation."""
        ratio = width_mm / height_mm
        if ratio > 1.3:
            return "landscape (horizontal)"
        elif ratio < 0.77:  # 1/1.3
            return "portrait (vertical)"
        else:
            return "square"
    
    @staticmethod
    def generate_scale_guidance(
        panel_width_mm: float, 
        panel_height_mm: float,
        face_name: str
    ) -> str:
        """Generate specific scale guidance based on panel dimensions."""
        area_cm2 = (panel_width_mm / 10) * (panel_height_mm / 10)
        max_dim = max(panel_width_mm, panel_height_mm)
        ratio = panel_width_mm / panel_height_mm
        
        guidance = []
        
        # Size-based guidance
        if max_dim < 50:
            guidance.append("- This is a VERY SMALL panel - keep patterns fine and detailed, avoid large bold elements")
        elif max_dim < 100:
            guidance.append("- This is a SMALL panel - use moderately sized patterns, avoid oversized elements")
        elif max_dim < 200:
            guidance.append("- This is a MEDIUM panel - balance pattern size with good visibility")
        elif max_dim < 300:
            guidance.append("- This is a LARGE panel - use bold patterns and elements that won't look sparse")
        else:
            guidance.append("- This is a VERY LARGE panel - use large-scale patterns and bold elements")
        
        # Orientation-based guidance
        if ratio > 1.5:
            guidance.append("- LANDSCAPE orientation: favor horizontal patterns, stripes, or wide compositions")
        elif ratio < 0.67:
            guidance.append("- PORTRAIT orientation: favor vertical patterns, stripes, or tall compositions")
        else:
            guidance.append("- SQUARE/BALANCED orientation: centered compositions or uniform patterns work well")
        
        # Face-specific guidance
        if face_name in ["front", "back"]:
            guidance.append("- Primary visible face: this is a focal point, consider centering key visual elements")
        elif face_name in ["top", "bottom"]:
            guidance.append("- Top/bottom face: often viewed from above/below, ensure design looks good from that angle")
        elif face_name in ["left", "right"]:
            guidance.append("- Side panel: typically narrower, simpler patterns often work better")
        elif face_name == "body":
            guidance.append("- Cylindrical body: design will wrap around, ensure seamless horizontal tiling if possible")
        
        return "\n".join(guidance)
    
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
        
        # Generate scale and composition guidance
        scale_guidance = self.generate_scale_guidance(panel_width_mm, panel_height_mm, face_name)
        orientation = self.get_panel_orientation(panel_width_mm, panel_height_mm)
        panel_size_description = self.get_panel_size_description(panel_width_mm, panel_height_mm)
        
        # Log the generation details
        logger.info(f"[prompt-builder] Building prompt for {face_name} panel")
        logger.info(f"[prompt-builder] Dimensions: {panel_width_mm}mm × {panel_height_mm}mm ({panel_width_in:.2f}\" × {panel_height_in:.2f}\")")
        logger.info(f"[prompt-builder] Aspect ratio: {aspect_ratio}")
        logger.info(f"[prompt-builder] Size: {panel_size_description}, Orientation: {orientation}")
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
            scale_guidance=scale_guidance,
            orientation=orientation,
            panel_size_description=panel_size_description,
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
        """Build a simple prompt for basic texture generation without full context."""
        is_valid, error = self.validate_user_prompt(user_prompt)
        if not is_valid:
            raise ValueError(error)
        
        panel_width_in = self.mm_to_inches(panel_width_mm)
        panel_height_in = self.mm_to_inches(panel_height_mm)
        aspect_ratio = self.calculate_aspect_ratio(panel_width_mm, panel_height_mm)
        scale_guidance = self.generate_scale_guidance(panel_width_mm, panel_height_mm, face_name)
        orientation = self.get_panel_orientation(panel_width_mm, panel_height_mm)
        panel_size_description = self.get_panel_size_description(panel_width_mm, panel_height_mm)
        
        prompt = self.SIMPLE_TEMPLATE.format(
            face_name=face_name,
            panel_width_in=panel_width_in,
            panel_height_in=panel_height_in,
            panel_width_mm=int(panel_width_mm),
            panel_height_mm=int(panel_height_mm),
            aspect_ratio_lock=aspect_ratio,
            scale_guidance=scale_guidance,
            orientation=orientation,
            panel_size_description=panel_size_description,
            user_prompt=user_prompt,
        )
        
        return prompt
    
    def build_mockup_extraction_prompt(
        self,
        face_name: str,
        panel_width_mm: float,
        panel_height_mm: float,
    ) -> str:
        """Build prompt for extracting panels from 3D mockup (works for both create and edit flows)."""
        aspect_ratio = self.calculate_aspect_ratio(panel_width_mm, panel_height_mm)
        
        return self.MOCKUP_EXTRACTION_TEMPLATE.format(
            face_name=face_name,
            panel_width_mm=int(panel_width_mm),
            panel_height_mm=int(panel_height_mm),
            aspect_ratio_lock=aspect_ratio,
        )


# Global instance
panel_prompt_builder = PanelPromptBuilder()

