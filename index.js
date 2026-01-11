require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/game.db');

app.use(express.static('public'));
app.use(express.json());

const PORT = process.env.PORT || 3000;

// -------------------- HELPERS --------------------
function generateRoomCode (length = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';

    for (let i = 0; i < length; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    return code;
}

function assignRoles (players, word1, word2) {
    const roles = players.map(p => ({
        username: p.username,
        role: 'Correct',
        word: word1
    }));

    let confusedCount = 1;
    let spyCount = players.length >= 5 ? 1 : 0;

    if (players.length >= 7) {
        confusedCount = 2;
    }

    const available = roles.map((_, i) => i);
    const pick = () => available.splice(Math.floor(Math.random() * available.length), 1)[0];

    for (let i = 0; i < confusedCount; i++) {
        const idx = pick();
        roles[idx].role = 'Confused';
        roles[idx].word = word2;
    }

    for (let i = 0; i < spyCount && available.length; i++) {
        const idx = pick();
        roles[idx].role = 'Spy';
        roles[idx].word = '';
    }

    return roles;
}

function assignRolesChaos (players, word1, word2) {
    const roles = players.map(p => ({
        username: p.username,
        role: 'Correct',
        word: word1
    }));

    const max = Math.floor(players.length / 2);
    const confusedCount = Math.floor(Math.random() * max) + 1;
    const spyCount = Math.floor(Math.random() * max);

    const available = roles.map((_, i) => i);
    const pick = () => available.splice(Math.floor(Math.random() * available.length), 1)[0];

    for (let i = 0; i < confusedCount && available.length; i++) {
        const idx = pick();
        roles[idx].role = 'Confused';
        roles[idx].word = word2;
    }

    for (let i = 0; i < spyCount && available.length; i++) {
        const idx = pick();
        roles[idx].role = 'Spy';
        roles[idx].word = '';
    }

    return roles;
}

// -------------------- SOCKET.IO --------------------
io.on('connection', socket => {
    console.log('CONNECTED:', socket.id);

    // --------- CREATE ROOM ---------
    socket.on('createRoom', ({ username }) => {
        const code = generateRoomCode();
        socket.roomCode = code;
        socket.username = username;
        socket.isHost = true;

        db.serialize(() => {
            db.run(`INSERT INTO rooms (code, host_socket) VALUES (?, ?)`, [code, socket.id]);

            db.run(
                `INSERT INTO players (room_code, socket_id, username) VALUES (?, ?, ?)`,
                [code, socket.id, username],
                () => {
                    socket.join(code);
                    socket.emit('roomCreated', { code, isHost: true });
                    io.to(code).emit('playerList', [{ username }]);
                }
            );
        });
    });

    // --------- JOIN ROOM ---------
    socket.on('joinRoom', ({ username, code }) => {
        db.get(`SELECT * FROM rooms WHERE code = ?`, [code], (err, room) => {
            if (!room || room.started) {
                socket.emit('errorMessage', 'Room Not Available.');
                return;
            }

            db.get(
                `SELECT * FROM players WHERE room_code = ? AND username = ?`,
                [code, username],
                (err, existing) => {
                    if (existing) {
                        socket.emit('errorMessage', 'Username Taken.');
                        return;
                    }

                    socket.roomCode = code;
                    socket.username = username;
                    socket.isHost = false;

                    db.run(
                        `INSERT INTO players (room_code, socket_id, username) VALUES (?, ?, ?)`,
                        [code, socket.id, username],
                        () => {
                            socket.join(code);
                            db.all(
                                `SELECT username FROM players WHERE room_code = ?`,
                                [code],
                                (err, players) => {
                                    io.to(code).emit('playerList', players);
                                }
                            );
                            socket.emit('roomJoined', { code, isHost: false });
                        }
                    );
                }
            );
        });
    });

    // --------- REJOIN (RECONNECT FIX) ---------
    socket.on('rejoinRoom', ({ code, username }) => {
        socket.roomCode = code;
        socket.username = username;
        socket.join(code);

        db.run(
            `UPDATE players SET socket_id = ? WHERE room_code = ? AND username = ?`,
            [socket.id, code, username],
            () => {
                db.all(
                    `SELECT username FROM players WHERE room_code = ?`,
                    [code],
                    (err, players) => {
                        io.to(code).emit('playerList', players);
                    }
                );
            }
        );
    });

    // --------- START GAME ---------
    socket.on('startGame', ({ code, chaosMode }) => {
        db.get(`SELECT * FROM rooms WHERE code = ?`, [code], (err, room) => {
            if (!room || room.host_socket !== socket.id) {
                socket.emit('errorMessage', 'Only host can start.');
                return;
            }

            db.all(
                `SELECT username, socket_id FROM players WHERE room_code = ?`,
                [code],
                (err, players) => {
                    if (players.length < 4 || players.length > 8) {
                        socket.emit('errorMessage', '4–8 players required.');
                        return;
                    }

                    db.get(
                        `SELECT word1, word2 FROM words ORDER BY RANDOM() LIMIT 1`,
                        [],
                        (err, words) => {
                            const mainWord = Math.random() < 0.5 ? words.word1 : words.word2;
                            const confusedWord = mainWord === words.word1 ? words.word2 : words.word1;

                            const roles = chaosMode
                                ? assignRolesChaos(players, mainWord, confusedWord)
                                : assignRoles(players, mainWord, confusedWord);

                            db.run(
                                `UPDATE rooms SET started = 1, word1 = ?, word2 = ? WHERE code = ?`,
                                [mainWord, confusedWord, code]
                            );

                            roles.forEach(r => {
                                const p = players.find(pl => pl.username === r.username);

                                db.run(
                                    `UPDATE players SET role = ?, word = ? WHERE room_code = ? AND username = ?`,
                                    [r.role, r.word, code, r.username]
                                );

                                io.to(p.socket_id).emit('gameStarted', {
                                    role: r.role,
                                    word: r.word,
                                    real: mainWord
                                });
                            });
                        }
                    );
                }
            );
        });
    });

    // --------- RESTART GAME ---------
    socket.on('restartGame', code => {
        db.get(`SELECT host_socket FROM rooms WHERE code = ?`, [code], (err, room) => {
            if (!room || room.host_socket !== socket.id) {
                return;
            }

            db.run(
                `UPDATE rooms SET started = 0, word1 = NULL, word2 = NULL WHERE code = ?`,
                [code],
                () => {
                    db.run(
                        `UPDATE players SET role = NULL, word = NULL WHERE room_code = ?`,
                        [code],
                        () => io.to(code).emit('gameReset')
                    );
                }
            );
        });
    });

    // --------- DISCONNECT ---------
    socket.on('disconnect', () => {
        if (!socket.roomCode || !socket.username) {
            return;
        }

        db.run(
            `DELETE FROM players WHERE room_code = ? AND username = ?`,
            [socket.roomCode, socket.username],
            () => {
                db.all(
                    `SELECT username FROM players WHERE room_code = ?`,
                    [socket.roomCode],
                    (err, players) => {
                        io.to(socket.roomCode).emit('playerList', players);
                    }
                );
            }
        );

        console.log('DISCONNECTED:', socket.username);
    });
});

// -------------------- ROOM CLEANUP --------------------
const ROOM_TTL_HOURS= 1;
const CLEANUP_INTERVAL_MINUTES = 15;

setInterval(() => {
    db.serialize(() => {
        db.all(
            `
            SELECT r.code
            FROM rooms r
            LEFT JOIN players p ON p.room_code = r.code
            WHERE r.created_at < datetime('now', ?)
            GROUP BY r.code
            HAVING COUNT(p.id) = 0
            `,
            [`-${ROOM_TTL_HOURS} Hours`],
            (err, rooms) => {
                if (err) {
                    console.error('Cleanup Error:', err);
                    return;
                }

                rooms.forEach(room => {
                    db.run(
                        `DELETE FROM rooms WHERE code = ?`,
                        [room.code],
                        () => {
                            console.log(`🧹 Cleaned Up Room ${room.code}`);
                        }
                    );
                });
            }
        );
    });
}, CLEANUP_INTERVAL_MINUTES * 60 * 1000);

http.listen(PORT);