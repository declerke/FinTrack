from sqlalchemy.engine import URL


def test_test_database_fixture_uses_password_safe_url(test_database_url) -> None:
    assert isinstance(test_database_url, URL)
    assert "***" in repr(test_database_url)
