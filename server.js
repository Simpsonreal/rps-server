const express = require('express');
const { Pool } = require('pg');
const CryptoBotAPI = require('crypto-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Разрешаем CORS для всех запросов
app.use((req, res, next) => {
    console.log('Применение CORS middleware...');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        console.log('Обработка preflight-запроса OPTIONS');
        return res.status(200).end();
    }
    next();
});

app.use(express.json());

// Логируем все входящие запросы
app.use((req, res, next) => {
    console.log(`Получен запрос: ${req.method} ${req.url}`);
    console.log('Тело запроса:', req.body);
    next();
});

// Настройка подключения к PostgreSQL
const pool = new Pool({
    user: 'rps_user',
    host: 'localhost',
    database: 'rps_db',
    password: 'Myra04102013', // Укажи свой пароль
    port: 5432
});

// Проверка подключения к базе данных
pool.connect((err, client, release) => {
    if (err) {
        console.error('Ошибка подключения к базе данных:', err.stack);
        return;
    }
    console.log('Успешно подключено к базе данных');
    release();
});

// Инициализация CryptoPay
const cryptoPay = new CryptoBotAPI('34606:AAonEuhKZUn26EwMPiaAII7qdkDSy9vaoSB');

// Базовый маршрут для проверки работы сервера
app.get('/', (req, res) => {
    console.log('Обработка маршрута /');
    res.send('Сервер работает!');
    console.log('Ответ на маршрут / отправлен');
});

// Получение статистики
app.get('/stats', async (req, res) => {
    try {
        console.log('Начало обработки маршрута /stats');

        const totalGamesResult = await pool.query('SELECT COUNT(*) FROM games');
        const totalGames = parseInt(totalGamesResult.rows[0].count);

        const playerWinsResult = await pool.query(
            "SELECT COUNT(*) FROM games WHERE result = 'Ты выиграл!'"
        );
        const playerScore = parseInt(playerWinsResult.rows[0].count);

        const computerWinsResult = await pool.query(
            "SELECT COUNT(*) FROM games WHERE result = 'Компьютер выиграл!'"
        );
        const computerScore = parseInt(computerWinsResult.rows[0].count);

        console.log('Статистика:', { playerScore, computerScore, totalGames });
        res.json({
            playerScore,
            computerScore,
            totalGames
        });
        console.log('Ответ на /stats отправлен');
    } catch (error) {
        console.error('Ошибка в маршруте /stats:', error);
        res.status(500).json({ error: 'Ошибка сервера при получении статистики' });
    }
});

// Сохранение результата игры
app.post('/game', async (req, res) => {
    const { playerChoice, computerChoice, result } = req.body;

    if (!playerChoice || !computerChoice || !result) {
        console.log('Ошибка: Недостаточно данных в запросе');
        return res.status(400).json({ error: 'Недостаточно данных' });
    }

    try {
        await pool.query(
            'INSERT INTO games (player_choice, computer_choice, result) VALUES ($1, $2, $3)',
            [playerChoice, computerChoice, result]
        );

        const totalGamesResult = await pool.query('SELECT COUNT(*) FROM games');
        const totalGames = parseInt(totalGamesResult.rows[0].count);

        const playerWinsResult = await pool.query(
            "SELECT COUNT(*) FROM games WHERE result = 'Ты выиграл!'"
        );
        const playerScore = parseInt(playerWinsResult.rows[0].count);

        const computerWinsResult = await pool.query(
            "SELECT COUNT(*) FROM games WHERE result = 'Компьютер выиграл!'"
        );
        const computerScore = parseInt(computerWinsResult.rows[0].count);

        res.json({
            message: 'Результат сохранен',
            stats: {
                playerScore,
                computerScore
            }
        });
    } catch (error) {
        console.error('Ошибка в маршруте /game:', error);
        res.status(500).json({ error: 'Ошибка сервера при сохранении игры' });
    }
});

// Эндпоинт для создания счёта через @CryptoBot
app.post('/create-invoice', async (req, res) => {
    try {
        const { amount, asset, description, userId, tonAddress } = req.body;
        const invoice = await cryptoPay.createInvoice({
            asset: asset,
            amount: amount,
            description: description,
            allow_anonymous: false
        });

        // Сохраняем userId и tonAddress в базе данных
        await pool.query(
            'INSERT INTO users (user_id, ton_address) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET ton_address = $2',
            [userId, tonAddress]
        );

        res.json({
            success: true,
            invoiceId: invoice.invoice_id,
            payUrl: invoice.bot_invoice_url
        });
    } catch (e) {
        console.error('Ошибка при создании счёта:', e);
        res.status(500).json({ success: false, message: 'Не удалось создать счёт' });
    }
});

// Эндпоинт для проверки оплаты
app.post('/check-invoice', async (req, res) => {
    try {
        const { invoiceId } = req.body;
        const invoice = await cryptoPay.getInvoice(invoiceId);
        res.json({ status: invoice.status });
    } catch (e) {
        console.error('Ошибка при проверке оплаты:', e);
        res.status(500).json({ success: false, message: 'Не удалось проверить оплату' });
    }
});

// Эндпоинт для обработки результата игры и отправки награды
app.post('/game-result', async (req, res) => {
    try {
        const { playerAddress, userId, result, gameId } = req.body;
        if (result === 'win') {
            const transfer = await cryptoPay.transfer({
                user_id: userId,
                asset: 'TON',
                amount: '0.015',
                spend_id: `game_${gameId}`,
                comment: 'Награда за победу в игре'
            });
            res.json({ message: 'Награда отправлена!' });
        } else {
            res.json({ message: 'Игрок проиграл, награда не отправлена.' });
        }
    } catch (e) {
        console.error('Ошибка при отправке награды:', e);
        res.status(500).json({ message: 'Ошибка при отправке награды.' });
    }
});

// Функция для получения userId по адресу кошелька
async function getUserIdFromAddress(address) {
    try {
        const result = await pool.query('SELECT user_id FROM users WHERE ton_address = $1', [address]);
        if (result.rows.length > 0) {
            return result.rows[0].user_id;
        }
        throw new Error('Пользователь не найден');
    } catch (e) {
        console.error('Ошибка при получении userId:', e);
        throw e;
    }
}

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});