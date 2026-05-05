import aiosqlite
import databases

from config import DATABASE_URL, DB_PATH, ensure_runtime_dirs

database = databases.Database(DATABASE_URL)


async def init_db():
    ensure_runtime_dirs()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS corpora (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                filepath TEXT NOT NULL,
                num_sentences INTEGER,
                num_tokens INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS experiments (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                corpus_id TEXT NOT NULL,
                error_config TEXT NOT NULL,
                detectors_config TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                progress REAL DEFAULT 0.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                results TEXT
            )
        """)
        await db.commit()
