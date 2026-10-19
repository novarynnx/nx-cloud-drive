const { requireUser, send } = require("../../lib/auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return send(res, 500, {
      error: "Server database is not configured"
    });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const id = req.query.id;

  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  ) {
    return send(res, 400, { error: "Invalid key ID" });
  }

  try {
    const query = new URLSearchParams({
      id: `eq.${id}`,
      owner_id: `eq.${user.id}`,
      revoked_at: "is.null"
    });

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/nx_api_keys?${query}`,
      {
        method: "PATCH",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          revoked_at: new Date().toISOString()
        })
      }
    );

    if (!response.ok) {
      return send(res, 500, { error: "Revocation failed" });
    }

    const rows = await response.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return send(res, 404, {
        error: "Active key not found"
      });
    }

    return send(res, 200, {
      success: true,
      id: rows[0].id,
      revoked_at: rows[0].revoked_at
    });
  } catch {
    return send(res, 500, { error: "Revocation failed" });
  }
};
