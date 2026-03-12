const COLOR_KEYS = ["red", "yellow", "purple", "cyan", "pink", "green"];

const elements = {
  grid: document.getElementById("grid"),
  legend: document.getElementById("legend"),
  winOverlay: document.getElementById("winOverlay"),
  keepPlayingBtn: document.getElementById("keepPlayingBtn"),
  playerName: document.getElementById("playerName"),
  soloBtn: document.getElementById("soloBtn"),
  createBtn: document.getElementById("createBtn"),
  joinBtn: document.getElementById("joinBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  serverCode: document.getElementById("serverCode"),
  statusBadge: document.getElementById("statusBadge"),
  roomCode: document.getElementById("roomCode"),
  playersList: document.getElementById("playersList"),
  resetBtn: document.getElementById("resetBtn"),
  hint: document.getElementById("hint")
};

const state = {
  puzzle: null,
  grid: [],
  cells: [],
  endpoints: new Map(),
  isDrawing: false,
  activeColor: null,
  currentPath: [],
  socket: null,
  roomCode: null,
  multiplayer: false,
  suppressSend: false
};

init();

function init() {
  buildLegend();
  bindUI();
  setHint("Tip: Enter your name to unlock multiplayer servers.");
  loadPuzzle(PUZZLES[0]);
  setPlayersList(["Solo Player"]);
  setStatus("Solo", "solo");
}

function buildLegend() {
  elements.legend.innerHTML = "";
  COLOR_KEYS.forEach((key) => {
    const item = document.createElement("div");
    item.className = "legendItem";
    const dot = document.createElement("span");
    dot.className = `legendDot color-${key}`;
    dot.style.background = `var(--${key})`;
    const label = document.createElement("span");
    label.textContent = key.toUpperCase();
    item.appendChild(dot);
    item.appendChild(label);
    elements.legend.appendChild(item);
  });
}

function bindUI() {
  elements.soloBtn.addEventListener("click", () => {
    if (state.socket) {
      disconnectMultiplayer();
    }
    enterSoloMode();
  });

  elements.createBtn.addEventListener("click", () => {
    if (!isNameValid()) {
      flashHint("Enter your name before creating a server.");
      return;
    }
    connectAndSend({ type: "create_room", name: getPlayerName() });
  });

  elements.joinBtn.addEventListener("click", () => {
    if (!isNameValid()) {
      flashHint("Enter your name before joining a server.");
      return;
    }
    const code = elements.serverCode.value.trim().toUpperCase();
    if (!code) {
      flashHint("Add a server code to join.");
      return;
    }
    connectAndSend({ type: "join_room", name: getPlayerName(), code });
  });

  elements.disconnectBtn.addEventListener("click", () => {
    disconnectMultiplayer();
    enterSoloMode();
  });

  elements.resetBtn.addEventListener("click", () => {
    if (state.multiplayer) {
      requestRoomReset();
    } else {
      loadPuzzle(getRandomPuzzle());
    }
  });

  elements.keepPlayingBtn.addEventListener("click", () => {
    elements.winOverlay.classList.add("hidden");
  });

  elements.playerName.addEventListener("input", () => {
    updateMultiplayerButtons();
  });

  elements.serverCode.addEventListener("input", () => {
    updateMultiplayerButtons();
  });

  elements.grid.addEventListener("pointerdown", handlePointerDown);
  elements.grid.addEventListener("pointermove", handlePointerMove);
  elements.grid.addEventListener("pointerup", handlePointerUp);
  elements.grid.addEventListener("pointercancel", handlePointerUp);

  updateMultiplayerButtons();
}

function loadPuzzle(puzzle, incomingState) {
  state.puzzle = puzzle;
  buildEndpoints(puzzle);
  elements.grid.style.setProperty("--grid-size", puzzle.size);

  if (incomingState && incomingState.grid) {
    state.grid = cloneGrid(incomingState.grid);
    enforceEndpoints();
  } else {
    state.grid = buildInitialGrid(puzzle);
  }

  renderGrid();
  renderAllCells();
  evaluateSolved();
}

function getRandomPuzzle() {
  return PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
}

function buildEndpoints(puzzle) {
  state.endpoints.clear();
  puzzle.endpoints.forEach((pair) => {
    state.endpoints.set(keyFor(pair.a[0], pair.a[1]), pair.color);
    state.endpoints.set(keyFor(pair.b[0], pair.b[1]), pair.color);
  });
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

function renderGrid() {
  elements.grid.innerHTML = "";
  state.cells = [];
  for (let r = 0; r < state.puzzle.size; r += 1) {
    const row = [];
    for (let c = 0; c < state.puzzle.size; c += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      elements.grid.appendChild(cell);
      row.push(cell);
    }
    state.cells.push(row);
  }
}

function renderAllCells() {
  for (let r = 0; r < state.puzzle.size; r += 1) {
    for (let c = 0; c < state.puzzle.size; c += 1) {
      renderCell(r, c);
    }
  }
}

function renderCell(r, c) {
  const cell = state.cells[r][c];
  cell.className = "cell";
  const color = state.grid[r][c];
  if (color) {
    cell.classList.add(`color-${color}`);
  }
  if (isEndpoint(r, c)) {
    cell.classList.add("endpoint");
  }
}

function handlePointerDown(event) {
  const cell = event.target.closest(".cell");
  if (!cell) {
    return;
  }
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  const color = state.grid[r][c];
  if (!color) {
    return;
  }
  startDrawing(r, c, color);
  elements.grid.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!state.isDrawing) {
    return;
  }
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!target) {
    return;
  }
  const cell = target.closest(".cell");
  if (!cell) {
    return;
  }
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);
  continueDrawing(r, c);
}

