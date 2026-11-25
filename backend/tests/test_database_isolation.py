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


@pytest.mark.parametrize(
    "query",
    [
        "host=127.0.0.1",
        "hostaddr=127.0.0.1",
        "port=55432",
        "dbname=fintrack",
        "service=remote",
        "servicefile=%2Ftmp%2Fpostgresql.conf",
        "sslmode=disable",
    ],
)
def test_test_database_guard_rejects_query_parameters(
    monkeypatch: pytest.MonkeyPatch,
    query: str,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url("localhost", driver="postgresql", port=5432, database="fintrack"),
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="must not include query parameters"):
        validate_test_database_url(
            _postgres_url("127.0.0.1", port=5433) + f"?{query}"
        )


@pytest.mark.parametrize(
    "query",
    [
        "host=127.0.0.1",
        "hostaddr=127.0.0.1",
        "port=5433",
        "dbname=fintrack_test",
        "service=local-test",
        "servicefile=%2Ftmp%2Fpostgresql.conf",
    ],
)
def test_application_database_guard_rejects_destination_query_overrides(
    monkeypatch: pytest.MonkeyPatch,
    query: str,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url("localhost", driver="postgresql", port=5432, database="fintrack")
        + f"?{query}",
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="can override its destination"):
        validate_test_database_url(_postgres_url("127.0.0.1", port=5433))


def test_application_database_guard_allows_non_destination_query_options(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url("localhost", driver="postgresql", port=5432, database="fintrack")
        + "?sslmode=require",
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    url = validate_test_database_url(_postgres_url("127.0.0.1", port=5433))

    assert url.database == "fintrack_test"


def test_application_database_guard_rejects_multiple_hosts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url(
            "localhost,127.0.0.1",
            driver="postgresql",
            port=5432,
            database="fintrack",
        ),
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="can override its destination"):
        validate_test_database_url(_postgres_url("127.0.0.1", port=5433))


@pytest.mark.parametrize(
    ("application_host", "application_port", "application_database"),
    [
        ("database.example", 5432, "fintrack_test"),
        ("localhost", 6543, "FINTRACK_TEST"),
    ],
)
def test_application_database_guard_reserves_test_catalog_name(
    monkeypatch: pytest.MonkeyPatch,
    application_host: str,
    application_port: int,
    application_database: str,
) -> None:
    monkeypatch.delenv("PGHOSTADDR", raising=False)
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url(
            application_host,
            driver="postgresql",
            port=application_port,
            database=application_database,
        ),
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="fintrack_test catalog is reserved for tests"):
        validate_test_database_url(_postgres_url("127.0.0.1", port=5433))


def test_test_database_guard_rejects_reserved_preview_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url("localhost", driver="postgresql", port=5432, database="fintrack"),
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="must not use reserved preview port 55432"):
        validate_test_database_url(_postgres_url("127.0.0.1", port=55432))


def test_test_database_guard_requires_explicit_port(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url("localhost", driver="postgresql", port=5432, database="fintrack"),
    )
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="must specify an explicit port"):
        validate_test_database_url(_postgres_url("127.0.0.1"))


@pytest.mark.parametrize("variable", ["PGSERVICE", "PGSERVICEFILE"])
def test_application_database_guard_rejects_service_environment_routing(
    monkeypatch: pytest.MonkeyPatch,
    variable: str,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        _postgres_url("localhost", driver="postgresql", port=5432, database="fintrack"),
    )
    monkeypatch.setenv(variable, "local-service")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="PGSERVICE routing"):
        validate_test_database_url(_postgres_url("127.0.0.1", port=5433))


@pytest.mark.parametrize(
    "application_url",
    [
        "postgresql+psycopg://tester@localhost:5432",
        "postgresql+psycopg://tester@localhost:5432/",
        "postgresql+psycopg:///fintrack_test",
    ],
)
def test_application_database_guard_rejects_missing_host_or_database(
    monkeypatch: pytest.MonkeyPatch,
    application_url: str,
) -> None:
    monkeypatch.setenv("DATABASE_URL", application_url)
    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")

    with pytest.raises(ValueError, match="must specify its host and database"):
        validate_test_database_url(_postgres_url("127.0.0.1", port=5433))


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

    with pytest.raises(ValueError, match="fintrack_test catalog is reserved for tests"):
        test_url = conftest.test_database_url.__wrapped__()
        next(conftest.db_engine.__wrapped__(test_url))

    assert engine_calls == []
    assert ddl_calls == []



def test_missing_test_database_fails_when_ci_requires_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
    monkeypatch.setenv("FINTRACK_REQUIRE_TEST_DATABASE", "1")

    with pytest.raises(pytest.fail.Exception, match="isolated PostgreSQL TEST_DATABASE_URL"):
        conftest.require_test_database_url()


def test_database_fixture_owns_and_drops_only_its_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from sqlalchemy.engine import URL
    from sqlalchemy.schema import MetaData

    monkeypatch.setenv("JWT_SECRET_KEY", "test-signing-key-long-enough-for-this-test")
    monkeypatch.setenv("PGHOSTADDR", "203.0.113.44")
    monkeypatch.setenv("PGPORT", "55432")
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
        host="LOCALHOST",
        port=5433,
        database="fintrack_test",
    )
    fixture_generator = conftest.db_engine.__wrapped__(test_url)
    try:
        yielded_engine = next(fixture_generator)
        assert len(engine_calls) == 2
        assert yielded_engine is engine_calls[1][2]
        assert engine_calls[0][1]["connect_args"] == {
            "hostaddr": "127.0.0.1",
            "port": 5433,
        }
        assert engine_calls[1][1]["connect_args"] == {
            "hostaddr": "127.0.0.1",
            "options": "-c search_path=" + schema_statements[0].split('"')[1],
            "port": 5433,
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
