const express = require('express');
const { Pool } = require('pg');
const { CryptoPay, Assets } = require('@foile/crypto-pay-api');

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
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Для Render нужно отключить проверку SSL
    }
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
const cryptoPay = new CryptoPay('34606:AAonEuhKZUn26EwMPiaAII7qdkDSy9vaoSB', {
    hostname: 'testnet-pay.crypt.bot', // Для тестовой сети
    protocol: 'https'
});

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
        const { amount, asset, description } = req.body;
        const invoice = await cryptoPay.createInvoice(asset, amount, {
            description,
            allow_anonymous: false
        });
        res.json({
            success: true,
            invoiceId: invoice.invoice_id,
            payUrl: invoice.pay_url
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
        const invoices = await cryptoPay.getInvoices({ invoice_ids: invoiceId });
        const invoice = invoices.items.find(inv => inv.invoice_id === invoiceId);
        res.json({ status: invoice.status });
    } catch (e) {
        console.error('Ошибка при проверке оплаты:', e);
        res.status(500).json({ success: false, message: 'Не удалось проверить оплату' });
    }
});

// Эндпоинт для обработки результата игры и отправки награды
app.post('/game-result', async (req, res) => {
    try {
        const { playerAddress, result, gameId } = req.body;
        if (result === 'win') {
            const userId = await getUserIdFromAddress(playerAddress); // Нужно реализовать
            const transfer = await cryptoPay.transfer(userId, Assets.TON, 0.015, {
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

// Функция для получения userId по адресу кошелька (заглушка)
async function getUserIdFromAddress(address) {
    // В реальном приложении нужно сопоставить адрес кошелька с Telegram userId
    // Для этого можно добавить таблицу в PostgreSQL для хранения пар "userId - TON address"
    // Пока используем заглушку
    return 123456789; // Замени на реальный userId
}

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});