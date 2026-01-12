const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

/* =========================
   ESTRUTURAS
========================= */

// roomId -> Set<ws>
const rooms = {};

// name -> { ws, roomId }
const presence = new Map();

// MOCK de amizades (substituir por DB depois)
// name -> Set<name>
const friendships = new Map();

/* =========================
   HELPERS
========================= */

function ensureFriendSet(name) {
  if (!friendships.has(name)) {
    friendships.set(name, new Set());
  }
}

function isMutualFriend(a, b) {
  return (
    friendships.get(a)?.has(b) &&
    friendships.get(b)?.has(a)
  );
}

/* =========================
   PRESENCE HELPERS (NOVO)
========================= */

function sendPresenceTo(ws) {
  if (!ws.user?.name) return;

  const viewerName = ws.user.name;
  const payload = [];

  presence.forEach((targetData, targetName) => {
    if (targetName === viewerName) return;

    const mutual = isMutualFriend(viewerName, targetName);

    payload.push({
      name: targetName,
      room: mutual ? targetData.roomId : null,
      canSeeRoom: mutual
    });
  });

  ws.send(JSON.stringify({
    type: "presence",
    users: payload
  }));
}

function broadcastPresence() {
  presence.forEach((viewerData) => {
    sendPresenceTo(viewerData.ws);
  });
}

/* =========================
   SERVER
========================= */

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
      if (!data.roomId || !data.user?.name) return;

      ws.roomId = data.roomId;
      ws.user = data.user;

      if (!rooms[ws.roomId]) rooms[ws.roomId] = new Set();
      rooms[ws.roomId].add(ws);

      ensureFriendSet(ws.user.name);

      presence.set(ws.user.name, {
        ws,
        roomId: ws.roomId
      });

      // 🔹 lista do room
      sendOnlineList(ws.roomId);

      // 🔹 presença global imediata (NOVO)
      sendPresenceTo(ws);

      // 🔹 atualiza presença para os outros
      broadcastPresence();

      return;
    }

    /* =========================
       REQUEST PRESENCE (NOVO)
    ========================= */
    if (data.type === "request-presence") {
      sendPresenceTo(ws);
      return;
    }

    /* =========================
       ADD FRIEND (opcional, futuro)
    ========================= */
    if (data.type === "add-friend") {
      if (!ws.user?.name || !data.friend) return;

      ensureFriendSet(ws.user.name);
      friendships.get(ws.user.name).add(data.friend);

      broadcastPresence();
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
      if (!ws.user || !data.to || !data.text) return;

      const sender = ws.user.name;
      const target = presence.get(data.to);

      // envia para o destinatário se online
      if (target) {
        target.ws.send(JSON.stringify({
          type: "private-message",
          from: sender,
          to: data.to,
          user: ws.user,
          text: data.text
        }));
      }

      // eco local para o remetente
      ws.send(JSON.stringify({
        type: "private-message",
        from: sender,
        to: data.to,
        user: ws.user,
        text: data.text
      }));

      return;
    }
  });

  ws.on("close", () => {
    const name = ws.user?.name;
    const roomId = ws.roomId;

    if (name) {
      presence.delete(name);
    }

    if (roomId && rooms[roomId]) {
      rooms[roomId].delete(ws);
      if (rooms[roomId].size === 0) {
        delete rooms[roomId];
      } else {
        sendOnlineList(roomId);
      }
    }

    broadcastPresence();
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
   ONLINE LIST (POR ROOM)
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

