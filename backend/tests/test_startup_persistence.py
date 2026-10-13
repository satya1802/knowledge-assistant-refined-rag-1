"""AC-093: backend startup neither clears, drops nor re-seeds any table --
a database populated with users and sessions still holds every record, and
every table that existed before a restart still exists afterward.
"""

import ast
import importlib
import inspect

from fastapi.testclient import TestClient
from sqlalchemy import inspect as sa_inspect

from app.database import Base, SessionLocal, engine
from app.models import Session as SessionModel
from app.models import User
from app.security import hash_password


def test_restarting_the_app_does_not_touch_existing_rows() -> None:
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        db.query(SessionModel).delete()
        db.query(User).filter(User.email == "persist@example.com").delete()
        db.commit()
        user = User(
            email="persist@example.com",
            password_hash=hash_password("x"),
            role="admin",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        from datetime import datetime, timedelta

        db.add(
            SessionModel(
                user_id=user.id,
                token_hash="deadbeef",
                expires_at=datetime.utcnow() + timedelta(days=1),
            )
        )
        db.commit()
    finally:
        db.close()

    tables_before = set(sa_inspect(engine).get_table_names())

    # Simulate a restart: re-import/re-run the application module, which is
    # exactly what happens when the process is relaunched.
    import app.main as main_module

    importlib.reload(main_module)
    TestClient(main_module.app)

    tables_after = set(sa_inspect(engine).get_table_names())
    assert tables_after == tables_before

    db = SessionLocal()
    try:
        user_count = db.query(User).filter(User.email == "persist@example.com").count()
        session_count = db.query(SessionModel).count()
    finally:
        db.close()

    assert user_count == 1
    assert session_count == 1


def test_main_module_never_creates_drops_or_seeds_the_schema() -> None:
    """Checks the actual code, not the docstring that explains why there is
    none: no call anywhere in app/main.py is named create_all or drop_all."""
    import app.main as main_module

    tree = ast.parse(inspect.getsource(main_module))
    called_names = {
        node.func.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }

    assert "create_all" not in called_names
    assert "drop_all" not in called_names
