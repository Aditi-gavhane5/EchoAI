"""SQLite helpers and safe, additive schema initialization for EchoAI."""
import os
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATABASE = Path(os.environ.get("ECHOAI_DATABASE", BASE_DIR / "echoai.db"))


def connect_db():
    """Open a row-aware connection and enforce foreign keys per connection."""
    db = sqlite3.connect(DATABASE, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def init_db():
    """Create missing tables/indexes; never clears existing application data."""
    with connect_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversations (
                conversation_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                title TEXT NOT NULL DEFAULT 'New chat',
                title_is_custom INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                message_id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('user','assistant')),
                content TEXT NOT NULL, attachments_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memories (
                memory_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                memory_key TEXT NOT NULL, memory_value TEXT NOT NULL,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS documents (
                document_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                filename TEXT NOT NULL, file_type TEXT NOT NULL,
                file_size INTEGER NOT NULL, extracted_text TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
                due_date TEXT, status TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','completed')),
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
                ON conversations(user_id, updated_at DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci
                ON users(lower(username));
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
                ON messages(conversation_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_memories_user_key ON memories(user_id, memory_key);
            CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
        """)
        # Add this flag to databases made by earlier EchoAI versions without
        # dropping or rewriting the conversations users already have.
        columns = {row["name"] for row in db.execute("PRAGMA table_info(conversations)")}
        if "title_is_custom" not in columns:
            db.execute("ALTER TABLE conversations ADD COLUMN title_is_custom INTEGER NOT NULL DEFAULT 0")
