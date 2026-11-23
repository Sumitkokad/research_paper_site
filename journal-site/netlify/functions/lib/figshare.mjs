const API_ROOT = "https://api.figshare.com/v2";

function getToken() {
  const token = process.env.FIGSHARE_TOKEN;
  if (!token) {
    throw new Error("FIGSHARE_TOKEN is not configured.");
  }
  return token;
}

async function figshareRequest(path, method = "GET", body) {
  const response = await fetch(
    path.startsWith("https://") ? path : `${API_ROOT}${path}`,
    {
      method,
      headers: {
        Authorization: `token ${getToken()}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }
  );

  const raw = await response.text();

  if (!response.ok) {
    let detail = raw;
    try {
      detail = JSON.parse(raw).message || raw;
    } catch {}

    throw new Error(`Figshare API ${response.status}: ${detail}`);
  }

  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  return {
    data,
    location: response.headers.get("location")
  };
}

function articleMetadata(paper, paperUrl, licenseId = null) {
  const metadata = {
    title: paper.title,
    description: [
      paper.abstract || "",
      "",
      `Journal: ${process.env.JOURNAL_NAME || "IJRISE"}`,
      `Volume: ${paper.volume || "Not specified"}`,
      `Issue: ${paper.issue || "Not specified"}`,
      `Published on IJRISE: ${paper.publishedAt || ""}`,
      `IJRISE article page: ${paperUrl}`
    ].join("\n"),
    keywords: (paper.keywords || []).slice(0, 12),
    authors: (paper.authors || [])
      .slice(0, 10)
      .map(author => ({ name: author.name })),
    defined_type: "journal contribution",
    categories: [26860],
    references: paperUrl ? [paperUrl] : [],
    tags: ["IJRISE", "journal article"]
  };

  if (licenseId) {
    metadata.license = licenseId;
  }

  return metadata;
}

export async function createFigshareArticle(paper, paperUrl) {
  const result = await figshareRequest(
    "/account/articles",
    "POST",
    articleMetadata(paper, paperUrl)
  );

  const location = result.data?.location || result.location;

  if (!location) {
    throw new Error("Figshare did not return the new article location.");
  }

  const articleId = Number(location.split("/").filter(Boolean).at(-1));

  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    throw new Error("Figshare returned an invalid article ID.");
  }

  return {
    articleId,
    privateUrl: `https://figshare.com/account/articles/${articleId}`
  };
}

export async function updateFigshareArticle(
  articleId,
  paper,
  paperUrl,
  licenseId = null
) {
  await figshareRequest(
    `/account/articles/${articleId}`,
    "PUT",
    articleMetadata(paper, paperUrl, licenseId)
  );
}

export async function uploadFigsharePdf(articleId, fileName, buffer) {
  const filesResult = await figshareRequest(
    `/account/articles/${articleId}/files`
  );

  const existingFile = (filesResult.data || []).find(
    file => file.name === fileName
  );

  if (existingFile) {
    return {
      fileId: existingFile.id,
      name: existingFile.name,
      alreadyUploaded: true
    };
  }

  const md5 = (await import("node:crypto"))
    .createHash("md5")
    .update(buffer)
    .digest("hex");

  const initiated = await figshareRequest(
    `/account/articles/${articleId}/files`,
    "POST",
    {
      name: fileName,
      size: buffer.length,
      md5
    }
  );

  const uploadLocation =
    initiated.data?.location || initiated.location;

  if (!uploadLocation) {
    throw new Error("Figshare did not return the upload location.");
  }

  const uploadInfo = await figshareRequest(uploadLocation);
  const info = uploadInfo.data;

  if (!info?.upload_url || !info?.id) {
    throw new Error("Figshare returned incomplete upload information.");
  }

  const uploadStatus = await figshareRequest(info.upload_url);
  const parts = uploadStatus.data?.parts || [];

  if (!parts.length) {
    throw new Error("Figshare returned no upload parts.");
  }

  for (const part of parts) {
    const chunk = buffer.subarray(
      part.startOffset,
      part.endOffset + 1
    );

    const response = await fetch(
      `${info.upload_url}/${part.partNo}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: chunk
      }
    );

    if (!response.ok) {
      throw new Error(
        `Figshare file upload failed for part ${part.partNo}: HTTP ${response.status}`
      );
    }
  }

  await figshareRequest(
    `/account/articles/${articleId}/files/${info.id}`,
    "POST"
  );

  const verify = await figshareRequest(
    `/account/articles/${articleId}/files`
  );

  const uploaded = (verify.data || []).find(
    file => file.id === info.id || file.name === fileName
  );

  if (!uploaded) {
    throw new Error("Figshare upload completed but the file could not be verified.");
  }

  return {
    fileId: uploaded.id,
    name: uploaded.name,
    alreadyUploaded: false
  };
}

// Read DOI from whichever record has it, without throwing.
async function readDoiFast(articleId) {
  // Try public record first (fastest path when already live).
  try {
    const pub = await figshareRequest(`/articles/${articleId}`);
    const a = pub.data || {};
    if (a.doi) {
      return {
        doi: a.doi,
        recordUrl: a.url_public_html || "",
        publishedAt: a.published_date || new Date().toISOString()
      };
    }
  } catch {}

  // Fall back to private record.
  try {
    const priv = await figshareRequest(`/account/articles/${articleId}`);
    const a = priv.data || {};
    if (a.doi) {
      return {
        doi: a.doi,
        recordUrl: a.url_public_html || "",
        publishedAt: a.published_date || new Date().toISOString()
      };
    }
  } catch {}

  return null;
}

export async function publishFigshareArticle(
  articleId,
  paper,
  paperUrl,
  licenseId
) {
  if (!Number.isInteger(licenseId) || licenseId <= 0) {
    throw new Error("A valid, author-approved Figshare license is required.");
  }

  // Fast path: article is already live with a DOI — return immediately.
  const existing = await readDoiFast(articleId);
  if (existing) {
    return {
      articleId,
      doi: existing.doi,
      recordUrl: existing.recordUrl,
      publishedAt: existing.publishedAt
    };
  }

  // Not yet published — update metadata, then publish.
  await updateFigshareArticle(
    articleId,
    paper,
    paperUrl,
    licenseId
  );

  try {
    await figshareRequest(
      `/account/articles/${articleId}/publish`,
      "POST"
    );
  } catch (error) {
    // If the article got published by a concurrent retry, don't fail.
    const check = await readDoiFast(articleId);
    if (!check) throw error;
    return {
      articleId,
      doi: check.doi,
      recordUrl: check.recordUrl,
      publishedAt: check.publishedAt
    };
  }

  // Poll every 1 second, up to 30 seconds, for the DOI to appear.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const found = await readDoiFast(articleId);
    if (found) {
      return {
        articleId,
        doi: found.doi,
        recordUrl: found.recordUrl,
        publishedAt: found.publishedAt
      };
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Figshare accepted the publish request but no DOI appeared after 30 seconds. ` +
    `Open https://figshare.com/account/articles/${articleId} to check the record. ` +
    `If the DOI is visible there, click Publish again to finish the local finalisation.`
  );
}

export async function getFigshareLicenses() {
  const result = await figshareRequest("/licenses");
  return result.data || [];
}