function handlePointerUp() {
  if (!state.isDrawing) {
    return;
  }
  state.isDrawing = false;
  state.activeColor = null;
  state.currentPath = [];
  evaluateSolved();
  if (state.multiplayer) {
    sendStateUpdate();
  }
}

function startDrawing(r, c, color) {
  state.isDrawing = true;
  state.activeColor = color;
  clearColor(color);
  state.currentPath = [[r, c]];
  setCellColor(r, c, color);
}

function continueDrawing(r, c) {
  const last = state.currentPath[state.currentPath.length - 1];
  if (!last) {
    return;
  }
  const distance = Math.abs(r - last[0]) + Math.abs(c - last[1]);
  if (distance !== 1) {
    return;
  }
  const cellColor = state.grid[r][c];
  if (cellColor && cellColor !== state.activeColor) {
    return;
  }

  const existingIndex = state.currentPath.findIndex(
    ([pr, pc]) => pr === r && pc === c
  );
  if (existingIndex !== -1) {
    for (let i = state.currentPath.length - 1; i > existingIndex; i -= 1) {
      const [rr, cc] = state.currentPath[i];
      if (!isEndpoint(rr, cc)) {
        setCellColor(rr, cc, null);
      }
    }
    state.currentPath = state.currentPath.slice(0, existingIndex + 1);
    return;
  }

  state.currentPath.push([r, c]);
  setCellColor(r, c, state.activeColor);
}

function clearColor(color) {
  for (let r = 0; r < state.puzzle.size; r += 1) {
    for (let c = 0; c < state.puzzle.size; c += 1) {
      if (state.grid[r][c] === color && !isEndpoint(r, c)) {
        setCellColor(r, c, null);
      }
    }
  }
}

function setCellColor(r, c, color) {
  if (color === null && isEndpoint(r, c)) {
    color = state.endpoints.get(keyFor(r, c));
  }
  state.grid[r][c] = color;
  renderCell(r, c);
}

function evaluateSolved() {
  if (!state.puzzle) {
    return;
  }
  const allFilled = state.grid.every((row) => row.every((cell) => cell !== null));
  if (!allFilled) {
    elements.winOverlay.classList.add("hidden");
    return;
  }
  const connected = state.puzzle.endpoints.every((pair) =>
    areEndpointsConnected(pair.color, pair.a, pair.b)
  );
  if (connected) {
    elements.winOverlay.classList.remove("hidden");
  } else {
    elements.winOverlay.classList.add("hidden");
  }
}

function areEndpointsConnected(color, start, end) {
  const queue = [start];
  const visited = new Set([keyFor(start[0], start[1])]);
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === end[0] && c === end[1]) {
      return true;
    }
    for (const [dr, dc] of directions) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= state.puzzle.size || nc >= state.puzzle.size) {
        continue;
      }
      const key = keyFor(nr, nc);
      if (visited.has(key)) {
        continue;
      }
      if (state.grid[nr][nc] !== color) {
        continue;
      }
      visited.add(key);
      queue.push([nr, nc]);
    }
  }
  return false;
}

function resetBoard(shouldBroadcast) {
  if (!state.puzzle) {
    return;
  }
  state.grid = buildInitialGrid(state.puzzle);
  renderAllCells();
  elements.winOverlay.classList.add("hidden");
  if (shouldBroadcast && state.multiplayer) {
    sendStateUpdate();
  }
}

function applyIncomingState(incoming) {
  if (!incoming || !incoming.grid) {
    return;
  }
  state.suppressSend = true;
  state.grid = cloneGrid(incoming.grid);
  enforceEndpoints();
  renderAllCells();
  evaluateSolved();
  state.suppressSend = false;
}

