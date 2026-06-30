import "dotenv/config";
import http from "node:http";
import {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  Partials
} from "discord.js";

const requiredEnv = ["DISCORD_TOKEN", "TARGET_CHANNEL_ID"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`Missing required environment variable(s): ${missingEnv.join(", ")}`);
  process.exit(1);
}

const config = {
  token: process.env.DISCORD_TOKEN,
  targetChannelId: process.env.TARGET_CHANNEL_ID,
  replacementDomain: normalizeReplacementDomain(process.env.REPLACEMENT_DOMAIN || "fxtwitter.com"),
  deleteOriginal: parseBoolean(process.env.DELETE_ORIGINAL, false),
  useWebhook: parseBoolean(process.env.USE_WEBHOOK, false),
  includeOriginalAuthor: parseBoolean(process.env.INCLUDE_ORIGINAL_AUTHOR, true),
  healthPort: Number.parseInt(process.env.HEALTH_PORT || "3000", 10)
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Watching channel ${config.targetChannelId}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot || message.channelId !== config.targetChannelId) {
      return;
    }

    const converted = convertTwitterLinks(message.content, config.replacementDomain);
    if (!converted.changed) {
      return;
    }

    if (config.deleteOriginal && config.useWebhook && message.inGuild()) {
      const reposted = await repostWithWebhook(message, converted.content);
      if (reposted) {
        await safelyDeleteOriginal(message);
        return;
      }
    }

    const text = config.includeOriginalAuthor
      ? `${message.author} ${converted.content}`
      : converted.content;

    await message.channel.send({
      content: text,
      allowedMentions: { users: [message.author.id], roles: [], parse: [] }
    });

    if (config.deleteOriginal) {
      await safelyDeleteOriginal(message);
    }
  } catch (error) {
    console.error("Failed to process message:", error);
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
});

startHealthServer(config.healthPort);

await client.login(config.token);

function convertTwitterLinks(content, replacementDomain) {
  const matches = findTwitterLinks(content, replacementDomain);
  if (matches.length === 0) {
    return { changed: false, content };
  }

  let converted = content;
  for (const match of matches) {
    converted = converted.replace(match.original, match.replacement);
  }

  return {
    changed: converted !== content,
    content: converted
  };
}

function findTwitterLinks(content, replacementDomain) {
  const urlPattern = /https?:\/\/[^\s<>()]+/gi;
  const matches = [];
  let match;

  while ((match = urlPattern.exec(content)) !== null) {
    const original = trimTrailingPunctuation(match[0]);

    try {
      const parsed = new URL(original);
      const hostname = parsed.hostname.toLowerCase();

      if (!isTwitterHost(hostname)) {
        continue;
      }

      parsed.hostname = replacementDomain;
      matches.push({
        original,
        replacement: parsed.toString()
      });
    } catch {
      // Ignore malformed URL-looking text.
    }
  }

  return matches;
}

function isTwitterHost(hostname) {
  return [
    "twitter.com",
    "www.twitter.com",
    "mobile.twitter.com",
    "x.com",
    "www.x.com"
  ].includes(hostname);
}

function trimTrailingPunctuation(value) {
  return value.replace(/[),.!?]+$/g, "");
}

async function repostWithWebhook(message, content) {
  const channel = message.channel;
  const botMember = message.guild.members.me;

  if (!botMember) {
    return false;
  }

  const permissions = channel.permissionsFor(botMember);
  const canManageWebhooks = permissions?.has(PermissionsBitField.Flags.ManageWebhooks);

  if (!canManageWebhooks || !channel.isTextBased()) {
    console.warn("USE_WEBHOOK=true, but the bot cannot manage webhooks in this channel.");
    return false;
  }

  const webhook = await getOrCreateWebhook(channel);
  await webhook.send({
    content,
    username: message.member?.displayName || message.author.displayName || message.author.username,
    avatarURL: message.author.displayAvatarURL({ extension: "png", size: 128 }),
    allowedMentions: { parse: [] }
  });

  return true;
}

async function getOrCreateWebhook(channel) {
  const hooks = await channel.fetchWebhooks();
  const existing = hooks.find((hook) => hook.owner?.id === client.user.id && hook.name === "Twitter Embed Reposter");

  if (existing) {
    return existing;
  }

  return channel.createWebhook({
    name: "Twitter Embed Reposter",
    reason: "Repost Twitter/X links with embed-friendly domains"
  });
}

async function safelyDeleteOriginal(message) {
  try {
    const botMember = message.guild?.members.me;
    const permissions = botMember ? message.channel.permissionsFor(botMember) : null;
    const canDelete = permissions?.has(PermissionsBitField.Flags.ManageMessages);

    if (!canDelete) {
      console.warn("DELETE_ORIGINAL=true, but the bot cannot manage messages in this channel.");
      return;
    }

    await message.delete();
  } catch (error) {
    console.error("Failed to delete original message:", error);
  }
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeReplacementDomain(value) {
  const cleaned = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/u, "");

  return cleaned || "fxtwitter.com";
}

function startHealthServer(port) {
  if (!Number.isInteger(port) || port <= 0) {
    return;
  }

  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(client.isReady() ? "ok\n" : "starting\n");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Health check listening on port ${port}`);
  });
}
