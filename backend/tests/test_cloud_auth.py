from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

import main


USER_A = "c7a4f630-8df7-47da-9b8a-a2e413449121"
USER_B = "31d6e6db-c4cb-4adf-86e3-174ae51a9fb2"
TASK_ID = "c4abbb73-eab1-4a1f-9b3a-d9e9b92b02c4"
TOKEN_USERS = {"token-a": USER_A, "token-b": USER_B}


def test_all_account_tables_have_owner_foreign_keys_and_forced_rls():
    root = Path(__file__).resolve().parents[2]
    migrations = {
        "profiles": ("20261112000100_daywell_cloud_data.sql", "profiles_owner_all"),
        "tasks": ("20261112000100_daywell_cloud_data.sql", "tasks_owner_all"),
        "schedules": ("20261112000100_daywell_cloud_data.sql", "schedules_owner_all"),
        "budgets": ("20261112000100_daywell_cloud_data.sql", "budgets_owner_all"),
        "user_preferences": ("20261112000100_daywell_cloud_data.sql", "preferences_owner_all"),
        "focus_sessions": ("20261112000100_daywell_cloud_data.sql", "focus_sessions_owner_all"),
        "legacy_imports": ("20261112000100_daywell_cloud_data.sql", "legacy_imports_owner_select_insert"),
        "active_focus_sessions": ("20261112000200_persist_active_focus_session.sql", "active_focus_sessions_owner_all"),
    }
    for table, (filename, policy) in migrations.items():
        sql = (root / "supabase" / "migrations" / filename).read_text(encoding="utf-8").lower()
        table_match = re.search(rf"create table if not exists public\.{table}\s*\((.*?)\n\);", sql, re.S)
        assert table_match
        assert re.search(r"user_id uuid(?: primary key| not null)? references auth\.users \(id\) on delete cascade", table_match.group(1))
        assert f"alter table public.{table} enable row level security;" in sql
        assert f"alter table public.{table} force row level security;" in sql
        assert f"create policy {policy} on public.{table} for all to authenticated" in sql
        assert "using ((select auth.uid()) = user_id)" in sql
        assert "with check ((select auth.uid()) = user_id)" in sql


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test-project.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-test-key")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    rows = {"tasks": [], "profiles": [], "schedules": [], "budgets": [], "user_preferences": [], "focus_sessions": [], "active_focus_sessions": []}
    requests = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        parsed = urlparse(str(request.url))
        bearer = request.headers.get("Authorization", "").removeprefix("Bearer ")
        if parsed.path.endswith("/auth/v1/user"):
            if bearer not in TOKEN_USERS:
                return httpx.Response(401, json={"message": "Invalid token"})
            user_id = TOKEN_USERS[bearer]
            return httpx.Response(200, json={"id": user_id, "email": f"{user_id[:4]}@example.test"})

        if parsed.path.startswith("/rest/v1/") and "/rpc/" not in parsed.path:
            resource = parsed.path.rsplit("/", 1)[-1]
            owner = TOKEN_USERS.get(bearer)
            if not owner:
                return httpx.Response(401, json={"message": "Invalid token"})
            params = parse_qs(parsed.query)
            requested_owner = params.get("user_id", [None])[0]
            if request.method == "GET":
                found = [row for row in rows[resource] if row["user_id"] == owner and requested_owner == f"eq.{owner}"]
                return httpx.Response(200, json=found)
            if request.method == "POST":
                data = json.loads(request.content)
                if data.get("user_id") != owner:
                    return httpx.Response(403, json={"message": "RLS denied"})
                if resource in ("tasks", "focus_sessions"):
                    data.setdefault("id", TASK_ID if resource == "tasks" else str(uuid.uuid4()))
                if resource == "profiles":
                    data.setdefault("full_name", "")
                    data.setdefault("role", "")
                    data.setdefault("focus", "")
                if resource == "schedules":
                    data.setdefault("day_start", "09:00")
                    data.setdefault("day_end", "17:00")
                if resource == "budgets":
                    data.setdefault("monthly_income", None)
                    data.setdefault("monthly_expenses", None)
                if resource == "user_preferences":
                    data.setdefault("currency", "INR")
                    data.setdefault("theme", "light")
                if resource == "focus_sessions":
                    data.setdefault("completed_at", "2026-11-12T00:00:00Z")
                if resource == "focus_sessions":
                    existing = next((row for row in rows[resource] if row["id"] == data["id"] and row["user_id"] == owner), None)
                    if existing:
                        existing.update(data)
                    else:
                        rows[resource].append(data)
                else:
                    rows[resource] = [row for row in rows[resource] if row["user_id"] != owner] if resource != "tasks" else rows[resource]
                    rows[resource].append(data)
                return httpx.Response(201, json=[data])
            if request.method == "PATCH":
                task_id = params.get("id", [None])[0]
                for row in rows[resource]:
                    if row.get("id") == task_id.removeprefix("eq.") and row["user_id"] == owner and requested_owner == f"eq.{owner}":
                        row.update(json.loads(request.content))
                        return httpx.Response(200, json=[row])
                return httpx.Response(200, json=[])
            if request.method == "DELETE":
                task_id = params.get("id", [None])[0]
                session_id = params.get("session_id", [None])[0]
                if resource == "active_focus_sessions":
                    found = [row for row in rows[resource] if row["user_id"] == owner
                             and requested_owner == f"eq.{owner}"
                             and (session_id is None or row["session_id"] == session_id.removeprefix("eq."))]
                else:
                    found = [row for row in rows[resource] if row.get("id") == task_id.removeprefix("eq.") and row["user_id"] == owner and requested_owner == f"eq.{owner}"]
                rows[resource] = [row for row in rows[resource] if row not in found]
                return httpx.Response(200, json=found)

        return httpx.Response(200, json=[])

    monkeypatch.setattr(main, "SUPABASE_HTTP_TRANSPORT", httpx.MockTransport(handle))
    with TestClient(main.app) as test_client:
        test_client.mock_rows = rows
        test_client.mock_requests = requests
        yield test_client


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "/api/me", None),
        ("GET", "/api/workspace", None),
        ("POST", "/api/tasks", {"title": "Private task"}),
        ("PATCH", f"/api/tasks/{TASK_ID}", {"completed": True}),
        ("DELETE", f"/api/tasks/{TASK_ID}", None),
        ("PUT", "/api/schedule", {"day_start": "09:00", "day_end": "17:00"}),
        ("PUT", "/api/budget", {"monthly_income": 1, "monthly_expenses": 0}),
        ("PUT", "/api/preferences", {"currency": "INR", "theme": "light"}),
        ("PUT", "/api/profile", {"full_name": "Someone"}),
        ("POST", "/api/focus-sessions", {"duration_seconds": 1500, "started_at": "2026-11-12T06:00:00Z"}),
        ("PUT", "/api/focus-session-state", {"duration_seconds": 1500, "remaining_seconds": 1200, "started_at": "2026-11-12T06:00:00Z", "resumed_at": "2026-11-12T06:05:00Z", "is_running": True}),
        ("DELETE", "/api/focus-session-state", None),
        ("POST", "/api/import-legacy", {}),
        ("POST", "/api/plan", {"tasks": []}),
        ("POST", "/api/assistant", {"message": "Hello"}),
    ],
)
def test_private_endpoints_reject_missing_tokens(client, method, path, body):
    response = client.request(method, path, json=body)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    assert "sign in" in response.json()["detail"].lower()


