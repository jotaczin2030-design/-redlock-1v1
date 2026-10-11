
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
      return send(ws, {
        type: "error",
        message: "Mensagem inválida."
      });
    }

    if (msg.type === "create" || msg.type === "join") {
      const creating = msg.type === "create";
      const code = creating
        ? randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()
   : String(msg.code || msg.room || "").trim().toUpperCase();

      if (!/^[A-Z0-9]{4,10}$/.test(code)) {
        return send(ws, {
          type: "error",
          message: "Código inválido (4 a 10 letras ou números)."
        });
      }

      let room = rooms.get(code);

      if (creating) {
        if (room) {
          return send(ws, {
            type: "error",
            message: "Essa sala já existe. Tente novamente."
          });
        }

        room = { players: new Set() };
        rooms.set(code, room);
      } else if (!room) {
        return send(ws, {
          type: "error",
          message: "Sala não encontrada. Confira o código."
        });
      }

      if (room.players.size >= 2) {
        if (creating) rooms.delete(code);
        return send(ws, {
          type: "error",
          message: "A sala já está cheia."
        });
      }

      if (roomCode) {
        const oldRoom = rooms.get(roomCode);
        if (oldRoom) {
          oldRoom.players.delete(ws);
          if (oldRoom.players.size === 0) rooms.delete(roomCode);
        }
      }

      roomCode = code;
      room.players.add(ws);

      send(ws, {
  type: creating ? "created" : "joined",
  room: code,
  code,
  playerId,
  id: playerId,
  players: room.players.size
});

      if (room.players.size === 2) {
        for (const peer of room.players) {
          send(peer, {
            type: "peer-joined",
            players: 2
          });
        }
      }

      return;
    }

    if (!roomCode) {
      return send(ws, {
        type: "error",
        message: "Entre em uma sala primeiro."
      });
    }

    const room = rooms.get(roomCode);
    if (!room) return;

    // Encaminha pose, disparos e demais eventos do jogo
    // sem permitir que o cliente falsifique o ID do jogador.
    for (const peer of room.players) {
      if (peer !== ws) {
        send(peer, {
          ...msg,
          playerId
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
      send(peer, { type: "peer-left" });
    }

    if (room.players.size === 0) {
      rooms.delete(roomCode);
    }

    roomCode = null;
  });
});

console.log(`Servidor REDLOCK iniciado na porta ${PORT}`);
