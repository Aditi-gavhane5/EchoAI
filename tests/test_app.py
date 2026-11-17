"""Focused API tests; Gemini is mocked and all data lives in a temporary DB."""
import os
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

_db_dir = tempfile.TemporaryDirectory(prefix="echoai-tests-")
os.environ["ECHOAI_DATABASE"] = str(Path(_db_dir.name) / "test.db")
os.environ["SECRET_KEY"] = "test-only-secret-key"

import pytest
import app as echo
import database as db_module
from database import connect_db


@pytest.fixture(autouse=True)
def clean_database(monkeypatch):
    with connect_db() as db:
        for table in ("messages", "conversations", "memories", "documents", "tasks", "users"):
            db.execute(f"DELETE FROM {table}")
    monkeypatch.setattr(echo, "gemini_reply", lambda history, user_id, use_search=False: ("Mock Gemini reply", []))


@pytest.fixture
def client():
    echo.app.config.update(TESTING=True)
    return echo.app.test_client()


def register(client, username="alice", email=None):
    page = client.get("/").get_data(as_text=True)
    csrf = re.search(r'<meta name="csrf-token" content="([^"]+)', page).group(1)
    response = client.post("/register", data={"csrf_token": csrf,"username":username,"email":email or f"{username}@example.com","password":"a-long-test-password"}, follow_redirects=True)
    assert response.status_code == 200
    token = re.search(r'<meta name="csrf-token" content="([^"]+)', response.get_data(as_text=True)).group(1)
    return token


def api(client, token, url, method="get", **kwargs):
    headers = kwargs.pop("headers", {})
    headers["X-CSRF-Token"] = token
    return getattr(client, method)(url, headers=headers, **kwargs)


def test_registration_login_logout_and_authentication(client):
    token = register(client)
    with client.session_transaction() as session:
        assert session["username"] == "alice"
        user_id = session["user_id"]
    with connect_db() as db:
        stored = db.execute("SELECT password_hash FROM users WHERE user_id=?", (user_id,)).fetchone()[0]
    assert stored != "a-long-test-password"
    assert client.get("/api/conversations").status_code == 200
    assert api(client, token, "/logout", "post").status_code == 302
    assert client.get("/api/conversations").status_code == 401
    page = client.get("/").get_data(as_text=True)
    csrf = re.search(r'<meta name="csrf-token" content="([^"]+)', page).group(1)
    assert client.post("/login", data={"csrf_token":csrf,"identity":"alice@example.com","password":"a-long-test-password"}).status_code == 302


def test_conversation_persistence_title_delete_and_latest_ten(client):
    token = register(client)
    ids = []
    for i in range(11):
        result = api(client,token,"/api/conversations","post",json={})
        assert result.status_code == 201
        ids.append(result.json["conversation_id"])
    listing = api(client,token,"/api/conversations").json["conversations"]
    assert len(listing) == 10
    assert ids[0] not in {row["conversation_id"] for row in listing}
    answer = api(client,token,"/api/chat","post",json={"message":"Plan a trip","conversation_id":ids[-1]})
    assert answer.status_code == 200
    loaded = api(client,token,f"/api/conversations/{ids[-1]}").json["messages"]
    assert [m["content"] for m in loaded] == ["Plan a trip","Mock Gemini reply"]
    assert any(row["title"] == "Plan a trip" for row in api(client,token,"/api/conversations").json["conversations"])
    assert api(client,token,f"/api/conversations/{ids[1]}","delete",headers={"X-Confirmed":"yes"}).status_code == 200
    assert api(client,token,f"/api/conversations/{ids[1]}").status_code == 404
    with connect_db() as db:
        assert db.execute("SELECT COUNT(*) FROM messages WHERE conversation_id=?",(ids[1],)).fetchone()[0] == 0


def test_user_data_isolation(client):
    token = register(client,"alice")
    conv = api(client,token,"/api/conversations","post",json={}).json["conversation_id"]
    other = echo.app.test_client()
    other_token = register(other,"bob")
    assert api(other,other_token,f"/api/conversations/{conv}").status_code == 404
    assert api(other,other_token,f"/api/conversations/{conv}","delete").status_code == 404
    assert api(other,other_token,f"/api/conversations/{conv}","patch",json={"title":"stolen"}).status_code == 404


