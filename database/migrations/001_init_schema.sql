PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- ============================
-- WORDS
-- ============================
DROP TABLE IF EXISTS words;

CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word1 TEXT NOT NULL,
    word2 TEXT NOT NULL
);

-- ============================
-- ROOMS
-- ============================
DROP TABLE IF EXISTS rooms;

CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    host_socket TEXT NOT NULL,
    started INTEGER DEFAULT 0,
    word1 TEXT,
    word2 TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================
-- PLAYERS
-- ============================
DROP TABLE IF EXISTS players;

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    socket_id TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT,
    word TEXT,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_code)
    REFERENCES rooms(code)
    ON DELETE CASCADE,
    UNIQUE (room_code, username)
);

-- ============================
-- INDEXES
-- ============================
CREATE INDEX IF NOT EXISTS idx_players_room_code ON players(room_code);
CREATE INDEX IF NOT EXISTS idx_players_socket_id ON players(socket_id);

COMMIT;