const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

/*
rooms = {
  roomId: Set<WebSocket>
}

typingUsers = {
  roomId: Set<userId>
}
*/

const rooms = {};
const typingUsers = {};

console.log("🟢 Chat WebSocket rodando na porta", PORT);

/* =========================
   HEARTBEAT (ANTI TIMEOUT)
========================= */
const HEARTBEAT_INTERVAL = 1000 * 60 * 5; // 5 minutos

setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

/* =========================
   CONEXÃO
========================= */
wss.on("connection", (ws) => {

  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    /* ===== KEEPALIVE CLIENTE ===== */
    if (data.type === "keepalive") {
      return;
    }

    /* ===== JOIN ===== */
    if (data.type === "join") {
      ws.roomId = data.roomId;

      const u = data.user || {};

      ws.user = {
        id: u.id,
        name: u.name || "Sem nome",
        role: u.role || "Visitante",
        emoji: u.emoji || "👤"
      };

      if (!rooms[ws.roomId]) {
        rooms[ws.roomId] = new Set();
      }

      rooms[ws.roomId].add(ws);
      sendOnlineList(ws.roomId);
      return;
    }

    /* ===== MESSAGE ===== */
    if (data.type === "message") {
      const room = ws.roomId;
      if (!room || !rooms[room] || !ws.user) return;

      typingUsers[room]?.delete(ws.user.id);

      rooms[room].forEach(client => {
        client.send(JSON.stringify({
          type: "message",
          user: ws.user,
          text: data.text
        }));
      });

      broadcastTyping(room);
      return;
    }

    /* ===== TYPING ===== */
    if (data.type === "typing") {
      const room = ws.roomId;
      if (!room || !ws.user) return;

      if (!typingUsers[room]) {
        typingUsers[room] = new Set();
      }

      if (data.typing) {
        typingUsers[room].add(ws.user.id);
      } else {
        typingUsers[room].delete(ws.user.id);
      }

      broadcastTyping(room);
    }
  });

  /* ===== CLOSE ===== */
  ws.on("close", () => {
    const room = ws.roomId;
    if (!room || !rooms[room]) return;

    rooms[room].delete(ws);
    typingUsers[room]?.delete(ws.user?.id);

    if (rooms[room].size === 0) {
      delete rooms[room];
      delete typingUsers[room];
    } else {
      sendOnlineList(room);
      broadcastTyping(room);
    }
  });
});

/* =========================
   HELPERS
========================= */
function sendOnlineList(roomId) {
  if (!rooms[roomId]) return;

  const users = Array.from(rooms[roomId]).map(ws => ws.user);

  rooms[roomId].forEach(client => {
    client.send(JSON.stringify({
      type: "online-list",
      users
    }));
  });
}

function broadcastTyping(roomId) {
  if (!typingUsers[roomId] || !rooms[roomId]) return;

  const usersTyping = Array.from(typingUsers[roomId])
    .map(id => {
      const client = [...rooms[roomId]].find(ws => ws.user.id === id);
      return client?.user?.name;
    })
    .filter(Boolean);

  rooms[roomId].forEach(client => {
    client.send(JSON.stringify({
      type: "typing-status",
      users: usersTyping
    }));
  });
}


