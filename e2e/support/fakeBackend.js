import { expect, test as base } from "@playwright/test";

export const E2E_SUPABASE_ORIGIN = "http://127.0.0.1:54321";
const AUTH_STORAGE_KEY = "sb-127-auth-token";

export const DEFAULT_USER = {
  id: "user-smoke",
  email: "smoke@example.com",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};

function createInitialState() {
  return {
    currentUser: { ...DEFAULT_USER },
    profiles: [
      {
        id: DEFAULT_USER.id,
        email: DEFAULT_USER.email,
        streaming_services: [],
        default_draw_settings: null,
      },
    ],
    bowls: [],
    bowl_members: [],
    bowl_movies: [],
    bowl_draw_events: [],
    user_watch_events: [],
    bowl_invites: [],
    bowl_draw_permissions: [],
    addLinks: {},
    tmdbSearchResults: [],
  };
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64url");
}

function createAccessToken(user, expiresAt) {
  return [
    encodeJwtPart({ alg: "HS256", typ: "JWT" }),
    encodeJwtPart({
      aud: "authenticated",
      exp: expiresAt,
      sub: user.id,
      email: user.email,
      role: "authenticated",
    }),
    "e2e-signature",
  ].join(".");
}

function createSession(user = DEFAULT_USER) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  return {
    access_token: createAccessToken(user, expiresAt),
    refresh_token: "movie-bowl-e2e-refresh-token",
    token_type: "bearer",
    expires_in: 60 * 60,
    expires_at: expiresAt,
    user: {
      ...DEFAULT_USER,
      ...user,
      email_confirmed_at: "2026-08-21T12:00:00.000Z",
      created_at: "2026-08-21T12:00:00.000Z",
      updated_at: "2026-08-21T12:00:00.000Z",
    },
  };
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
}

async function fulfillJson(route, body, status = 200, headers = {}) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { ...corsHeaders(), ...headers },
    body: body === undefined ? "" : JSON.stringify(body),
  });
}

function decodeFilterValue(value) {
  const stringValue = String(value ?? "");
  if (stringValue === "null") return null;
  if (stringValue === "true") return true;
  if (stringValue === "false") return false;
  return stringValue;
}

function valuesEqual(left, right) {
  if (right === null) return left == null;
  return String(left ?? "") === String(right);
}

function matchesFilter(row, key, expression) {
  if (["select", "order", "limit", "offset", "on_conflict"].includes(key)) {
    return true;
  }

  if (expression.startsWith("eq.")) {
    return valuesEqual(row[key], decodeFilterValue(expression.slice(3)));
  }
  if (expression.startsWith("is.")) {
    return valuesEqual(row[key], decodeFilterValue(expression.slice(3)));
  }
  if (expression.startsWith("ilike.")) {
    const pattern = expression.slice(6).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
    return new RegExp(`^${pattern}$`, "i").test(String(row[key] ?? ""));
  }
  if (expression.startsWith("in.(") && expression.endsWith(")")) {
    const values = expression
      .slice(4, -1)
      .split(",")
      .map((value) => value.replace(/^"|"$/g, ""));
    return values.some((value) => valuesEqual(row[key], value));
  }

  return true;
}

function filterRows(rows, searchParams) {
  let filtered = [...rows];
  for (const [key, expression] of searchParams.entries()) {
    filtered = filtered.filter((row) => matchesFilter(row, key, expression));
  }

  const order = searchParams.get("order");
  if (order) {
    const orderRules = order.split(",").map((rule) => {
      const [field, direction = "asc"] = rule.split(".");
      return { field, direction };
    });
    filtered.sort((left, right) => {
      for (const { field, direction } of orderRules) {
        const leftValue = left[field] ?? "";
        const rightValue = right[field] ?? "";
        const comparison = String(leftValue).localeCompare(String(rightValue));
        if (comparison !== 0) return direction === "desc" ? -comparison : comparison;
      }
      return 0;
    });
  }

  const limitParam = searchParams.get("limit");
  if (limitParam === null) {
    return filtered;
  }

  const limit = Number(limitParam);
  return Number.isFinite(limit) && limit >= 0 ? filtered.slice(0, limit) : filtered;
}

function wantsObject(request) {
  return String(request.headers().accept || "").includes("application/vnd.pgrst.object+json");
}

