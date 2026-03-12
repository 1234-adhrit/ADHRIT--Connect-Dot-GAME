const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const PUZZLES = require("./puzzles");

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

app.use(express.static(path.join(__dirname)));

function makeRoomCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) {
    return makeRoomCode();
  }
  return code;
}

function getRandomPuzzle() {
  return PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
}

function buildInitialGrid(puzzle) {
  const grid = Array.from({ length: puzzle.size }, () =>
    Array.from({ length: puzzle.size }, () => null)
  );
  puzzle.endpoints.forEach((pair) => {
    grid[pair.a[0]][pair.a[1]] = pair.color;
    grid[pair.b[0]][pair.b[1]] = pair.color;
  });
  return grid;
}

function broadcast(room, payload) {
  const message = JSON.stringify(payload);
  room.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function getPlayers(room) {
  return Array.from(room.players.values());
}

function joinRoom(ws, room, name) {
  ws.room = room;
  ws.name = name;
  room.clients.add(ws);
  room.players.set(ws, name);
}

function leaveRoom(ws) {
  const room = ws.room;
  if (!room) {
    return;
  }
  room.clients.delete(ws);
  room.players.delete(ws);
  if (room.clients.size === 0) {
    rooms.delete(room.code);
  } else {
    broadcast(room, { type: "room_update", players: getPlayers(room), state: room.state });
  }
  ws.room = null;
}

function sendError(ws, message) {
  ws.send(JSON.stringify({ type: "error", message }));
}

wss.on("connection", (ws) => {
  ws.room = null;
  ws.name = null;

  ws.on("message", (data) => {
    let payload = null;
    try {
      payload = JSON.parse(data);
    } catch (error) {
      sendError(ws, "Invalid message.");
      return;
    }

    if (payload.type === "create_room") {
      const name = String(payload.name || "").trim();
      if (!name) {
        sendError(ws, "Name is required to create a server.");
        return;
      }
      const code = makeRoomCode();
      const puzzle = PUZZLES[0];
      const room = {
        code,
        puzzleId: puzzle.id,
        state: { puzzleId: puzzle.id, grid: buildInitialGrid(puzzle) },
        clients: new Set(),
        players: new Map()
      };
      rooms.set(code, room);
      joinRoom(ws, room, name);
      ws.send(
        JSON.stringify({
          type: "room_created",
          code,
          state: room.state,
          players: getPlayers(room)
        })
      );
      broadcast(room, { type: "room_update", players: getPlayers(room), state: room.state });
      return;
    }

    if (payload.type === "join_room") {
      const name = String(payload.name || "").trim();
      const code = String(payload.code || "").trim().toUpperCase();
      if (!name) {
        sendError(ws, "Name is required to join a server.");
        return;
      }
      if (!code || !rooms.has(code)) {
        sendError(ws, "Server not found. Check the code and try again.");
        return;
      }
      const room = rooms.get(code);
      joinRoom(ws, room, name);
      ws.send(
        JSON.stringify({
          type: "room_joined",
          code,
          state: room.state,
          players: getPlayers(room)
        })
      );
      broadcast(room, { type: "room_update", players: getPlayers(room), state: room.state });
      return;
    }

    if (payload.type === "state_update") {
      const room = ws.room;
      if (!room) {
        sendError(ws, "Join a server before sending updates.");
        return;
      }
      if (!payload.state || payload.state.puzzleId !== room.state.puzzleId) {
        sendError(ws, "Puzzle mismatch.");
        return;
      }
      room.state = payload.state;
      broadcast(room, {
        type: "room_update",
        players: getPlayers(room),
        state: room.state,
        by: ws.name
      });
      return;
    }

    if (payload.type === "reset_room") {
      const room = ws.room;
      if (!room) {
        sendError(ws, "Join a server before resetting.");
        return;
      }
      const puzzle = getRandomPuzzle();
      room.puzzleId = puzzle.id;
      room.state = { puzzleId: puzzle.id, grid: buildInitialGrid(puzzle) };
      broadcast(room, { type: "room_update", players: getPlayers(room), state: room.state });
      return;
    }

    sendError(ws, "Unknown command.");
  });

  ws.on("close", () => {
    leaveRoom(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
