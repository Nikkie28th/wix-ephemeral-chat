const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("🟢 Chat WebSocket rodando na porta", PORT);

/*
 Estrutura:
 rooms = {
   roomId: {
     users: Map(socket, { id, name, avatar }),
     sockets: Set(socket)
   }
 }
*/
const rooms = new Map();

// ===============================
// FUNÇÕES AUXILIARES
// ===============================
function broadcast(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;

  const message = JSON.stringify(data);
  room.sockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

function getOnlineList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];

  return Array.from(room.users.values());
}

// ===============================
// CONEXÃO
// ===============================
wss.on("connection", (ws) => {

  let currentRoom = null;
  let currentUser = null;

  // ===========================
  // MENSAGENS RECEBIDAS
  // ===========================
  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // ---------------------------
    // JOIN ROOM
    // ---------------------------
    if (data.type === "join") {
      const { roomId, user } = data;

      if (!roomId || !user?.id) return;

      currentRoom = roomId;
      currentUser = user;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          users: new Map(),
          sockets: new Set()
        });
      }

      const room = rooms.get(roomId);
      room.sockets.add(ws);
      room.users.set(ws, user);

      // Envia lista atual de online
      ws.send(JSON.stringify({
        type: "online-list",
        users: getOnlineList(roomId)
      }));

      // Broadcast para os outros
      broadcast(roomId, {
        type: "user-joined",
        user
      });

      broadcast(roomId, {
        type: "online-list",
        users: getOnlineList(roomId)
      });

      return;
    }

    // ---------------------------
    // MESSAGE
    // ---------------------------
    if (data.type === "message") {
      if (!currentRoom || !currentUser) return;

      const text = String(data.text || "").trim();
      if (!text) return;

      broadcast(currentRoom, {
        type: "message",
        user: currentUser,
        text,
        timestamp: Date.now()
      });

      return;
    }
  });

  // ===========================
  // DESCONEXÃO
  // ===========================
  ws.on("close", () => {
    if (!currentRoom || !rooms.has(currentRoom)) return;

    const room = rooms.get(currentRoom);
    room.sockets.delete(ws);
    room.users.delete(ws);

    broadcast(currentRoom, {
      type: "user-left",
      user: currentUser
    });

    broadcast(currentRoom, {
      type: "online-list",
      users: getOnlineList(currentRoom)
    });

    // Remove sala vazia
    if (room.sockets.size === 0) {
      rooms.delete(currentRoom);
    }
  });
});
