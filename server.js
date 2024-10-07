const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Chat = require('./models/chat');
const { getChatBetweenUsers } = require('./chatController');  // Импорт функции
const app = express();
const server = http.createServer(app);
const io = new Server(server);


mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Подключено к MongoDB'))
    .catch(err => console.error('Ошибка подключения к MongoDB:', err));

// Функция для сохранения сообщений в чат
const saveMessageInChat = async (senderId, receiverId, content, messageType) => {
    try {
        // Поиск существующего чата между двумя пользователями
        let chat = await Chat.findOne({ participants: { $all: [senderId, receiverId] } });

        if (!chat) {
            // Если чат не найден, создаём новый
            chat = new Chat({
                participants: [senderId, receiverId],
                messages: []
            });
        }

        // Добавляем новое сообщение в массив сообщений
        chat.messages.push({
            senderId,
            content,
            messageType
        });

        // Сохраняем обновлённый чат
         chat.save();
        console.log('Сообщение успешно добавлено в чат.');
    } catch (error) {
        console.error('Ошибка при сохранении сообщения:', error);
    }
};


app.use(express.static(__dirname));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/chat/:userId1/:userId2', async (req, res) => {
    const { userId1, userId2 } = req.params;
    const messages = await getChatBetweenUsers(userId1, userId2);
    res.json(messages);
});
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const commands = [
    {
        command: 'start',
        description: 'Запуск бота'
    },
    {
        command: 'end',
        description: 'Завершить текущий чат'
    }
];

bot.setMyCommands(commands);

let users = {};

