from collections.abc import Iterator

from app.infrastructure.database import connect
from app.repositories.loads import MidwestLoadRepository


def get_load_repository() -> Iterator[MidwestLoadRepository]:
  with connect() as connection:
    yield MidwestLoadRepository(connection)
