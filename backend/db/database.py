import sqlite3
import threading
from pathlib import Path
from ..config import settings

_local = threading.local()

def get_connection() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        _local.conn = sqlite3.connect(
            str(settings.db_path), check_same_thread=False
        )
        _local.conn.row_factory = sqlite3.Row
        _apply_pragmas(_local.conn)
    return _local.conn

def _apply_pragmas(conn: sqlite3.Connection):
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-4000")
    conn.execute("PRAGMA busy_timeout=5000")

def init_db():
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(settings.db_path))
    _apply_pragmas(conn)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type   TEXT    NOT NULL,
            description  TEXT    NOT NULL DEFAULT '',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS settings_kv (
            key        TEXT PRIMARY KEY,
            value      TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at DESC);
    """)
    conn.commit()
    conn.close()
