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
            "Agents: planner (decide), sql (query/aggregate), analytics (compute), action (mutations), admin (org/meta), responder (finalize). "
            "Use function tools for database reads/writes only when the user asks for data-driven help. "
            "Do NOT call admin tools unless the user explicitly asks about users, accounts, tables, schema, backups, migrations, or admin/system topics. "
            "For casual greetings or small talk, respond briefly and do not use tools. "
            "When creating users via admin_create_user, proceed if name and password are provided; email is optional. Do not perform unrelated actions. "
            "If the user confirms an action with 'yes', 'okay', 'go ahead', etc., and your previous turn proposed that specific action (e.g., cancel a target), you MUST perform it using the appropriate user_* tool and then confirm the outcome. "
            "For admin deletions where the user specifies a name (e.g., 'delete user bobo'), first resolve the user by name via admin_get_user_by_name or directly call admin_delete_user_by_name. Only use admin_delete_user when you have a user_id. "
            "When cancelling a target, prefer setting status to 'cancelled' using user_update_target (with target_id) or user_update_active_target, rather than deleting the record. "
            "To grant or revoke admin privileges, resolve the user (by name or id) and call admin_update_user with is_admin set to true/false, then verify via admin_list_users. "
            "To promote all non-admin users, prefer calling admin_promote_all_non_admins (admin) and then verify results via admin_list_users. "
            "Do not ask for confirmation. When the user requests an action, immediately perform it by calling the appropriate tools in this turn. "
            "If you cannot perform the action due to a missing tool (e.g., no admin_update_user available), say explicitly which tool is missing and do not claim success. "
            "Never say 'I will proceed' without making the tool call. Always ground answers in tool outputs. "
            "When answering with data, be concise and numeric; cite dates/units and table/field names when helpful. "
            "When you compute numeric metrics, include a final fenced JSON block (```json ... ```) with a small schema so the app can render it. For averages, use: {\"type\":\"metrics\", \"per_day\": number, \"per_week\": number, \"per_month\": number, \"delta_kg\": number, \"days\": number, \"period\": {\"from\": \"YYYY-MM-DD\", \"to\": \"YYYY-MM-DD\"}}. Avoid LaTeX formatting in text."
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
        # Intent gating: include only relevant agents to reduce off-topic tool calls
        last_user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        last_assistant_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "assistant"), "")
        # Combine a small window of recent user messages to preserve ongoing intent (e.g., follow-ups like "password is ...")
        recent_user_msgs = " ".join([m["content"] for m in messages if m.get("role") == "user"][ -3: ])
        _lu = (recent_user_msgs or last_user_msg or "").lower()
        _la = (last_assistant_msg or "").lower()

        admin_intent = any(k in _lu for k in [
            "admin", "user ", "users", "accounts", "account",
            "schema", "table", "tables", "database", "db",
            "backup", "migrate", "migration", "org", "organization",
            "create user", "new user", "set password", "password",
            "make admin", "admin privileges", "promote", "elevate",
            "revoke admin", "remove admin", "remove admin privileges", "demote", "unadmin"
        ])
        weight_intent = any(k in _lu for k in [
            "weight", "weigh", "bmi", "target", "goal", "trend", "streak", "log", "record", "kg", "lbs"
        ])
        # Direct action verbs and synonyms from the user
        action_verbs = [
            "create", "add", "update", "delete", "set", "cancel", "remove",
            "grant", "promote", "make admin", "admin privileges", "elevate",
            "revoke", "demote", "remove admin", "remove admin privileges", "unadmin"
        ]
        action_intent = any(v in _lu for v in action_verbs) and (weight_intent or "target" in _lu or "user" in _lu or "users" in _lu)

        # Confirmation follow-up to an assistant's proposed action (e.g., user: "yes")
        confirmation_phrases = ["yes", "yep", "sure", "ok", "okay", "go ahead", "please do", "confirm", "do it", "proceed"]
        assistant_proposed_action = any(v in _la for v in [
            "cancel", "delete", "update", "create", "set", "grant", "promote", "make admin", "admin privileges", "elevate",
            "revoke", "demote", "remove admin", "remove admin privileges", "unadmin"
        ]) and any(t in _la for t in ["target", "weight", "user", "users"])
        is_confirmation = any(p in _lu for p in confirmation_phrases)
        if assistant_proposed_action and is_confirmation:
            action_intent = True
            # infer weight intent if the proposal mentioned targets/weights
            if ("target" in _la) or ("weight" in _la):
                weight_intent = True
            # infer admin intent if the proposal mentioned users/admin privileges
            if ("user" in _la or "users" in _la) and any(k in _la for k in [
                "admin", "make admin", "admin privileges", "revoke", "demote", "remove admin", "unadmin"
            ]):
                admin_intent = True

        agents: List[BaseAgent] = []
        if weight_intent or action_intent:
            # Keep SQL/Analytics available when taking actions over targets/weights
            agents.extend([SQLAgent(db, user), AnalyticsAgent(db, user)])
        if action_intent:
            agents.append(ActionAgent(db, user))
        if user.is_admin and admin_intent:
            agents.append(AdminAgent(db, user))
        tools = self._aggregate_tools(agents)
        sys_prompt = self.build_system_prompt()
        ctx = self.build_context(db, user)

        # Deterministic admin grant/revoke execution for clear commands
        if user.is_admin and admin_intent and any(k in _lu for k in [
            "make admin", "grant admin", "promote", "admin privileges", "elevate", "revoke", "demote", "remove admin", "unadmin"
        ]):
            # Try to extract a username after 'user ' or last token as fallback
            import re
            target_name = None
            m = re.search(r"user\s+([A-Za-z0-9_\-\.]+)", _lu)
            if m:
                target_name = m.group(1)
            if not target_name:
                # Try simple 'from user NAME' or 'for NAME'
                m2 = re.search(r"(?:from|for)\s+([A-Za-z0-9_\-\.]+)", _lu)
                if m2:
                    target_name = m2.group(1)
            # As a last resort, use last word
            if not target_name:
                parts = [p for p in _lu.replace("\n"," ").split(" ") if p]
                if parts:
                    target_name = parts[-1].strip(".,:;!?")
            if target_name:
                revoke = any(k in _lu for k in ["revoke", "demote", "remove admin", "unadmin"])
                grant = any(k in _lu for k in ["make admin", "promote", "grant admin", "admin privileges", "elevate"])
                if revoke or grant:
                    try:
                        admin_agent = AdminAgent(db, user)
                        info = admin_agent.execute("admin_get_user_by_name", {"name": target_name})
                        if not info or info.get("error"):
                            return f"Missing user: '{target_name}'."
                        uid = int(info.get("id"))
                        upd = admin_agent.execute("admin_update_user", {"user_id": uid, "is_admin": bool(grant)})
                        if not upd or upd.get("error"):
                            return f"Could not update admin for '{target_name}': {upd.get('error') if upd else 'unknown error'}"
                        flag = "Yes" if upd.get("is_admin") else "No"
                        return f"Updated admin for '{target_name}'. Admin: {flag}."
                    except Exception as _e:
                        return f"Could not perform admin update: {_e}"

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
            tool_choice=("required" if tools else "none"),
        )
        msg = completion.choices[0].message
        # Enforce grounding: if the model produced a direct answer without calling tools,
        # require a second pass that MUST utilize tools to fetch real data.
        # Only enforce tool usage when the user isn't making a casual/social request
        smalltalk_phrases = [
            "hi", "hello", "hey", "how are you", "good morning", "good evening",
            "thanks", "thank you", "yo", "sup", "what's up", "bye", "goodbye"
        ]
        is_smalltalk = any(p in _lu for p in smalltalk_phrases) and len(_lu) <= 60
        # Also, if no relevant agents are active (no clear intent), do not force tools
        if not getattr(msg, "tool_calls", None) and not is_smalltalk and agents:
            if on_event:
                on_event("planner", "force_tools", None)
            chat_msgs.append({
                "role": "assistant",
                "content": msg.content or "",
            })
            chat_msgs.append({
                "role": "system",
                "content": (
                    "Your previous draft was not grounded in tool output. "
                    "You MUST call at least one appropriate tool now before answering. "
                    "If the user asked to grant/revoke admin rights for NAME, first resolve NAME via admin_get_user_by_name and then call admin_update_user with is_admin set to true/false. "
                    "Do not acknowledge or promise actions without actually calling tools."
                ),
            })
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=chat_msgs,
                temperature=0.1,
                tools=tools,
                tool_choice=("required" if tools else "none"),
            )
            msg = completion.choices[0].message
        # Simple tool loop (max 6)
        steps = 0
        tool_used = False
        while getattr(msg, "tool_calls", None) and steps < 6:
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
                if name.startswith("user_") and ("weight_change" in name or "avg_weight_change" in name or "streak" in name):
                    agent_name = "analytics"
                elif name.startswith("user_") and ("create_" in name or "update_" in name or "delete_" in name):
                    agent_name = "action"
                elif name.startswith("admin_"):
                    agent_name = "admin"
                if on_event:
                    on_event(agent_name, name, None)
                result = self._exec_tool(agents, name, args)
                chat_msgs.append({"role": "tool", "tool_call_id": tc.id, "name": name, "content": str(result)})
                tool_used = True
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=chat_msgs,
                temperature=0.2,
            )
            msg = completion.choices[0].message

        # Heuristic fallback: if admin intent and no tool was used (model still refused), attempt a minimal name-based admin update
        if user.is_admin and not tool_used and admin_intent:
            target_name: Optional[str] = None
            intent = "unknown"
            lu = _lu
            # extract name after 'user '
            if "user " in lu:
                try:
                    after = lu.split("user ", 1)[1].strip()
                    target_name = after.split()[0].strip(".,:;!?")
                except Exception:
                    target_name = None
            if not target_name:
                # fallback: last token
                parts = [p for p in lu.replace("\n"," ").split(" ") if p]
                if parts:
                    target_name = parts[-1].strip(".,:;!?")
            if any(k in lu for k in ["revoke", "demote", "remove admin", "unadmin"]):
                intent = "revoke"
            elif any(k in lu for k in ["make admin", "promote", "grant", "admin privileges"]):
                intent = "grant"
            if target_name and intent in ("revoke", "grant"):
                try:
                    # Build minimal agent set with AdminAgent only
                    admin_agent = AdminAgent(db, user)
                    res1 = admin_agent.execute("admin_get_user_by_name", {"name": target_name}) or {"error": "User not found"}
                    if res1.get("error"):
                        msg = type("obj", (), {"content": f"Sorry, I couldn't find a user named '{target_name}'."})
                    else:
                        uid = int(res1.get("id"))
                        upd = admin_agent.execute("admin_update_user", {"user_id": uid, "is_admin": intent == "grant"}) or {}
                        if upd.get("error"):
                            msg = type("obj", (), {"content": f"Could not update admin status for '{target_name}': {upd.get('error')}"})
                        else:
                            new_flag = "Yes" if (upd.get("is_admin") is True or intent == "grant") else "No"
                            msg = type("obj", (), {"content": f"Updated admin for '{target_name}'. Admin: {new_flag}."})
                except Exception:
                    pass

        if on_event:
            on_event("responder", "finalizing", None)
        return msg.content or ""
