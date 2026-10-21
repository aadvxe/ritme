"""Database migration and permission bootstrapper for Cloud Run."""

from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path

import psycopg
from alembic import command
from alembic.config import Config


def main() -> None:
    # Always resolve root to /srv/apps/backend regardless of where the runtime started
    base_dir = Path(__file__).resolve().parents[2]
    os.chdir(base_dir)
    if str(base_dir) not in sys.path:
        sys.path.insert(0, str(base_dir))

    db_pass = os.environ.get("DB_PASSWORD", "").strip()
    inst = os.environ.get("INSTANCE_CONNECTION_NAME", "").strip()
    db_name = os.environ.get("DB_NAME", "ritme").strip()
    db_user = os.environ.get("DB_USER", "ritme").strip()

    if inst and db_pass:
        # Connect as postgres to ensure database ownership and public schema privileges
        conn_str = f"dbname={db_name} user=postgres password={db_pass} host=/cloudsql/{inst}"
        try:
            with psycopg.connect(conn_str, autocommit=True) as conn:
                with conn.cursor() as cur:
                    cur.execute(f"ALTER DATABASE {db_name} OWNER TO {db_user};")
                    cur.execute(f"GRANT ALL ON SCHEMA public TO {db_user};")
                    cur.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {db_user};")
                    cur.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {db_user};")
                    print("--> Database ownership and schema permissions verified for Cloud SQL.")
        except Exception as exc:
            print(f"--> Notice on admin permissions setup: {exc}")

    # Run migrations via Alembic Python API
    ini_file = str(base_dir / "alembic.ini")
    script_dir = str(base_dir / "alembic")
    print(f"--> Running Alembic migrations from {ini_file} (upgrade head)...")
    try:
        cfg = Config(ini_file)
        cfg.set_main_option("script_location", script_dir)
        command.upgrade(cfg, "head")
        print("--> Alembic migrations completed successfully.")
    except Exception as exc:
        print(f"--> Alembic upgrade failed: {exc}", file=sys.stderr)
        traceback.print_exc()
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(1)
