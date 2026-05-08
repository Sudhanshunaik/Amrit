# Project Amrit Hostinger VPS Deployment

This bundle is for a Hostinger VPS with Docker. Use two DNS records pointed at the VPS IP:

- `amrit.example.com` for the dashboard
- `n8n.example.com` for n8n and production webhooks

## Files

- `compose.yaml` runs Caddy and n8n.
- `Caddyfile` serves the React build and proxies `/api/n8n/*` to n8n.
- `site/` contains the built dashboard files.
- `n8n-import/workflows/` contains exported n8n workflow JSON.
- `n8n-import/credentials/` contains encrypted credential exports.

## Server Steps

1. Copy `.env.example` to `.env` and set real domains, email, and `N8N_ENCRYPTION_KEY`.
2. Start the stack:

```sh
docker compose up -d
```

3. Open `https://n8n.example.com` and create the owner account.
4. Import credentials and workflows:

```sh
sh import-n8n.sh
```

5. In n8n, open the workflows used by the app and make sure they are active.

## App Webhook Routing

The built frontend calls `/api/n8n/webhook/...`. Caddy strips `/api/n8n` and forwards requests to the n8n container, so browser calls become production n8n webhook calls without exposing port `5678`.

