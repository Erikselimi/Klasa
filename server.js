const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { createClient } = require("@supabase/supabase-js");

const PORT = Number(process.env.PORT || 3000);
const CREATOR_PASSWORD = process.env.CREATOR_PASSWORD || "Erik2011";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "chat-latest";
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, "index.html");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "class_portal_state";

const DEFAULT_SCHEDULE = {
  monday: "Matematikë, Gjuhë shqipe",
  tuesday: "Histori, Biologji",
  wednesday: "Fizikë, Anglisht, Informatikë",
  thursday: "Kimi, Gjeografi",
  friday: "Art, Edukim fizik, Këshillim klase"
};

const DEFAULT_SHOP = [
  { id: "lucky_ticket", name: "Biletë me Fat", price: 25, effectLabel: "Shton fat", description: "Një shans për të rritur fitimin në lojën tjetër." },
  { id: "shield", name: "Mbrojtje", price: 40, effectLabel: "Mbron humbjen", description: "Mbron nga humbja e parë në një duel ose bet." },
  { id: "double", name: "Double Up", price: 30, effectLabel: "Dyfishon fitimin", description: "Dyfishon fitimin në një fitore të ardhshme." }
];

const BAD_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "nigger",
  "fucker",
  "motherfucker",
  "idiot",
  "stupid"
];

function defaultConnect4() {
  return {
    board: Array.from({ length: 6 }, () => Array(7).fill(null)),
    redId: null,
    yellowId: null,
    redName: "",
    yellowName: "",
    mode: "queue",
    turn: "red",
    winner: null,
    lastMoveAt: null,
    ranked: true,
    updatedAt: now()
  };
}

function connect4AvailableMoves(board) {
  const moves = [];
  for (let col = 0; col < 7; col += 1) {
    if (!board[0][col]) moves.push(col);
  }
  return moves;
}

function connect4Drop(board, col, token) {
  const next = board.map((row) => row.slice());
  let row = -1;
  for (let r = 5; r >= 0; r -= 1) {
    if (!next[r][col]) {
      next[r][col] = token;
      row = r;
      break;
    }
  }
  return { board: next, row };
}

function connect4ScoreWindow(window, token) {
  const other = token === "red" ? "yellow" : "red";
  const tokenCount = window.filter((cell) => cell === token).length;
  const otherCount = window.filter((cell) => cell === other).length;
  const emptyCount = window.filter((cell) => !cell).length;
  let score = 0;
  if (tokenCount === 4) score += 100000;
  else if (tokenCount === 3 && emptyCount === 1) score += 120;
  else if (tokenCount === 2 && emptyCount === 2) score += 12;
  if (otherCount === 3 && emptyCount === 1) score -= 140;
  if (otherCount === 2 && emptyCount === 2) score -= 8;
  return score;
}

function connect4Evaluate(board, token) {
  const centerCol = board.map((row) => row[3]);
  let score = centerCol.filter((cell) => cell === token).length * 18;
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      score += connect4ScoreWindow([board[row][col], board[row][col + 1], board[row][col + 2], board[row][col + 3]], token);
    }
  }
  for (let col = 0; col < 7; col += 1) {
    for (let row = 0; row < 3; row += 1) {
      score += connect4ScoreWindow([board[row][col], board[row + 1][col], board[row + 2][col], board[row + 3][col]], token);
    }
  }
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      score += connect4ScoreWindow([board[row][col], board[row + 1][col + 1], board[row + 2][col + 2], board[row + 3][col + 3]], token);
    }
  }
  for (let row = 3; row < 6; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      score += connect4ScoreWindow([board[row][col], board[row - 1][col + 1], board[row - 2][col + 2], board[row - 3][col + 3]], token);
    }
  }
  return score;
}

function connect4HasWinner(board, token) {
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      if (board[row][col] !== token) continue;
      const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1]
      ];
      for (const [dr, dc] of directions) {
        let count = 1;
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === token) {
          count += 1;
          r += dr;
          c += dc;
        }
        if (count >= 4) return true;
      }
    }
  }
  return false;
}

