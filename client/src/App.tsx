import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Role = "black" | "white" | "spectator" | null;

type RoomSnapshot = {
  roomId: string;
  board: number[][];
  turn: 1 | 2;
  winner: 0 | 1 | 2;
  lastMove: { x: number; y: number; player: 1 | 2 } | null;
  players: { black: string | null; white: string | null };
  spectatorsCount: number;
};

type ServerMsg =
  | { type: "hello"; clientId: string; boardSize: number; winLen: number }
  | { type: "room:joined"; room: RoomSnapshot; role: Exclude<Role, null> }
  | { type: "room:update"; room: RoomSnapshot }
  | { type: "room:left" }
  | { type: "error"; message: string }
  | { type: "pong"; t: number };

function playerName(p: 0 | 1 | 2) {
  if (p === 1) return "黑棋";
  if (p === 2) return "白棋";
  return "无";
}

function roleLabel(role: Role) {
  if (role === "black") return "黑棋玩家";
  if (role === "white") return "白棋玩家";
  if (role === "spectator") return "观战";
  return "未加入";
}

function App() {
  const wsRef = useRef<WebSocket | null>(null);
  const [conn, setConn] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [clientId, setClientId] = useState<string>("");
  const [boardSize, setBoardSize] = useState<number>(15);
  const [winLen, setWinLen] = useState<number>(5);

  const [role, setRole] = useState<Role>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [roomIdInput, setRoomIdInput] = useState<string>("");
  const [toast, setToast] = useState<string>("");

  const wsUrl = useMemo(() => {
//    return import.meta.env.VITE_WS_URL || "ws://localhost:8080";
    return import.meta.env.VITE_WS_URL || "https://gomoku-backend-eruv.onrender.com";
  }, []);

  function send(msg: unknown) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setToast("未连接到服务器");
      return;
    }
    ws.send(JSON.stringify(msg));
  }

  useEffect(() => {
    let alive = true;

    const connect = () => {
      setConn("connecting");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!alive) return;
        setConn("connected");
        setToast("");
      };

      ws.onmessage = (ev) => {
        if (!alive) return;
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMsg;
        } catch {
          return;
        }

        if (msg.type === "hello") {
          setClientId(msg.clientId);
          setBoardSize(msg.boardSize);
          setWinLen(msg.winLen);
          return;
        }

        if (msg.type === "room:joined") {
          setRoom(msg.room);
          setRole(msg.role);
          setRoomIdInput(msg.room.roomId);
          setToast("");
          return;
        }

        if (msg.type === "room:update") {
          setRoom(msg.room);
          return;
        }

        if (msg.type === "room:left") {
          setRoom(null);
          setRole(null);
          return;
        }

        if (msg.type === "error") {
          setToast(msg.message);
          return;
        }
      };

      ws.onclose = () => {
        if (!alive) return;
        setConn("disconnected");
        // simple auto-reconnect
        setTimeout(() => {
          if (alive) connect();
        }, 800);
      };
    };

    connect();
    return () => {
      alive = false;
      wsRef.current?.close();
    };
  }, [wsUrl]);

  const canMove =
    room &&
    !room.winner &&
    (role === "black" || role === "white") &&
    room.turn === (role === "black" ? 1 : 2) &&
    conn === "connected";

  const statusText = useMemo(() => {
    if (!room) return "未加入房间";
    if (room.winner) return `对局结束：${playerName(room.winner)}获胜`;
    return `当前回合：${playerName(room.turn)}`;
  }, [room]);

  const yourTurnText = useMemo(() => {
    if (!room) return "";
    if (room.winner) return "";
    if (role !== "black" && role !== "white") return "观战中（不可落子）";
    const me = role === "black" ? 1 : 2;
    return room.turn === me ? "轮到你了" : "等待对方落子";
  }, [room, role]);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="title">五子棋 Online</div>
          <div className="subtitle">React + WebSocket 实时对战</div>
        </div>

        <div className="pillRow">
          <span className={`pill ${conn}`}>连接：{conn === "connected" ? "已连接" : conn === "connecting" ? "连接中" : "已断开"}</span>
          <span className="pill">身份：{roleLabel(role)}</span>
          {room ? <span className="pill">房间：{room.roomId}</span> : <span className="pill">房间：-</span>}
        </div>
      </header>

      <main className="main">
        <section className="panel">
          <div className="panelTitle">房间</div>

          <div className="row">
            <button className="btn primary" onClick={() => send({ type: "room:create" })} disabled={conn !== "connected"}>
              创建房间
            </button>
            <button
              className="btn"
              onClick={async () => {
                if (room?.roomId) {
                  await navigator.clipboard.writeText(room.roomId);
                  setToast("房间码已复制");
                }
              }}
              disabled={!room?.roomId}
            >
              复制房间码
            </button>
          </div>

          <div className="row">
            <input
              className="input"
              placeholder="输入房间码（例如 ABC123）"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
            />
            <button className="btn primary" onClick={() => send({ type: "room:join", roomId: roomIdInput })} disabled={conn !== "connected"}>
              加入
            </button>
          </div>

          <div className="row">
            <button className="btn danger" onClick={() => send({ type: "room:leave" })} disabled={!room}>
              离开房间
            </button>
            <button
              className="btn"
              onClick={() => send({ type: "room:reset" })}
              disabled={!room || (role !== "black" && role !== "white")}
              title="仅玩家可重开"
            >
              重开
            </button>
          </div>

          <div className="meta">
            <div>你的ID：{clientId || "-"}</div>
            <div>棋盘：{boardSize}×{boardSize}，连{winLen}胜</div>
            {room ? (
              <div>
                玩家：黑({room.players.black ? "已占用" : "空"}) / 白({room.players.white ? "已占用" : "空"})，观战：{room.spectatorsCount}
              </div>
            ) : null}
          </div>

          {toast ? <div className="toast">{toast}</div> : null}
        </section>

        <section className="boardWrap">
          <div className="boardHeader">
            <div className="status">{statusText}</div>
            <div className="hint">{room ? yourTurnText : "创建或加入房间开始游戏"}</div>
          </div>

          <div
            className="board"
            style={{
              gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
              gridTemplateRows: `repeat(${boardSize}, 1fr)`,
            }}
          >
            {room?.board?.map((row, y) =>
              row.map((cell, x) => {
                const isLast = room.lastMove?.x === x && room.lastMove?.y === y;
                return (
                  <button
                    key={`${x}-${y}`}
                    className={`cell ${cell === 1 ? "b" : cell === 2 ? "w" : ""} ${isLast ? "last" : ""}`}
                    onClick={() => {
                      if (!canMove) return;
                      send({ type: "move", x, y });
                    }}
                    disabled={!room || room.winner !== 0 || conn !== "connected"}
                    title={`${x + 1},${y + 1}`}
                  >
                    <span className="dot" />
                  </button>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
