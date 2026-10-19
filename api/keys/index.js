const crypto = require("node:crypto");
const { requireUser, send } = require("../../lib/auth");

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function dbRequest(path, options = {}) {
  const response = await fetch(`${URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(`Database request failed (${response.status})`);
  }

  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed" });
  }

  if (!URL || !SERVICE_KEY) {
    return send(res, 500, { error: "Server database is not configured" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  try {
    if (req.method === "GET") {
      const query = new URLSearchParams({
        select: "id,name,key_prefix,created_at,last_used_at,revoked_at",
        owner_id: `eq.${user.id}`,
        order: "created_at.desc",
        limit: "100"
      });

      const rows = await dbRequest(`nx_api_keys?${query}`);

      return send(res, 200, { keys: rows || [] });
    }

    const name =
      typeof req.body?.name === "string"
        ? req.body.name.trim()
        : "";

    if (name.length < 1 || name.length > 80) {
      return send(res, 400, {
        error: "Name must be between 1 and 80 characters"
      });
    }

    const rawKey = `nxk_${crypto.randomBytes(32).toString("base64url")}`;
    const keyHash = crypto
      .createHash("sha256")
      .update(rawKey, "utf8")
      .digest("hex");

    const keyPrefix = rawKey.slice(0, 12);

    const rows = await dbRequest(
      "nx_api_keys?select=id,name,key_prefix,created_at",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          owner_id: user.id,
          name,
          key_prefix: keyPrefix,
          key_hash: keyHash
        })
      }
    );

    const record = rows?.[0];

    if (!record) {
      return send(res, 500, { error: "Key creation failed" });
    }

    // The raw key is returned only in this creation response.
    return send(res, 201, {
      key: rawKey,
      record
    });
  } catch {
    return send(res, 500, { error: "API Key operation failed" });
  }
};
