
# Mad Lads Sales Webhook
Webhook receiver for Mad Lads sales on Solana.


## What It Does

- Receives enhanced webhook events at `POST /api/helius-webhook`
- Filters marketplace source to:
  - `MAGIC_EDEN`
  - `TENSOR`
- Keeps only sale events and tries to resolve Mad Lads info
- Logs:
  - `Madlads #<id>`
  - `Sold for <price> on <marketplace>`
  - `image <url>`

## Project Routes

- `POST /api/helius-webhook` -> Helius webhook target
- `GET /api/health` -> health check (`{ "ok": true }`)

## Environment Variables

Create `.env` (local) and set the same variable in Vercel Project Settings:

```env
HELIUS_API_KEY=your_helius_api_key
```

## Deploy to Vercel

1. Import the repo in Vercel
2. Set env var `HELIUS_API_KEY`
3. Deploy
4. Verify health endpoint:
   - `https://<your-project>.vercel.app/api/health`

## Configure Helius Webhook

In Helius dashboard, create a webhook with:

- Network: `mainnet`
- Webhook type: `enhanced`
- Transaction types: `NFT_SALE`
- Webhook URL:  
  `https://<your-project>.vercel.app/api/helius-webhook`
- Account addresses:
  - `M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K` (Magic Eden)
  - `TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp` (Tensor)

Reference: [Helius Webhooks Docs](https://www.helius.dev/docs/webhooks)

## Local Smoke Test

Run Vercel dev server:

```bash
npx vercel dev
```

Then call:

- `http://localhost:3000/api/health`

## Notes

- Helius can retry failed deliveries; duplicate events are expected.
- Webhook events consume Helius credits.