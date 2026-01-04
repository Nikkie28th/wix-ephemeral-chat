const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};
const typingUsers = {};

console.log("🟢 Chat WebSocket rodando na porta", PORT);

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

    /* ===== KEEPALIVE ===== */
    if (data.type === "keepalive") return;

    /* ===== JOIN ===== */
    if (data.type === "join") {
      ws.roomId = data.roomId;
      ws.user = data.user;

      if (!ws.roomId || !ws.user?.id) return;

      if (!rooms[ws.roomId]) {
        rooms[ws.roomId] = new Set();
      }

      rooms[ws.roomId].add(ws);

      // confirma join APENAS para quem entrou
      ws.send(JSON.stringify({ type: "joined" }));

      sendOnlineList(ws.roomId);
      return;
    }

    /* ===== MESSAGE ===== */
    if (data.type === "message") {
      const room = ws.roomId;
      if (!room || !rooms[room]) return;

      typingUsers[room]?.delete(ws.user.id);
      broadcastTyping(room);

      rooms[room].forEach(client => {
        client.send(JSON.stringify({
          type: "message",
          user: ws.user,
          text: data.text
        }));
      });
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
   PING GLOBAL
========================= */
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/* =========================
   HELPERS
========================= */
function sendOnlineList(roomId) {
  const users = Array.from(rooms[roomId]).map(ws => ({
    id: ws.user.id,
    name: ws.user.name,
    role: ws.user.role,
    emoji: ws.user.emoji
  }));

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
      const ws = [...rooms[roomId]].find(c => c.user?.id === id);
      return ws ? { id: ws.user.id, name: ws.user.name } : null;
    })
    .filter(Boolean);

  rooms[roomId].forEach(client => {
    const others = usersTyping.filter(
      u => u.id !== client.user.id
    );

    client.send(JSON.stringify({
      type: "typing-status",
      users: others
    }));
  });
}


