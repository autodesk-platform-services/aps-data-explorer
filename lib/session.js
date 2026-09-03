import crypto from "crypto";

// Minimal server-side session middleware.
//
// The session data (client secret, access token, refresh token) never leaves the
// server: it is held in an in-memory map, and the browser only gets a signed,
// opaque session ID in an HttpOnly cookie.

const SWEEP_INTERVAL = 10 * 60 * 1000; // 10 minutes

function sign(sid, secret) {
  return crypto.createHmac("sha256", secret).update(sid).digest("base64url");
}

function unsign(value, secret) {
  const separator = value.lastIndexOf(".");
  if (separator < 0)
    return null;

  const sid = value.slice(0, separator);
  const mac = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(sid, secret));

  if (mac.length !== expected.length || !crypto.timingSafeEqual(mac, expected))
    return null;

  return sid;
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header)
    return null;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0)
      continue;

    if (part.slice(0, separator).trim() !== name)
      continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

class MemoryStore {
  constructor(maxAge) {
    this.maxAge = maxAge;
    this.sessions = new Map();

    const timer = setInterval(() => this.sweep(), SWEEP_INTERVAL);
    timer.unref();
  }

  get(sid) {
    const entry = this.sessions.get(sid);
    if (!entry)
      return null;

    if (entry.expires <= Date.now()) {
      this.sessions.delete(sid);
      return null;
    }

    return entry.data;
  }

  set(sid, data) {
    this.sessions.set(sid, { data, expires: Date.now() + this.maxAge });
  }

  destroy(sid) {
    this.sessions.delete(sid);
  }

  sweep() {
    const now = Date.now();
    for (const [sid, entry] of this.sessions) {
      if (entry.expires <= now)
        this.sessions.delete(sid);
    }
  }
}

export default function session({ name = "session", secret, maxAge = 24 * 60 * 60 * 1000, secure = false }) {
  if (!secret)
    throw new Error("A session secret is required");

  const store = new MemoryStore(maxAge);

  return function sessionMiddleware(req, res, next) {
    const cookieValue = readCookie(req, name);
    const existingSid = cookieValue ? unsign(cookieValue, secret) : null;

    // The session data lives in the store, so mutating req.session is enough to
    // persist it; save() is only kept for callers that expect the usual API.
    const attach = (sid, data) => {
      req.sessionID = sid;
      req.session = data;

      // Redefined on every request, so that the helpers below always refer to the
      // session ID of the request at hand
      Object.defineProperties(req.session, {
        save: {
          configurable: true,
          value: (callback) => {
            store.set(sid, data);
            if (callback)
              callback(null);
          }
        },
        destroy: {
          configurable: true,
          value: (callback) => {
            store.destroy(sid);
            if (callback)
              callback(null);
          }
        },
        regenerate: {
          configurable: true,
          value: (callback) => {
            store.destroy(sid);
            const newSid = crypto.randomBytes(32).toString("base64url");
            attach(newSid, {});
            if (callback)
              callback(null);
          }
        }
      });
    };

    const knownData = existingSid ? store.get(existingSid) : null;

    if (knownData)
      attach(existingSid, knownData);
    else
      attach(crypto.randomBytes(32).toString("base64url"), {});

    // The cookie has to be written just before the headers are flushed, so that
    // it reflects whatever the route handler did with the session.
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      const sid = req.sessionID;
      const isEmpty = Object.keys(req.session).length === 0;

      // Nothing worth remembering yet: don't hand out a session at all
      if (!isEmpty || store.get(sid)) {
        store.set(sid, req.session);
        res.cookie(name, `${sid}.${sign(sid, secret)}`, {
          httpOnly: true,
          sameSite: "lax",
          secure,
          maxAge,
          path: "/"
        });
      }

      return writeHead.apply(this, args);
    };

    next();
  };
}
