# Copilot / AI agent instructions for AutoAccessoriesPOS

Purpose: give AI coding agents the minimum, focused context to be productive working on this repository.

- **Big picture:** Backend is a FastAPI app at src/backend/main.py serving the SPA in `src/frontend` (mounted as static files). The app uses a custom SQLite-based `DatabaseManager` (src/backend/core/database.py) that auto-creates the DB and tables on startup and stores files under the OS app-data path (Windows: `%APPDATA%/AutoAccessoriesPOS/database/pos_main.db`). Desktop packaging lives under `src/desktop` and packaging scripts under `scripts/`.

- **Run / dev commands (Windows PowerShell):**
  - From project root run backend (with docs):
    ```powershell
    Set-Item Env:ENV development
    cd src/backend
    python main.py
    # or using uvicorn directly
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
    ```
  - The API docs are enabled when `ENV=development` and appear at `/docs`.

- **Key files to inspect:**
  - `src/backend/main.py` — FastAPI app, router registration, static mount.
  - `src/backend/core/database.py` — single authoritative DatabaseManager (auto-creates 52 tables, backup/restore, connection pooling). Avoid changing DB layout without running migrations.
  - `src/backend/api/*.py` — REST endpoints (auth, products, sales, pos, etc.). See `src/backend/api/auth.py` for patterns (dependency-injected `get_current_user`, permission checks).
  - `src/frontend` — static frontend served by FastAPI; editing here affects production UI directly when backend is serving files.
  - `scripts/` and `src/desktop` — packaging and installer flows (portable build, NSIS scripts).

- **Project-specific patterns & conventions:**
  - Permissions use dependency injection: check `Depends(require_permission("..."))` in API routers (see `src/backend/api/auth.py`). Mimic this pattern when adding endpoints.
  - Database access uses `get_database_manager()` and `db_manager.get_cursor()` context manager — prefer these rather than raw sqlite3 connections.
  - Logging and audit: use `core.logger.audit_log` or `setup_logging()` in `core/logger.py` to produce consistent logs.
  - Roles follow localized identifiers (e.g. 'malik', 'munshi'); role config lives in `src/backend/core/auth.py` — keep role names stable to avoid breaking permission checks.

- **Integrations & external dependencies:**
  - Hardware integrations (printers, scanners, cash drawer) live in `src/backend/integrations` and `drivers/` — changes here may affect native packaging.
  - Packaging relies on pywebview / pywin32 for Windows desktop builds; see `requirements.txt` for versions to match.

- **Testing / debugging hints:**
  - There are no explicit test runners in the repo root; run modules directly for integration checks. To debug endpoints, start the backend with `ENV=development` and use `/docs` or an API client.
  - Database is created under user app-data; to reuse/reset state remove `%APPDATA%/AutoAccessoriesPOS/database/`.

- **What to avoid / warnings for an AI agent:**
  - The DB schema is large and used across many modules. Do not refactor table columns or names without updating all `core`, `repositories`, and `api` callers and creating migrations (alembic is present in `src/backend/migrations`).
  - Changes to `src/frontend` may be immediately served by the backend; ensure UI and API contract compatibility.

- **Quick examples for common edits:**
  - Add an auth-protected endpoint:
    - follow `src/backend/api/auth.py` pattern, use `APIRouter`, `Depends(get_current_user)` and `Depends(require_permission(...))` where appropriate.
  - Run a database query:
    - `from core.database import get_database_manager`
    - `db = get_database_manager(); with db.get_cursor() as cur: cur.execute(...); result = cur.fetchall()`

If anything here is unclear or you'd like specific examples (more file links, sample PR templates, or rules for commit messages), tell me which area to expand. 
