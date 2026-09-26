"""Structural guards for system-architecture.md section 4.1/4.2 and plan.md
section 10: the AI service never touches the commerce database, and this
phase adds no model provider, AI framework or outbound HTTP client.

Enforced by review only until now (section 8, gap 2); this makes the part of
it a test *can* check a failing test rather than a convention. It is still
not network or credential separation.

A later phase that legitimately adds, say, LangGraph or a Commerce API HTTP
client changes the allowlists here in the same reviewed change - that is
the point: the dependency becomes a visible decision, never a side effect.
"""

import ast
import re
import tomllib
from pathlib import Path

from ai_service.config import Settings

SERVICE_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = SERVICE_ROOT / "ai_service"

ALLOWED_RUNTIME = {"fastapi", "uvicorn", "pydantic"}
ALLOWED_DEV = {"pytest", "httpx", "jsonschema", "ruff", "mypy"}

# Top-level modules the service package must never import. Prefix entries
# (ending in "*") match any module starting with that name.
FORBIDDEN_IMPORTS = {
    # Databases and ORMs: the database is commerce-api's alone (section 4.1).
    "psycopg", "psycopg2", "asyncpg", "pg8000", "aiopg", "sqlalchemy",
    "sqlmodel", "databases", "sqlite3", "pymysql", "redis", "qdrant_client",
    # Model providers and AI frameworks: a later phase, and then only in llm/.
    "openai", "anthropic", "ollama", "mistralai", "cohere", "google",
    "transformers", "langchain*", "langgraph*", "langsmith",
    # Outbound HTTP: the Commerce API client is a later phase.
    "httpx", "requests", "aiohttp", "urllib3",
    # Test code never ships.
    "tests",
}  # fmt: skip

FORBIDDEN_SETTING_NAME = re.compile(r"database|(^|_)db(_|$)|_url$|api_key|secret|token")


def _requirement_name(requirement: str) -> str:
    match = re.match(r"[A-Za-z0-9._-]+", requirement)
    assert match, requirement
    return match.group(0).lower().replace("_", "-")


def _pyproject() -> dict[str, object]:
    return tomllib.loads((SERVICE_ROOT / "pyproject.toml").read_text())


def _is_forbidden(module: str) -> bool:
    top = module.split(".")[0]
    return any(
        top.startswith(entry[:-1]) if entry.endswith("*") else top == entry
        for entry in FORBIDDEN_IMPORTS
    )


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            modules.add(node.module)
    return modules


def test_runtime_dependencies_are_allowlisted() -> None:
    project = _pyproject()["project"]
    assert isinstance(project, dict)
    names = {_requirement_name(r) for r in project["dependencies"]}

    assert names <= ALLOWED_RUNTIME, names - ALLOWED_RUNTIME


def test_dev_dependencies_are_allowlisted() -> None:
    groups = _pyproject()["dependency-groups"]
    assert isinstance(groups, dict)
    assert set(groups) == {"dev"}
    names = {_requirement_name(r) for r in groups["dev"]}

    assert names <= ALLOWED_DEV, names - ALLOWED_DEV


def test_service_package_imports_nothing_forbidden() -> None:
    sources = sorted(PACKAGE_ROOT.rglob("*.py"))
    assert sources, "no service sources found"

    violations = [
        f"{path.relative_to(SERVICE_ROOT)}: {module}"
        for path in sources
        for module in sorted(_imported_modules(path))
        if _is_forbidden(module)
    ]

    assert violations == []


def test_forbidden_matcher_catches_prefixes_and_submodules() -> None:
    assert _is_forbidden("langchain_core.messages")
    assert _is_forbidden("langgraph.graph")
    assert _is_forbidden("sqlalchemy.orm")
    assert _is_forbidden("google.generativeai")
    assert not _is_forbidden("fastapi")
    assert not _is_forbidden("ai_service.config")


def test_no_setting_names_a_database_url_or_credential() -> None:
    offending = [n for n in Settings.model_fields if FORBIDDEN_SETTING_NAME.search(n)]

    assert offending == []
