# Twitter/X Embed Discord Bot

Small Discord bot that watches one or more Discord channels and converts `twitter.com` / `x.com` links into embed-friendly links such as `fxtwitter.com`.

## Behavior

By default, the bot leaves the original message alone and posts a converted copy below it.

If you set `DELETE_ORIGINAL=true`, the bot will try to remove the original message after posting the converted version. If you also set `USE_WEBHOOK=true`, it will repost through a channel webhook using the original author's display name and avatar.

## Discord Setup

1. Go to the Discord Developer Portal and create an application.
2. Add a bot to the application.
3. Copy the bot token into `DISCORD_TOKEN`.
4. In the bot settings, enable **Message Content Intent**.
5. Invite the bot to your server with these permissions:
   - View Channels
   - Send Messages
   - Read Message History
   - Manage Messages, only if `DELETE_ORIGINAL=true`
   - Manage Webhooks, only if `USE_WEBHOOK=true`
6. Enable Developer Mode in Discord, right-click each channel you want watched, and copy its channel ID into `TARGET_CHANNEL_IDS`.

## Environment Variables

Copy `.env.example` to `.env` for local testing, or set these directly in Coolify.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | yes | | Discord bot token. |
| `TARGET_CHANNEL_IDS` | yes | | Comma-separated channel IDs to watch. You can also use the old single-channel `TARGET_CHANNEL_ID`. |
| `REPLACEMENT_DOMAIN` | no | `fxtwitter.com` | Domain used for converted links. `vxtwitter.com` is another common option. |
| `DELETE_ORIGINAL` | no | `false` | Delete the original Twitter/X message after posting the converted link. |
| `USE_WEBHOOK` | no | `false` | Repost via webhook with the original author's display name/avatar. Requires Manage Webhooks. |
| `INCLUDE_ORIGINAL_AUTHOR` | no | `true` | Mention the original author when the bot posts as itself. Ignored when `USE_WEBHOOK=true`. |
| `HEALTH_PORT` | no | `3000` | HTTP health check port for Coolify. |

## Local Run

```bash
npm install
cp .env.example .env
npm start
```

## Coolify Install

1. Push this folder to a Git repository that your VM/Coolify can access.
2. In Coolify, create a new resource from that Git repository.
3. Choose **Dockerfile** as the build pack.
4. Set the environment variables from the table above.
5. No public domain is required. This is a worker bot, but it exposes `HEALTH_PORT=3000` for health checks.
6. Deploy.

Recommended Coolify environment:

```env
DISCORD_TOKEN=your-discord-bot-token
TARGET_CHANNEL_IDS=123456789012345678,234567890123456789
REPLACEMENT_DOMAIN=fxtwitter.com
DELETE_ORIGINAL=true
USE_WEBHOOK=true
INCLUDE_ORIGINAL_AUTHOR=true
HEALTH_PORT=3000
```

If you use the recommended delete-and-webhook mode, make sure the bot role is above the roles of users whose messages it needs to delete, and make sure it has **Manage Messages** and **Manage Webhooks** in the target channel.

## Notes

- Discord must be able to reach the replacement domain for embeds to appear.
- Twitter/X embed frontends can change behavior over time. If one stops embedding, change `REPLACEMENT_DOMAIN` to another compatible frontend and redeploy.
- The bot watches only the configured channel IDs.
