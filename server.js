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
   HIERARQUIA DE CARGOS
========================= */
const HIERARCHY = [
  "Staff",
  "Narrador",
  "Professor",
  "Ministerio",
  "StMungus",
  "Sociedade",
  "Monitor",
  "Aluno",
  "Visitante"
];

function resolveHighestRole(cargos = []) {
  for (const role of HIERARCHY) {
    if (cargos.includes(role)) return role;
  }
  return "Visitante";
}

function getEmoji(role, gender) {
  const g = (gender || "").toLowerCase();

  switch (role) {
    case "Staff": return "👑";
    case "Narrador": return "🧙";
    case "Professor": return g === "feminino" ? "👩‍🏫" : "👨‍🏫";
    case "Ministerio": return "⚖️";
    case "StMungus": return "🏥";
    case "Sociedade": return g === "feminino" ? "👩🏻" : "👦🏻";
    case "Monitor": return "⭐";
    case "Aluno": return g === "feminino" ? "👩‍🎓" : "👨‍🎓";
    default: return "👤";
  }
}

/* =========================
   CONEXÃO
========================= */
wss.on("connection", (ws) => {

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    /* =====================
       JOIN (ENTRADA)
    ===================== */
    if (data.type === "join") {
      ws.roomId = data.roomId;

      const rawUser = data.user || {};

      // 🔒 NORMALIZA USUÁRIO
      const role = rawUser.role || "Visitante";
      const emoji = rawUser.emoji || "👤";

      ws.user = {
        id: rawUser.id,
        name: rawUser.name || "Sem nome",
        role,
        emoji
      };

      if (!rooms[ws.roomId]) {
        rooms[ws.roomId] = new Set();
      }

      rooms[ws.roomId].add(ws);

      sendOnlineList(ws.roomId);
      return;
    }

    /* =====================
       MESSAGE
    ===================== */
    if (data.type === "message") {
      const room = ws.roomId;
      if (!room || !rooms[room] || !ws.user) return;

      typingUsers[room]?.delete(ws.user.id);

      rooms[room].forEach(client => {
        client.send(JSON.stringify({
          type: "message",
          user: {
            id: ws.user.id,
            name: ws.user.name,
            role: ws.user.role,
            emoji: ws.user.emoji
          },
          text: data.text
        }));
      });

      broadcastTyping(room);
      return;
    }

    /* =====================
       TYPING
    ===================== */
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

  /* =====================
     CLOSE
  ===================== */
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