function responseShape(request, rows) {
  return wantsObject(request) ? rows[0] ?? null : rows;
}

function nextId(state, prefix, table) {
  return `${prefix}-${state[table].length + 1}`;
}

function normalizeInsertedRows(body) {
  return Array.isArray(body) ? body : [body];
}

class FakeBackend {
  constructor() {
    this.state = createInitialState();
    this.requests = [];
    this.unhandledRequests = [];
    this.pageErrors = [];
    this.consoleErrors = [];
  }

  async install(page) {
    page.on("pageerror", (error) => {
      this.pageErrors.push(error.message);
    });
    page.on("console", (message) => {
      if (message.type() === "error") this.consoleErrors.push(message.text());
    });

    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === E2E_SUPABASE_ORIGIN) {
        await this.handleSupabase(route);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        await this.handleAppApi(route);
        return;
      }
      await route.continue();
    });
  }

  async authenticate(page, user = this.state.currentUser) {
    this.state.currentUser = { ...DEFAULT_USER, ...user };
    const existingProfile = this.state.profiles.find((profile) => profile.id === user.id);
    if (!existingProfile) {
      this.state.profiles.push({
        id: user.id,
        email: user.email,
        streaming_services: [],
        default_draw_settings: null,
      });
    }
    await page.addInitScript(
      ({ storageKey, session }) => {
        window.localStorage.setItem(storageKey, JSON.stringify(session));
      },
      { storageKey: AUTH_STORAGE_KEY, session: createSession(this.state.currentUser) }
    );
  }

  async handleSupabase(route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;
    this.requests.push({ method, pathname: url.pathname, body });

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
      return;
    }

    if (url.pathname === "/auth/v1/otp" && method === "POST") {
      await fulfillJson(route, {});
      return;
    }

    if (url.pathname === "/auth/v1/logout" && method === "POST") {
      await fulfillJson(route, {});
      return;
    }

    if (url.pathname.startsWith("/rest/v1/rpc/") && method === "POST") {
      const rpcName = url.pathname.split("/").pop();
      await this.handleRpc(route, rpcName, body || {});
      return;
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (!Array.isArray(this.state[table])) {
        await this.unhandled(route, `Unknown Supabase table ${table}`);
        return;
      }
      await this.handleTable(route, table, url, body);
      return;
    }

    await this.unhandled(route, `Unhandled Supabase request ${method} ${url.pathname}`);
  }

  async handleTable(route, table, url, body) {
    const request = route.request();
    const method = request.method();

    if (method === "GET") {
      const rows = filterRows(this.state[table], url.searchParams);
      await fulfillJson(route, responseShape(request, rows), 200, {
        "content-range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0",
      });
      return;
    }

    if (method === "POST") {
      const sourceRows = normalizeInsertedRows(body || {});
      const existingMemberships =
        table === "bowl_members"
          ? sourceRows.map((sourceRow) =>
              this.state.bowl_members.find(
                (member) =>
                  member.bowl_id === sourceRow.bowl_id && member.user_id === sourceRow.user_id
              )
            )
          : [];
      if (existingMemberships.length > 0 && existingMemberships.every(Boolean)) {
        await fulfillJson(route, responseShape(request, existingMemberships));
        return;
      }

      const insertedRows = sourceRows.map((sourceRow) => {
        const now = new Date().toISOString();
        const row = { ...sourceRow };
        if (table === "profiles") {
          const existing = this.state.profiles.find((profile) => profile.id === row.id);
          if (existing) {
            Object.assign(existing, row);
            return existing;
          }
        }
        if (table === "bowls") {
          row.id ||= nextId(this.state, "bowl", table);
          row.created_at ||= now;
          row.updated_at ||= now;
          row.draw_access_mode ||= "all_members";
          row.draw_method ||= "person_first";
        }
        if (table === "bowl_members") {
          row.id ||= nextId(this.state, "member", table);
        }
        if (table === "bowl_movies") {
          row.id ||= nextId(this.state, "movie", table);
          row.tmdb_id ??= -(this.state.bowl_movies.length + 1);
          row.added_at ||= now;
          row.drawn_at ??= null;
          row.drawn_by ??= null;
        }
        if (table === "bowl_invites") {
          row.id ||= nextId(this.state, "invite", table);
          row.created_at ||= now;
          row.accepted_at ??= null;
        }
        this.state[table].push(row);
        return row;
      });
      await fulfillJson(route, responseShape(request, insertedRows), 201, {
        "content-range": `0-${Math.max(0, insertedRows.length - 1)}/${insertedRows.length}`,
      });
      return;
    }

    if (method === "PATCH") {
      const matchingRows = filterRows(this.state[table], url.searchParams);
      matchingRows.forEach((row) => Object.assign(row, body || {}));
      await fulfillJson(route, responseShape(request, matchingRows));
      return;
    }

    if (method === "DELETE") {
      const matchingRows = new Set(filterRows(this.state[table], url.searchParams));
      this.state[table] = this.state[table].filter((row) => !matchingRows.has(row));
      await fulfillJson(route, []);
      return;
    }

    await this.unhandled(route, `Unhandled table request ${method} ${table}`);
  }

  async handleRpc(route, rpcName, args) {
    if (rpcName === "get_my_bowls_with_counts") {
      const rows = this.state.bowls.map((bowl) => ({
        ...bowl,
        remaining_count: this.state.bowl_movies.filter(
          (movie) => movie.bowl_id === bowl.id && movie.drawn_at == null
        ).length,
        member_count: new Set(
          this.state.bowl_members
            .filter((member) => member.bowl_id === bowl.id)
            .map((member) => member.user_id)
        ).size,
        last_activity_at: bowl.updated_at || bowl.created_at || null,
      }));
      await fulfillJson(route, rows);
      return;
    }

    if (rpcName === "get_bowl_profile_directory") {
      const bowl = this.state.bowls.find((row) => row.id === args.p_bowl_id);
      const userIds = new Set([
        bowl?.owner_id,
        ...this.state.bowl_members
          .filter((member) => member.bowl_id === args.p_bowl_id)
          .map((member) => member.user_id),
      ]);
      const rows = this.state.profiles
        .filter((profile) => userIds.has(profile.id))
        .map((profile) => ({ user_id: profile.id, email: profile.email }));
      await fulfillJson(route, rows);
      return;
    }

    if (rpcName === "get_my_invite_sender_directory") {
      await fulfillJson(
        route,
        this.state.profiles.map((profile) => ({ user_id: profile.id, email: profile.email }))
      );
      return;
    }

    if (rpcName === "draw_bowl_movie") {
      const movie = this.state.bowl_movies.find((row) => row.id === args.p_bowl_movie_id);
      if (!movie || movie.drawn_at) {
        await fulfillJson(route, { message: "Movie is no longer available", code: "P0001" }, 400);
        return;
      }
      const now = new Date().toISOString();
      movie.drawn_at = now;
      movie.drawn_by = this.state.currentUser.id;
      const drawEvent = {
        ...movie,
        id: nextId(this.state, "draw", "bowl_draw_events"),
        source_bowl_movie_id: movie.id,
        drawn_at: now,
        drawn_by: this.state.currentUser.id,
        returned_at: null,
      };
      this.state.bowl_draw_events.push(drawEvent);

      const bowl = this.state.bowls.find((row) => row.id === movie.bowl_id);
      const participantIds = new Set([
        bowl?.owner_id,
        ...this.state.bowl_members
          .filter((member) => member.bowl_id === movie.bowl_id)
          .map((member) => member.user_id),
      ]);
      participantIds.forEach((userId) => {
        if (!userId) return;
        this.state.user_watch_events.push({
          id: nextId(this.state, "watch", "user_watch_events"),
          user_id: userId,
          source_draw_event_id: drawEvent.id,
          source_kind: "bowl_draw",
          bowl_name: bowl?.name || "Movie Bowl",
          tmdb_id: movie.tmdb_id,
          title: movie.title,
          poster_path: movie.poster_path || null,
          release_date: movie.release_date || null,
          runtime: movie.runtime || null,
          genres: movie.genres || [],
          overview: movie.overview || null,
          watched_on: now.slice(0, 10),
          created_at: now,
          updated_at: now,
        });
      });
      await fulfillJson(route, null);
      return;
    }

    if (rpcName === "return_bowl_draw_to_bowl") {
      const drawEvent = this.state.bowl_draw_events.find(
        (row) => row.id === args.p_draw_event_id
      );
      if (!drawEvent) {
        await fulfillJson(route, { message: "Draw event not found", code: "P0001" }, 400);
        return;
      }
      drawEvent.returned_at = new Date().toISOString();
      const movie = this.state.bowl_movies.find(
        (row) => row.id === drawEvent.source_bowl_movie_id
      );
      if (movie) {
        movie.drawn_at = null;
        movie.drawn_by = null;
      }
      this.state.user_watch_events = this.state.user_watch_events.filter(
        (row) => row.source_draw_event_id !== drawEvent.id
      );
      await fulfillJson(route, null);
      return;
    }

    await this.unhandled(route, `Unhandled Supabase RPC ${rpcName}`);
  }

  async handleAppApi(route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = request.postDataJSON?.() ?? null;
    this.requests.push({ method, pathname: url.pathname, body });

    if (url.pathname === "/api/tmdb/search" && method === "GET") {
      await fulfillJson(route, { results: this.state.tmdbSearchResults });
      return;
    }

    if (url.pathname === "/api/tmdb/movie/providers" && method === "GET") {
      await fulfillJson(route, { results: { US: { flatrate: [], ads: [] } } });
      return;
    }

    if (url.pathname === "/api/invites/send" && method === "POST") {
      const inviteCount = Array.isArray(body?.invites) ? body.invites.length : 0;
      await fulfillJson(route, {
        sent: inviteCount,
        failed: 0,
        results: (body?.invites || []).map((invite) => ({ token: invite.token, ok: true })),
      });
      return;
    }

    if (url.pathname === "/api/tv-pairing/start" && method === "POST") {
      await fulfillJson(route, {
        deviceId: "device-smoke",
        deviceSecret: "movie-bowl-smoke-device-secret",
        userCode: "ABCD-2345",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        verificationUri: "http://127.0.0.1:4173/activate-tv",
        verificationUriComplete: "http://127.0.0.1:4173/activate-tv?code=ABCD-2345",
        pollIntervalSeconds: 60,
      });
      return;
    }

    if (url.pathname.startsWith("/api/add-links/") && method === "GET") {
      const token = decodeURIComponent(url.pathname.slice("/api/add-links/".length));
      const link = this.state.addLinks[token];
      await fulfillJson(
        route,
        link || { status: "not_found", bowlName: "Movie Bowl", remainingAdds: 0 },
        link ? 200 : 404
      );
      return;
    }

    if (url.pathname === "/api/add-links/consume" && method === "POST") {
      const link = this.state.addLinks[body?.token];
      if (!link || link.remainingAdds <= 0) {
        await fulfillJson(route, { error: "Add link is exhausted.", code: "link_exhausted" }, 410);
        return;
      }
      const now = new Date().toISOString();
      const addedByName = String(body?.contributorName || link.defaultContributorName || "Link Guest").trim() || "Link Guest";
      const movie = body?.movie || {};
      this.state.bowl_movies.push({
        id: nextId(this.state, "movie", "bowl_movies"),
        bowl_id: link.bowlId,
        tmdb_id: Number(movie.tmdb_id) > 0 ? Number(movie.tmdb_id) : -(this.state.bowl_movies.length + 1),
        title: movie.title,
        poster_path: movie.poster_path || null,
        release_date: movie.release_date || null,
        runtime: movie.runtime || null,
        genres: movie.genres || [],
        overview: movie.overview || null,
        added_by: null,
        added_by_name: addedByName,
        added_at: now,
        drawn_at: null,
        drawn_by: null,
        snapshot_at: now,
      });
      link.remainingAdds -= 1;
      link.status = link.remainingAdds > 0 ? "active" : "exhausted";
      await fulfillJson(route, {
        bowlName: link.bowlName,
        remainingAdds: link.remainingAdds,
        addedByName,
      });
      return;
    }

    await this.unhandled(route, `Unhandled app API request ${method} ${url.pathname}`);
  }

  async unhandled(route, description) {
    this.unhandledRequests.push(description);
    await fulfillJson(route, { error: description }, 501);
  }
}

export const test = base.extend({
  backend: async ({ page }, provideBackend) => {
    const backend = new FakeBackend();
    await backend.install(page);
    await provideBackend(backend);
    expect(backend.unhandledRequests, "all external calls should be handled by the boundary fake").toEqual([]);
    expect(backend.pageErrors, "the page should not throw uncaught errors").toEqual([]);
    expect(backend.consoleErrors, "the browser console should stay error-free").toEqual([]);
  },
});

export { expect };
