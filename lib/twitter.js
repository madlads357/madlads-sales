const axios = require("axios");
const { TwitterApi } = require("twitter-api-v2");

let twitterClient = null;
let twitterRwClient = null;

const getTwitterClients = () => {
  if (twitterRwClient && twitterClient) {
    return { twitterClient, twitterRwClient };
  }

  const appKey = process.env.API_Key;
  const appSecret = process.env.API_Secret;
  const accessToken = process.env.Access_Token;
  const accessSecret = process.env.Access_Token_Secret;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error(
      "Missing Twitter credentials (API_Key, API_Secret, Access_Token, Access_Token_Secret)."
    );
  }

  twitterClient = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  });
  twitterRwClient = twitterClient.readWrite;
  return { twitterClient, twitterRwClient };
};

const formatSaleTweet = (sale) => {
  const headline = sale.id !== "Unknown" ? `Mad Lads #${sale.id}` : "Mad Lads";
  return `🔥 ${headline}\n\n💰 Sold for ◎${sale.price} on ${sale.marketplace} 🛒\n\n@madlads #MadLads`;
};

const postSaleTweet = async (sale) => {
  const { twitterRwClient: rwClient, twitterClient: rawClient } = getTwitterClients();
  const tweetText = formatSaleTweet(sale);

  try {
    if (sale.image && sale.image !== "unknown") {
      const imageResponse = await axios.get(sale.image, {
        responseType: "arraybuffer",
        timeout: 12000,
      });
      const mediaId = await rawClient.v1.uploadMedia(Buffer.from(imageResponse.data), {
        mimeType: "image/png",
      });

      await rwClient.v2.tweet({
        text: tweetText,
        media: { media_ids: [mediaId] },
      });
      console.log(`[tweet] posted with image for ${sale.signature}`);
      return;
    }

    await rwClient.v2.tweet({ text: tweetText });
    console.log(`[tweet] posted text-only for ${sale.signature}`);
  } catch (error) {
    console.error("[tweet] failed:", error?.data || error?.message || error);
  }
};

module.exports = { postSaleTweet };
