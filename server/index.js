const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const BOARD_SIZE = 15;
const WIN_LEN = 5;

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {Object} ClientInfo
 * @property {string} clientId
 * @property {import('ws').WebSocket} ws
 * @property {string | null} roomId
 * @property {"black"|"white"|"spectator"|null} role
 */

/**
 * @typedef {Object} Room
 * @property {string} roomId
 * @property {number[][]} board
 * @property {1|2} turn
 * @property {0|1|2} winner
 * @property {{x:number,y:number,player:1|2} | null} lastMove
 * @property {{black: string|null, white: string|null}} players
 * @property {Set<string>} spectators
 * @property {number} createdAt
 */

function newBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

function randId(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function createRoom() {
  let roomId = randId(6);
  while (rooms.has(roomId)) roomId = randId(6);
  /** @type {Room} */
  const room = {
    roomId,
    board: newBoard(),
    turn: 1,
    winner: 0,
    lastMove: null,
    players: { black: null, white: null },
    spectators: new Set(),
    createdAt: Date.now(),
  };
  rooms.set(roomId, room);
  return room;
}

function getPlayerNumber(role) {
  if (role === "black") return 1;
  if (role === "white") return 2;
  return 0;
}

function roomSnapshot(room) {
  return {
    roomId: room.roomId,
    board: room.board,
    turn: room.turn,
    winner: room.winner,
    lastMove: room.lastMove,
    players: room.players,
    spectatorsCount: room.spectators.size,
  };
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** @param {Room} room */
function broadcast(room, msg) {
  for (const client of wss.clients) {
    if (client.readyState !== client.OPEN) continue;
    const info = clientInfos.get(client);
    if (info?.roomId === room.roomId) send(client, msg);
  }
}

function inBounds(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function checkWin(board, x, y, player) {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (const [dx, dy] of dirs) {
    let count = 1;
    for (let s = 1; s < WIN_LEN; s++) {
      const nx = x + dx * s;
      const ny = y + dy * s;
      if (!inBounds(nx, ny) || board[ny][nx] !== player) break;
      count++;
    }
    for (let s = 1; s < WIN_LEN; s++) {
      const nx = x - dx * s;
      const ny = y - dy * s;
      if (!inBounds(nx, ny) || board[ny][nx] !== player) break;
      count++;
    }
    if (count >= WIN_LEN) return true;
  }
  return false;
}

/** @type {WeakMap<import('ws').WebSocket, ClientInfo>} */
const clientInfos = new WeakMap();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Gomoku WebSocket server is running.\n");
});

const wss = new WebSocketServer({ server });

function cleanupRoomIfEmpty(room) {
  const hasPlayers = room.players.black || room.players.white;
  const hasSpectators = room.spectators.size > 0;
  if (!hasPlayers && !hasSpectators) rooms.delete(room.roomId);
}

function detachFromRoom(info) {
  if (!info.roomId) return;
  const room = rooms.get(info.roomId);
  if (!room) {
    info.roomId = null;
    info.role = null;
    return;
  }
  if (info.role === "black" && room.players.black === info.clientId) room.players.black = null;
  else if (info.role === "white" && room.players.white === info.clientId) room.players.white = null;
  else if (info.role === "spectator") room.spectators.delete(info.clientId);

  const oldRoomId = room.roomId;
  info.roomId = null;
  info.role = null;

  broadcast(room, { type: "room:update", room: roomSnapshot(room) });
  cleanupRoomIfEmpty(room);
  // just for clarity in logs
  return oldRoomId;
}

function attachToRoom(info, room) {
  // try assign as black/white first
  let role = "spectator";
  if (!room.players.black) {
    room.players.black = info.clientId;
    role = "black";
  } else if (!room.players.white) {
    room.players.white = info.clientId;
    role = "white";
  } else {
    room.spectators.add(info.clientId);
    role = "spectator";
  }
  info.roomId = room.roomId;
  info.role = role;
  return role;
}

wss.on("connection", (ws) => {
  /** @type {ClientInfo} */
  const info = { clientId: randId(10), ws, roomId: null, role: null };
  clientInfos.set(ws, info);

  send(ws, { type: "hello", clientId: info.clientId, boardSize: BOARD_SIZE, winLen: WIN_LEN });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "Invalid JSON" });
    }

    if (!msg || typeof msg.type !== "string") return send(ws, { type: "error", message: "Missing type" });

    if (msg.type === "room:create") {
      detachFromRoom(info);
      const room = createRoom();
      const role = attachToRoom(info, room);
      send(ws, { type: "room:joined", room: roomSnapshot(room), role });
      broadcast(room, { type: "room:update", room: roomSnapshot(room) });
      return;
    }

    if (msg.type === "room:join") {
      const roomId = String(msg.roomId || "").trim().toUpperCase();
      if (!roomId) return send(ws, { type: "error", message: "roomId required" });
      const room = rooms.get(roomId);
      if (!room) return send(ws, { type: "error", message: "Room not found" });
      detachFromRoom(info);
      const role = attachToRoom(info, room);
      send(ws, { type: "room:joined", room: roomSnapshot(room), role });
      broadcast(room, { type: "room:update", room: roomSnapshot(room) });
      return;
    }

    if (msg.type === "room:leave") {
      detachFromRoom(info);
      send(ws, { type: "room:left" });
      return;
    }

    if (msg.type === "room:reset") {
      if (!info.roomId) return send(ws, { type: "error", message: "Not in a room" });
      const room = rooms.get(info.roomId);
      if (!room) return send(ws, { type: "error", message: "Room not found" });
      if (info.role !== "black" && info.role !== "white") return send(ws, { type: "error", message: "Players only" });
      room.board = newBoard();
      room.turn = 1;
      room.winner = 0;
      room.lastMove = null;
      broadcast(room, { type: "room:update", room: roomSnapshot(room) });
      return;
    }

    if (msg.type === "move") {
      if (!info.roomId) return send(ws, { type: "error", message: "Not in a room" });
      const room = rooms.get(info.roomId);
      if (!room) return send(ws, { type: "error", message: "Room not found" });
      if (room.winner) return send(ws, { type: "error", message: "Game already ended" });

      const x = Number(msg.x);
      const y = Number(msg.y);
      if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) {
        return send(ws, { type: "error", message: "Invalid position" });
      }

      const player = getPlayerNumber(info.role);
      if (player === 0) return send(ws, { type: "error", message: "Spectators cannot move" });
      if (room.turn !== player) return send(ws, { type: "error", message: "Not your turn" });
      if (room.board[y][x] !== 0) return send(ws, { type: "error", message: "Cell occupied" });

      room.board[y][x] = player;
      room.lastMove = { x, y, player };

      if (checkWin(room.board, x, y, player)) {
        room.winner = player;
      } else {
        room.turn = room.turn === 1 ? 2 : 1;
      }

      broadcast(room, { type: "room:update", room: roomSnapshot(room) });
      return;
    }

    if (msg.type === "ping") return send(ws, { type: "pong", t: Date.now() });

    send(ws, { type: "error", message: "Unknown type" });
  });

  ws.on("close", () => {
    // release seat on disconnect; for a production-grade reconnect, we'd keep seat with a token.
    detachFromRoom(info);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[gomoku-server] listening on http://localhost:${PORT} (ws://localhost:${PORT})`);
});