def test_invalid_or_expired_token_is_rejected(client):
    response = client.get("/api/workspace", headers={"Authorization": "Bearer expired-token"})
    assert response.status_code == 401
    assert "invalid or expired" in response.json()["detail"].lower()


def test_crud_derives_owner_and_enforces_account_isolation(client):
    token_a = {"Authorization": "Bearer token-a"}
    token_b = {"Authorization": "Bearer token-b"}

    created = client.post("/api/tasks", headers=token_a, json={"title": "Account A task"})
    assert created.status_code == 201
    assert created.json()["id"] == TASK_ID
    assert client.mock_rows["tasks"][0]["user_id"] == USER_A

    # A caller cannot choose a different owner in a write body.
    spoofed = client.post("/api/tasks", headers=token_a, json={"title": "Spoof", "user_id": USER_B})
    assert spoofed.status_code == 422

    workspace_b = client.get("/api/workspace", headers=token_b)
    assert workspace_b.status_code == 200
    assert workspace_b.json()["tasks"] == []

    foreign_update = client.patch(f"/api/tasks/{TASK_ID}", headers=token_b, json={"title": "Changed"})
    assert foreign_update.status_code == 404
    assert client.mock_rows["tasks"][0]["title"] == "Account A task"

    update = client.patch(f"/api/tasks/{TASK_ID}", headers=token_a, json={"completed": True})
    assert update.status_code == 200
    assert update.json()["completed"] is True
    deleted = client.delete(f"/api/tasks/{TASK_ID}", headers=token_a)
    assert deleted.status_code == 204
    assert client.mock_rows["tasks"] == []


