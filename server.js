const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { createClient } = require("@supabase/supabase-js");

const PORT = Number(process.env.PORT || 3000);
const CREATOR_PASSWORD = process.env.CREATOR_PASSWORD || "Erik2011";
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, "index.html");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "class_portal_state";

// Koment në shqip: orari bazë i javës kur nuk ka ende të dhëna të tjera
const DEFAULT_SCHEDULE = {
  monday: "Matematikë, Gjuhë shqipe",
  tuesday: "Histori, Biologji",
  wednesday: "Fizikë, Anglisht, Informatikë",
  thursday: "Kimi, Gjeografi",
  friday: "Art, Edukim fizik, Këshillim klase"
};

// Koment në shqip: artikujt fillestarë të dyqanit të lojës
const DEFAULT_SHOP = [
  { id: "lucky_ticket", name: "Biletë me Fat", price: 25, effectLabel: "Shton fat", description: "Një shans për të rritur fitimin në lojën tjetër." },
  { id: "shield", name: "Mbrojtje", price: 40, effectLabel: "Mbron humbjen", description: "Mbron nga humbja e parë në një duel ose bet." },
  { id: "double", name: "Double Up", price: 30, effectLabel: "Dyfishon fitimin", description: "Dyfishon fitimin në një fitore të ardhshme." }
];

// Koment në shqip: krijon një ID unike për profilet, mesazhet dhe ngjarjet
function uid() {
  return crypto.randomUUID();
}

// Koment në shqip: ruan kohën aktuale në format të standardizuar
function now() {
  return new Date().toISOString();
}

// Koment në shqip: gjendja fillestare e gjithë faqes së klasës
function defaultData() {
  return {
    profiles: [
      {
        id: uid(),
        firstName: "Ardian",
        lastName: "Hoxha",
        nickname: "Kapiteni",
        role: "Kryetar i klasës",
        points: 2,
        money: 20,
        inventory: [],
        createdAt: now(),
        updatedAt: now()
      },
      {
        id: uid(),
        firstName: "Elira",
        lastName: "Krasniqi",
        nickname: "Ylli",
        role: "Nënkryetare",
        points: 2,
        money: 15,
        inventory: [],
        createdAt: now(),
        updatedAt: now()
      }
    ],
    schedule: DEFAULT_SCHEDULE,
    chat: [
      { id: uid(), type: "system", author: "Sistemi", text: "Mirë se erdhët në chat-in e klasës.", createdAt: now() }
    ],
    history: [],
    matchQueue: [],
    shop: DEFAULT_SHOP,
    creatorActive: false
  };
}

// Koment në shqip: rregullon të dhënat që të kenë gjithmonë të njëjtën formë
function normalizeData(input) {
  const fresh = defaultData();
  return {
    profiles: Array.isArray(input.profiles) ? input.profiles.map((p) => ({
      id: p.id || uid(),
      firstName: p.firstName || "Pa emër",
      lastName: p.lastName || "Pa mbiemër",
      nickname: p.nickname || "",
      role: p.role || "Student",
      points: Number(p.points || 0),
      money: Number(p.money || 0),
      inventory: Array.isArray(p.inventory) ? p.inventory : [],
      createdAt: p.createdAt || now(),
      updatedAt: p.updatedAt || now()
    })) : fresh.profiles,
    schedule: { ...fresh.schedule, ...(input.schedule || {}) },
    chat: Array.isArray(input.chat) ? input.chat : fresh.chat,
    history: Array.isArray(input.history) ? input.history : fresh.history,
    matchQueue: Array.isArray(input.matchQueue) ? input.matchQueue : fresh.matchQueue,
    shop: Array.isArray(input.shop) ? input.shop : fresh.shop,
    creatorActive: Boolean(input.creatorActive)
  };
}

// Koment në shqip: nëse ka Supabase, ruajmë aty; përndryshe përdorim file lokal
const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