const universities = ['Университет А', 'Университет Б', 'Любой университет'];
const genders = ['Мужской', 'Женский', 'Любой пол'];
const preferences = ['Мужчин', 'Женщин', 'Любой пол'];

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.post('/upload', upload.single('file'), (req, res) => {
    const file = req.file;
    const userId = 'ws_' + req.body.userId;

    if (file && users[userId]) {
        const partnerId = users[userId].partnerId;

        if (partnerId && users[partnerId]) {
            if (users[partnerId].isWebUser) {
                const fileUrl = `/uploads/${file.filename}`;
                const socketId = partnerId.substring(3);
                io.to(socketId).emit('receiveMessage', { type: req.body.type, content: fileUrl });
            } else {
                const chatId = partnerId.substring(3);
                const filePath = path.join(__dirname, 'uploads', file.filename);

                fs.access(filePath, fs.constants.F_OK, (err) => {
                    if (err) {
                        return res.status(500).send('Файл не найден.');
                    }

                    if (req.body.type === 'photo') {
                        bot.sendPhoto(chatId, fs.createReadStream(filePath)).catch(console.error);
                    } else if (req.body.type === 'video') {
                        bot.sendVideo(chatId, fs.createReadStream(filePath)).catch(console.error);
                    }

                    setTimeout(() => {
                        fs.unlink(filePath, (err) => {
                            if (err) console.error(err);
                        });
                    }, 60000);
                });
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(400);
    }
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;

    if (users[userId] && users[userId].gender && users[userId].lookingFor && users[userId].university) {
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

    users[userId] = {
        partnerId: null,
        status: 'idle',
        gender: null,
        lookingFor: null,
        university: null,
        isWebUser: false
    };

    bot.sendMessage(chatId, 'Привет! Пожалуйста, выберите свой университет:', {
        reply_markup: {
            keyboard: [
                [{ text: 'Университет А' }, { text: 'Университет Б' }],
                [{ text: 'Любой университет' }]
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
    users[userId].status = 'idle';
});

// Обработка видео-сообщений (кружков)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;
    const text = msg.text;

    if (msg.entities && msg.entities.some(entity => entity.type === 'bot_command' && text !== '/end')) {
        return;
    }

    // Если пользователь не существует в системе, инициализируем его
    if (!users[userId]) {
        users[userId] = {
            partnerId: null,
            status: 'idle',
            gender: null,
            lookingFor: null,
            university: null,
            isWebUser: false
        };
    }

    // Игнорируем команды бота, кроме /end
    if (msg.entities && msg.entities.some(entity => entity.type === 'bot_command' && text !== '/end')) {
        return;
    }

    // Проверка выбора университета
    if (!users[userId].university) {
        if (universities.includes(text)) {
            users[userId].university = text;
            bot.sendMessage(chatId, 'Пожалуйста, выберите свой пол:', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Мужской' }, { text: 'Женский' }],
                        [{ text: 'Любой пол' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        } else {
            bot.sendMessage(chatId, 'Пожалуйста, выберите свой университет:', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Университет А' }, { text: 'Университет Б' }],
                        [{ text: 'Любой университет' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
        return;
    }

    // Проверка выбора пола
    if (!users[userId].gender) {
        if (genders.includes(text)) {
            users[userId].gender = text;
            bot.sendMessage(chatId, 'Кого вы хотите найти?', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Мужчин' }, { text: 'Женщин' }],
                        [{ text: 'Любой пол' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        } else {
            bot.sendMessage(chatId, 'Пожалуйста, выберите свой пол:', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Мужской' }, { text: 'Женский' }],
                        [{ text: 'Любой пол' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
        return;
    }

    // Проверка выбора предпочтений
    if (!users[userId].lookingFor) {
        if (preferences.includes(text)) {
            if (text === 'Мужчин') {
                users[userId].lookingFor = 'Мужской';
            } else if (text === 'Женщин') {
                users[userId].lookingFor = 'Женский';
            } else {
                users[userId].lookingFor = 'Любой пол';
            }

            bot.sendMessage(chatId, `Спасибо! Вы выбрали искать ${text.toLowerCase()}.`, {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Найти нового собеседника' }],
                        [{ text: 'Изменить предпочтения' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
            users[userId].status = 'idle';
        } else {
            bot.sendMessage(chatId, 'Пожалуйста, выберите, кого вы хотите найти:', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Мужчин' }, { text: 'Женщин' }],
                        [{ text: 'Любой пол' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
        return;
    }

    // Обработка команды "Изменить предпочтения"
    if (text === 'Изменить предпочтения') {
        users[userId].gender = null;
        users[userId].lookingFor = null;
        users[userId].university = null;
        users[userId].status = 'idle';
        users[userId].partnerId = null;

        bot.sendMessage(chatId, 'Выберите свой университет:', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Университет А' }, { text: 'Университет Б' }],
                    [{ text: 'Любой университет' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    } else if (text === 'Найти нового собеседника') {
        if (users[userId].partnerId) {
            endChatForUser(userId);
        }
        bot.sendMessage(chatId, 'Ищем нового собеседника для вас...');
        users[userId].status = 'waiting';
        findPartnerForUser(userId);
        return;
    } else if (text === 'Завершить чат') {
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
        users[userId].status = 'idle';
        return;
    } else if (text === '/end') {
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
        users[userId].status = 'idle';
        return;
    }

    // Пересылка сообщений между пользователями
    if (users[userId] && users[userId].partnerId) {
        const partnerId = users[userId].partnerId;

        // Обработка текстовых сообщений
        if (text) {
            if (users[partnerId].isWebUser) {
                const socketId = partnerId.substring(3);
                io.to(socketId).emit('receiveMessage', { type: 'text', content: text });
            } else {
                const partnerChatId = partnerId.substring(3);
                sendWithRetry(partnerChatId, text);
            }

            // Сохранение сообщения в переписку между senderId и receiverId
             saveMessageInChat(userId, partnerId, text, 'text');
        }



        // Обработка фото
        else if (msg.photo) {
            const photo = msg.photo[msg.photo.length - 1];
            const fileId = photo.file_id;

            // Получаем ссылку на файл
            const file = await bot.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

            if (users[partnerId].isWebUser) {
                const socketId = partnerId.substring(3);
                io.to(socketId).emit('receiveMessage', { type: 'photo', content: fileUrl });
            } else {
                const partnerChatId = partnerId.substring(3);

                // Добавляем отправку с повторной попыткой
                const sendPhotoWithRetry = (chatId, fileId, retries = 3, delay = 1000) => {
                    bot.sendPhoto(chatId, fileId)
                        .catch((error) => {
                            if (error.response && error.response.statusCode === 400 && retries > 0) {
                                console.warn('Ошибка 400, повтор через 1 сек.', chatId);
                                setTimeout(() => sendPhotoWithRetry(chatId, fileId, retries - 1), delay);
                            } else {
                                console.error('Произошла ошибка при отправке фото:', error);
                            }
                        });
                };

                // Вызываем отправку фото с проверкой
                sendPhotoWithRetry(partnerChatId, fileId);
            }

            // Сохранение фото в базу данных
            const chatMessage = new Chat({
                senderId: userId,
                receiverId: partnerId,
                content: fileUrl,
                messageType: 'photo'
            });

            await chatMessage.save()
                .then(() => console.log('Фото сохранено в MongoDB'))
                .catch(err => console.error('Ошибка при сохранении фото:', err));
        }
        // Обработка видео-сообщений (кружков)
        else if (msg.photo) {
            const photo = msg.photo[msg.photo.length - 1];
            const fileId = photo.file_id;

            // Получаем ссылку на файл
            const file = await bot.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

            if (users[partnerId].isWebUser) {
                const socketId = partnerId.substring(3);
                io.to(socketId).emit('receiveMessage', { type: 'photo', content: fileUrl });
            } else {
                const partnerChatId = partnerId.substring(3);
                sendPhotoWithRetry(partnerChatId, fileId);
            }

            // Сохранение фото в переписку между senderId и receiverId
            await saveMessageInChat(userId, partnerId, fileUrl, 'photo');
        }

        // Обработка других типов сообщений (опционально)
        else {
            bot.sendMessage(chatId, 'Извините, этот тип сообщений не поддерживается.');
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

// Добавление возможности отправки кружков с веб-клиента
app.post('/upload', upload.single('file'), (req, res) => {
    const file = req.file;
    const userId = 'ws_' + req.body.userId;

    if (file && users[userId]) {
        const partnerId = users[userId].partnerId;

        if (partnerId && users[partnerId]) {
            if (users[partnerId].isWebUser) {
                const fileUrl = `/uploads/${file.filename}`;
                const socketId = partnerId.substring(3);
                io.to(socketId).emit('receiveMessage', { type: req.body.type, content: fileUrl });
            } else {
                const chatId = partnerId.substring(3);
                const filePath = path.join(__dirname, 'uploads', file.filename);

                fs.access(filePath, fs.constants.F_OK, (err) => {
                    if (err) {
                        return res.status(500).send('Файл не найден.');
                    }

                    if (req.body.type === 'photo') {
                        bot.sendPhoto(chatId, fs.createReadStream(filePath)).catch(console.error);
                    } else if (req.body.type === 'video') {
                        bot.sendVideo(chatId, fs.createReadStream(filePath)).catch(console.error);
                    } else if (req.body.type === 'video_note') {
                        bot.sendVideoNote(chatId, fs.createReadStream(filePath)).catch(console.error);
                    }

                    setTimeout(() => {
                        fs.unlink(filePath, (err) => {
                            if (err) console.error(err);
                        });
                    }, 60000);
                });
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(400);
    }
});



function findPartnerForUser(userId) {
    const user = users[userId];

    if (!user.gender || !user.lookingFor || !user.university || user.status !== 'waiting') {
        return;
    }

    const potentialPartners = Object.keys(users).filter(id => {
        const potentialPartner = users[id];

        return potentialPartner.partnerId === null
            && id !== userId
            && potentialPartner.status === 'waiting'
            && (user.university === 'Любой университет' || potentialPartner.university === 'Любой университет' || potentialPartner.university === user.university)
            && (user.lookingFor === 'Любой пол' || potentialPartner.gender === user.lookingFor || potentialPartner.gender === 'Любой пол')
            && (potentialPartner.lookingFor === 'Любой пол' || user.gender === potentialPartner.lookingFor || user.gender === 'Любой пол');
    });

    if (potentialPartners.length === 0) {
        if (user.isWebUser) {
            const socketId = userId.substring(3);
            io.to(socketId).emit('waitingForPartner');
        } else {
            const chatId = userId.substring(3);
            bot.sendMessage(chatId, 'Ищу собеседника, пожалуйста подождите...');
        }
        return;
    }

    const partnerId = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];

    users[userId].partnerId = partnerId;
    users[partnerId].partnerId = userId;

    users[userId].status = 'chatting';
    users[partnerId].status = 'chatting';

    if (users[partnerId].isWebUser) {
        const socketId = partnerId.substring(3);
        io.to(socketId).emit('partnerFound', { partnerId: userId, isTelegramUser: !users[userId].isWebUser });
        if (!users[userId].isWebUser) {
            const chatId = userId.substring(3);
            bot.sendMessage(chatId, 'Собеседник найден! Вы общаетесь с пользователем с вебсайта.');
        }
    } else {
        const chatIdUser = userId.substring(3);
        const chatIdPartner = partnerId.substring(3);
        bot.sendMessage(chatIdUser, 'Собеседник найден! Можете начинать общение.');
        bot.sendMessage(chatIdPartner, 'Собеседник найден! Можете начинать общение.');
    }
}

function endChatForUser(userId) {
    const user = users[userId];

    if (user && user.partnerId) {
        const partnerId = user.partnerId;

        if (users[partnerId].isWebUser) {
            const socketId = partnerId.substring(3);
            io.to(socketId).emit('chatEnded', 'Ваш собеседник завершил диалог.');
        } else {
            const chatId = partnerId.substring(3);
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

        users[userId].partnerId = null;
        users[partnerId].partnerId = null;

        users[userId].status = 'idle';
        users[partnerId].status = 'idle';
    }
}

io.on('connection', (socket) => {
    const userId = 'ws_' + socket.id;

    users[userId] = {
        partnerId: null,
        status: 'idle',
        gender: null,
        lookingFor: null,
        university: null,
        isWebUser: true
    };

    socket.on('disconnect', () => {
        const partnerId = users[userId].partnerId;
        if (partnerId) {
            if (users[partnerId].isWebUser) {
                const socketId = partnerId.substring(3);
                io.to(socketId).emit('chatEnded', 'Ваш собеседник отключился.');
            } else {
                const chatId = partnerId.substring(3);
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

        delete users[userId];
    });

    socket.on('selectUniversity', (university) => {
        users[userId].university = university;
    });

    socket.on('selectGender', (gender) => {
        users[userId].gender = gender;
    });

    socket.on('selectLookingFor', (lookingFor) => {
        if (lookingFor === 'Мужчин') {
            users[userId].lookingFor = 'Мужской';
        } else if (lookingFor === 'Женщин') {
            users[userId].lookingFor = 'Женский';
        } else {
            users[userId].lookingFor = 'Любой пол';
        }
        users[userId].status = 'idle';
    });

    socket.on('startSearching', () => {
        users[userId].status = 'waiting';
        findPartnerForUser(userId);
    });

    socket.on('sendMessage', async (data) => {
        const partnerId = users[userId].partnerId;
        const { senderId, receiverId, content, messageType } = data;

        const chatMessage = new Chat({
            senderId,
            receiverId,
            content,
            messageType
        });

        if (partnerId && users[partnerId]) {
            const chatMessage = new Chat({
                senderId: userId,
                receiverId: partnerId,
                content: data.content,
                messageType: data.type
            });

            await chatMessage.save()
                .then(() => console.log('Сообщение сохранено'))
                .catch(err => console.error('Ошибка при сохранении сообщения:', err));

            if (users[partnerId].isWebUser) {
                const socketId = partnerId.substring(3);
                io.to(socketId).emit('receiveMessage', data);
            } else {
                const chatId = partnerId.substring(3);
                if (data.type === 'text') {
                    bot.sendMessage(chatId, data.content);
                } else if (data.type === 'photo') {
                    bot.sendPhoto(chatId, data.content);
                } else if (data.type === 'video') {
                    bot.sendVideo(chatId, data.content);
                }
            }
        } else {
            socket.emit('noPartner', 'Партнёр не найден.');
        }
    });


    socket.on('endChat', () => {
        endChatForUser(userId);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
//
//