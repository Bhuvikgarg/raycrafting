#!/usr/bin/env node
/**
 * Cloudinary Batch Upload Script for Raycrafting
 *
 * Usage:
 *   CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME node scripts/upload-cloudinary.js
 * Or:
 *   CLOUDINARY_CLOUD_NAME=xxx CLOUDINARY_API_KEY=xxx CLOUDINARY_API_SECRET=xxx node scripts/upload-cloudinary.js
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
let apiKey = process.env.CLOUDINARY_API_KEY;
let apiSecret = process.env.CLOUDINARY_API_SECRET;

if (process.env.CLOUDINARY_URL) {
  try {
    const parsed = new URL(process.env.CLOUDINARY_URL);
    apiKey = parsed.username;
    apiSecret = parsed.password;
    cloudName = parsed.hostname;
  } catch (err) {
    console.error("Invalid CLOUDINARY_URL:", err.message);
  }
}

if (!cloudName || !apiKey || !apiSecret) {
  console.log(`
[Cloudinary Upload Tool]
No Cloudinary credentials provided in environment.

To upload all local assets to Cloudinary for compressed reliable delivery:
  export CLOUDINARY_URL="cloudinary://<api_key>:<api_secret>@<cloud_name>"
  node scripts/upload-cloudinary.js

Or add them to your .env file.
`);
  process.exit(0);
}

const PRODUCTS_DIR = path.join(__dirname, "..", "assets", "products");
const files = fs.readdirSync(PRODUCTS_DIR).filter((f) => /\.(webp|jpg|jpeg|png)$/i.test(f));

console.log(`Found ${files.length} images to upload to Cloudinary [${cloudName}]...`);

async function uploadFile(filename) {
  const filePath = path.join(PRODUCTS_DIR, filename);
  const publicId = `raycrafting/${path.parse(filename).name}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const signStr = `folder=raycrafting&public_id=${path.parse(filename).name}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(signStr).digest("hex");

  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]));
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("folder", "raycrafting");
  formData.append("public_id", path.parse(filename).name);
  formData.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Upload failed");
  }
  return data.secure_url;
}

(async () => {
  let count = 0;
  for (const file of files) {
    try {
      const url = await uploadFile(file);
      count++;
      console.log(`[${count}/${files.length}] Uploaded: ${file} -> ${url}`);
    } catch (err) {
      console.error(`Failed ${file}:`, err.message);
    }
  }
  console.log(`Finished Cloudinary upload: ${count} files succeeded.`);
})();
