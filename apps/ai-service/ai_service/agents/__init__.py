"""Agent orchestration (LangGraph).

The only package that imports langgraph (tests/test_boundaries.py). It never
imports FastAPI: HTTP lives in ``api/``. It never holds commerce state (cart,
prices, order status, availability): that is commerce-api's alone
(system-architecture.md section 4.2), and it will be reached over HTTP only.
"""
