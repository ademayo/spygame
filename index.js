require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const randomWords = require('random-words');
const axios = require('axios');

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/send-emails', async (req, res) => {
    const emails = req.body.emails;
    const roles = assignRoles(emails.length);

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        }
    });

    const promises = emails.map((email, index) => {
        const role = roles[index].role;
        const word = roles[index].word;

        let message = '';

        if (role === 'Spy') {
            message = `Your role is: Spy\nThe word you need to focus on is: "${word}"`;
        } else {
            message = `Your word is: "${word}"`;
        }

        return transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Spygame',
            text: message,
        });
    });

    try {
        await Promise.all(promises);
        res.send({ success: true, key: roles[0].word });
    } catch (error) {
        res.status(500).send('Error sending emails: ' + error.message);
    }
});

function assignRoles(playerCount) {
    let roles = [];
    const selectedWords = randomizeWords(playerCount);

    if (playerCount >= 4 && playerCount <= 6) {
        const spyCount = playerCount >= 5 ? 1 : 0;
        const confusedCount = 1;
        roles = createRoleList(playerCount, confusedCount, spyCount, selectedWords);
    } else if (playerCount >= 7 && playerCount <= 8) {
        roles = createRoleList(playerCount, 2, 1, selectedWords);
    } else if (playerCount === 4) {
        roles = createRoleList(playerCount, 1, 0, selectedWords);
    }

    return roles;
}

function randomizeWords(playerCount) {
    const selectedWords = [];

    for (let i = 0; i < playerCount; i++) {
        selectedWords.push(randomWords());
    }

    return selectedWords;
}

async function createRoleList(playerCount, confusedCount, spyCount, selectedWords) {
    let roles = new Array(playerCount).fill('Correct');
    let roleAssignments = [];

    for (let i = 0; i < confusedCount; i++) {
        const randomIndex = Math.floor(Math.random() * playerCount);
        roles[randomIndex] = 'Confused';
    }

    for (let i = 0; i < spyCount; i++) {
        let randomIndex = Math.floor(Math.random() * playerCount);

        while (roles[randomIndex] !== 'Correct') {
            randomIndex = Math.floor(Math.random() * playerCount);
        }

        roles[randomIndex] = 'Spy';
    }

    for (let i = 0; i < playerCount; i++) {
        const role = roles[i];
        const word = selectedWords[i];
        let confusedWord = word;

        if (role === 'Confused') {
            confusedWord = await getSimilarWord(word);
        }

        roleAssignments.push({ role, word: confusedWord });
    }

    return roleAssignments;
}

async function getSimilarWord(word) {
    try {
        const response = await axios.get('https://api.datamuse.com/words', {
            params: {
                rel_syn: word,
                max: 5,
            },
        });

        const similarWords = response.data.map(item => item.word);

        if (similarWords.length > 0) {
            return similarWords[Math.floor(Math.random() * similarWords.length)];
        } else {
            return word;
        }
    } catch (error) {
        console.error('Error fetching similar word:', error);
        return word;
    }
}

app.listen(port);
