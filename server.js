const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};
const typingUsers = {};

console.log("🟢 WebSocket rodando na porta", PORT);

wss.on("connection", ws => {

  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", message => {
    let data;
    try { data = JSON.parse(message); }
    catch { return; }

    if (data.type === "keepalive") return;

    if (data.type === "join") {
      ws.roomId = data.roomId;
      ws.user = data.user;

      if (!rooms[ws.roomId]) rooms[ws.roomId] = new Set();
      rooms[ws.roomId].add(ws);

      sendOnlineList(ws.roomId);
      return;
    }

    if (data.type === "message") {
      const room = ws.roomId;
      if (!room || !rooms[room]) return;

      typingUsers[room]?.delete(ws.user.name);

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
    if (!room || !rooms[room]) return;

    rooms[room].delete(ws);
    typingUsers[room]?.delete(ws.user?.name);

    if (rooms[room].size === 0) {
      delete rooms[room];
      delete typingUsers[room];
    } else {
      sendOnlineList(room);
      broadcastTyping(room);
    }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

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

  rooms[roomId].forEach(client => {
    const others = Array.from(typingUsers[roomId])
      .filter(name => name !== client.user.name);

    client.send(JSON.stringify({
      type: "typing-status",
      users: others
    }));
  });
}


