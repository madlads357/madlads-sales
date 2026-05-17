# Mad Lads Sales Bot

Listens for Mad Lads NFT sales on Solana via a [Helius](https://www.helius.dev/docs/webhooks) enhanced webhook and posts each sale to X (Twitter).

## What It Does

1. Receives `NFT_SALE` events at `POST /api/helius-webhook`
2. Confirms the sale is a Mad Lad (metadata, description, or royalty payment)
3. Posts a tweet with the Lad image (when available), price, and marketplace

Example tweet:

```
🔥 Mad Lads #6198

💰 Sold for ◎15.50 on Magic Eden 🛒

@madlads #MadLads
```

Sales from any marketplace Helius reports (`MAGIC_EDEN`, `TENSOR`, `HYPERSPACE`, etc.) are supported.

## Project Structure

```
api/
  helius-webhook.js   # Vercel HTTP handler
  health.js           # Health check
lib/
  constants.js        # Addresses and shared config
  sales.js            # Parse Helius transactions into sale records
  helius.js           # DAS getAsset lookups
  twitter.js          # Tweet formatting and posting
  marketplace.js      # Helius source → display name
  dedupe.js           # In-memory signature deduplication
  process-event.js    # Per-event orchestration
```

## Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/helius-webhook` | Helius webhook target |
| `GET` | `/api/health` | Health check (`{ "ok": true }`) |

## Environment Variables

Set these in Vercel Project Settings (and in `.env` for local dev):

```env
# Helius — used for DAS getAsset when resolving NFT metadata
HELIUS_API_KEY=your_helius_api_key

# X (Twitter) API — required to post tweets
API_Key=your_twitter_app_key
API_Secret=your_twitter_app_secret
Access_Token=your_access_token
Access_Token_Secret=your_access_token_secret
```

Use a dedicated `HELIUS_API_KEY` for Helius. Do not reuse the Twitter `API_Key` env var for both.

## Configure Helius Webhook

In the [Helius dashboard](https://dashboard.helius.dev/webhooks), create a webhook with:

| Setting | Value |
|---------|--------|
| Network | `mainnet` |
| Webhook type | `enhanced` |
| Transaction types | `NFT_SALE` |
| Webhook URL | `https://<your-project>.vercel.app/api/helius-webhook` |
| Account addresses | `2RtGg6fsFiiF1EQzHqbd66AhW7R5bWeQGpTbv2UMkCdW` (Mad Lads royalty wallet) |

This scopes deliveries to sales that pay Mad Lads royalties, without monitoring entire marketplace programs (which would burn credits on unrelated collections).

The collection mint `J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHuTgh9w` is **not** suitable as the only watched address — it usually does not appear in sale transactions.

Reference: [Helius Webhooks](https://www.helius.dev/docs/webhooks) · [Transaction types](https://www.helius.dev/docs/webhooks/transaction-types)

## Deploy to Vercel

1. Import the repo in Vercel
2. Set all environment variables above
3. Deploy
4. Confirm health: `https://<your-project>.vercel.app/api/health`
5. Point your Helius webhook URL at `/api/helius-webhook`

## Local Development

```bash
npm install
npx vercel dev
```

- Health: `http://localhost:3000/api/health`
- Webhook: `http://localhost:3000/api/helius-webhook` (use a tunnel such as ngrok for Helius to reach it)

## Notes

- Helius may retry failed deliveries; the bot deduplicates by transaction signature.
- Each webhook delivery costs [1 Helius credit](https://helius.dev/docs/faqs/webhooks).
- Tweet failures are logged but do not fail the webhook response (Helius still gets `200`).
- Images are resized and compressed to JPEG before upload (Twitter’s 5 MB limit).
