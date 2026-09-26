"""Structural guards for system-architecture.md section 4.1/4.2: the AI
service never touches the commerce database, and admits each AI framework,
the outbound HTTP client and every internal layer only where a phase put it.

Phase 13 (docs/features/phase-13-langgraph-agent-foundation/plan.md section
18) admitted exactly two AI packages, each confined to a location: langgraph
only under ``ai_service/agents/`` and langchain_core only under
``ai_service/agents/`` and ``ai_service/llm/``. The parts of both that belong
to later phases (tools, prebuilt agents, checkpointers) stay forbidden.

Enforced by review only until now (section 8, gap 2); this makes the part of
it a test *can* check a failing test rather than a convention. It is still
not network or credential separation.

Phase 14 (docs/features/phase-14-ai-tool-calling/plan.md sections 3, 24,
OD3, OD4, OD9) admitted httpx as a runtime dependency, but only under
``ai_service/clients/``, the one package that speaks HTTP. ``tools/`` stays
framework-free and ``agents/`` never reaches the client directly. The
contract generator is a dev dependency that service code never imports.
Tool definitions (``langchain_core.tools``) and ToolNode
(``langgraph.prebuilt``) stay forbidden: tools are this service's own
registry. One URL setting, ``commerce_api_url``, is exempt from the setting
name rule by name.

Phase 15 (docs/features/phase-15-ai-ui-commands/plan.md sections 5, 9 and
18) added ``ui_commands/``, the presentation tools. They must never reach
commerce-api: the package imports neither the Commerce client nor the
Commerce tool registry, only the generated contracts and the shared tool
error vocabulary (``tools/results.py``). ``tools/`` never imports it back:
the two registries stay separate.

A later phase that legitimately adds a dependency or lifts a ban changes the
allowlists here in the same reviewed change - that is the point: the
dependency becomes a visible decision, never a side effect.
"""

import ast
import re
import tomllib
from pathlib import Path

from ai_service.config import Settings

SERVICE_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = SERVICE_ROOT / "ai_service"

ALLOWED_RUNTIME = {
    "fastapi",
    "uvicorn",
    "pydantic",
    "langgraph",
    "langchain-core",
    "httpx",
}
ALLOWED_DEV = {"pytest", "jsonschema", "ruff", "mypy", "datamodel-code-generator"}

# Modules the service package must never import. A plain entry matches that
# module and its submodules ("langgraph.prebuilt" matches
# "langgraph.prebuilt.tool_node"). An entry ending in "*" matches any
# top-level module starting with that name, except PREFIX_EXCEPTIONS.
FORBIDDEN_IMPORTS = {
    # Databases and ORMs: the database is commerce-api's alone (section 4.1).
    "psycopg", "psycopg2", "asyncpg", "pg8000", "aiopg", "sqlalchemy",
    "sqlmodel", "databases", "sqlite3", "pymysql", "redis", "qdrant_client",
    # Model providers: a later phase, and then only in llm/.
    "openai", "anthropic", "ollama", "mistralai", "cohere", "google",
    "transformers",
    # LangChain beyond langchain_core: the full package, community and
    # provider integrations (langchain_openai, ...). And langsmith, the
    # tracing client: installed only because langchain-core requires it.
    "langchain", "langchain_*", "langsmith",
    # The LangGraph and LangChain parts that belong to later phases: prebuilt
    # agents and ToolNode (tool loops), checkpointers (memory), the platform
    # SDK, and tool definitions.
    "langgraph.prebuilt", "langgraph.checkpoint", "langgraph_*",
    "langchain_core.tools",
    # LangChain's serializer/deserializer (load, loads, dumpd): it rebuilds
    # objects from JSON, a risky surface for untrusted data (security review
    # S2). Nothing needs it.
    "langchain_core.load",
    # Outbound HTTP other than httpx, which LOCATION_SCOPED confines to
    # clients/ (Phase 14): one HTTP client, in one place.
    "requests", "aiohttp", "urllib3",
    # The contract generator runs from scripts/ only; its output is plain
    # Pydantic (Phase 14, OD3).
    "datamodel_code_generator",
    # Test code never ships.
    "tests",
}  # fmt: skip

