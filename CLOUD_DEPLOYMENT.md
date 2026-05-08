# Cloud Deployment for Friends

The app has two parts:

- React dashboard frontend
- n8n workflows/agents

For friends to access it anytime, both parts need to run on a server. The prepared bundle is:

`deploy/hostinger-vps/`

## No Domain Setup

Use a Hostinger VPS IP with `sslip.io`:

- App: `https://amrit.YOUR_VPS_IP.sslip.io`
- n8n: `https://n8n.YOUR_VPS_IP.sslip.io`

Example if your VPS IP is `1.2.3.4`:

- `https://amrit.1.2.3.4.sslip.io`
- `https://n8n.1.2.3.4.sslip.io`

## Deploy Steps

On the VPS:

```sh
unzip amrit-hostinger-vps-deploy.zip -d amrit
cd amrit
cp .env.sslip.example .env
```

Edit `.env` and replace:

- `YOUR_VPS_IP`
- `SSL_EMAIL`
- `N8N_ENCRYPTION_KEY`

Then run:

```sh
sh server-setup.sh
```

Open the n8n URL, create the owner account, then import:

```sh
sh import-n8n.sh
```

Finally, activate the workflows used by the app:

- `vision-frame`
- `free-voice-agent`
- `chat`
- `salt-weather`

