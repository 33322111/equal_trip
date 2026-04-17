# EqualTrip

## Быстрый запуск через Docker

### 1) Подготовка

```bash
cp .env.example .env
docker compose up --build
```

После запуска:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000/api/`
- Django Admin: `http://localhost:8000/admin/`

### 2) Создать администратора

В отдельном терминале:

```bash
docker compose exec backend python manage.py createsuperuser
```

### 3) Остановка

```bash
docker compose down
```

Если нужно удалить БД и все docker-тома:

```bash
docker compose down -v
```

## Что внутри Docker Compose

- `db` — PostgreSQL 16
- `backend` — Django (миграции выполняются автоматически при старте)
- `frontend` — Vite dev server

## Переменные окружения

Основные переменные уже есть в `.env.example`.

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — настройки БД
- `VITE_API_BASE_URL` — адрес backend для frontend
- `VITE_YMAPS_API_KEY` — ключ Яндекс.Карт
- `OPENEXCHANGERATES_API_KEY` — ключ курсов валют
- `YANDEX_SMTP_*` — SMTP для отправки писем
