from collections.abc import Iterator

from app.infrastructure.database import connect
from app.repositories.loads import ApexLoadRepository


def get_load_repository() -> Iterator[ApexLoadRepository]:
  connection = connect()
  try:
    yield ApexLoadRepository(connection)
  finally:
    connection.close()
