FROM python:3.12-slim

WORKDIR /app/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ /app/backend/

RUN chmod +x /app/backend/docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]

# Gunicorn вместо app.run() — без предупреждения Werkzeug dev server.
# SQLite: один worker, несколько потоков на воркер.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "120", "app:app"]