# The one "langchain_" package a prefix entry must not catch; it is admitted,
# but only where LOCATION_SCOPED allows it.
PREFIX_EXCEPTIONS = {"langchain_core"}

# Top-level modules allowed only under these ai_service/ subpackages.
LOCATION_SCOPED = {
    "langgraph": {"agents"},
    "langchain_core": {"agents", "llm"},
    "httpx": {"clients"},
}

# ai_service/ subpackage -> the ai_service subpackages it must not import
# (Phase 14 plan.md section 3). The graph reaches commerce-api only through
# tools; tools and the client never reach back up; generated contracts
# depend on nothing of ours.
LAYER_FORBIDDEN = {
    "agents": {"clients"},
    "tools": {"agents", "api", "llm", "ui_commands"},
    "clients": {"agents", "api", "llm", "tools", "ui_commands"},
    "contracts": {
        "agents", "api", "clients", "core", "llm", "schemas", "tools", "ui_commands",
    },
    "ui_commands": {"agents", "api", "clients", "core", "llm", "schemas"},
}  # fmt: skip

# The only modules of ai_service/tools/ that ui_commands/ may import: the
# shared error codes and messages. Never tools/registry.py or
# tools/service.py, which reach the Commerce client (Phase 15, AC7).
UI_COMMANDS_ALLOWED_TOOLS_IMPORTS = {"ai_service.tools.results"}

FORBIDDEN_SETTING_NAME = re.compile(r"database|(^|_)db(_|$)|_url$|api_key|secret|token")
# Exempt by exact name, never by pattern: the Commerce API's base URL
# (Phase 14, OD9). Any other *_url setting still fails.
ALLOWED_URL_SETTINGS = {"commerce_api_url"}


def _requirement_name(requirement: str) -> str:
    match = re.match(r"[A-Za-z0-9._-]+", requirement)
    assert match, requirement
    return match.group(0).lower().replace("_", "-")


def _pyproject() -> dict[str, object]:
    return tomllib.loads((SERVICE_ROOT / "pyproject.toml").read_text())


def _matches(module: str, entry: str) -> bool:
    if entry.endswith("*"):
        top = module.split(".")[0]
        return top.startswith(entry[:-1]) and top not in PREFIX_EXCEPTIONS
    return module == entry or module.startswith(entry + ".")


def _is_forbidden(module: str) -> bool:
    return any(_matches(module, entry) for entry in FORBIDDEN_IMPORTS)


def _is_misplaced(relative_path: Path, module: str) -> bool:
    """True if ``module`` is location-scoped and ``relative_path`` (relative
    to ai_service/) is outside every subpackage allowed to import it."""
    allowed = LOCATION_SCOPED.get(module.split(".")[0])
    if allowed is None:
        return False
    return len(relative_path.parts) < 2 or relative_path.parts[0] not in allowed


def _crosses_layer(relative_path: Path, module: str) -> bool:
    """True if ``module`` is an ai_service subpackage that the subpackage
    holding ``relative_path`` (relative to ai_service/) must not import."""
    parts = module.split(".")
    if len(parts) < 2 or parts[0] != "ai_service" or len(relative_path.parts) < 2:
        return False
    return parts[1] in LAYER_FORBIDDEN.get(relative_path.parts[0], set())


