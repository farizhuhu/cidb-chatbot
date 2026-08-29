# ---------- vendor stage ----------
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json ./
COPY backend ./backend
# The project namespaces (Cidb\Backend\Utils) do not match the on-disk directory
# case (backend/utils), which breaks PSR-4 autoloading on case-sensitive
# filesystems. composer.json therefore also declares a classmap, and we dump an
# optimized (classmap-first) autoloader here.
RUN composer install --no-dev --no-interaction --no-progress --optimize-autoloader

# ---------- runtime ----------
FROM php:8.2-apache

ENV APACHE_DOCUMENT_ROOT=/var/www/app/backend/public

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        libpq-dev \
        libonig-dev \
        curl \
        ca-certificates; \
    docker-php-ext-install -j"$(nproc)" pdo_pgsql mbstring; \
    a2enmod rewrite headers; \
    rm -rf /var/lib/apt/lists/*

COPY docker/app/php.ini /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/app/vhost.conf /etc/apache2/sites-available/000-default.conf
COPY docker/app/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /var/www/app

# Backend application code
COPY composer.json ./
COPY backend ./backend
COPY --from=vendor /app/vendor ./vendor

# Static frontend, served from the same origin as the API
COPY home.html frontend_api.js ./backend/public/
COPY assets ./backend/public/assets
COPY docker/app/health.php ./backend/public/health.php

# Stray committed log directory must never be web-reachable
RUN rm -rf ./backend/public/backend \
    && mkdir -p /var/www/storage /var/www/logs \
    && chown -R www-data:www-data /var/www/app /var/www/storage /var/www/logs

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1/health.php || exit 1

ENTRYPOINT ["entrypoint.sh"]
CMD ["apache2-foreground"]
