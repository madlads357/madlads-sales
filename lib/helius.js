const axios = require("axios");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || process.env.API_Key;
const assetCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchAssetByMint = async (mint) => {
  if (!HELIUS_API_KEY || !mint) return null;
  if (assetCache.has(mint)) return assetCache.get(mint);

  try {
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
      {
        jsonrpc: "2.0",
        id: "madlads-sales-bot",
        method: "getAsset",
        params: { id: mint },
      },
      { timeout: 15000 }
    );
    const asset = response.data?.result || null;
    assetCache.set(mint, asset);
    return asset;
  } catch (error) {
    if (error?.response?.data?.error?.code === -32429) await sleep(250);
    return null;
  }
};

module.exports = { fetchAssetByMint };