function enforceEndpoints() {
  state.endpoints.forEach((color, key) => {
    const [r, c] = key.split(",").map(Number);
    state.grid[r][c] = color;
  });
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function isEndpoint(r, c) {
  return state.endpoints.has(keyFor(r, c));
}

function keyFor(r, c) {
  return `${r},${c}`;
}

function setStatus(label, mode) {
  elements.statusBadge.textContent = label;
  elements.statusBadge.className = `statusBadge ${mode}`;
}

function setHint(message) {
  elements.hint.textContent = message;
}

function flashHint(message) {
  setHint(message);
  setTimeout(() => {
    if (elements.hint.textContent === message) {
      setHint("");
    }
  }, 2500);
}

function setPlayersList(players) {
  elements.playersList.innerHTML = "";
  players.forEach((name) => {
    const item = document.createElement("li");
    item.textContent = name;
    elements.playersList.appendChild(item);
  });
}

function isNameValid() {
  return getPlayerName().length > 0;
}

function getPlayerName() {
  return elements.playerName.value.trim();
}

function updateMultiplayerButtons() {
  const nameOk = isNameValid();
  elements.createBtn.disabled = !nameOk;
  const hasCode = elements.serverCode.value.trim().length > 0;
  elements.joinBtn.disabled = !nameOk || !hasCode;
}

function enterSoloMode() {
  state.multiplayer = false;
  state.roomCode = null;
  setStatus("Solo", "solo");
  elements.roomCode.textContent = "-";
  elements.disconnectBtn.classList.add("hidden");
  setHint("");
  const name = getPlayerName();
  setPlayersList([name || "Solo Player"]);
  loadPuzzle(PUZZLES[0]);
}

function connectAndSend(payload) {
  const ws = connectSocket();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  } else {
    ws.addEventListener(
      "open",
      () => {
        ws.send(JSON.stringify(payload));
      },
      { once: true }
    );
  }
}

function connectSocket() {
  if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
    return state.socket;
  }
  const wsUrl = getWsUrl();
  const ws = new WebSocket(wsUrl);
  state.socket = ws;
  setStatus("Connecting", "offline");
  setHint(`Connecting to ${wsUrl}...`);

  ws.addEventListener("open", () => {
    setStatus("Connected", "live");
    setHint("");
  });

  ws.addEventListener("message", (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    handleServerMessage(payload);
  });

  ws.addEventListener("close", () => {
    if (state.multiplayer) {
      setStatus("Disconnected", "offline");
      flashHint("Connection closed. Switch to solo or rejoin.");
    }
  });

  ws.addEventListener("error", () => {
    setStatus("Offline", "offline");
    flashHint("Could not reach the server. Start server.js first.");
  });

  return ws;
}

function handleServerMessage(payload) {
  if (!payload || !payload.type) {
    return;
  }
  if (payload.type === "error") {
    flashHint(payload.message || "Server error.");
    return;
  }
  if (payload.type === "room_created" || payload.type === "room_joined") {
    state.multiplayer = true;
    state.roomCode = payload.code;
    elements.roomCode.textContent = payload.code;
    elements.disconnectBtn.classList.remove("hidden");
    setStatus("Live", "live");
    setHint("");
    setPlayersList(payload.players || []);
    const puzzle = PUZZLES.find((item) => item.id === payload.state?.puzzleId) || PUZZLES[0];
    loadPuzzle(puzzle, payload.state);
    return;
  }
  if (payload.type === "room_update") {
    if (payload.players) {
      setPlayersList(payload.players);
    }
    if (payload.state && !state.suppressSend) {
      const nextPuzzle =
        PUZZLES.find((item) => item.id === payload.state.puzzleId) || state.puzzle;
      if (nextPuzzle && nextPuzzle.id !== state.puzzle.id) {
        loadPuzzle(nextPuzzle, payload.state);
      } else {
        applyIncomingState(payload.state);
      }
    }
  }
}

function sendStateUpdate() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const payload = {
    type: "state_update",
    code: state.roomCode,
    name: getPlayerName(),
    state: {
      puzzleId: state.puzzle.id,
      grid: state.grid
    }
  };
  state.socket.send(JSON.stringify(payload));
}

function requestRoomReset() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    flashHint("Server not connected.");
    return;
  }
  state.socket.send(
    JSON.stringify({
      type: "reset_room"
    })
  );
}

function disconnectMultiplayer() {
  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }
  state.multiplayer = false;
  state.roomCode = null;
  elements.disconnectBtn.classList.add("hidden");
  setStatus("Solo", "solo");
}

function getWsUrl() {
  if (window.location.protocol.startsWith("http")) {
    return window.location.origin.replace("http", "ws");
  }
  return "ws://localhost:3000";
}
