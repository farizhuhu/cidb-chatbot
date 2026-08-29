#!/bin/sh
set -e

STORAGE_PATH="${STORAGE_PATH:-/var/www/storage}"
LOG_PATH="${LOG_PATH:-/var/www/logs}"

mkdir -p "$STORAGE_PATH" "$LOG_PATH"
chown -R www-data:www-data "$STORAGE_PATH" "$LOG_PATH" || true

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "[entrypoint] waiting for database ${DB_HOST}:${DB_PORT}..."
    attempt=0
    until php -r '
        $dsn = sprintf("pgsql:host=%s;port=%d;dbname=%s;connect_timeout=3",
            getenv("DB_HOST") ?: "127.0.0.1",
            (int) (getenv("DB_PORT") ?: 5432),
            getenv("DB_DATABASE") ?: ""
        );
        try {
            new PDO($dsn, getenv("DB_USERNAME") ?: "", getenv("DB_PASSWORD") ?: "");
            exit(0);
        } catch (Throwable $e) {
            exit(1);
        }
    ' 2>/dev/null; do
        attempt=$((attempt + 1))
        if [ "$attempt" -ge "${DB_WAIT_ATTEMPTS:-30}" ]; then
            echo "[entrypoint] database not reachable after $attempt attempts; aborting startup." >&2
            exit 1
        fi
        sleep 2
    done

    echo "[entrypoint] running migrations..."
    php /var/www/app/backend/migrate.php
fi

exec "$@"
