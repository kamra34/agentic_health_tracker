from __future__ import annotations
from typing import Any, Dict, List, Optional, Callable

from .. import models
from ..config import settings
from sqlalchemy.orm import Session

from .agents import SQLAgent, AnalyticsAgent, ActionAgent, AdminAgent, BaseAgent
from .tools import summarize_schema, gather_user_context

try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore


class ChatOrchestrator:
    def __init__(self, model: Optional[str] = None):
        self.model = model or (settings.model_id or "gpt-4o")
        if OpenAI is None:
            raise RuntimeError("OpenAI client not available")
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY not configured")
        self.client = OpenAI(api_key=settings.openai_api_key)

    def build_system_prompt(self) -> str:
        return (
            "You are a helpful multi‑agent assistant for a weight tracking app. "
            "Agents: planner (decide), sql (query/aggregate), analytics (compute), responder (finalize). "
            "Use function tools for data access and analysis. Be concise and numeric, cite dates/units."
        )

    def build_context(self, db: Session, user: models.User) -> str:
        schema = summarize_schema()
        uctx = gather_user_context(db, user)
        return (
            "Context:\n"
            "- Database Schema:\n" + schema + "\n\n"
            "- User Data (scoped to current user):\n" + str(uctx)
        )

    def _aggregate_tools(self, agents: List[BaseAgent]) -> List[Dict[str, Any]]:
        tools: List[Dict[str, Any]] = []
        for a in agents:
            tools.extend(a.tools())
        return tools

    def _exec_tool(self, agents: List[BaseAgent], name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        for a in agents:
            res = a.execute(name, args)
            if res is not None:
                return {"tool": name, "ok": True, "data": res}
        return {"tool": name, "ok": False, "data": {"error": f"Unknown tool: {name}"}}

    def run_sync(self,
                 messages: List[Dict[str, str]],
                 user: models.User,
                 db: Session,
                 on_event: Optional[Callable[[str, str, Optional[Dict[str, Any]]], None]] = None,
                 ) -> str:
        # Build agents
        agents: List[BaseAgent] = [SQLAgent(db, user), AnalyticsAgent(db, user), ActionAgent(db, user)]
        if user.is_admin:
            agents.append(AdminAgent(db, user))
        tools = self._aggregate_tools(agents)
        sys_prompt = self.build_system_prompt()
        ctx = self.build_context(db, user)

        chat_msgs: List[Dict[str, Any]] = [
            {"role": "system", "content": sys_prompt},
            {"role": "system", "content": ctx},
        ]
        for m in messages[-12:]:
            chat_msgs.append({"role": m["role"], "content": m["content"]})

        # First completion with tools
        if on_event:
            on_event("planner", "planning", None)
        completion = self.client.chat.completions.create(
            model=self.model,
            messages=chat_msgs,
            temperature=0.2,
            tools=tools,
            tool_choice="auto",
        )
        msg = completion.choices[0].message
        # Simple tool loop (max 3)
        steps = 0
        while getattr(msg, "tool_calls", None) and steps < 3:
            steps += 1
            if on_event:
                on_event("planner", "tool_call", {"count": len(msg.tool_calls)})
            chat_msgs.append({"role": "assistant", "content": msg.content or "", "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
            for tc in msg.tool_calls:
                name = tc.function.name
                import json as _json
                try:
                    args = _json.loads(tc.function.arguments or "{}")
                except Exception:
                    args = {}
                # classify tool -> agent name
                agent_name = "sql"
                if name.startswith("user_") and ("weight_change" in name):
                    agent_name = "analytics"
                elif name.startswith("user_") and ("create_" in name or "update_" in name or "delete_" in name):
                    agent_name = "action"
                elif name.startswith("admin_"):
                    agent_name = "admin"
                if on_event:
                    on_event(agent_name, name, None)
                result = self._exec_tool(agents, name, args)
                chat_msgs.append({"role": "tool", "tool_call_id": tc.id, "name": name, "content": str(result)})
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=chat_msgs,
                temperature=0.2,
            )
            msg = completion.choices[0].message

        if on_event:
            on_event("responder", "finalizing", None)
        return msg.content or ""