def test_profile_and_preferences_use_verified_identity(client):
    response = client.put(
        "/api/profile",
        headers={"Authorization": "Bearer token-a"},
        json={"full_name": "Riya", "role": "Student", "focus": "Exams"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Riya"
    write = next(request for request in client.mock_requests if request.method == "POST" and request.url.path.endswith("/profiles"))
    assert write.headers["Authorization"] == "Bearer token-a"
    assert json.loads(write.content)["user_id"] == USER_A


def test_schedule_budget_preferences_and_progress_are_account_owned(client):
    owner = {"Authorization": "Bearer token-a"}
    schedule = client.put("/api/schedule", headers=owner, json={"day_start": "08:30", "day_end": "16:30"})
    budget = client.put("/api/budget", headers=owner, json={"monthly_income": "42000", "monthly_expenses": "18000"})
    preferences = client.put("/api/preferences", headers=owner, json={"currency": "INR", "theme": "dark"})
    focus = client.post("/api/focus-sessions", headers=owner, json={"duration_seconds": 1500, "started_at": "2026-11-12T06:00:00Z"})

    assert schedule.status_code == 200 and schedule.json() == {"start": "08:30", "end": "16:30"}
    assert budget.status_code == 200 and budget.json() == {"income": "42000", "expenses": "18000"}
    assert preferences.status_code == 200 and preferences.json() == {"currency": "INR", "theme": "dark"}
    assert focus.status_code == 201
    for resource in ("schedules", "budgets", "user_preferences", "focus_sessions"):
        assert client.mock_rows[resource][0]["user_id"] == USER_A

    workspace_b = client.get("/api/workspace", headers={"Authorization": "Bearer token-b"}).json()
    assert workspace_b["budget"] == {"income": "", "expenses": ""}
    assert workspace_b["preferences"] == {"currency": "INR", "theme": "light"}
    assert workspace_b["schedule"] == {"start": "09:00", "end": "17:00"}
    assert workspace_b["progress"]["focusSessions"] == 0
    assert workspace_b["focusSession"] is None


def test_every_user_section_round_trips_after_workspace_reload(client):
    owner = {"Authorization": "Bearer token-a"}
    task = client.post("/api/tasks", headers=owner, json={
        "title": "Review notes", "priority": "high", "duration": 30, "category": "Study",
        "due_date": "2026-11-12", "due_label": "Today", "due_at": "2026-11-12T17:00:00",
    })
    profile = client.put("/api/profile", headers=owner, json={"full_name": "Riya Shah", "role": "Student", "focus": "Exams"})
    schedule = client.put("/api/schedule", headers=owner, json={"day_start": "08:30", "day_end": "16:30"})
    budget = client.put("/api/budget", headers=owner, json={"monthly_income": "42000", "monthly_expenses": "18000"})
    preferences = client.put("/api/preferences", headers=owner, json={"currency": "INR", "theme": "dark"})
    focus_state = client.put("/api/focus-session-state", headers=owner, json={
        "session_id": "c4abbb73-eab1-4a1f-9b3a-d9e9b92b02c4", "duration_seconds": 1500,
        "remaining_seconds": 1200, "started_at": "2026-11-12T06:00:00Z",
        "resumed_at": "2026-11-12T06:05:00Z", "is_running": True,
    })

    assert all(response.status_code == 200 for response in (profile, schedule, budget, preferences, focus_state))
    assert task.status_code == 201
    workspace_a = client.get("/api/workspace", headers=owner).json()
    assert workspace_a["tasks"][0]["title"] == "Review notes"
    assert workspace_a["profile"] == {"name": "Riya Shah", "role": "Student", "focus": "Exams", "email": f"{USER_A[:4]}@example.test"}
    assert workspace_a["schedule"] == {"start": "08:30", "end": "16:30"}
    assert workspace_a["budget"] == {"income": "42000", "expenses": "18000"}
    assert workspace_a["preferences"] == {"currency": "INR", "theme": "dark"}
    assert workspace_a["focusSession"]["remaining_seconds"] == 1200
    assert workspace_a["focusSession"]["is_running"] is True
    assert client.mock_rows["active_focus_sessions"][0]["user_id"] == USER_A

    other_account = client.get("/api/workspace", headers={"Authorization": "Bearer token-b"}).json()
    assert other_account["tasks"] == []
    assert other_account["profile"]["name"] == ""
    assert other_account["schedule"] == {"start": "09:00", "end": "17:00"}
    assert other_account["budget"] == {"income": "", "expenses": ""}
    assert other_account["preferences"] == {"currency": "INR", "theme": "light"}
    assert other_account["focusSession"] is None

    completed = client.post("/api/focus-sessions", headers=owner, json={
        "session_id": "c4abbb73-eab1-4a1f-9b3a-d9e9b92b02c4", "duration_seconds": 1500,
        "started_at": "2026-11-12T06:00:00Z",
    })
    assert completed.status_code == 201
    retried = client.post("/api/focus-sessions", headers=owner, json={
        "session_id": "c4abbb73-eab1-4a1f-9b3a-d9e9b92b02c4", "duration_seconds": 1500,
        "started_at": "2026-11-12T06:00:00Z",
    })
    assert retried.status_code == 201
    after_completion = client.get("/api/workspace", headers=owner).json()
    assert after_completion["progress"]["focusSessions"] == 1
    assert after_completion["focusSession"] is None


def test_focus_state_rejects_impossible_timer_values(client):
    response = client.put("/api/focus-session-state", headers={"Authorization": "Bearer token-a"}, json={
        "duration_seconds": 1500, "remaining_seconds": 1501,
        "started_at": "2026-11-12T06:00:00Z", "is_running": False,
    })
    assert response.status_code == 422
    assert "cannot exceed" in response.json()["detail"].lower()