def _is_forbidden_setting(name: str) -> bool:
    return name not in ALLOWED_URL_SETTINGS and bool(
        FORBIDDEN_SETTING_NAME.search(name)
    )


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(), filename=str(path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            modules.add(node.module)
            # "from langgraph import prebuilt" imports langgraph.prebuilt.
            modules.update(f"{node.module}.{alias.name}" for alias in node.names)
    return modules


def test_runtime_dependencies_are_allowlisted() -> None:
    project = _pyproject()["project"]
    assert isinstance(project, dict)
    names = {_requirement_name(r) for r in project["dependencies"]}

    assert names == ALLOWED_RUNTIME, names ^ ALLOWED_RUNTIME


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


def test_location_scoped_modules_stay_in_place() -> None:
    sources = sorted(PACKAGE_ROOT.rglob("*.py"))

    violations = [
        f"{path.relative_to(SERVICE_ROOT)}: {module}"
        for path in sources
        for module in sorted(_imported_modules(path))
        if _is_misplaced(path.relative_to(PACKAGE_ROOT), module)
    ]

    assert violations == []


# Constructors of the model, the graph and the agent service. Called only
# inside functions (create_app, build_chat_model, ...), never at import time:
# a module-level instance would be shared by every app and every test
# (plan.md section 16, AC12).
IMPORT_TIME_FORBIDDEN_CALLS = {
    "build_chat_model",
    "build_agent_graph",
    "AgentService",
    "SimulatedChatModel",
    # Phase 14: one HTTP client per app, closed on shutdown (plan.md
    # section 9, OD13), and one tool registry and service per app.
    "AsyncClient",
    "build_commerce_http_client",
    "CommerceClient",
    "build_tool_registry",
    "ToolService",
    # Phase 15: one presentation registry and service per app.
    "build_presentation_registry",
    "PresentationToolService",
}


def _import_time_calls(tree: ast.AST) -> set[str]:
    """Names called outside any function body (module or class level)."""
    names: set[str] = set()
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.Lambda):
            continue
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name):
                names.add(func.id)
            elif isinstance(func, ast.Attribute):
                names.add(func.attr)
        names |= _import_time_calls(node)
    return names


def test_nothing_is_built_at_import_time() -> None:
    violations = [
        f"{path.relative_to(SERVICE_ROOT)}: {name}"
        for path in sorted(PACKAGE_ROOT.rglob("*.py"))
        for name in sorted(_import_time_calls(ast.parse(path.read_text())))
        if name in IMPORT_TIME_FORBIDDEN_CALLS
    ]

    assert violations == []


def test_import_time_call_scan() -> None:
    tree = ast.parse(
        "graph = build_agent_graph(model)\n"
        "class C:\n    service = AgentService(graph)\n"
        "def f():\n    return build_chat_model()\n"
        "async def g():\n    return SimulatedChatModel()\n"
    )

    assert _import_time_calls(tree) == {"build_agent_graph", "AgentService"}


def test_forbidden_matcher_catches_prefixes_and_submodules() -> None:
    assert _is_forbidden("sqlalchemy.orm")
    assert _is_forbidden("google.generativeai")
    assert _is_forbidden("langchain")
    assert _is_forbidden("langchain.chat_models")
    assert _is_forbidden("langchain_openai")
    assert _is_forbidden("langchain_community.chat_models")
    assert _is_forbidden("langsmith")
    assert _is_forbidden("langgraph.prebuilt")
    assert _is_forbidden("langgraph.prebuilt.tool_node")
    assert _is_forbidden("langgraph.checkpoint.memory")
    assert _is_forbidden("langgraph_sdk")
    assert _is_forbidden("langchain_core.tools")
    assert _is_forbidden("langchain_core.tools.base")
    assert _is_forbidden("langchain_core.load")
    assert _is_forbidden("langchain_core.load.load")
    assert not _is_forbidden("fastapi")
    assert not _is_forbidden("ai_service.config")
    assert not _is_forbidden("langgraph")
    assert not _is_forbidden("langgraph.graph")
    assert not _is_forbidden("langchain_core.messages")
    assert not _is_forbidden("langchain_core.language_models")
    assert not _is_forbidden("langchain_core.toolkit_lookalike")
    assert not _is_forbidden("langchain_core.loader_lookalike")
    assert _is_forbidden("requests")
    assert _is_forbidden("datamodel_code_generator.format")
    # Location-scoped instead (test_location_matcher).
    assert not _is_forbidden("httpx")


def test_from_import_names_are_scanned(tmp_path: Path) -> None:
    source = tmp_path / "module.py"
    source.write_text(
        "from langgraph import prebuilt\nfrom langchain_core import tools\n"
    )

    modules = _imported_modules(source)

    assert {"langgraph.prebuilt", "langchain_core.tools"} <= modules
    assert all(_is_forbidden(m) for m in ("langgraph.prebuilt", "langchain_core.tools"))


