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
    if (data.type === "keepalive") {
      return;
    }

    /* ===== JOIN ===== */
    if (data.type === "join") {
      ws.roomId = data.roomId;
      ws.user = data.user;

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
      if (!room || !rooms[room]) return;

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
      if (!room) return;

      if (!typingUsers[room]) typingUsers[room] = new Set();

      if (data.typing) typingUsers[room].add(ws.user.name);
      else typingUsers[room].delete(ws.user.name);

      broadcastTyping(room);
    }
  });

  ws.on("close", () => {
    const room = ws.roomId;
    if (room && rooms[room]) {
      rooms[room].delete(ws);
      if (rooms[room].size === 0) {
        delete rooms[room];
        delete typingUsers[room];
      } else {
        sendOnlineList(room);
      }
    }
  });
});

/* =========================
   PING GLOBAL (SERVIDOR)
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

  rooms[roomId].forEach(client => {
    // remove o próprio usuário da lista
    const othersTyping = Array.from(typingUsers[roomId])
      .filter(name => name !== client.user.name);

    client.send(JSON.stringify({
      type: "typing-status",
      users: othersTyping
    }));
  });
}



