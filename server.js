const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};
const typingUsers = {};

console.log("🟢 WebSocket rodando na porta", PORT);

wss.on("connection", ws => {
  ws.isAlive = true;
  ws.user = null;
  ws.roomId = null;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "keepalive") return;

    /* =========================
       JOIN
    ========================= */
    if (data.type === "join") {
      if (!data.roomId || !data.user) return;

      ws.roomId = data.roomId;
      ws.user = data.user;

      if (!rooms[ws.roomId]) rooms[ws.roomId] = new Set();
      rooms[ws.roomId].add(ws);

      sendOnlineList(ws.roomId);
      return;
    }

    /* =========================
       PUBLIC MESSAGE
    ========================= */
    if (data.type === "message") {
      if (!ws.roomId || !ws.user) return;

      const room = rooms[ws.roomId];
      if (!room) return;

      room.forEach(client => {
        if (!client.user) return;

        client.send(JSON.stringify({
          type: "message",
          user: ws.user,
          text: data.text
        }));
      });

      return;
    }

    /* =========================
       PRIVATE MESSAGE
    ========================= */
    if (data.type === "private-message") {
      if (!ws.roomId || !ws.user) return;
      if (!data.to || !data.text) return;

      const room = rooms[ws.roomId];
      if (!room) return;

      room.forEach(client => {
        if (!client.user) return;

        if (
          client.user.name === data.to ||
          client === ws
        ) {
          client.send(JSON.stringify({
            type: "private-message",
            from: ws.user.name,
            to: data.to,
            user: ws.user,
            text: data.text
          }));
        }
      });

      return;
    }
  });

  ws.on("close", () => {
    const roomId = ws.roomId;
    if (!roomId || !rooms[roomId]) return;

    rooms[roomId].delete(ws);

    if (typingUsers[roomId] && ws.user?.name) {
      typingUsers[roomId].delete(ws.user.name);
    }

    if (rooms[roomId].size === 0) {
      delete rooms[roomId];
      delete typingUsers[roomId];
    } else {
      sendOnlineList(roomId);
      broadcastTyping(roomId);
    }
  });
});

/* =========================
   KEEP ALIVE
========================= */
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/* =========================
   ONLINE LIST
========================= */
function sendOnlineList(roomId) {
  if (!rooms[roomId]) return;

  const users = Array.from(rooms[roomId])
    .map(ws => ws.user)
    .filter(Boolean);

  rooms[roomId].forEach(client => {
    client.send(JSON.stringify({
      type: "online-list",
      users
    }));
  });
}

/* =========================
   TYPING STATUS
========================= */
function broadcastTyping(roomId) {
  if (!typingUsers[roomId] || !rooms[roomId]) return;

  rooms[roomId].forEach(client => {
    if (!client.user) return;

    const others = Array.from(typingUsers[roomId])
      .filter(name => name !== client.user.name);

    client.send(JSON.stringify({
      type: "typing-status",
      users: others
    }));
  });
}

