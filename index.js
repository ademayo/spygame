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
    const roles = players.map(p => ({ username: p.username, role: 'Correct', word: word1 }));
    let confusedCount = 1;
    let spyCount = players.length >= 5 ? 1 : 0;

    if (players.length >= 7 && players.length <= 8) {
        confusedCount = 2;
        spyCount = 1;
    }

    // Assign Confused
    for (let i = 0; i < confusedCount; i++) {
        let idx = Math.floor(Math.random() * roles.length);
        while (roles[idx].role !== 'Correct') idx = Math.floor(Math.random() * roles.length);
        roles[idx].role = 'Confused';
        roles[idx].word = word2;
    }

    // Assign Spy
    for (let i = 0; i < spyCount; i++) {
        let idx = Math.floor(Math.random() * roles.length);
        while (roles[idx].role !== 'Correct') idx = Math.floor(Math.random() * roles.length);
        roles[idx].role = 'Spy';
        roles[idx].word = '';
    }

    return roles;
}

function assignRolesChaos (players, word1, word2) {
    const roles = players.map(p => ({ username: p.username, role: 'Correct', word: word1 }));

    // Random Number Of Confused: 1 To Half Of Players
    const confusedCount = Math.floor(Math.random() * Math.ceil(players.length / 2)) + 1;

    // Random Number Of Spies: 0 To Half Of Players
    const spyCount = Math.floor(Math.random() * Math.ceil(players.length / 2));

    // Assign Confused
    for (let i = 0; i < confusedCount; i++) {
        let idx = Math.floor(Math.random() * roles.length);
        while (roles[idx].role !== 'Correct') idx = Math.floor(Math.random() * roles.length);
        roles[idx].role = 'Confused';
        roles[idx].word = word2;
    }

    // Assign Spy
    for (let i = 0; i < spyCount; i++) {
        let idx = Math.floor(Math.random() * roles.length);
        while (roles[idx].role !== 'Correct') idx = Math.floor(Math.random() * roles.length);
        roles[idx].role = 'Spy';
        roles[idx].word = '';
    }

    return roles;
}

// -------------------- SOCKET.IO --------------------
io.on('connection', socket => {
    console.log('User Connected:', socket.id);

    // --------- CREATE ROOM ---------
    socket.on('createRoom', ({ username }) => {
        const code = generateRoomCode();

        db.serialize(() => {
            db.run(`INSERT INTO rooms (code, host_socket) VALUES (?, ?)`, [code, socket.id]);

            db.run(
                `INSERT INTO players (room_code, socket_id, username) VALUES (?, ?, ?)`,
                [code, socket.id, username],
                () => {
                    socket.join(code);
                    socket.emit('roomCreated', { code });
                    socket.emit('playerList', [{ username }]);
                }
            );
        });
    });

    // --------- JOIN ROOM ---------
    socket.on('joinRoom', ({ username, code }) => {
        db.get(`SELECT * FROM rooms WHERE code = ?`, [code], (err, room) => {
            if (err || !room) {
                socket.emit('errorMessage', 'Room Not Found.');
                return;
            }

            if (room.started) {
                socket.emit('errorMessage', 'Game Already Started.');
                return;
            }

            // Prevent duplicate username
            db.get(
                `SELECT * FROM players WHERE room_code = ? AND username = ?`,
                [code, username],
                (err2, existing) => {
                    if (existing) {
                        socket.emit('errorMessage', 'Username Already Taken In This Room.');
                        return;
                    }

                    db.run(
                        `INSERT INTO players (room_code, socket_id, username) VALUES (?, ?, ?)`,
                        [code, socket.id, username],
                        () => {
                            socket.join(code);

                            // Update Player List
                            db.all(`SELECT username FROM players WHERE room_code = ?`, [code], (err3, players) => {
                                io.to(code).emit('playerList', players);
                            });

                            // Show Waiting Message
                            socket.emit('roomJoined', { code });
                        }
                    );
                }
            );
        });
    });

    // --------- START GAME ---------
    socket.on('startGame', ({ code, chaosMode }) => {
        db.get(`SELECT * FROM rooms WHERE code = ?`, [code], (err, room) => {
            if (err || !room) {
                return;
            }

            db.all(`SELECT username, socket_id FROM players WHERE room_code = ?`, [code], (err, players) => {
                if (err || !players) {
                    return;
                }

                // Check If The Number Of Players Is 4-8
                if (players.length < 4 || players.length > 8) {
                    socket.emit('errorMessage', 'Game Requires 4 To 8 Players To Start.');
                    return;
                }

                // Pick Random Word Pair
                db.get(`SELECT word1, word2 FROM words ORDER BY RANDOM() LIMIT 1`, [], (err, words) => {
                    if (err || !words) {
                        return;
                    }

                    // Randomly Decide Which Is Main/Confused
                    let mainWord, confusedWord;

                    if (Math.random() < 0.5) {
                        mainWord = words.word1;
                        confusedWord = words.word2;
                    } else {
                        mainWord = words.word2;
                        confusedWord = words.word1;
                    }

                    // Assign Roles Based On Chaos Mode
                    let roles = chaosMode
                        ? assignRolesChaos(players, mainWord, confusedWord)
                        : assignRoles(players, mainWord, confusedWord);

                    // Update Room And Start Game
                    db.run(
                        `UPDATE rooms SET started = 1, word1 = ?, word2 = ? WHERE code = ?`,
                        [mainWord, confusedWord, code]
                    );

                    // Assign Role To Each Player And Emit gameStarted
                    roles.forEach(r => {
                        db.run(
                            `UPDATE players SET role = ?, word = ? WHERE room_code = ? AND username = ?`,
                            [r.role, r.word, code, r.username]
                        );

                        const playerSocket = players.find(p => p.username === r.username).socket_id;
                        let realWord = r.word;

                        if (r.role === 'Confused') {
                            realWord = mainWord;
                        }

                        io.to(playerSocket).emit('gameStarted', {
                            role: r.role,
                            word: r.word,
                            real: realWord
                        });
                    });
                });
            });
        });
    });

    // --------- REVEAL CONFUSED ---------
    socket.on('revealConfused', code => {
        db.get(`SELECT word2 FROM rooms WHERE code = ?`, [code], (err, row) => {
            if (row) socket.emit('confusedReveal', row.word2);
        });
    });

    // --------- RESTART GAME ---------
    socket.on('restartGame', code => {
        db.run(`UPDATE rooms SET started = 0, word1 = NULL, word2 = NULL WHERE code = ?`, [code], () => {
            db.run(`UPDATE players SET role = NULL, word = NULL WHERE room_code = ?`, [code], () => {
                io.to(code).emit('gameReset');
            });
        });
    });

    // --------- DISCONNECT ---------
    socket.on('disconnect', () => {
        db.run(`DELETE FROM players WHERE socket_id = ?`, [socket.id]);
        console.log('User Disconnected:', socket.id);
    });
});

http.listen(PORT);
