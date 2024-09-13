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

// Обработка команды /start для Telegram-бота
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    if (users[chatId] && users[chatId].gender && users[chatId].lookingFor) {
        bot.sendMessage(chatId, 'Вы уже зарегистрированы. Хотите изменить свои предпочтения? Введите /preferences или /next для поиска нового собеседника.');
        return;
    }

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

// Обработка выбора пола и предпочтений
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'male' || data === 'female') {
        users[chatId].gender = data;

        // После выбора пола, запрашиваем предпочтение, кого искать
        bot.sendMessage(chatId, 'Кого вы хотите найти?', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Мужчин', callback_data: 'looking_male' }],
                    [{ text: 'Женщин', callback_data: 'looking_female' }]
                ]
            }
        });
    } else if (data === 'looking_male' || data === 'looking_female') {
        // Сохраняем предпочтение поиска
        users[chatId].lookingFor = data === 'looking_male' ? 'male' : 'female';

        bot.sendMessage(chatId, `Спасибо! Вы выбрали искать ${users[chatId].lookingFor === 'male' ? 'мужчин' : 'женщин'}. Теперь ищем вам собеседника...`);
        findPartnerForUser(chatId);
    }
});

// Обработка команды для изменения предпочтений /preferences
bot.onText(/\/preferences/, (msg) => {
    const chatId = msg.chat.id;

    // Запрашиваем новое предпочтение для поиска
    bot.sendMessage(chatId, 'Кого вы хотите найти?', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Мужчин', callback_data: 'looking_male' }],
                [{ text: 'Женщин', callback_data: 'looking_female' }]
            ]
        }
    });
});

// Функция для поиска партнёра
function findPartnerForUser(userId) {
    const user = users[userId];

    // Проверяем, заполнены ли у пользователя все данные
    if (!user.gender || !user.lookingFor) {
        console.log(`Пользователь ${userId} не завершил выбор пола или предпочтений`);
        return;  // Если пол или предпочтение не указаны, не продолжаем
    }

    // Отладочные сообщения
    console.log(`Пользователь ${userId} ищет собеседника`);
    console.log('Текущие пользователи:', users);

    // Фильтруем пользователей, которые соответствуют критериям
    const potentialPartners = Object.keys(users).filter(id => {
        const potentialPartner = users[id];

        // Проверяем, что у потенциального партнёра есть все данные и он соответствует критериям
        // Убедимся, что партнёр:
        // 1. Не сам пользователь (id !== userId)
        // 2. Статус партнёра — "waiting"
        // 3. Пол партнёра совпадает с предпочтениями текущего пользователя
        return potentialPartner.partnerId === null
            && id !== userId.toString()  // Преобразуем userId в строку
            && potentialPartner.gender === user.lookingFor  // Пол соответствует предпочтению
            && potentialPartner.status === 'waiting'; // Статус "ожидание"
    });

    // Если нет подходящих партнёров
    if (potentialPartners.length === 0) {
        console.log('Нет подходящих партнёров, продолжаем поиск...');
        if (users[userId].isWebUser) {
            io.to(userId).emit('waitingForPartner');
        } else {
            bot.sendMessage(userId, 'Ищу собеседника, пожалуйста подождите...');
        }
        return;
    }

    // Случайный выбор партнёра из списка подходящих кандидатов
    const partnerId = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];

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
}




// Функция для завершения общения и освобождения пользователей
function endChatForUser(userId) {
    const user = users[userId];

    if (user && user.partnerId) {
        const partnerId = user.partnerId;

        // Уведомляем партнёра о завершении чата
        if (users[partnerId].isWebUser) {
            io.to(partnerId).emit('chatEnded', 'Ваш собеседник завершил диалог.');
        } else {
            bot.sendMessage(partnerId, 'Ваш собеседник завершил диалог.');
        }

        // Обнуляем партнёров у обоих пользователей
        users[userId].partnerId = null;
        users[partnerId].partnerId = null;

        // Возвращаем статус обоих пользователей в ожидание
        users[userId].status = 'waiting';
        users[partnerId].status = 'waiting';

        console.log(`Чат между пользователями ${userId} и ${partnerId} завершён.`);
    }
}

function removeUser(userId) {
    const user = users[userId];

    if (user) {
        const partnerId = user.partnerId;

        if (partnerId) {
            endChatForUser(userId);
        }

        delete users[userId];
        console.log(`Пользователь ${userId} удалён.`);
    }
}

io.on('connection', (socket) => {
    console.log('Пользователь подключился с вебсайта:', socket.id);

    users[socket.id] = { partnerId: null, status: 'waiting', gender: null, lookingFor: null, isWebUser: true };

    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        removeUser(socket.id);
    });

    socket.on('sendMessage', (message) => {
        const partnerId = users[socket.id].partnerId;

        if (partnerId && users[partnerId]) {
            if (users[partnerId].isWebUser) {
                io.to(partnerId).emit('receiveMessage', message);
            } else {
                bot.sendMessage(partnerId, message);
            }
        } else {
            socket.emit('noPartner', 'Партнёр не найден.');
        }
    });

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
});

// Обработка команды /end для завершения диалога
bot.onText(/\/end/, (msg) => {
    const chatId = msg.chat.id;

    if (users[chatId] && users[chatId].partnerId) {
        endChatForUser(chatId);
        bot.sendMessage(chatId, 'Вы завершили диалог.');
    } else {
        bot.sendMessage(chatId, 'У вас нет активного собеседника.');
    }
});

// Обработка команды /next для завершения и поиска нового собеседника
bot.onText(/\/next/, (msg) => {
    const chatId = msg.chat.id;

    if (users[chatId] && users[chatId].partnerId) {
        endChatForUser(chatId);
        bot.sendMessage(chatId, 'Вы завершили диалог и начался поиск нового собеседника.');
        findPartnerForUser(chatId);
    } else {
        bot.sendMessage(chatId, 'У вас нет активного собеседника, ищем нового.');
        findPartnerForUser(chatId);
    }
});

// Обработка сообщений от пользователей Telegram
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (users[chatId] && users[chatId].partnerId) {
        const partnerId = users[chatId].partnerId;

        if (users[partnerId].isWebUser) {
            // Если собеседник — веб-пользователь, отправляем сообщение через WebSocket
            io.to(partnerId).emit('receiveMessage', text);
        } else {
            // Если собеседник — пользователь Telegram, отправляем через Telegram
            bot.sendMessage(partnerId, text);
        }
    } else if (text !== '/start' && text !== '/preferences' && text !== '/end' && text !== '/next') {
        bot.sendMessage(chatId, 'Вы пока не нашли собеседника. Пожалуйста, подождите.');
    }
});

// Запускаем сервер на порту 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
