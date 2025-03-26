const express = require('express');
const fs = require('fs').promises;
const app = express();
const port = 3000;

// Разрешаем CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.use(express.json());

// Логируем все входящие запросы
app.use((req, res, next) => {
    console.log(`Получен запрос: ${req.method} ${req.url}`);
    console.log('Тело запроса:', req.body);
    next();
});

async function loadData() {
    try {
        const data = await fs.readFile('data.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        return { games: [], playerScore: 0, computerScore: 0 };
    }
}

async function saveData(data) {
    try {
        await fs.writeFile('data.json', JSON.stringify(data, null, 2));
        console.log('Данные сохранены:', data);
    } catch (error) {
        console.error('Ошибка сохранения данных:', error);
    }
}

app.get('/stats', async (req, res) => {
    const data = await loadData();
    res.json({
        playerScore: data.playerScore,
        computerScore: data.computerScore,
        totalGames: data.games.length
    });
});

app.post('/game', async (req, res) => {
    const { playerChoice, computerChoice, result } = req.body;
    
    if (!playerChoice || !computerChoice || !result) {
        console.log('Ошибка: Недостаточно данных в запросе');
        return res.status(400).json({ error: 'Недостаточно данных' });
    }

    const data = await loadData();
    data.games.push({ playerChoice, computerChoice, result });

    if (result === 'Ты выиграл!') data.playerScore++;
    if (result === 'Компьютер выиграл!') data.computerScore++;

    await saveData(data);
    res.json({ message: 'Результат сохранен', stats: {
        playerScore: data.playerScore,
        computerScore: data.computerScore
    }});
});

app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});