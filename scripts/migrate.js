const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../database/game.db');
const migrationPath = path.join(__dirname, '../database/migrations/001_init_schema.sql');
const wordsFolderPath = path.join(__dirname, '../database/migrations/words');
const db = new sqlite3.Database(dbPath);
const sql = fs.readFileSync(migrationPath, 'utf8');

db.exec(sql, err => {
    if (err) {
        console.error('Migration Failed:', err.message);
        process.exit(1);
    }

    console.log('Schema Migration Completed Successfully');

    // Now, Process The Word Files
    const wordFiles = fs.readdirSync(wordsFolderPath).filter(file => file.endsWith('.json'));

    let insertCount = 0;
    wordFiles.forEach(file => {
        const filePath = path.join(wordsFolderPath, file);
        const wordsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Insert Word Pairs Into The Words Table
        wordsData.forEach(wordPair => {
            const { word1, word2 } = wordPair;

            db.run(
                'INSERT INTO words (word1, word2) VALUES (?, ?)',
                [word1, word2],
                function (err) {
                    if (err) {
                        console.error(`Error Inserting Word Pair: ${word1} - ${word2}`, err.message);
                    } else {
                        insertCount++;
                    }
                }
            );
        });
    });

    // Confirm Insertion Completion
    db.serialize(() => {
        db.get("SELECT COUNT(*) AS count FROM words", (err, row) => {
            if (err) {
                console.error('Error Getting Word Count:', err.message);
                process.exit(1);
            }
            console.log(`Successfully Inserted ${insertCount} Word Pairs Into The Words Table.`);
            console.log(`Total Word Pairs In The Table: ${row.count}`);
            db.close();
        });
    });
});