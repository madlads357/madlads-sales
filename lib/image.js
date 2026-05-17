const sharp = require("sharp");

// Twitter upload limit is 5 MiB; stay under with headroom.
const TWITTER_MAX_BYTES = 5 * 1024 * 1024 - 64 * 1024;
const MAX_DIMENSION = 1200;
const JPEG_QUALITIES = [85, 75, 65, 55, 45, 35];

const encodeJpeg = (inputBuffer, maxSide, quality) =>
  sharp(inputBuffer)
    .rotate()
    .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

const prepareImageForTwitter = async (inputBuffer) => {
  for (const quality of JPEG_QUALITIES) {
    const buffer = await encodeJpeg(inputBuffer, MAX_DIMENSION, quality);
    if (buffer.length <= TWITTER_MAX_BYTES) {
      return { buffer, mimeType: "image/jpeg" };
    }
  }

  const buffer = await encodeJpeg(inputBuffer, 800, 40);
  if (buffer.length > TWITTER_MAX_BYTES) {
    throw new Error(`Image still too large after compression (${buffer.length} bytes)`);
  }
  return { buffer, mimeType: "image/jpeg" };
};

module.exports = { prepareImageForTwitter };
