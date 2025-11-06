"""
Chat v2: Multi‑agent orchestration entrypoint.

POST /api/chat/v2
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_user
from ..database import get_db
from ..llm.orchestrator import ChatOrchestrator


router = APIRouter(prefix="/api/chat/v2", tags=["Chat v2"])


class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


@router.post("", response_model=ChatResponse)
def chat_v2(
    payload: ChatRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        orch = ChatOrchestrator()
        msgs = [{"role": m.role, "content": m.content} for m in payload.messages]
        reply = orch.run_sync(msgs, current_user, db)
        return ChatResponse(reply=reply)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {e}")

