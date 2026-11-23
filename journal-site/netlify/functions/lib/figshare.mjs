
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
    defined_type: "paper",
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

  // Prevent duplicate uploads when an admin retries the draft action.
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

export async function publishFigshareArticle(
  articleId,
  paper,
  paperUrl,
  licenseId
) {
  if (!Number.isInteger(licenseId) || licenseId <= 0) {
    throw new Error("A valid, author-approved Figshare license is required.");
  }

  await updateFigshareArticle(
    articleId,
    paper,
    paperUrl,
    licenseId
  );

  await figshareRequest(
    `/account/articles/${articleId}/publish`,
    "POST"
  );

  // Read the public record to obtain the DOI and public URL.
  const publicResult = await figshareRequest(
    `/articles/${articleId}`
  );

  const publicArticle = publicResult.data || {};

  // Also check the private record in case public metadata takes a moment.
  let privateArticle = {};
  if (!publicArticle.doi || !publicArticle.url_public_html) {
    const privateResult = await figshareRequest(
      `/account/articles/${articleId}`
    );
    privateArticle = privateResult.data || {};
  }

  const doi = publicArticle.doi || privateArticle.doi || "";
  const recordUrl =
    publicArticle.url_public_html ||
    privateArticle.url_public_html ||
    "";

  return {
    articleId,
    doi,
    recordUrl,
    publishedAt:
      publicArticle.published_date ||
      privateArticle.published_date ||
      new Date().toISOString()
  };
}

export async function getFigshareLicenses() {
  const result = await figshareRequest("/licenses");
  return result.data || [];
}
