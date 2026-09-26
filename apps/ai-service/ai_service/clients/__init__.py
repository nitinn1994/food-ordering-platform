"""Outbound HTTP clients.

The only package allowed to import httpx (tests/test_boundaries.py,
Phase 14 plan.md section 3). It never imports the graph, the tools, the
model boundary or the HTTP routes: a client knows how to call a service and
nothing about who asked.
"""
