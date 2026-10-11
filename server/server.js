import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws) => {
  let roomCode = null;
  const playerId = randomUUID();

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Mensagem inválida." });
    }

    if (msg.type === "create" || msg.type === "join") {
      const code = String(msg.room || "").trim().toUpperCase();

      if (!/^[A-Z0-9]{4,10}$/.test(code)) {
        return send(ws, { type: "error", message: "Código inválido (4 a 10 letras ou números)." });
      }

      let room = rooms.get(code);

      if (msg.type === "create") {
        if (room) {
          return send(ws, { type: "error", message: "Essa sala já existe." });
        }

        room = { players: new Set() };
        rooms.set(code, room);
      } else if (!room) {
        return send(ws, { type: "error", message: "Sala não encontrada. Confira o código." });
      }

      if (room.players.size >= 2) {
        return send(ws, { type: "error", message: "A sala já está cheia." });
      }

      if (roomCode) {
        rooms.get(roomCode)?.players.delete(ws);
      }

      roomCode = code;
      room.players.add(ws);

      send(ws, {
        type: "joined",
        room: code,
        playerId,
        players: room.players.size
      });

      for (const peer of room.players) {
        if (peer !== ws) {
          send(peer, { type: "opponent_joined", players: room.players.size });
          send(ws, { type: "opponent_joined", players: room.players.size });
        }
      }

      return;
    }

    if (!roomCode) {
      return send(ws, { type: "error", message: "Entre em uma sala primeiro." });
    }

    const room = rooms.get(roomCode);
    if (!room) return;

    for (const peer of room.players) {
      if (peer !== ws) {
        send(peer, {
          type: msg.type,
          playerId,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          rotation: msg.rotation
        });
      }
    }
  });

  ws.on("close", () => {
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    room.players.delete(ws);

    for (const peer of room.players) {
      send(peer, { type: "opponent_left" });
    }

    if (room.players.size === 0) {
      rooms.delete(roomCode);
    }
  });
});

console.log(`Servidor REDLOCK iniciado na porta ${PORT}`);