function connect4Minimax(board, depth, alpha, beta, maximizing, token, opponent) {
  const validMoves = connect4AvailableMoves(board);
  const terminal = connect4HasWinner(board, token) || connect4HasWinner(board, opponent) || validMoves.length === 0;
  if (depth === 0 || terminal) {
    if (terminal) {
      if (connect4HasWinner(board, token)) return { score: 1000000 };
      if (connect4HasWinner(board, opponent)) return { score: -1000000 };
      return { score: 0 };
    }
    return { score: connect4Evaluate(board, token) };
  }

  if (maximizing) {
    let value = -Infinity;
    let bestCol = validMoves[0];
    for (const col of validMoves) {
      const drop = connect4Drop(board, col, token);
      const result = connect4Minimax(drop.board, depth - 1, alpha, beta, false, token, opponent);
      if (result.score > value) {
        value = result.score;
        bestCol = col;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return { score: value, col: bestCol };
  }

  let value = Infinity;
  let bestCol = validMoves[0];
  for (const col of validMoves) {
    const drop = connect4Drop(board, col, opponent);
    const result = connect4Minimax(drop.board, depth - 1, alpha, beta, true, token, opponent);
    if (result.score < value) {
      value = result.score;
      bestCol = col;
    }
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return { score: value, col: bestCol };
}

function normalizeConnect4(input) {
  const fresh = defaultConnect4();
  const board = Array.isArray(input?.board) && input.board.length === 6
    ? input.board.map((row) => Array.isArray(row) && row.length === 7 ? row.map((cell) => (cell === "red" || cell === "yellow" ? cell : null)) : Array(7).fill(null))
    : fresh.board;
  return {
    board,
    redId: input?.redId || null,
    yellowId: input?.yellowId || null,
    redName: input?.redName || "",
    yellowName: input?.yellowName || "",
    turn: input?.turn === "yellow" ? "yellow" : "red",
    winner: input?.winner === "red" || input?.winner === "yellow" ? input.winner : null,
    lastMoveAt: input?.lastMoveAt || null,
    mode: input?.mode === "bot" ? "bot" : "queue",
    ranked: input?.ranked !== false,
    updatedAt: input?.updatedAt || now()
  };
}

function defaultBlackjackSessions() {
  return {};
}

function uid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Client-Id, X-Clientid, X-Creator-Token"
  };
}

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
    connect4Queue: [],
    reports: [],
    connect4: defaultConnect4(),
    blackjackSessions: defaultBlackjackSessions(),
    shop: DEFAULT_SHOP,
    creatorActive: false
  };
}

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
      timeoutUntil: p.timeoutUntil || null,
      timeoutReason: p.timeoutReason || "",
      dailyRewardAt: p.dailyRewardAt || null,
      createdAt: p.createdAt || now(),
      updatedAt: p.updatedAt || now()
    })) : fresh.profiles,
    schedule: { ...fresh.schedule, ...(input.schedule || {}) },
    chat: Array.isArray(input.chat) ? input.chat : fresh.chat,
    history: Array.isArray(input.history) ? input.history : fresh.history,
    matchQueue: Array.isArray(input.matchQueue) ? input.matchQueue : [],
    connect4Queue: Array.isArray(input.connect4Queue) ? input.connect4Queue : [],
    reports: Array.isArray(input.reports) ? input.reports : fresh.reports,
    connect4: normalizeConnect4(input.connect4),
    blackjackSessions: typeof input.blackjackSessions === "object" && input.blackjackSessions ? input.blackjackSessions : fresh.blackjackSessions,
    shop: Array.isArray(input.shop) ? input.shop : fresh.shop,
    creatorActive: Boolean(input.creatorActive)
  };
}

const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabase = hasSupabase
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

let storageMode = supabase ? "supabase" : "file";
let storageWarning = "";

function isSupabaseNetworkError(error) {
  const message = String(error?.message || error || "");
  return message.includes("fetch failed") || message.includes("ENOTFOUND") || message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT");
}

function disableSupabase(error) {
  if (storageMode === "file") return;
  storageMode = "file";
  storageWarning = `Supabase u çaktivizua për këtë session: ${String(error?.message || error)}`;
  console.warn(storageWarning);
}

