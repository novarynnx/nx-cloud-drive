const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY;

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

async function requireUser(req, res) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    send(res, 500, { error: "Server auth is not configured" });
    return null;
  }

  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    send(res, 401, { error: "Sign in required" });
    return null;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${match[1]}`
        }
      }
    );

    if (!response.ok) {
      send(res, 401, { error: "Invalid or expired session" });
      return null;
    }

    const user = await response.json();

    if (!user || !user.id) {
      send(res, 401, { error: "Invalid session" });
      return null;
    }

    return user;
  } catch {
    send(res, 503, { error: "Authentication service unavailable" });
    return null;
  }
}

module.exports = { requireUser, send };
