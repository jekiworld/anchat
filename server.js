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
let users = {}; // Для хранения пользователей, их статусов, партнёров, пола и предпочтений

// WebSocket логика для пользователей с вебсайта
io.on('connection', (socket) => {
    console.log('Пользователь подключился с вебсайта:', socket.id);

    // Инициализация пользователя со статусом "waiting" и запросом пола и предпочтений
    users[socket.id] = { partnerId: null, status: 'waiting', gender: null, lookingFor: null, isWebUser: true };

    // Ловим событие выбора пола
    socket.on('selectGender', (gender) => {
        users[socket.id].gender = gender;
        console.log(`Пользователь ${socket.id} выбрал пол: ${gender}`);
    });

    // Ловим событие выбора предпочтений
    socket.on('selectLookingFor', (lookingFor) => {
        users[socket.id].lookingFor = lookingFor;
        console.log(`Пользователь ${socket.id} ищет: ${lookingFor}`);
        findPartnerForUser(socket.id);
    });

    // Ловим событие отправки сообщения от веб-клиента
    socket.on('sendMessage', (message) => {
        const partnerId = users[socket.id].partnerId;

        if (partnerId && users[partnerId]) {
            if (users[partnerId].isWebUser) {
                // Если собеседник — веб-пользователь, передаём сообщение через WebSocket
                io.to(partnerId).emit('receiveMessage', message);
            } else {
                // Если собеседник — пользователь Telegram, отправляем сообщение через Telegram Bot API
                bot.sendMessage(partnerId, message);
            }
        } else {
            socket.emit('noPartner', 'Партнёр не найден.');
        }
    });

    // Ловим событие отключения
    socket.on('disconnect', () => {
        const partnerId = users[socket.id].partnerId;
        if (partnerId) {
            if (users[partnerId].isWebUser) {
                io.to(partnerId).emit('partnerDisconnected', 'Ваш собеседник отключился.');
            } else {
                bot.sendMessage(partnerId, 'Ваш собеседник с вебсайта отключился.');
            }
            users[partnerId].partnerId = null;
        }
        delete users[socket.id];
        console.log('Пользователь отключился:', socket.id);
    });
});

// Обработка команды /start для Telegram-бота
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Инициализируем пользователя
    users[chatId] = { partnerId: null, status: 'waiting', gender: null, lookingFor: null, isWebUser: false };

    // Запрашиваем пол у пользователя
    bot.sendMessage(chatId, 'Привет! Пожалуйста, выберите свой пол:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Мужской', callback_data: 'male' }],
                [{ text: 'Женский', callback_data: 'female' }]
            ]
        }
    });
});

// Обработка выбора пола
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const gender = callbackQuery.data; // Ловим пол (male/female)

    // Сохраняем пол пользователя
    users[chatId].gender = gender;

    // Запрашиваем предпочтение для поиска
    bot.sendMessage(chatId, 'Кого вы хотите найти?', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Мужчин', callback_data: 'looking_male' }],
                [{ text: 'Женщин', callback_data: 'looking_female' }]
            ]
        }
    });
});

// Обработка выбора предпочтения поиска
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'looking_male' || data === 'looking_female') {
        // Сохраняем предпочтение поиска
        users[chatId].lookingFor = data === 'looking_male' ? 'male' : 'female';

        bot.sendMessage(chatId, `Спасибо! Вы выбрали искать ${users[chatId].lookingFor === 'male' ? 'мужчин' : 'женщин'}. Теперь ищем вам собеседника...`);
        findPartnerForUser(chatId);
    }
});

// Функция для поиска партнёра
function findPartnerForUser(userId) {
    const user = users[userId];

    // Ищем свободного партнёра с подходящими параметрами
    let partnerId = Object.keys(users).find(id => {
        const potentialPartner = users[id];
        return potentialPartner.partnerId === null && id !== userId && potentialPartner.gender === user.lookingFor;
    });

    if (partnerId) {
        // Связываем пользователей
        users[userId].partnerId = partnerId;
        users[partnerId].partnerId = userId;

        users[userId].status = 'chatting';
        users[partnerId].status = 'chatting';

        // Уведомляем пользователей
        if (users[partnerId].isWebUser) {
            io.to(partnerId).emit('partnerFound', { partnerId: userId, isTelegramUser: !users[userId].isWebUser });
            if (!users[userId].isWebUser) {
                bot.sendMessage(userId, 'Собеседник найден! Вы общаетесь с пользователем с вебсайта.');
            }
        } else {
            bot.sendMessage(userId, 'Собеседник найден! Можете начинать общение.');
            bot.sendMessage(partnerId, 'Собеседник найден! Можете начинать общение.');
        }
    } else {
        // Если нет партнёра
        if (users[userId].isWebUser) {
            io.to(userId).emit('waitingForPartner');
        } else {
            bot.sendMessage(userId, 'Ищу собеседника, пожалуйста подождите...');
        }
    }
}

// Запускаем сервер на порту 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
