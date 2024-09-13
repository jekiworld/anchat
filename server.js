const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config(); 

const app = express();
const server = http.createServer(app); 
const io = new Server(server); 

app.use(express.static(__dirname));

const token = process.env.TELEGRAM_TOKEN; 
const bot = new TelegramBot(token, { polling: true }); 

let users = {}; 

const commands = [
    {
        command: "start",
        description: "Запуск бота"
    },
]

bot.setMyCommands(commands);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId; 
    

    // Проверяем, есть ли пользователь в системе
    if (users[userId] && users[userId].gender && users[userId].lookingFor) {
        bot.sendMessage(chatId, 'Вы уже зарегистрированы. Что вы хотите сделать?', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Изменить предпочтения' }],
                    [{ text: 'Найти нового собеседника' }],
                    [{ text: 'Завершить чат' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return;
    }

    users[userId] = { partnerId: null, status: 'idle', gender: null, lookingFor: null, isWebUser: false };

    // Запрашиваем пол у пользователя с использованием кнопок
    bot.sendMessage(chatId, 'Привет! Пожалуйста, выберите свой пол:', {
        reply_markup: {
            keyboard: [
                [{ text: 'Мужской' }, { text: 'Женский' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
});

bot.onText(/\/end/, (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;

    if (users[userId] && users[userId].partnerId) {
        endChatForUser(userId);
        bot.sendMessage(chatId, 'Вы завершили чат.', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Найти нового собеседника' }],
                    [{ text: 'Изменить предпочтения' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    } else {
        bot.sendMessage(chatId, 'У вас нет активного чата.', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Найти нового собеседника' }],
                    [{ text: 'Изменить предпочтения' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    }
    // Устанавливаем статус в 'idle', чтобы пользователь не искал собеседника
    users[userId].status = 'idle';
});

// Обработка сообщений от пользователей Telegram
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId; // Добавляем префикс
    const text = msg.text;

    // Если сообщение является командой и не является /end, игнорируем его (команду /start мы обработали выше)
    if (msg.entities && msg.entities.some(entity => entity.type === 'bot_command' && text !== '/end')) {
        return;
    }

    // Проверяем, если пользователь не зарегистрирован или не выбрал пол
    if (!users[userId] || !users[userId].gender) {
        if (text === 'Мужской' || text === 'Женский') {
            users[userId].gender = text === 'Мужской' ? 'male' : 'female';

            // Запрашиваем предпочтения пользователя с помощью кнопок
            bot.sendMessage(chatId, 'Кого вы хотите найти?', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Мужчин' }, { text: 'Женщин' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        } else {
            bot.sendMessage(chatId, 'Пожалуйста, выберите свой пол:', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Мужской' }, { text: 'Женский' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
        return;
    }

    // Проверяем, если пользователь выбрал пол, но не выбрал предпочтения
    if (!users[userId].lookingFor) {
        if (text === 'Мужчин' || text === 'Женщин') {
            users[userId].lookingFor = text === 'Мужчин' ? 'male' : 'female';

            bot.sendMessage(chatId, `Спасибо! Вы выбрали искать ${users[userId].lookingFor === 'male' ? 'мужчин' : 'женщин'}.`, {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Найти нового собеседника' }],
                        [{ text: 'Изменить предпочтения' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
            // Пользователь готов, но пока не ищет собеседника
            users[userId].status = 'idle';
        } else {
            bot.sendMessage(chatId, 'Пожалуйста, выберите, кого вы хотите найти:', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Мужчин' }, { text: 'Женщин' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
        return;
    }

    // Обработка нажатий на кнопки меню
    if (text === 'Изменить предпочтения') {
        // Предлагаем изменить пол и предпочтения
        users[userId].gender = null;
        users[userId].lookingFor = null;
        users[userId].status = 'idle';
        users[userId].partnerId = null;

        bot.sendMessage(chatId, 'Выберите свой пол:', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Мужской' }, { text: 'Женский' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    } else if (text === 'Найти нового собеседника') {
        // Если пользователь в чате, завершаем текущий чат
        if (users[userId].partnerId) {
            endChatForUser(userId);
        }
        // Начинаем поиск нового собеседника
        bot.sendMessage(chatId, 'Ищем нового собеседника для вас...');
        users[userId].status = 'waiting';
        findPartnerForUser(userId);
        return;
    } else if (text === 'Завершить чат') {
        // Завершаем текущий чат
        if (users[userId].partnerId) {
            endChatForUser(userId);
            bot.sendMessage(chatId, 'Вы завершили чат.', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Найти нового собеседника' }],
                        [{ text: 'Изменить предпочтения' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        } else {
            bot.sendMessage(chatId, 'У вас нет активного чата.', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Найти нового собеседника' }],
                        [{ text: 'Изменить предпочтения' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }
        // Устанавливаем статус в 'idle', чтобы пользователь не искал собеседника
        users[userId].status = 'idle';
        return;
    } else if (text === '/end') {
        // Обработка команды /end (на случай, если она не была обработана ранее)
        if (users[userId].partnerId) {
            endChatForUser(userId);
            bot.sendMessage(chatId, 'Вы завершили чат.', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Найти нового собеседника' }],
                        [{ text: 'Изменить предпочтения' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        } else {
            bot.sendMessage(chatId, 'У вас нет активного чата.', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Найти нового собеседника' }],
                        [{ text: 'Изменить предпочтения' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }
        // Устанавливаем статус в 'idle', чтобы пользователь не искал собеседника
        users[userId].status = 'idle';
        return;
    }

    // Если пользователь в чате, пересылаем сообщение партнеру
    if (users[userId] && users[userId].partnerId) {
        const partnerId = users[userId].partnerId;

        if (users[partnerId].isWebUser) {
            // Если собеседник — веб-пользователь, отправляем сообщение через WebSocket
            const socketId = partnerId.substring(3); // Убираем префикс 'ws_'
            io.to(socketId).emit('receiveMessage', text);
        } else {
            // Если собеседник — пользователь Telegram, отправляем через Telegram
            const partnerChatId = partnerId.substring(3); // Убираем префикс 'tg_'
            bot.sendMessage(partnerChatId, text);
        }
    } else {
        bot.sendMessage(chatId, 'У вас нет активного чата. Вы можете найти нового собеседника или изменить предпочтения.', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Найти нового собеседника' }],
                    [{ text: 'Изменить предпочтения' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
    }
});

// Функция для поиска партнёра
function findPartnerForUser(userId) {
    const user = users[userId];

    // Проверяем, заполнены ли у пользователя все данные
    if (!user.gender || !user.lookingFor || user.status !== 'waiting') {
        console.log(`Пользователь ${userId} не готов к поиску собеседника`);
        return;
    }

    // Отладочные сообщения
    console.log(`Пользователь ${userId} ищет собеседника`);
    console.log('Текущие пользователи:', users);

    // Фильтруем пользователей, которые соответствуют критериям
    const potentialPartners = Object.keys(users).filter(id => {
        const potentialPartner = users[id];

        // Проверяем соответствие критериям
        return potentialPartner.partnerId === null
            && id !== userId
            && potentialPartner.gender === user.lookingFor
            && potentialPartner.lookingFor === user.gender
            && potentialPartner.status === 'waiting';
    });

    // Если нет подходящих партнёров
    if (potentialPartners.length === 0) {
        console.log('Нет подходящих партнёров, продолжаем поиск...');
        if (user.isWebUser) {
            const socketId = userId.substring(3); // Убираем префикс 'ws_'
            io.to(socketId).emit('waitingForPartner');
        } else {
            const chatId = userId.substring(3); // Убираем префикс 'tg_'
            bot.sendMessage(chatId, 'Ищу собеседника, пожалуйста подождите...');
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
        const socketId = partnerId.substring(3); // Убираем префикс 'ws_'
        io.to(socketId).emit('partnerFound', { partnerId: userId, isTelegramUser: !users[userId].isWebUser });
        if (!users[userId].isWebUser) {
            const chatId = userId.substring(3); // Убираем префикс 'tg_'
            bot.sendMessage(chatId, 'Собеседник найден! Вы общаетесь с пользователем с вебсайта.');
        }
    } else {
        const chatIdUser = userId.substring(3); // Убираем префикс 'tg_'
        const chatIdPartner = partnerId.substring(3); // Убираем префикс 'tg_'
        bot.sendMessage(chatIdUser, 'Собеседник найден! Можете начинать общение.');
        bot.sendMessage(chatIdPartner, 'Собеседник найден! Можете начинать общение.');
    }
}

// Функция для завершения общения и освобождения пользователей
function endChatForUser(userId) {
    const user = users[userId];

    if (user && user.partnerId) {
        const partnerId = user.partnerId;

        // Уведомляем партнёра о завершении чата
        if (users[partnerId].isWebUser) {
            const socketId = partnerId.substring(3); // Убираем префикс 'ws_'
            io.to(socketId).emit('chatEnded', 'Ваш собеседник завершил диалог.');
        } else {
            const chatId = partnerId.substring(3); // Убираем префикс 'tg_'
            bot.sendMessage(chatId, 'Ваш собеседник завершил диалог.', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Найти нового собеседника' }],
                        [{ text: 'Изменить предпочтения' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }

        // Обнуляем партнёров у обоих пользователей
        users[userId].partnerId = null;
        users[partnerId].partnerId = null;

        // Устанавливаем статус обоих пользователей в 'idle'
        users[userId].status = 'idle';
        users[partnerId].status = 'idle';

        console.log(`Чат между пользователями ${userId} и ${partnerId} завершён.`);
    }
}

// WebSocket логика для веб-пользователей
io.on('connection', (socket) => {
    const userId = 'ws_' + socket.id; // Добавляем префикс
    console.log('Пользователь подключился с вебсайта:', userId);

    // Инициализация пользователя
    users[userId] = { partnerId: null, status: 'idle', gender: null, lookingFor: null, isWebUser: true };

    // Ловим событие отключения
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', userId);

        // Если у пользователя есть партнёр, уведомляем его об отключении
        const partnerId = users[userId].partnerId;
        if (partnerId) {
            if (users[partnerId].isWebUser) {
                const socketId = partnerId.substring(3); // Убираем префикс 'ws_'
                io.to(socketId).emit('chatEnded', 'Ваш собеседник отключился.');
            } else {
                const chatId = partnerId.substring(3); // Убираем префикс 'tg_'
                bot.sendMessage(chatId, 'Ваш собеседник с вебсайта отключился.', {
                    reply_markup: {
                        keyboard: [
                            [{ text: 'Найти нового собеседника' }],
                            [{ text: 'Изменить предпочтения' }]
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: false
                    }
                });
            }
            users[partnerId].partnerId = null;
            users[partnerId].status = 'idle';
        }

        // Удаляем пользователя
        delete users[userId];
    });

    // Ловим событие отправки сообщения от веб-клиента
    socket.on('sendMessage', (message) => {
        const partnerId = users[userId].partnerId;

        if (partnerId && users[partnerId]) {
            if (users[partnerId].isWebUser) {
                const socketId = partnerId.substring(3); // Убираем префикс 'ws_'
                io.to(socketId).emit('receiveMessage', message);
            } else {
                const chatId = partnerId.substring(3); // Убираем префикс 'tg_'
                bot.sendMessage(chatId, message);
            }
        } else {
            socket.emit('noPartner', 'Партнёр не найден.');
        }
    });

    // Ловим событие выбора пола
    socket.on('selectGender', (gender) => {
        users[userId].gender = gender;
        console.log(`Пользователь ${userId} выбрал пол: ${gender}`);
    });

    // Ловим событие выбора предпочтений
    socket.on('selectLookingFor', (lookingFor) => {
        users[userId].lookingFor = lookingFor;
        console.log(`Пользователь ${userId} ищет: ${lookingFor}`);
        // Устанавливаем статус в 'waiting' и начинаем поиск
        users[userId].status = 'waiting';
        console.log(`Статус пользователя ${userId} изменён на 'waiting'`);
        findPartnerForUser(userId);
    });

    // Ловим событие начала поиска собеседника
    socket.on('startSearching', () => {
        users[userId].status = 'waiting';
        console.log(`Пользователь ${userId} начал поиск собеседника`);
        findPartnerForUser(userId);
    });

    // Ловим событие завершения чата
    socket.on('endChat', () => {
        endChatForUser(userId);
    });
});

// Запускаем сервер на порту 3000
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
