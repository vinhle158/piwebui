import os
import sqlite3
from .config import settings
from .db.database import init_db, get_connection

def verify_foundation():
    print("--- Checking configuration ---")
    print(f"DB Path: {settings.db_path}")
    print(f"File Manager Root: {settings.file_manager_root}")
    print(f"Allowed Services: {settings.allowed_services}")
    
    # Run init_db
    print("\n--- Initializing Database ---")
    init_db()
    if settings.db_path.exists():
        print(f"Database file created successfully: {settings.db_path}")
    else:
        raise FileNotFoundError("Database file not found after init!")
    
    # Check Connection and WAL mode
    print("\n--- Checking Connection & PRAGMAs ---")
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check journal mode
    journal_mode = cursor.execute("PRAGMA journal_mode").fetchone()[0]
    print(f"Journal Mode: {journal_mode}")
    assert journal_mode.lower() == "wal", f"Journal mode is not WAL, it is: {journal_mode}"
    
    # Check synchronous mode
    synchronous = cursor.execute("PRAGMA synchronous").fetchone()[0]
    print(f"Synchronous Mode: {synchronous} (0=OFF, 1=NORMAL, 2=FULL, 3=EXTRA)")
    assert synchronous == 1, f"Synchronous mode is not NORMAL (1), it is: {synchronous}"
    
    # Check table existence
    tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    table_names = [t[0] for t in tables]
    print(f"Tables in DB: {table_names}")
    assert "events" in table_names, "Missing events table"
    assert "settings_kv" in table_names, "Missing settings_kv table"
    
    # Check importing main.py
    print("\n--- Checking main.py import ---")
    from .main import app
    print("Successfully imported main app!")
    print("\n>>> ALL FOUNDATION VERIFICATION STEPS PASSED! <<<")

if __name__ == "__main__":
    verify_foundation()
