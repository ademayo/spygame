document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let currentRoom = '';
    let isHost = false;
    let username = '';
    let assignedWord = '';
    let realWord = '';

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
    socket.on('roomCreated', ({ code }) => {
        currentRoom = code;
        document.getElementById('joinCreate').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
        document.getElementById('currentRoom').innerText = code;
        document.getElementById('startGameBtn').style.display = 'inline-block';
    });

    socket.on('roomJoined', ({ code }) => {
        currentRoom = code;
        document.getElementById('joinCreate').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
        document.getElementById('currentRoom').innerText = code;
        document.getElementById('startGameBtn').style.display = isHost ? 'inline-block' : 'none';
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
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('gameArea').style.display = 'block';
        assignedWord = word;
        realWord = real;
        const wordBox = document.getElementById('wordBox');

        if (role === 'Spy') {
            wordBox.innerText = "You're the Spy!";
            document.getElementById('confusedBtn').style.display = 'none';
        } else {
            wordBox.innerText = assignedWord;
            document.getElementById('confusedBtn').style.display = 'inline-block';
        }

        if (isHost) {
            document.getElementById('restartBtn').style.display = 'inline-block';
        }
    });

    // -------------------- CONFUSED BUTTON --------------------
    document.getElementById('confusedBtn').onclick = () => {
        document.getElementById('wordBox').innerText = realWord;
        document.getElementById('confusedBtn').style.display = 'none';
    };

    // -------------------- RESTART GAME --------------------
    document.getElementById('restartBtn').onclick = () => {
        socket.emit('restartGame', currentRoom);
    };

    socket.on('gameReset', () => {
        document.getElementById('gameArea').style.display = 'none';
        document.getElementById('lobby').style.display = 'block';
        document.getElementById('wordBox').innerText = '';
        document.getElementById('confusedBtn').style.display = 'none';
        document.getElementById('startGameBtn').style.display = isHost ? 'inline-block' : 'none';
    });
});