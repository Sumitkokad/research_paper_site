
import crypto from "node:crypto";
import fs from "node:fs";

const TOKEN = process.env.FIGSHARE_TOKEN;
const API = "https://api.figshare.com/v2";

if (!TOKEN) {
  console.error("ERROR: FIGSHARE_TOKEN is missing from .env");
  process.exit(1);
}

const headers = {
  Authorization: `token ${TOKEN}`,
  Accept: "application/json",
  "Content-Type": "application/json"
};

async function apiRequest(method, url, body) {
  const response = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Figshare API error ${response.status}: ${text.slice(0, 2000)}`
    );
  }

  return text ? JSON.parse(text) : {};
}

// Generate a tiny valid PDF for testing.
function createTestPdf() {
  const stream = [
    "BT",
    "/F1 20 Tf",
    "60 730 Td",
    "(IJRISE - Figshare API Test) Tj",
    "0 -35 Td",
    "/F1 12 Tf",
    "(Private draft upload test. Not a published paper.) Tj",
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);

  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

async function main() {
  console.log("Starting Figshare draft upload test...\n");

  // 1. Generate test PDF.
  const pdf = createTestPdf();
  const fileName = "ijrise-figshare-api-test.pdf";

  fs.writeFileSync(`scripts/${fileName}`, pdf);

  console.log("Test PDF created.");
  console.log("File size:", pdf.length, "bytes");

  // 2. Create private draft article.
  const title =
    `IJRISE Figshare API Test - ${new Date().toISOString()}`;

  console.log("\nCreating private draft...");

  const created = await apiRequest(
    "POST",
    `${API}/account/articles`,
    { title }
  );

  if (!created.location) {
    throw new Error(
      "Figshare did not return an article location: " +
      JSON.stringify(created)
    );
  }

  const article = await apiRequest("GET", created.location);
  const articleId = article.id;

  if (!articleId) {
    throw new Error("Could not retrieve the created article ID.");
  }

  console.log("Private draft created successfully!");
  console.log("Article ID:", articleId);
  console.log("Title:", article.title);

  // 3. Calculate PDF checksum.
  const md5 = crypto
    .createHash("md5")
    .update(pdf)
    .digest("hex");

  // 4. Initiate file upload.
  console.log("\nStarting PDF upload...");

  const initiated = await apiRequest(
    "POST",
    `${API}/account/articles/${articleId}/files`,
    {
      name: fileName,
      size: pdf.length,
      md5
    }
  );

  if (!initiated.location) {
    throw new Error(
      "Figshare did not return an upload location: " +
      JSON.stringify(initiated)
    );
  }

  const uploadInfo = await apiRequest("GET", initiated.location);

  if (!uploadInfo.upload_url || !uploadInfo.id) {
    throw new Error("Could not retrieve upload information.");
  }

  // 5. Retrieve upload parts.
  const uploadStatus = await apiRequest(
    "GET",
    uploadInfo.upload_url
  );

  console.log("Uploading PDF parts:", uploadStatus.parts.length);

  // 6. Upload each part.
  for (const part of uploadStatus.parts) {
    const chunk = pdf.subarray(
      part.startOffset,
      part.endOffset + 1
    );

    const uploadResponse = await fetch(
      `${uploadInfo.upload_url}/${part.partNo}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: chunk
      }
    );

    if (!uploadResponse.ok) {
      throw new Error(
        `PDF part ${part.partNo} failed: HTTP ${uploadResponse.status}`
      );
    }

    console.log(`Uploaded part ${part.partNo}`);
  }

  // 7. Complete upload.
  console.log("\nCompleting PDF upload...");

  await apiRequest(
    "POST",
    `${API}/account/articles/${articleId}/files/${uploadInfo.id}`
  );

  // 8. Verify file.
  const files = await apiRequest(
    "GET",
    `${API}/account/articles/${articleId}/files`
  );

  console.log("\n==================================");
  console.log("FIGSHARE TEST COMPLETED");
  console.log("==================================");
  console.log("Article ID:", articleId);
  console.log("Article URL:", article.url_public_html || "Not public");
  console.log("Uploaded files:", files.length);

  for (const file of files) {
    console.log("-", file.name);
  }

  console.log("\nThe article has NOT been published.");
  console.log("No public DOI has been registered.");
  console.log("Keep the article ID for future testing.");
}

main().catch(error => {
  console.error("\nFIGSHARE TEST FAILED:");
  console.error(error.message);
  process.exitCode = 1;
});
