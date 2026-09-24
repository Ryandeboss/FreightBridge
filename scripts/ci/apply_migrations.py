from pathlib import Path
import os
import sys

import psycopg


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / 'infrastructure' / 'supabase' / 'migrations'


def main() -> int:
  database_url = os.environ.get('TEST_DATABASE_URL')
  if not database_url:
    print('TEST_DATABASE_URL is required.', file=sys.stderr)
    return 2

  files = sorted(MIGRATIONS.glob('*.sql'))
  expected_numbers = [f'{number:03d}' for number in range(1, 12)]
  actual_numbers = [path.name.split('_', 1)[1].split('_', 1)[0] for path in files]
  if actual_numbers != expected_numbers:
    print(f'Expected migrations 001-011, found {actual_numbers}.', file=sys.stderr)
    return 1

  with psycopg.connect(database_url, autocommit=True) as connection:
    with connection.cursor() as cursor:
      for path in files:
        print(f'Applying {path.name}')
        cursor.execute(path.read_text(encoding='utf-8'))
  return 0


if __name__ == '__main__':
  raise SystemExit(main())
