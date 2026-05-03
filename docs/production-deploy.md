# Production Deploy

## DNS

- Create an `A` record for `equal-trip.ru`
- Point it to `77.105.170.176`
- Optionally create `www.equal-trip.ru` and point it to the same IP

## Server bootstrap

```bash
sudo apt update
sudo apt install -y ca-certificates curl git

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## Project directory

```bash
sudo mkdir -p /opt/equal_trip
sudo chown -R $USER:$USER /opt/equal_trip
cd /opt/equal_trip
git clone https://github.com/33322111/equal_trip.git .
cp .env.prod.example .env.prod
```

Fill in `.env.prod` with real secrets before the first start.

## First start

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

The backend entrypoint will run migrations and `collectstatic` automatically.
The `caddy` image now builds the frontend itself and serves it directly, so production does not need a separate `nginx` or `frontend` runtime container.

## GitHub Actions secrets

Add these repository or environment secrets:

- `PROD_HOST=77.105.170.176`
- `PROD_USER=<your-server-user>`
- `PROD_PORT=22`
- `PROD_SSH_PRIVATE_KEY=<private ssh key contents>`

## Notes

- Frontend: `https://equal-trip.ru/`
- API: `https://equal-trip.ru/api/`
- Admin: `https://equal-trip.ru/admin/`
- Media: `https://equal-trip.ru/media/`
- Static: `https://equal-trip.ru/static/`