async function readData() {
  if (storageMode === "supabase" && supabase) {
    try {
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
    } catch (error) {
      if (isSupabaseNetworkError(error)) {
        disableSupabase(error);
      } else {
        console.warn("Supabase read failed, switching to local file storage.", error);
        disableSupabase(error);
      }
    }
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

async function writeData(data) {
  if (storageMode === "supabase" && supabase) {
    try {
      const payload = normalizeData(data);
      const { error } = await supabase
        .from(SUPABASE_TABLE)
        .upsert({ id: 1, state: payload, updated_at: now() }, { onConflict: "id" });
      if (error) throw error;
      return;
    } catch (error) {
      if (isSupabaseNetworkError(error)) {
        disableSupabase(error);
      } else {
        console.warn("Supabase write failed, switching to local file storage.", error);
        disableSupabase(error);
      }
    }
  }

  const filePath = path.join(ROOT, "data.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { ...corsHeaders(), "Content-Type": contentType });
  res.end(text);
}

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

function displayName(profile) {
  if (!profile) return "";
  const full = `${profile.firstName || ""} ${profile.lastName || ""}`.trim();
  return profile.nickname ? `${full} (${profile.nickname})` : full;
}

function pointsFor(profile) {
  return Number(profile.points || 0);
}

function moneyFor(profile) {
  return Number(profile.money || 0);
}

function timeoutUntil(profile) {
  return profile?.timeoutUntil ? new Date(profile.timeoutUntil).getTime() : 0;
}

function isTimedOut(profile) {
  return Boolean(profile && timeoutUntil(profile) > Date.now());
}

function formatTimeout(profile) {
  const until = timeoutUntil(profile);
  if (!until) return "";
  return new Date(until).toLocaleString("sq-AL");
}

function setTimeoutFor(profile, minutes, reason) {
  profile.timeoutUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  profile.timeoutReason = reason || "";
  profile.updatedAt = now();
}

function containsBadWord(text) {
  const value = String(text || "").toLowerCase();
  return BAD_WORDS.some((word) => value.includes(word));
}

function startOfDayKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function getProfile(data, clientId) {
  return data.profiles.find((p) => p.id === clientId) || null;
}

function requireAdmin(req, adminSessions) {
  const token = req.headers["x-creator-token"];
  return token && adminSessions.has(String(token));
}

function makeState(data, req, adminSessions) {
  const clientId = req.headers["x-client-id"] || req.headers["x-clientid"] || "";
  const me = clientId ? getProfile(data, clientId) : null;
  return {
    me,
    profiles: data.profiles,
    schedule: data.schedule,
    chat: data.chat,
    history: data.history,
    matchQueue: data.matchQueue || [],
    connect4Queue: data.connect4Queue || [],
    connect4: data.connect4,
    reports: requireAdmin(req, adminSessions) ? data.reports : [],
    myTimeoutUntil: me?.timeoutUntil || null,
    myTimeoutReason: me?.timeoutReason || "",
    blackjackSession: clientId ? data.blackjackSessions?.[clientId] || null : null,
    shop: data.shop,
    creatorActive: requireAdmin(req, adminSessions)
  };
}

function routeStatic(req, res, pathname) {
  if (pathname === "/" || pathname === "/index.html") {
    const html = fs.readFileSync(INDEX_FILE, "utf8");
    sendText(res, 200, html, "text/html; charset=utf-8");
    return true;
  }
  return false;
}

async function main() {
  let data = await readData();
  const adminSessions = new Set();

  async function saveAndRespond(res, payload) {
    await writeData(data);
    sendJson(res, 200, payload);
  }

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
        timeoutUntil: null,
        timeoutReason: "",
        dailyRewardAt: null,
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

  function addChatMessage(body) {
    const profile = getProfile(data, body.clientId);
    if (profile && isTimedOut(profile)) {
      const until = formatTimeout(profile);
      const err = new Error(`Je në timeout deri më ${until}.`);
      err.statusCode = 403;
      throw err;
    }
    const text = String(body.text || "").trim();
    if (profile && containsBadWord(text)) {
      setTimeoutFor(profile, 10, "Fjalë fyese në chat.");
      const err = new Error("Mesazhi u bllokua dhe profili u vendos në timeout 10 minuta.");
      err.statusCode = 403;
      throw err;
    }
    const author = profile ? (profile.nickname?.trim() || displayName(profile)) : "Anëtar i klasës";
    data.chat.unshift({
      id: uid(),
      type: "user",
      author,
      text,
      image: body.image || "",
      createdAt: now()
    });
  }

  function addAiMessage(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për të folur me AI.");
    if (isTimedOut(profile)) throw new Error(`Je në timeout deri më ${formatTimeout(profile)}.`);
    const text = String(body.text || "").trim();
    if (!text) throw new Error("Shkruaj një pyetje për AI.");
    if (containsBadWord(text)) {
      setTimeoutFor(profile, 10, "Fjalë fyese në AI.");
      throw new Error("Mesazhi u bllokua dhe profili u vendos në timeout 10 minuta.");
    }
    return { profile, text };
  }

  function createReport(body) {
    const profile = getProfile(data, body.clientId);
    const text = String(body.text || "").trim();
    if (!text) throw new Error("Shkruaj një bug që do të raportosh.");
    data.reports.unshift({
      id: uid(),
      reporterId: profile?.id || String(body.clientId || ""),
      reporterName: profile ? displayName(profile) : "Anonymous",
      text,
      createdAt: now(),
      status: "open"
    });
  }

  function clearChat() {
    data.chat = [{ id: uid(), type: "system", author: "Sistemi", text: "Chat-i u pastrua.", createdAt: now() }];
  }

  function adminPoint(body) {
    const profile = getProfile(data, body.id);
    if (!profile) throw new Error("Profili nuk u gjet.");
    const kind = body.kind === "homework" ? "homework" : body.kind === "project" ? "project" : "class";
    profile.points = pointsFor(profile) + 1;
    profile.money = moneyFor(profile) + 5;
    profile.updatedAt = now();
  }

  function adminDelete(body) {
    const idx = data.profiles.findIndex((p) => p.id === body.id);
    if (idx === -1) throw new Error("Profili nuk u gjet.");
    data.profiles.splice(idx, 1);
  }

  function adminMoney(body) {
    const profile = getProfile(data, body.id);
    if (!profile) throw new Error("Profili nuk u gjet.");
    const amount = Math.max(1, Number(body.amount || 0));
    profile.money = moneyFor(profile) + amount;
    profile.updatedAt = now();
    return profile;
  }

  function adminClearHistory() {
    data.history = [];
  }

  function adminClearReports() {
    data.reports = [];
  }

  function adminSchedule(body) {
    data.schedule = {
      monday: body.monday || data.schedule.monday,
      tuesday: body.tuesday || data.schedule.tuesday,
      wednesday: body.wednesday || data.schedule.wednesday,
      thursday: body.thursday || data.schedule.thursday,
      friday: body.friday || data.schedule.friday
    };
  }

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
    return { won, message: `${displayName(profile)} ${won ? "fitoi" : "humbi"} ${wager}$ në ${mode}. Tani ka ${profile.money}$.` };
  }

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
    return { won: winner.id === left.id, message: `${displayName(winner)} fitoi duel-in kundër ${displayName(loser)} dhe mori ${pot}$.` };
  }

  function doCoinFlip(body) {
    const profile = getProfile(data, body.playerId || body.clientId);
    if (!profile) throw new Error("Lojtari nuk u gjet.");
    const guess = body.guess === "tails" ? "tails" : "heads";
    const amount = Math.max(1, Number(body.amount || 0));
    const current = moneyFor(profile);
    const wager = Math.min(current, amount);
    if (wager <= 0) throw new Error("Nuk ka para të mjaftueshme.");
    const face = Math.random() >= 0.5 ? "heads" : "tails";
    const won = face === guess;
    profile.money = Math.max(0, current + (won ? wager : -wager));
    profile.updatedAt = now();
    return {
      won,
      face,
      guess,
      message: `${displayName(profile)} hodhi ${face === "heads" ? "kokë" : "bisht"} dhe ${won ? "fitoi" : "humbi"} ${wager}$. Tani ka ${profile.money}$.`
    };
  }

  function joinMatchQueue(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për të kërkuar match.");
    const stake = Math.max(1, Number(body.stake || 10));
    data.matchQueue = (data.matchQueue || []).filter((entry) => entry.clientId !== profile.id);
    data.matchQueue.push({
      clientId: profile.id,
      stake,
      name: displayName(profile),
      joinedAt: now()
    });

    let message = `${displayName(profile)} hyri në radhën e match-it.`;
    if (data.matchQueue.length >= 2) {
      const first = data.matchQueue.shift();
      const second = data.matchQueue.shift();
      const left = getProfile(data, first.clientId);
      const right = getProfile(data, second.clientId);
      if (left && right && left.id !== right.id) {
        const pot = Math.min(first.stake, second.stake, moneyFor(left), moneyFor(right));
        if (pot > 0) {
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
            amount: pot,
            type: "match"
          });
          message = `${displayName(left)} u ndesh me ${displayName(right)}. ${displayName(winner)} fitoi ${pot}$.`;
        } else {
          message = "Match-i u krijua, por një lojtar nuk kishte para të mjaftueshme.";
        }
      }
    }
    return { message, queue: data.matchQueue };
  }

  function leaveMatchQueue(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për të dalë nga radha.");
    const before = (data.matchQueue || []).length;
    data.matchQueue = (data.matchQueue || []).filter((entry) => entry.clientId !== profile.id);
    const changed = before !== data.matchQueue.length;
    return {
      message: changed ? `${displayName(profile)} doli nga radhë.` : `${displayName(profile)} nuk ishte në radhë.`,
      queue: data.matchQueue
    };
  }

  function connect4SeatFor(profile) {
    if (!profile) return null;
    if (data.connect4.redId === profile.id) return "red";
    if (data.connect4.yellowId === profile.id) return "yellow";
    return null;
  }

  function connect4FinishGame(game, winnerSeat) {
    game.winner = winnerSeat;
    game.updatedAt = now();
    const winnerProfile = winnerSeat === "red" ? getProfile(data, game.redId) : getProfile(data, game.yellowId);
    const loserProfile = winnerSeat === "red" ? getProfile(data, game.yellowId) : getProfile(data, game.redId);
    if (winnerProfile) {
      winnerProfile.money = moneyFor(winnerProfile) + (game.ranked ? 25 : 15);
      winnerProfile.updatedAt = now();
    }
    if (loserProfile && game.ranked && loserProfile.id) {
      loserProfile.money = Math.max(0, moneyFor(loserProfile) - 5);
      loserProfile.updatedAt = now();
    }
    data.history.push({
      createdAt: now(),
      leftName: game.redName || "Red",
      rightName: game.yellowName || "Yellow",
      winnerName: winnerSeat === "red" ? (game.redName || "Red") : (game.yellowName || "Yellow"),
      amount: game.ranked ? 25 : 15,
      type: "connect4"
    });
  }

  function connect4ApplyMove(game, seat, col) {
    const drop = connect4Drop(game.board, col, seat);
    if (drop.row === -1) throw new Error("Kolona është plot.");
    game.board = drop.board;
    game.turn = seat === "red" ? "yellow" : "red";
    game.lastMoveAt = now();
    game.updatedAt = now();
    if (connect4HasWinner(game.board, seat)) {
      connect4FinishGame(game, seat);
      return { game, winner: seat, draw: false, message: `${seat === "red" ? game.redName : game.yellowName} fitoi Connect 4.` };
    }
    if (!connect4AvailableMoves(game.board).length) {
      game.winner = "draw";
      game.updatedAt = now();
      data.history.push({
        createdAt: now(),
        leftName: game.redName || "Red",
        rightName: game.yellowName || "Yellow",
        winnerName: "Barazim",
        amount: 0,
        type: "connect4"
      });
      return { game, draw: true, message: "Boardi u mbush. Barazim." };
    }
    return { game, winner: null, draw: false, message: `U vendos gur në kolonën ${col + 1}.` };
  }

  function connect4Reset() {
    const keepRanked = Boolean(data.connect4?.ranked);
    data.connect4 = {
      ...defaultConnect4(),
      ranked: keepRanked
    };
    data.connect4Queue = [];
  }

  function connect4Join(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për Connect 4.");
    if (isTimedOut(profile)) throw new Error(`Je në timeout deri më ${formatTimeout(profile)}.`);
    const game = data.connect4 || defaultConnect4();
    if (typeof body.ranked === "boolean") {
      game.ranked = body.ranked;
    }
    const vs = body.vs === "bot" ? "bot" : "queue";
    game.mode = vs;
    if (vs === "bot") {
      game.redId = profile.id;
      game.redName = displayName(profile);
      game.yellowId = "bot";
      game.yellowName = "AI Bot";
      game.turn = "red";
      game.winner = null;
      game.board = Array.from({ length: 6 }, () => Array(7).fill(null));
      game.lastMoveAt = now();
      game.updatedAt = now();
      data.connect4 = game;
      return { ok: true, seat: "red", game, message: "Hyre kundër bot-it." };
    }

    data.connect4Queue = (data.connect4Queue || []).filter((entry) => entry.clientId !== profile.id);
    data.connect4Queue.push({
      clientId: profile.id,
      name: displayName(profile),
      joinedAt: now()
    });

    if (data.connect4Queue.length >= 2) {
      const first = data.connect4Queue.shift();
      const second = data.connect4Queue.shift();
      const left = getProfile(data, first.clientId);
      const right = getProfile(data, second.clientId);
      if (left && right) {
        game.redId = left.id;
        game.redName = displayName(left);
        game.yellowId = right.id;
        game.yellowName = displayName(right);
        game.turn = "red";
        game.winner = null;
        game.board = Array.from({ length: 6 }, () => Array(7).fill(null));
        game.mode = "queue";
        game.lastMoveAt = now();
        game.updatedAt = now();
        data.connect4 = game;
        return { ok: true, seat: connect4SeatFor(profile), game, message: `Match u krijua: ${game.redName} kundër ${game.yellowName}.` };
      }
    }
    data.connect4 = game;
    return { ok: true, seat: null, game, waiting: true, message: `${displayName(profile)} hyri në radhë për Connect 4.` };
  }

  function connect4Winner(board, row, col, token) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1]
    ];
    for (const [dr, dc] of directions) {
      let count = 1;
      for (const sign of [-1, 1]) {
        let r = row + dr * sign;
        let c = col + dc * sign;
        while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === token) {
          count += 1;
          r += dr * sign;
          c += dc * sign;
        }
      }
      if (count >= 4) return true;
    }
    return false;
  }

  function connect4Move(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për Connect 4.");
    if (isTimedOut(profile)) throw new Error(`Je në timeout deri më ${formatTimeout(profile)}.`);
    const game = data.connect4 || defaultConnect4();
    if (game.winner) throw new Error("Loja ka përfunduar. Reset board për një ndeshje të re.");
    const seat = connect4SeatFor(profile);
    if (!seat) throw new Error("Futu në Connect 4 si lojtar.");
    if (game.turn !== seat) throw new Error("Nuk është radha jote.");
    const col = Math.max(0, Math.min(6, Number(body.column)));
    const result = connect4ApplyMove(game, seat, col);
    if (result.winner || result.draw) {
      data.connect4 = game;
      return { ok: true, ...result, game };
    }

    if (game.mode === "bot" && game.turn === "yellow") {
      const bot = connect4Minimax(game.board, 5, -Infinity, Infinity, true, "yellow", "red");
      const botMove = typeof bot.col === "number" ? bot.col : connect4AvailableMoves(game.board)[0];
      const botResult = connect4ApplyMove(game, "yellow", botMove);
      data.connect4 = game;
      if (botResult.winner || botResult.draw) return { ok: true, ...botResult, game };
      return { ok: true, ...result, message: `${result.message} Bot-i luajti kolonën ${botMove + 1}.`, game };
    }

    data.connect4 = game;
    return { ok: true, ...result, game };
  }

  function blackjackDeck() {
    const suits = ["♠", "♥", "♦", "♣"];
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ rank, suit, value: rank === "A" ? 11 : ["K", "Q", "J"].includes(rank) ? 10 : Number(rank) });
      }
    }
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function blackjackValue(cards) {
    let total = cards.reduce((sum, card) => sum + card.value, 0);
    let aces = cards.filter((card) => card.rank === "A").length;
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  function blackjackSessionFor(clientId) {
    return data.blackjackSessions?.[clientId] || null;
  }

  function blackjackSetSession(clientId, session) {
    data.blackjackSessions[clientId] = session;
  }

  function blackjackClearSession(clientId) {
    delete data.blackjackSessions[clientId];
  }

  function blackjackState(session, revealDealer = false) {
    const showDealer = revealDealer || session.status === "finished";
    return {
      playerCards: session.playerCards,
      dealerCards: showDealer ? session.dealerCards : [session.dealerCards[0]],
      playerTotal: blackjackValue(session.playerCards),
      dealerTotal: showDealer ? blackjackValue(session.dealerCards) : blackjackValue([session.dealerCards[0]]),
      bet: session.bet,
      status: session.status,
      result: session.result || null,
      revealDealer: showDealer,
      message: session.message || null
    };
  }

  function blackjackFinalize(clientId, session, profile) {
    const playerTotal = blackjackValue(session.playerCards);
    const dealerTotal = blackjackValue(session.dealerCards);
    let outcome = "push";
    let payout = 0;
    if (playerTotal > 21) {
      outcome = "lose";
    } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
      outcome = "win";
      payout = session.bet * 2;
    } else if (playerTotal < dealerTotal) {
      outcome = "lose";
    }
    if (outcome === "push") payout = session.bet;
    if (payout > 0) {
      profile.money = moneyFor(profile) + payout;
      profile.updatedAt = now();
    }
    const message = outcome === "win"
      ? `Fitove Blackjack dhe morre ${session.bet}$.`
      : outcome === "lose"
        ? `Humbje Blackjack.`
        : `Blackjack barazim, beti u kthye mbrapsht.`;
    session.status = "finished";
    session.result = outcome;
    session.revealDealer = true;
    session.message = message;
    session.updatedAt = now();
    data.history.push({
      createdAt: now(),
      leftName: displayName(profile),
      rightName: "Dealer",
      winnerName: outcome === "win" ? displayName(profile) : outcome === "lose" ? "Dealer" : "Barazim",
      amount: outcome === "win" ? session.bet : outcome === "push" ? 0 : session.bet,
      type: "blackjack"
    });
    blackjackSetSession(clientId, session);
    return { ok: true, outcome, message, state: blackjackState(session, true) };
  }

  function blackjackStart(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për Blackjack.");
    if (isTimedOut(profile)) throw new Error(`Je në timeout deri më ${formatTimeout(profile)}.`);
    const bet = Math.max(1, Number(body.bet || 0));
    if (bet > moneyFor(profile)) throw new Error("Nuk ke mjaftueshëm coins.");
    const existing = blackjackSessionFor(profile.id);
    if (existing) blackjackClearSession(profile.id);
    profile.money = moneyFor(profile) - bet;
    profile.updatedAt = now();
    const session = {
      deck: blackjackDeck(),
      playerCards: [],
      dealerCards: [],
      bet,
      status: "playing",
      result: null,
      message: "Blackjack nisi.",
      createdAt: now(),
      updatedAt: now()
    };
    session.playerCards.push(session.deck.pop(), session.deck.pop());
    session.dealerCards.push(session.deck.pop(), session.deck.pop());
    blackjackSetSession(profile.id, session);
    const playerTotal = blackjackValue(session.playerCards);
    if (playerTotal === 21) {
      session.status = "playing";
      session.result = "blackjack";
      session.message = "Blackjack nisi me 21. Mund të zgjedhësh Stand.";
      blackjackSetSession(profile.id, session);
      return { ok: true, state: blackjackState(session), message: "Blackjack nisi me 21. Mund të zgjedhësh Stand." };
    }
    return { ok: true, state: blackjackState(session), message: "Blackjack nisi." };
  }

  function blackjackHit(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për Blackjack.");
    const session = blackjackSessionFor(profile.id);
    if (!session) throw new Error("Nuk ke lojë aktive.");
    if (session.status !== "playing") throw new Error("Loja ka përfunduar.");
    session.playerCards.push(session.deck.pop());
    session.updatedAt = now();
    const total = blackjackValue(session.playerCards);
    if (total > 21) {
      const final = blackjackFinalize(profile.id, session, profile);
      return { ...final, message: "U bust-ove. " + final.message };
    }
    session.message = `More një kartë. Totali yt është ${total}.`;
    blackjackSetSession(profile.id, session);
    return { ok: true, state: blackjackState(session), message: `More një kartë. Totali yt është ${total}.` };
  }

  function blackjackStand(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për Blackjack.");
    const session = blackjackSessionFor(profile.id);
    if (!session) throw new Error("Nuk ke lojë aktive.");
    if (session.status !== "playing" && !body.auto) throw new Error("Loja ka përfunduar.");
    while (blackjackValue(session.dealerCards) < 17) {
      session.dealerCards.push(session.deck.pop());
    }
    const final = blackjackFinalize(profile.id, session, profile);
    return { ...final, dealerTotal: blackjackValue(session.dealerCards), state: blackjackState(session, true) };
  }

  function blackjackStateRoute(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për Blackjack.");
    const session = blackjackSessionFor(profile.id);
    if (!session) return { ok: true, state: null };
    return { ok: true, state: blackjackState(session) };
  }

  function isOpenAiQuotaError(error) {
    const text = String(error?.message || error?.body || error || "");
    return /insufficient_quota|quota/i.test(text);
  }

  function openAiQuotaReply() {
    return {
      reply: "AI tani nuk mund të përgjigjet sepse kuota e OpenAI është mbaruar. Kontrollo billing-un ose ndrysho planin e API-së.",
      usage: "quota"
    };
  }

  async function askOpenAi(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për AI.");
    if (isTimedOut(profile)) throw new Error(`Je në timeout deri më ${formatTimeout(profile)}.`);
    const text = String(body.text || "").trim();
    if (!text) throw new Error("Shkruaj diçka për AI.");
    if (containsBadWord(text)) {
      setTimeoutFor(profile, 10, "Fjalë fyese në AI.");
      throw new Error("Mesazhi u bllokua dhe profili u vendos në timeout 10 minuta.");
    }
    if (!OPENAI_API_KEY) {
      return {
        reply: "AI nuk është konfiguruar ende. Vendos OPENAI_API_KEY si env var në Render që të flasë me ty.",
        usage: "offline"
      };
    }

    const systemPrompt = "Je një assistant i klasës 9/1. Përgjigju shkurt, qartë, në shqip. Ndihmo me faqen, lojërat, dhe shpjegime të thjeshta. Mos jep këshilla për mashtrim, urrejtje, ose gjëra të dëmshme.";
    const userPrompt = `Profili: ${displayName(profile)}. Pyetja: ${text}`;

    const callChatCompletions = async () => {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 300
        })
      });
      const raw = await response.text();
      if (!response.ok) {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {}
        const message = parsed?.error?.message || parsed?.message || raw || `OpenAI HTTP ${response.status}`;
        const err = new Error(message);
        err.body = raw;
        err.status = response.status;
        throw err;
      }
      const json = raw ? JSON.parse(raw) : {};
      const reply = json?.choices?.[0]?.message?.content?.trim();
      if (!reply) throw new Error("Nuk mora përgjigje nga AI.");
      return { reply, usage: "chat-completions" };
    };

    const callResponses = async () => {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_output_tokens: 300
        })
      });
      const raw = await response.text();
      if (!response.ok) {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {}
        const message = parsed?.error?.message || parsed?.message || raw || `OpenAI HTTP ${response.status}`;
        const err = new Error(message);
        err.body = raw;
        err.status = response.status;
        throw err;
      }
      const json = raw ? JSON.parse(raw) : {};
      const reply = String(json?.output_text || "").trim()
        || String(json?.output?.flatMap((item) => item?.content || []).map((part) => part?.text || "").join("")).trim();
      if (!reply) throw new Error("Nuk mora përgjigje nga AI.");
      return { reply, usage: "responses" };
    };

    try {
      return await callChatCompletions();
    } catch (chatError) {
      if (isOpenAiQuotaError(chatError)) return openAiQuotaReply();
      try {
        return await callResponses();
      } catch (responsesError) {
        if (isOpenAiQuotaError(responsesError) || isOpenAiQuotaError(chatError)) {
          return openAiQuotaReply();
        }
        throw new Error(`AI dështoi: ${String(responsesError?.message || chatError?.message || responsesError)}`);
      }
    }
  }

  function addDailyReward(body) {
    const profile = getProfile(data, body.clientId);
    if (!profile) throw new Error("Duhet profil për reward ditor.");
    const today = startOfDayKey();
    if (profile.dailyRewardAt === today) {
      throw new Error("Ke marrë reward-in ditor sot.");
    }
    profile.dailyRewardAt = today;
    profile.money = moneyFor(profile) + 10;
    profile.updatedAt = now();
    return { ok: true, reward: 10, message: "Morre 10 coins reward ditor." };
  }

  function createBugReport(body) {
    createReport(body);
    return { ok: true };
  }

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
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }

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

      if (req.method === "POST" && pathname === "/api/admin/money") {
        if (!requireAdmin(req, adminSessions)) return sendJson(res, 403, { error: "Nuk je krijues." });
        const body = await parseBody(req);
        adminMoney(body);
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/admin/history/clear") {
        if (!requireAdmin(req, adminSessions)) return sendJson(res, 403, { error: "Nuk je krijues." });
        adminClearHistory();
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/admin/reports/clear") {
        if (!requireAdmin(req, adminSessions)) return sendJson(res, 403, { error: "Nuk je krijues." });
        adminClearReports();
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/chat") {
        const body = await parseBody(req);
        addChatMessage(body);
        return saveAndRespond(res, { ok: true });
      }

      if (req.method === "POST" && pathname === "/api/ai/chat") {
        const body = await parseBody(req);
        addAiMessage(body);
        const result = await askOpenAi(body);
        data.chat.unshift({
          id: uid(),
          type: "system",
          author: "AI",
          text: result.reply,
          createdAt: now()
        });
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/report") {
        const body = await parseBody(req);
        const result = createBugReport(body);
        return saveAndRespond(res, result);
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

      if (req.method === "POST" && pathname === "/api/game/coin") {
        const body = await parseBody(req);
        const result = doCoinFlip(body);
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

      if (req.method === "POST" && pathname === "/api/game/connect4/join") {
        const body = await parseBody(req);
        const result = connect4Join(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/game/connect4/move") {
        const body = await parseBody(req);
        const result = connect4Move(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/game/connect4/reset") {
        const body = await parseBody(req);
        const profile = getProfile(data, body.clientId);
        if (!profile) throw new Error("Duhet profil për reset.");
        const seat = connect4SeatFor(profile);
        if (!requireAdmin(req, adminSessions) && !seat) return sendJson(res, 403, { error: "Nuk ke akses." });
        connect4Reset();
        return saveAndRespond(res, { ok: true, game: data.connect4 });
      }

      if (req.method === "POST" && pathname === "/api/game/blackjack/start") {
        const body = await parseBody(req);
        const result = blackjackStart(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/game/blackjack/hit") {
        const body = await parseBody(req);
        const result = blackjackHit(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/game/blackjack/stand") {
        const body = await parseBody(req);
        const result = blackjackStand(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/game/blackjack/state") {
        const body = await parseBody(req);
        const result = blackjackStateRoute(body);
        return saveAndRespond(res, result);
      }

      if (req.method === "POST" && pathname === "/api/rewards/daily") {
        const body = await parseBody(req);
        const result = addDailyReward(body);
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

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (storageWarning) {
      console.log(storageWarning);
    } else if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log("Running with local file storage. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for full online mode.");
    } else if (storageMode === "supabase") {
      console.log("Supabase storage is active.");
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
