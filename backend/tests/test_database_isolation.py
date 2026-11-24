import conftest
import pytest

from app.config import validate_test_database_url


def _postgres_url(
    host: str,
    *,
    driver: str = "postgresql+psycopg",
    port: int | None = None,
    database: str = "fintrack_test",
    username: str = "tester",
) -> str:
    formatted_host = f"[{host}]" if ":" in host else host
    formatted_port = f":{port}" if port is not None else ""
    return f"{driver}://{username}@{formatted_host}{formatted_port}/{database}"


@pytest.mark.parametrize(
    ("application_host", "test_host"),
    [
        ("localhost", "127.0.0.1"),
        ("127.0.0.1", "localhost"),
        ("localhost", "::1"),
        ("::1", "localhost"),
        ("127.0.0.1", "::1"),
        ("::1", "127.0.0.1"),
    ],
)
def test_test_database_guard_rejects_application_database_through_loopback_aliases(
    monkeypatch: pytest.MonkeyPatch,
    application_host: str,
    test_host: str,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url(application_host, driver="postgresql", database="fintrack_test"),
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="application database"):
        validate_test_database_url(_postgres_url(test_host, port=5432))


def test_test_database_guard_allows_a_distinct_application_catalog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url("localhost", driver="postgresql", port=5432, database="fintrack"),
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    url = validate_test_database_url(
        _postgres_url("127.0.0.1", port=5433, database="fintrack_test")
    )

    assert url.database == "fintrack_test"


def test_rejected_application_database_never_reaches_engine_or_ddl(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sqlalchemy.schema import MetaData

    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url("localhost", driver="postgresql", port=5432, database="fintrack_test"),
    )
    monkeypatch.setenv("TEST_DATABASE_URL", _postgres_url("::1", port=5432))
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")
    engine_calls: list[object] = []
    ddl_calls: list[str] = []

    def unexpected_engine(*args: object, **kwargs: object) -> object:
        engine_calls.append((args, kwargs))
        raise AssertionError("database engine was created before configuration rejection")

    monkeypatch.setattr(conftest, "create_engine", unexpected_engine)
    monkeypatch.setattr(MetaData, "create_all", lambda *args, **kwargs: ddl_calls.append("create"))
    monkeypatch.setattr(MetaData, "drop_all", lambda *args, **kwargs: ddl_calls.append("drop"))

    with pytest.raises(ValueError, match="application database"):
        test_url = conftest.test_database_url.__wrapped__()
        next(conftest.db_engine.__wrapped__(test_url))

    assert engine_calls == []
    assert ddl_calls == []



def test_database_fixture_owns_and_drops_only_its_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sqlalchemy.engine import URL
    from sqlalchemy.schema import MetaData

    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")
    engine_calls: list[tuple[URL, dict[str, object], object]] = []
    schema_statements: list[str] = []
    metadata_create_calls: list[object] = []
    metadata_drop_calls: list[object] = []
    disposed_engines: list[object] = []

    class FakeConnection:
        def __enter__(self) -> "FakeConnection":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def exec_driver_sql(self, statement: str) -> None:
            schema_statements.append(statement)

    class FakeEngine:
        def begin(self) -> FakeConnection:
            return FakeConnection()

        def dispose(self) -> None:
            disposed_engines.append(self)

    def fake_create_engine(database_url: URL, **kwargs: object) -> FakeEngine:
        engine = FakeEngine()
        engine_calls.append((database_url, kwargs, engine))
        return engine

    def fake_create_all(
        metadata: MetaData, engine: object, *args: object, **kwargs: object
    ) -> None:
        metadata_create_calls.append(engine)

    def fake_drop_all(
        metadata: MetaData, engine: object, *args: object, **kwargs: object
    ) -> None:
        metadata_drop_calls.append(engine)

    monkeypatch.setattr(conftest, "create_engine", fake_create_engine)
    monkeypatch.setattr(MetaData, "create_all", fake_create_all)
    monkeypatch.setattr(MetaData, "drop_all", fake_drop_all)

    test_url = URL.create(
        "postgresql+psycopg",
        username="tester",
        host="localhost",
        port=5433,
        database="fintrack_test",
    )
    fixture_generator = conftest.db_engine.__wrapped__(test_url)
    try:
        yielded_engine = next(fixture_generator)
        assert len(engine_calls) == 2
        assert yielded_engine is engine_calls[1][2]
        assert engine_calls[1][1]["connect_args"] == {
            "options": "-c search_path=" + schema_statements[0].split('"')[1]
        }
        assert metadata_create_calls == [yielded_engine]
        assert metadata_drop_calls == []
    finally:
        fixture_generator.close()

    schema_name = schema_statements[0].split('"')[1]
    assert schema_statements == [
        f'CREATE SCHEMA "{schema_name}"',
        f'DROP SCHEMA "{schema_name}" CASCADE',
    ]
    assert schema_name.startswith("test_")
    assert metadata_drop_calls == []
    assert disposed_engines == [engine_calls[1][2], engine_calls[0][2]]
