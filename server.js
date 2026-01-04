const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

/*
 Estrutura:
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

wss.on("connection", (ws) => {

  ws.on("message", (message) => {
    let data;

    try {
      data = JSON.parse(message);
    } catch (err) {
      return;
    }

    /* =========================
       JOIN (ENTRAR NA SALA)
    ========================= */
    if (data.type === "join") {
      ws.roomId = data.roomId;
      ws.user = data.user;

      if (!rooms[ws.roomId]) {
        rooms[ws.roomId] = new Set();
      }

      rooms[ws.roomId].add(ws);

      // envia lista de online
      sendOnlineList(ws.roomId);

      return;
    }

    /* =========================
       MENSAGEM
    ========================= */
    if (data.type === "message") {
      const room = ws.roomId;
      if (!room || !rooms[room]) return;

      // remove status digitando
      typingUsers[room]?.delete(ws.user.id);

      rooms[room].forEach(client => {
        client.send(JSON.stringify({
          type: "message",
          user: ws.user,
          text: data.text
        }));
      });

      // atualiza digitando
      broadcastTyping(room);

      return;
    }

    /* =========================
       DIGITANDO
    ========================= */
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

  /* =========================
     SAIR / DESCONECTAR
  ========================= */
  ws.on("close", () => {
    const room = ws.roomId;
    if (!room || !rooms[room]) return;

    rooms[room].delete(ws);

    // remove digitando
    typingUsers[room]?.delete(ws.user?.id);

    // limpa sala vazia
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
   FUNÇÕES AUXILIARES
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
  if (!typingUsers[roomId]) return;

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
