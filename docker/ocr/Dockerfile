FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# OpenCV / PaddleOCR runtime libraries
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        curl \
        ca-certificates; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ocr/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ocr/app ./app
COPY ocr/static ./static

# Pre-download the PaddleOCR models so the first real request is not a cold
# multi-hundred-megabyte download. Non-fatal: if the build host cannot reach the
# model CDN the models are fetched on first use instead (mounted cache volume).
RUN python -c "from app.ocr_service import ocr_service; print('paddleocr models cached')" \
    || echo "WARNING: PaddleOCR model prefetch failed; models will download on first request."

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8001/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
