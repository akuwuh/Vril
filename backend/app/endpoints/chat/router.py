from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.integrations.gemini import gemini_chat_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatRequest(BaseModel):
    prompt: str
    task_type: str = "default"
    response_schema: Optional[Dict[str, Any]] = None

@router.post("/generate")
async def generate_chat_response(request: ChatRequest):
    """
    Generate a chat response using Gemini.
    
    - **prompt**: The input text for the model.
    - **task_type**: Optimization preset (default, extraction, creative, analysis).
    - **response_schema**: Optional JSON schema for structured output.
    """
    try:
        response = await gemini_chat_service.generate_content(
            prompt=request.prompt,
            task_type=request.task_type,
            response_schema=request.response_schema
        )
        
        if "error" in response:
            raise HTTPExgitception(status_code=500, detail=response["error"])
            
        return response
    except Exception as e:
        logger.error(f"Chat generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

