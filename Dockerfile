# ==========================================
# Stage 1: Build the React frontend
# ==========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ==========================================
# Stage 2: Run the Flask backend
# ==========================================
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=5050

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt

RUN pip install --no-cache-dir \
    -r /app/backend/requirements.txt

COPY backend/ /app/backend/

COPY --from=frontend-builder \
    /app/frontend/dist \
    /app/frontend/dist

WORKDIR /app/backend

EXPOSE 5050

CMD ["gunicorn", "--config", "gunicorn.conf.py", "app:app"]