// Koment në shqip: lexon gjendjen nga backend-i ose nga file lokal
async function readData() {
  if (supabase) {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select("state")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.state) {
      const fresh = defaultData();
      await writeData(fresh);
      return fresh;
    }
    return normalizeData(data.state);
  }

  const filePath = path.join(ROOT, "data.json");
  try {
    if (!fs.existsSync(filePath)) {
      const fresh = defaultData();
      fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), "utf8");
      return fresh;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeData(parsed);
  } catch {
    const fresh = defaultData();
    fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), "utf8");
    return fresh;
  }
}

// Koment në shqip: shkruan gjendjen në Supabase ose në file lokal
async function writeData(data) {
  if (supabase) {
    const payload = normalizeData(data);
    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .upsert({ id: 1, state: payload, updated_at: now() }, { onConflict: "id" });
    if (error) throw error;
    return;
  }

  const filePath = path.join(ROOT, "data.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// Koment në shqip: përgjigje JSON për endpoint-et API
function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

// Koment në shqip: përgjigje tekst për file statik ose mesazhe gabimi
function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(text);
}

// Koment në shqip: lexon trupin e kërkesës POST si JSON
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Koment në shqip: shfaq emrin, mbiemrin, dhe nëse ka, nofkën
function displayName(profile) {
  if (!profile) return "";
  const full = `${profile.firstName || ""} ${profile.lastName || ""}`.trim();
  return profile.nickname ? `${full} (${profile.nickname})` : full;
}

// Koment në shqip: pikët dhe paratë mbahen si numra të pastër
function pointsFor(profile) {
  return Number(profile.points || 0);
}

function moneyFor(profile) {
  return Number(profile.money || 0);
}

// Koment në shqip: gjen profilin sipas clientId-së
function getProfile(data, clientId) {
  return data.profiles.find((p) => p.id === clientId) || null;
}

// Koment në shqip: kontrollon nëse kërkesa ka token të krijuesit
function requireAdmin(req, adminSessions) {
  const token = req.headers["x-creator-token"];
  return token && adminSessions.has(String(token));
}

// Koment në shqip: ndërton gjendjen që i dërgohet browser-it
function makeState(data, req, adminSessions) {
  const clientId = req.headers["x-client-id"] || req.headers["x-clientid"] || "";
  const me = clientId ? getProfile(data, clientId) : null;
  return {
    me,
    profiles: data.profiles,
    schedule: data.schedule,
    chat: data.chat,
    history: data.history,
    matchQueue: data.matchQueue,
    shop: data.shop,
    creatorActive: requireAdmin(req, adminSessions)
  };
}

// Koment në shqip: shërben index.html dhe file të tjerë statikë nga i njëjti server
function routeStatic(req, res, pathname) {
  if (pathname === "/" || pathname === "/index.html") {
    const html = fs.readFileSync(INDEX_FILE, "utf8");
    sendText(res, 200, html, "text/html; charset=utf-8");
    return true;
  }
  return false;
}

async function main() {
  // Koment në shqip: ngarkon të dhënat dhe mban sesionet e krijuesit në memorie
  let data = await readData();
  const adminSessions = new Set();

  // Koment në shqip: ruan gjendjen dhe pastaj i kthen përgjigje klientit
  async function saveAndRespond(res, payload) {
    await writeData(data);
    sendJson(res, 200, payload);
  }

  // Koment në shqip: krijon ose përditëson profilin e një nxënësi
  function updateProfileFromBody(body) {
    const clientId = String(body.clientId || "").trim() || uid();
    let profile = getProfile(data, clientId);
    if (!profile) {
      profile = {
        id: clientId,
        firstName: body.firstName || "Pa emër",
        lastName: body.lastName || "Pa mbiemër",
        nickname: body.nickname || "",
        role: body.role || "Student",
        points: 0,
        money: 20,
        inventory: [],
        createdAt: now(),
        updatedAt: now()
      };
      data.profiles.unshift(profile);
    } else {
      profile.firstName = body.firstName || profile.firstName;
      profile.lastName = body.lastName || profile.lastName;
      profile.nickname = body.nickname || profile.nickname;
      profile.role = body.role || profile.role;
      profile.updatedAt = now();
    }
    data.chat.unshift({
      id: uid(),
      type: "system",
      author: "Sistemi",
      text: `Profili u ruajt për ${displayName(profile)}.`,
      createdAt: now()
    });
    return profile;
  }

  // Koment në shqip: shton mesazh të ri në chat me emrin e profilit
  function addChatMessage(body) {
    const profile = getProfile(data, body.clientId);
    const author = profile ? (profile.nickname?.trim() || displayName(profile)) : "Anëtar i klasës";
    data.chat.unshift({
      id: uid(),
      type: "user",
      author,
      text: String(body.text || "").trim(),
      image: body.image || "",
      createdAt: now()
    });
  }

  // Koment në shqip: pastron chat-in, por lë një mesazh sistemi
  function clearChat() {
    data.chat = [{ id: uid(), type: "system", author: "Sistemi", text: "Chat-i u pastrua.", createdAt: now() }];
  }

  // Koment në shqip: shton një pikë dhe 5 bucks për një kategori të caktuar
  function adminPoint(body) {
    const profile = getProfile(data, body.id);
    if (!profile) throw new Error("Profili nuk u gjet.");
    const kind = body.kind === "homework" ? "homework" : body.kind === "project" ? "project" : "class";
    profile.points = pointsFor(profile) + 1;
    profile.money = moneyFor(profile) + 5;
    profile.updatedAt = now();
    data.chat.unshift({
      id: uid(),
      type: "system",
      author: "Sistemi",
      text: `${displayName(profile)} mori 1 pikë për ${kind}.`,
      createdAt: now()
    });
  }

  // Koment në shqip: heq një anëtar nga lista e klasës
  function adminDelete(body) {
    const idx = data.profiles.findIndex((p) => p.id === body.id);
    if (idx === -1) throw new Error("Profili nuk u gjet.");
    const removed = data.profiles.splice(idx, 1)[0];
    data.chat.unshift({
      id: uid(),
      type: "system",
      author: "Sistemi",
      text: `${displayName(removed)} u fshi nga krijuesi.`,
      createdAt: now()
    });
  }

  // Koment në shqip: ruan orarin e javës me 5 ditë
  function adminSchedule(body) {
    data.schedule = {
      monday: body.monday || data.schedule.monday,
      tuesday: body.tuesday || data.schedule.tuesday,
      wednesday: body.wednesday || data.schedule.wednesday,
      thursday: body.thursday || data.schedule.thursday,
      friday: body.friday || data.schedule.friday
    };
  }

  // Koment në shqip: bet i thjeshtë me fitore ose humbje të rastësishme
  function doBet(body, mode) {
    const profile = getProfile(data, body.playerId);
    if (!profile) throw new Error("Lojtari nuk u gjet.");
    const amount = Math.max(1, Number(body.amount || 0));
    const current = moneyFor(profile);
    const wager = Math.min(current, amount);
    if (wager <= 0) throw new Error("Nuk ka para të mjaftueshme.");
    const won = Math.random() >= 0.5;
    profile.money = Math.max(0, current + (won ? wager : -wager));
    profile.updatedAt = now();
    data.chat.unshift({
      id: uid(),
      type: "system",
      author: "Sistemi",
      text: `${displayName(profile)} ${won ? "fitoi" : "humbi"} ${wager}$ në ${mode}.`,
      createdAt: now()
    });
    return { won, message: `${displayName(profile)} ${won ? "fitoi" : "humbi"} ${wager}$ në ${mode}. Tani ka ${profile.money}$.` };
  }

  // Koment në shqip: duel 1v1 që i jep fituesit pot-in e betit
  function doDuel(body) {
    const left = getProfile(data, body.leftId);
    const right = getProfile(data, body.rightId);
    if (!left || !right) throw new Error("Zgjidh dy lojtarë të vlefshëm.");
    if (left.id === right.id) throw new Error("Zgjidh dy lojtarë të ndryshëm.");
    const amount = Math.max(1, Number(body.amount || 0));
    const leftMoney = moneyFor(left);
    const rightMoney = moneyFor(right);
    const pot = Math.min(amount, leftMoney, rightMoney);
    if (pot <= 0) throw new Error("Nuk ka para të mjaftueshme për duel.");
    const winner = Math.random() >= 0.5 ? left : right;
    const loser = winner.id === left.id ? right : left;
    winner.money = moneyFor(winner) + pot;
    loser.money = Math.max(0, moneyFor(loser) - pot);
    winner.updatedAt = now();
    loser.updatedAt = now();
    data.history.push({
      createdAt: now(),
      leftName: displayName(left),
      rightName: displayName(right),
      winnerName: displayName(winner),
      amount: pot
    });
    data.chat.unshift({
      id: uid(),
      type: "system",
      author: "Sistemi",
      text: `${displayName(winner)} fitoi duel kundër ${displayName(loser)} për ${pot}$.`,
      createdAt: now()
    });
    return { won: winner.id === left.id, message: `${displayName(winner)} fitoi duel-in kundër ${displayName(loser)} dhe mori ${pot}$.` };
  }

  // Koment në shqip: fut lojtarin në radhën e ndeshjeve dhe auto-pair kur ka dikë tjetër
  function joinMatchQueue(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për të hyrë në match.");

    const stake = Math.max(1, Number(body.stake || 0));
    data.matchQueue = (data.matchQueue || []).filter((entry) => entry.clientId !== profile.id);

    const meEntry = {
      id: uid(),
      clientId: profile.id,
      name: displayName(profile),
      stake,
      createdAt: now()
    };

    const opponent = data.matchQueue.find((entry) => entry.clientId !== profile.id);
    if (!opponent) {
      data.matchQueue.push(meEntry);
      data.chat.unshift({
        id: uid(),
        type: "system",
        author: "Sistemi",
        text: `${displayName(profile)} po kërkon ndeshje për ${stake}$.`,
        createdAt: now()
      });
      return { waiting: true, queue: data.matchQueue };
    }

    data.matchQueue = data.matchQueue.filter((entry) => entry.clientId !== opponent.clientId);
    const opponentProfile = getProfile(data, opponent.clientId);
    if (!opponentProfile) throw new Error("Profili i kundërshtarit nuk u gjet.");

    const pot = Math.min(stake, Number(opponent.stake || 0), moneyFor(profile), moneyFor(opponentProfile));
    if (pot <= 0) throw new Error("Nuk ka para të mjaftueshme për match.");

    const winner = Math.random() >= 0.5 ? profile : opponentProfile;
    const loser = winner.id === profile.id ? opponentProfile : profile;
    winner.money = moneyFor(winner) + pot;
    loser.money = Math.max(0, moneyFor(loser) - pot);
    winner.updatedAt = now();
    loser.updatedAt = now();

    data.history.push({
      createdAt: now(),
      leftName: displayName(profile),
      rightName: opponent.name,
      winnerName: displayName(winner),
      amount: pot,
      type: "matchmaking"
    });
    data.chat.unshift({
      id: uid(),
      type: "system",
      author: "Sistemi",
      text: `Match u gjet: ${displayName(profile)} kundër ${opponent.name}. Fituesi mori ${pot}$.`,
      createdAt: now()
    });

    return {
      waiting: false,
      matched: true,
      queue: data.matchQueue,
      message: `${displayName(profile)} u përputh me ${opponent.name} për ${pot}$. Fituesi: ${displayName(winner)}.`
    };
  }

  // Koment në shqip: largo profilin nga radhë nëse nuk do më të presë
  function leaveMatchQueue(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për të dalë nga match.");
    data.matchQueue = (data.matchQueue || []).filter((entry) => entry.clientId !== profile.id);
    return { queue: data.matchQueue };
  }

  // Koment në shqip: blen një artikull nga dyqani i lojës
  function buyShopItem(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për të blerë.");
    const item = data.shop.find((s) => s.id === body.itemId);
    if (!item) throw new Error("Artikulli nuk u gjet.");
    if (moneyFor(profile) < item.price) throw new Error("Nuk ke mjaftueshëm bucks.");
    profile.money = moneyFor(profile) - item.price;
    profile.inventory = profile.inventory || [];
    profile.inventory.push({ itemId: item.id, name: item.name, boughtAt: now() });
    profile.updatedAt = now();
    data.chat.unshift({
      id: uid(),
      type: "system",
      author: "Sistemi",
      text: `${displayName(profile)} bleu "${item.name}".`,
      createdAt: now()
    });
  }

  // Koment në shqip: serveri HTTP që i shërben faqes dhe API-t
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      if (req.method === "GET" && pathname === "/api/state") {
        return sendJson(res, 200, makeState(data, req, adminSessions));
      }

      if (req.method === "POST" && pathname === "/api/profile") {
        const body = await parseBody(req);
        const profile = updateProfileFromBody(body);
        await saveAndRespond(res, { profile });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/login") {
        const body = await parseBody(req);
        if (String(body.password || "") !== CREATOR_PASSWORD) {
          return sendJson(res, 401, { error: "Kodi i gabuar." });
        }
        const token = uid();
        adminSessions.add(token);
        data.creatorActive = true;
        await writeData(data);
        return sendJson(res, 200, { token });
      }

      if (req.method === "POST" && pathname === "/api/admin/schedule") {
        if (!requireAdmin(req, adminSessions)) return sendJson(res, 403, { error: "Nuk je krijues." });
        const body = await parseBody(req);
        adminSchedule(body);
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/admin/student") {
        if (!requireAdmin(req, adminSessions)) return sendJson(res, 403, { error: "Nuk je krijues." });
        const body = await parseBody(req);
        const profile = getProfile(data, body.id);
        if (!profile) return sendJson(res, 404, { error: "Profili nuk u gjet." });
        profile.firstName = body.firstName || profile.firstName;
        profile.lastName = body.lastName || profile.lastName;
        profile.nickname = body.nickname || profile.nickname;
        profile.role = body.role || profile.role;
        profile.updatedAt = now();
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/admin/delete") {
        if (!requireAdmin(req, adminSessions)) return sendJson(res, 403, { error: "Nuk je krijues." });
        const body = await parseBody(req);
        adminDelete(body);
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/admin/point") {
        if (!requireAdmin(req, adminSessions)) return sendJson(res, 403, { error: "Nuk je krijues." });
        const body = await parseBody(req);
        adminPoint(body);
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/chat") {
        const body = await parseBody(req);
        addChatMessage(body);
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/chat/clear") {
        if (!requireAdmin(req, adminSessions)) return sendJson(res, 403, { error: "Nuk je krijues." });
        clearChat();
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/game/bet") {
        const body = await parseBody(req);
        const result = doBet(body, body.mode === "coin" ? "monedha" : "zari");
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/game/duel") {
        const body = await parseBody(req);
        const result = doDuel(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/game/match/join") {
        const body = await parseBody(req);
        const result = joinMatchQueue(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/game/match/leave") {
        const body = await parseBody(req);
        const result = leaveMatchQueue(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/shop/buy") {
        const body = await parseBody(req);
        buyShopItem(body);
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "GET" && routeStatic(req, res, pathname)) return;

      const filePath = path.join(ROOT, pathname.replace(/^\/+/, ""));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const type = ext === ".css" ? "text/css; charset=utf-8"
          : ext === ".js" ? "application/javascript; charset=utf-8"
          : ext === ".json" ? "application/json; charset=utf-8"
          : "text/plain; charset=utf-8";
        return sendText(res, 200, fs.readFileSync(filePath, "utf8"), type);
      }

      return sendText(res, 404, "Not found");
    } catch (err) {
      return sendJson(res, 500, { error: err.message || "Server error" });
    }
  });

  // Koment në shqip: nis serverin në portin që jep hosting-u
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log("Running with local file storage. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for full online mode.");
    }
  });
}

// Koment në shqip: nis gjithë aplikacionin dhe kap gabimet e startup-it
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