def test_location_matcher() -> None:
    assert not _is_misplaced(Path("agents/graph.py"), "langgraph.graph")
    assert not _is_misplaced(Path("agents/nodes.py"), "langchain_core.messages")
    assert not _is_misplaced(Path("llm/simulated.py"), "langchain_core.messages")
    assert _is_misplaced(Path("llm/simulated.py"), "langgraph.graph")
    assert _is_misplaced(Path("api/agent.py"), "langgraph")
    assert _is_misplaced(Path("api/agent.py"), "langchain_core.messages")
    assert _is_misplaced(Path("main.py"), "langgraph.graph")
    assert _is_misplaced(Path("core/errors.py"), "langchain_core")
    assert not _is_misplaced(Path("api/agent.py"), "fastapi")
    assert not _is_misplaced(Path("clients/commerce/client.py"), "httpx")
    assert _is_misplaced(Path("tools/service.py"), "httpx")
    assert _is_misplaced(Path("agents/nodes.py"), "httpx")
    assert _is_misplaced(Path("main.py"), "httpx")
    assert _is_misplaced(Path("tools/registry.py"), "langchain_core.messages")
    assert _is_misplaced(Path("tools/registry.py"), "langgraph.graph")
    assert _is_misplaced(Path("clients/commerce/client.py"), "langgraph")


def test_internal_layers_are_respected() -> None:
    sources = sorted(PACKAGE_ROOT.rglob("*.py"))

    violations = [
        f"{path.relative_to(SERVICE_ROOT)}: {module}"
        for path in sources
        for module in sorted(_imported_modules(path))
        if _crosses_layer(path.relative_to(PACKAGE_ROOT), module)
    ]

    assert violations == []


def test_layer_matcher() -> None:
    assert _crosses_layer(Path("agents/nodes.py"), "ai_service.clients.commerce")
    assert _crosses_layer(Path("tools/service.py"), "ai_service.agents.graph")
    assert _crosses_layer(Path("clients/commerce/client.py"), "ai_service.tools")
    assert _crosses_layer(Path("contracts/api_contracts.py"), "ai_service.core")
    assert not _crosses_layer(Path("agents/nodes.py"), "ai_service.tools.service")
    assert not _crosses_layer(Path("tools/service.py"), "ai_service.clients")
    assert not _crosses_layer(Path("tools/schemas.py"), "ai_service.contracts")
    assert not _crosses_layer(
        Path("clients/commerce/client.py"), "ai_service.core.request_context"
    )
    # main.py is the composition root: it wires every layer.
    assert not _crosses_layer(Path("main.py"), "ai_service.clients.commerce")


def test_no_setting_names_a_database_url_or_credential() -> None:
    offending = [n for n in Settings.model_fields if _is_forbidden_setting(n)]

    assert offending == []


def test_setting_name_rule_exempts_only_the_commerce_api_url() -> None:
    assert not _is_forbidden_setting("commerce_api_url")
    assert not _is_forbidden_setting("commerce_api_timeout_seconds")
    assert _is_forbidden_setting("database_url")
    assert _is_forbidden_setting("other_url")
    assert _is_forbidden_setting("commerce_api_callback_url")
    assert _is_forbidden_setting("commerce_api_token")
    assert _is_forbidden_setting("commerce_api_key")


def test_ui_commands_never_reach_the_commerce_tools_or_client() -> None:
    sources = sorted((PACKAGE_ROOT / "ui_commands").rglob("*.py"))
    assert sources, "no ui_commands sources found"

    tools_imports = {
        module
        for path in sources
        for module in _imported_modules(path)
        if module == "ai_service.tools" or module.startswith("ai_service.tools.")
    }
    reaches_commerce = {
        module
        for path in sources
        for module in _imported_modules(path)
        if module.startswith(("ai_service.clients", "httpx"))
    }

    # "from ai_service.tools.results import X" also records
    # ai_service.tools.results.X: only the results module itself counts.
    assert {m for m in tools_imports if m.count(".") <= 2} <= (
        UI_COMMANDS_ALLOWED_TOOLS_IMPORTS
    )
    assert reaches_commerce == set()


def test_ui_commands_layer_matcher() -> None:
    assert _crosses_layer(Path("ui_commands/service.py"), "ai_service.clients")
    assert _crosses_layer(Path("ui_commands/service.py"), "ai_service.agents.nodes")
    assert _crosses_layer(Path("tools/service.py"), "ai_service.ui_commands")
    assert not _crosses_layer(
        Path("ui_commands/service.py"), "ai_service.contracts.ui_commands"
    )
    assert not _crosses_layer(Path("agents/nodes.py"), "ai_service.ui_commands")
