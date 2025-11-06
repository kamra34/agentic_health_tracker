"""
LLM multi‑agent orchestration package.

Agents:
- Planner: decides steps (implicit in the LLM prompt)
- SQLAgent: structured read access to DB (weights/targets)
- AnalyticsAgent: derived metrics (deltas, BMI/body composition estimates)
- ActionAgent: mutations (optional, reuse existing REST for heavy ops)

The orchestrator aggregates agent tools and drives an OpenAI function‑calling loop.
"""