def test_all_ten_conversations_open_continue_and_keep_custom_titles(client):
    token=register(client)
    ids=[]
    for index in range(10):
        conversation=api(client,token,"/api/conversations","post",json={}).json["conversation_id"]
        ids.append(conversation)
        response=api(client,token,"/api/chat","post",json={"message":f"message {index}","conversation_id":conversation})
        assert response.status_code==200
    for index,conversation in enumerate(ids):
        result=api(client,token,f"/api/conversations/{conversation}")
        assert [m["content"] for m in result.json["messages"]]==[f"message {index}","Mock Gemini reply"]
    renamed=api(client,token,f"/api/conversations/{ids[0]}","patch",json={"title":"My custom title"})
    assert renamed.status_code==200
    continued=api(client,token,"/api/chat","post",json={"message":"continue oldest","conversation_id":ids[0]})
    assert continued.status_code==200
    refreshed=api(client,token,"/api/conversations").json["conversations"]
    assert next(item for item in refreshed if item["conversation_id"]==ids[0])["title"]=="My custom title"
    history=api(client,token,f"/api/conversations/{ids[0]}").json["messages"]
    assert [m["content"] for m in history][-2:]==["continue oldest","Mock Gemini reply"]


def test_simultaneous_accounts_keep_conversations_separate():
    alice=echo.app.test_client(); alice_token=register(alice,"alice")
    bob=echo.app.test_client(); bob_token=register(bob,"bob")
    def create(client,token):
        response=api(client,token,"/api/conversations","post",json={})
        return response.json["conversation_id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        alice_future=pool.submit(create,alice,alice_token)
        bob_future=pool.submit(create,bob,bob_token)
        alice_id=alice_future.result(); bob_id=bob_future.result()
    assert api(alice,alice_token,f"/api/conversations/{bob_id}").status_code==404
    assert api(bob,bob_token,f"/api/conversations/{alice_id}").status_code==404


def test_custom_title_migration_preserves_existing_conversations(tmp_path,monkeypatch):
    legacy=tmp_path/"legacy.db"
    import sqlite3
    with sqlite3.connect(legacy) as db:
        db.execute("CREATE TABLE users(user_id TEXT PRIMARY KEY,username TEXT UNIQUE,email TEXT UNIQUE,password_hash TEXT,created_at TEXT)")
        db.execute("CREATE TABLE conversations(conversation_id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,title TEXT NOT NULL,created_at TEXT,updated_at TEXT)")
        db.execute("INSERT INTO users VALUES('user-1','alice','alice@example.com','hash','2026-01-01')")
        db.execute("INSERT INTO conversations VALUES('chat-1','user-1','Old title','2026-01-01','2026-01-01')")
    monkeypatch.setattr(db_module,"DATABASE",legacy)
    db_module.init_db()
    with db_module.connect_db() as db:
        row=db.execute("SELECT title,title_is_custom FROM conversations WHERE conversation_id='chat-1'").fetchone()
    assert tuple(row)==("Old title",0)


def test_memory_crud_and_cross_user_protection(client):
    token = register(client)
    created = api(client,token,"/api/memories","post",json={"memory_key":"tone","memory_value":"Concise"})
    memory_id = created.json["memory_id"]
    assert api(client,token,"/api/memories").json["memories"][0]["memory_value"] == "Concise"
    assert api(client,token,f"/api/memories/{memory_id}","put",json={"memory_key":"tone","memory_value":"Friendly"}).status_code == 200
    assert api(client,token,f"/api/memories/{memory_id}","delete",headers={"X-Confirmed":"yes"}).status_code == 200


def test_cross_user_memory_and_task_access(client):
    alice_token=register(client,"alice")
    memory=api(client,alice_token,"/api/memories","post",json={"memory_key":"home","memory_value":"Somewhere"}).json["memory_id"]
    task=api(client,alice_token,"/api/tasks","post",json={"title":"Private task"}).json["task_id"]
    bob=echo.app.test_client(); bob_token=register(bob,"bob")
    assert api(bob,bob_token,f"/api/memories/{memory}","put",json={"memory_key":"x","memory_value":"x"}).status_code == 404
    assert api(bob,bob_token,f"/api/tasks/{task}","patch",json={"status":"completed"}).status_code == 404


def test_document_upload_search_ownership_and_delete(client):
    token = register(client)
    upload = api(client,token,"/api/documents","post",data={"file":(BytesIO(b"EchoAI project notes"),"notes.txt")},content_type="multipart/form-data")
    assert upload.status_code == 201
    doc_id = upload.json["document_id"]
    assert echo.search_documents("not-an-owner", "notes") == []
    with client.session_transaction() as session: user_id=session["user_id"]
    assert echo.search_documents(user_id,"project notes")[0]["filename"] == "notes.txt"
    assert api(client,token,f"/api/documents/{doc_id}").json["text"] == "EchoAI project notes"
    other=echo.app.test_client(); other_token=register(other,"bob")
    assert api(other,other_token,f"/api/documents/{doc_id}").status_code == 404
    with BytesIO() as stream:
        document=echo.python_docx.Document(); document.add_paragraph("DOCX extraction works"); document.save(stream)
        assert echo.extract_text("sample.docx",stream.getvalue(),strict_library=True) == "DOCX extraction works"
    assert api(client,token,f"/api/documents/{doc_id}","delete",headers={"X-Confirmed":"yes"}).status_code == 200
    bad = api(client,token,"/api/documents","post",data={"file":(BytesIO(b"not a pdf"),"bad.pdf")},content_type="multipart/form-data")
    assert bad.status_code == 400


def test_task_crud_confirmation_and_validation(client):
    token = register(client)
    created = api(client,token,"/api/tasks","post",json={"title":"Study","due_date":"2026-12-01"})
    assert created.status_code == 201
    task_id = created.json["task_id"]
    assert api(client,token,f"/api/tasks/{task_id}","patch",json={"status":"completed"}).status_code == 200
    assert api(client,token,"/api/tasks?status=completed").json["tasks"][0]["title"] == "Study"
    assert api(client,token,f"/api/tasks/{task_id}","delete").status_code == 400
    assert api(client,token,f"/api/tasks/{task_id}","delete",headers={"X-Confirmed":"yes"}).status_code == 200
    assert api(client,token,"/api/tasks","post",json={"title":"Bad date","due_date":"tomorrow"}).status_code == 400


def test_csrf_and_gemini_failure_are_safe(client, monkeypatch, caplog):
    token = register(client)
    assert client.post("/api/conversations",json={}).status_code == 400
    conversation=api(client,token,"/api/conversations","post",json={}).json["conversation_id"]
    assert api(client,token,"/api/chat","post",json={"message":"saved first","conversation_id":conversation}).status_code==200
    monkeypatch.setattr(echo,"gemini_reply",lambda *a,**k: (_ for _ in ()).throw(RuntimeError("private SDK detail")))
    response=api(client,token,"/api/chat","post",json={"message":"hello","conversation_id":conversation})
    assert response.status_code == 502
    assert "private SDK detail" not in response.get_data(as_text=True)
    assert "RuntimeError" in caplog.text and "private SDK detail" in caplog.text
    saved=api(client,token,f"/api/conversations/{conversation}").json["messages"]
    assert [message["content"] for message in saved]==["saved first","Mock Gemini reply"]
    assert len(api(client,token,"/api/conversations").json["conversations"])==1


def test_error_logging_redacts_credentials(monkeypatch,caplog):
    monkeypatch.setenv("GOOGLE_API_KEY","diagnostic-secret-value")
    echo.log_gemini_error(RuntimeError("bad key diagnostic-secret-value"))
    assert "diagnostic-secret-value" not in caplog.text
    assert "[REDACTED]" in caplog.text


def test_gemini_errors_are_classified_without_exposing_provider_details():
    from types import SimpleNamespace
    assert "usage limits" in echo.gemini_error_message(SimpleNamespace(code=429,message="quota exceeded"))
    assert "API key" in echo.gemini_error_message(SimpleNamespace(code=403,message="permission denied"))
    assert "model" in echo.gemini_error_message(SimpleNamespace(code=404,message="model not found"))
    assert "terminal diagnostic" in echo.gemini_error_message(SimpleNamespace(code=400,message="invalid request"))


def test_extraction_file_validation():
    assert echo.extract_text("a.txt",b"hello") == "hello"
    with pytest.raises(ValueError): echo.extract_text("a.pdf",b"not a pdf",strict_library=True)
    with pytest.raises(ValueError): echo.extract_text("a.exe",b"data",strict_library=True)


def test_gemini_tool_schemas_match_installed_sdk():
    declarations = echo.function_declarations()
    assert {tool.name for tool in declarations} >= {"create_task","save_memory","search_documents"}
    tool = echo.types.Tool(function_declarations=declarations)
    search = echo.types.Tool(google_search=echo.types.GoogleSearch())
    config = echo.types.GenerateContentConfig(tools=[tool], automatic_function_calling=echo.types.AutomaticFunctionCallingConfig(disable=True))
    assert config.tools and search.google_search is not None
