"""
Chat v2: Multi‑agent orchestration entrypoint.

POST /api/chat/v2
"""
from typing import List, Dict, Any, Optional
import threading
import time
import uuid
from datetime import datetime
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_user
from ..database import get_db
from ..llm.orchestrator import ChatOrchestrator
from ..config import settings
from jose import jwt, JWTError


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


# -------- Lightweight Task API (async orchestration with live agent events) --------

class TaskStart(BaseModel):
    messages: List[ChatMessage]


class TaskStatus(BaseModel):
    status: str
    reply: Optional[str] = None
    error: Optional[str] = None
    events: List[Dict[str, Any]] = []


_tasks: Dict[str, Dict[str, Any]] = {}


def _new_task() -> str:
    tid = str(uuid.uuid4())
    _tasks[tid] = {
        "status": "pending",
        "reply": None,
        "error": None,
        "events": [],
        "created": time.time(),
    }
    return tid


def _task_event(task_id: str, agent: str, label: str, detail: Optional[Dict[str, Any]] = None):
    rec = _tasks.get(task_id)
    if not rec:
        return
    rec["events"].append({
        "ts": datetime.utcnow().isoformat() + "Z",
        "agent": agent,
        "label": label,
        "detail": detail or {},
    })


def _task_set(task_id: str, **kwargs):
    rec = _tasks.get(task_id)
    if not rec:
        return
    rec.update(kwargs)


@router.post("/task", response_model=Dict[str, str])
def start_chat_task(
    payload: TaskStart,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task_id = _new_task()

    def runner():
        _task_set(task_id, status="running")
        try:
            orch = ChatOrchestrator()
            msgs = [{"role": m.role, "content": m.content} for m in payload.messages]

            def on_event(agent: str, label: str, detail: Optional[Dict[str, Any]] = None):
                _task_event(task_id, agent, label, detail)

            # initial event to update UI instantly
            _task_event(task_id, "planner", "starting", {})
            reply = orch.run_sync(msgs, current_user, db, on_event=on_event)
            _task_set(task_id, status="done", reply=reply)
        except Exception as e:
            _task_set(task_id, status="error", error=str(e))

    threading.Thread(target=runner, daemon=True).start()
    return {"task_id": task_id}


@router.get("/tasks/{task_id}", response_model=TaskStatus)
def get_chat_task_status(
    task_id: str,
    current_user: models.User = Depends(get_current_user),
):
    rec = _tasks.get(task_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskStatus(status=rec.get("status"), reply=rec.get("reply"), error=rec.get("error"), events=rec.get("events", []))


@router.get("/stream/{task_id}")
async def stream_chat_task(
    task_id: str,
    token: Optional[str] = Query(None, description="JWT token for SSE auth (use access_token)"),
    db: Session = Depends(get_db),
):
    from fastapi.responses import StreamingResponse

    if task_id not in _tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    # Authenticate via token query param (EventSource cannot set headers)
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")

    async def event_generator():
        last_idx = 0
        # Send initial ping
        yield f"event: ping\ndata: {{}}\n\n"
        while True:
            rec = _tasks.get(task_id)
            if not rec:
                break
            events = rec.get("events", [])
            while last_idx < len(events):
                ev = events[last_idx]
                last_idx += 1
                yield f"event: agent\ndata: {json.dumps(ev)}\n\n"
            if rec.get("status") in ("done", "error"):
                # send final
                payload = {"status": rec.get("status"), "reply": rec.get("reply"), "error": rec.get("error")}
                yield "event: status\ndata: " + json.dumps(payload) + "\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
