document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let currentRoom = '';
    let isHost = false;
    let username = '';
    let assignedWord = '';
    let realWord = '';

    const musicTracks = [
        '/music/lobby1.mp3',
        '/music/lobby2.mp3'
    ];

    const lobbyMusic = document.getElementById('lobbyMusic');
    lobbyMusic.src = musicTracks[Math.floor(Math.random() * musicTracks.length)];
    const muteBtn = document.getElementById('muteBtn');
    let isMuted = false;

    // -------------------- FADE OUT FUNCTION --------------------
    function fadeOutMusic() {
        let fadeInterval = setInterval(() => {
            if (lobbyMusic.volume > 0.05) {
                lobbyMusic.volume -= 0.05;
            } else {
                clearInterval(fadeInterval);
                lobbyMusic.pause();
            }
        }, 100);
    }

    // -------------------- CREATE ROOM --------------------
    document.getElementById('createRoomBtn').onclick = () => {
        const name = document.getElementById('hostName').value.trim();

        if (!name) {
            return alert('Enter Your Name');
        }

        username = name;
        isHost = true;
        socket.emit('createRoom', { username });
    };

    // -------------------- JOIN ROOM --------------------
    document.getElementById('joinRoomBtn').onclick = () => {
        const name = document.getElementById('joinName').value.trim();
        const code = document.getElementById('roomCode').value.trim().toUpperCase();

        if (!name || !code) {
            return alert('Enter Name And Room Code');
        }

        username = name;
        socket.emit('joinRoom', { username, code });
    };

    // -------------------- SOCKET EVENTS --------------------
    socket.on('roomCreated', ({ code, isHost }) => {
        currentRoom = code;
        document.getElementById('joinCreate').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
        document.getElementById('currentRoom').innerText = code;
        document.getElementById('startGameBtn').style.display = 'inline-block';

        if (isHost) {
            document.querySelector('.checkbox-container').style.display = 'block';
            document.getElementById('startGameBtn').style.display = 'inline-block';
            document.getElementById('restartBtn').style.display = 'none';
            document.getElementById('wordBox').innerText = 'Waiting For Host To Start The Game...'
            lobbyMusic.play().catch(() => {});
        }
    });

    socket.on('roomJoined', ({ code }) => {
        currentRoom = code;
        document.getElementById('joinCreate').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
        document.getElementById('currentRoom').innerText = code;
        document.getElementById('startGameBtn').style.display = isHost ? 'inline-block' : 'none';

        if (isHost) {
            document.querySelector('.checkbox-container').style.display = 'none';
            document.getElementById('startGameBtn').style.display = 'none';
            lobbyMusic.play().catch(() => {});
        }
    });

    socket.on('playerList', (players) => {
        const ul = document.getElementById('playerList');
        ul.innerHTML = '';

        players.forEach(p => {
            const li = document.createElement('li');
            li.textContent = p.username;
            ul.appendChild(li);
        });
    });

    socket.on('errorMessage', msg => alert(msg));

    // -------------------- START GAME --------------------
    document.getElementById('startGameBtn').onclick = () => {
        if (!username) {
            return alert('Host Username Not Set');
        }

        const chaos = document.getElementById('chaosMode').checked;
        socket.emit('startGame', { code: currentRoom, chaosMode: chaos });
    };

    socket.on('gameStarted', ({ role, word, real }) => {
        if (isHost) {
            lobbyMusic.pause();
        }

        document.getElementById('lobby').style.display = 'none';
        document.getElementById('gameArea').style.display = 'block';
        assignedWord = word;
        realWord = real;
        const wordBox = document.getElementById('wordBox');

        wordBox.innerText =
            role === 'Spy'
                ? 'You\'re The Spy!'
                : assignedWord;

        document.getElementById('revealRealBtn').style.display = 'inline-block';

        if (isHost) {
            document.getElementById('restartBtn').style.display = 'inline-block';
        }
    });

    // -------------------- REVEAL REAL BUTTON --------------
    document.getElementById('revealRealBtn').onclick = () => {
        document.getElementById('wordBox').innerText = realWord;
        document.getElementById('revealRealBtn').style.display = 'none';
    };

    // -------------------- RESTART GAME --------------------
    document.getElementById('restartBtn').onclick = () => {
        socket.emit('restartGame', currentRoom);
    };

    socket.on('gameReset', () => {
        document.getElementById('gameArea').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';

        if (isHost) {
            lobbyMusic.play().catch(() => {});
        }

        document.getElementById('wordBox').innerText = '';
        document.getElementById('confusedBtn').style.display = 'none';
        document.getElementById('startGameBtn').style.display = isHost ? 'inline-block' : 'none';
    });

    // -------------------- MUTE BUTTON --------------------
    muteBtn.onclick = () => {
        if (isMuted) {
            lobbyMusic.volume = 0.4;
            lobbyMusic.play().catch(() => {});
            muteBtn.innerText = 'Mute';
            isMuted = false;
        } else {
            fadeOutMusic();
            muteBtn.innerText = 'Unmute';
            isMuted = true;
        }
    };

    // -------------------- CONTROL MUTE BUTTON VISIBILITY --------------------
    lobbyMusic.onplay = () => {
        if (isHost) {
            muteBtn.style.display = 'inline-block';
        }
    };
});