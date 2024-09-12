// Импортируем необходимые модули
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config(); // Загружаем переменные окружения

// Инициализируем Express
const app = express();
const server = http.createServer(app); // Создаем HTTP сервер на базе Express
const io = new Server(server); // Создаем WebSocket сервер с помощью Socket.IO

// Добавляем middleware для раздачи статических файлов
app.use(express.static(__dirname));

// Инициализируем Telegram-бота
const token = process.env.TELEGRAM_TOKEN; // Читаем токен из .env
const bot = new TelegramBot(token, { polling: true }); // Включаем режим опроса (polling)

// Структура для хранения информации о пользователях
let users = {}; // Для хранения пользователей и их партнёров

// WebSocket логика
io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    // Когда пользователь подключается, сохраняем его
    users[socket.id] = { partnerId: null };

    // Ловим событие, когда пользователь хочет найти собеседника
    socket.on('findPartner', () => {
        // Ищем другого пользователя без партнёра
        let partnerId = Object.keys(users).find(id => users[id].partnerId === null && id !== socket.id);

        if (partnerId) {
            // Связываем пользователей друг с другом
            users[socket.id].partnerId = partnerId;
            users[partnerId].partnerId = socket.id;

            // Отправляем уведомление пользователям
            io.to(socket.id).emit('partnerFound', { partnerId });
            io.to(partnerId).emit('partnerFound', { partnerId: socket.id });

            console.log(`Пользователь ${socket.id} нашел собеседника ${partnerId}`);
        } else {
            // Если нет свободных пользователей, сообщаем об ожидании
            io.to(socket.id).emit('waitingForPartner');
            console.log(`Пользователь ${socket.id} ждет собеседника`);
        }
    });

    // Ловим событие отправки сообщения от клиента
    socket.on('sendMessage', (message) => {
        const partnerId = users[socket.id].partnerId;

        if (partnerId) {
            // Отправляем сообщение только партнёру
            io.to(partnerId).emit('receiveMessage', message);
            console.log(`Сообщение от ${socket.id} к ${partnerId}: ${message}`);
        } else {
            // Если партнёр не найден, сообщаем пользователю
            io.to(socket.id).emit('noPartner', 'Партнёр не найден.');
        }
    });

    // Ловим событие завершения диалога
    socket.on('endChat', () => {
        const partnerId = users[socket.id].partnerId;

        if (partnerId) {
            // Отключаем партнёра, если он был
            users[partnerId].partnerId = null;
            io.to(partnerId).emit('chatEnded', 'Ваш собеседник завершил диалог.');
        }

        // Освобождаем текущего пользователя
        users[socket.id].partnerId = null;
        io.to(socket.id).emit('chatEnded', 'Вы завершили диалог. Теперь вы можете найти нового собеседника.');
        console.log(`Пользователь ${socket.id} завершил диалог с ${partnerId}`);
    });


    // Ловим событие отключения
    socket.on('disconnect', () => {
        const partnerId = users[socket.id].partnerId;

        if (partnerId) {
            // Отключаем партнёра, если он был
            users[partnerId].partnerId = null;
            io.to(partnerId).emit('partnerDisconnected', 'Ваш собеседник отключился.');
        }

        // Удаляем пользователя из списка
        delete users[socket.id];
        console.log('Пользователь отключился:', socket.id);
    });
});

// Обработка команды /start от Telegram-бота
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Отправляем приветственное сообщение пользователю в Telegram
    bot.sendMessage(chatId, 'Привет! Вы подключены к боту.');
});

// Обработка любых текстовых сообщений от Telegram-пользователей
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Логируем сообщение в консоль
    console.log(`Сообщение от Telegram пользователя ${chatId}: ${text}`);

    // Отправляем сообщение в WebSocket всем клиентам
    io.emit('receiveMessage', `Сообщение от Telegram: ${text}`);
});

// Запускаем сервер на порту 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
