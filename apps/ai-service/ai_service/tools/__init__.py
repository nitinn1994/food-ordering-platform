"""The agent's tools: what it may ask commerce-api to do, and nothing else.

Framework-free on purpose (Phase 14 plan.md section 3, OD4): no httpx, no
LangGraph, no LangChain (tests/test_boundaries.py). A tool is a strict input
model, one Commerce API client call, and a ``ToolResult``. The graph turns
model tool calls into ``ToolService.execute`` calls and results back into
messages; the client does the HTTP.

The registry is a fixed allowlist of five tools. The model cannot add one,
name a URL or choose an HTTP method. commerce-api validates and decides
every operation (system-architecture.md section 5); nothing here checks
availability, quantities or prices.
"""
