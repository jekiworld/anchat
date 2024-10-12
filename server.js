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
const { getChatBetweenUsers } = require('./chatController');
const User = require('./models/user');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Подключено к MongoDB'))
    .catch(err => console.error('Ошибка подключения к MongoDB:', err));

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

const universities = ['КБТУ', 'Скоро', 'Скоро - 2'];
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

app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/chat/:userId1/:userId2', async (req, res) => {
    const { userId1, userId2 } = req.params;
    const messages = await getChatBetweenUsers(userId1, userId2);
    res.json(messages);
});

app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const userId = 'ws_' + req.body.userId;

    const user = await User.findOne({ telegramId: userId });

    if (file && user) {
        const partnerId = user.partnerId;
        const partner = await User.findOne({ telegramId: partnerId });

        if (partner) {
            const filePath = path.join(__dirname, 'uploads', file.filename);

            if (partner.isWebUser) {
                const fileUrl = `/uploads/${file.filename}`;
                const socketId = partnerId.substring(3);
                io.to(socketId).emit('receiveMessage', { type: req.body.type, content: fileUrl });
            } else {
                const chatId = partnerId.substring(3);

                if (req.body.type === 'photo') {
                    bot.sendPhoto(chatId, fs.createReadStream(filePath)).catch(console.error);
                } else if (req.body.type === 'video') {
                    bot.sendVideo(chatId, fs.createReadStream(filePath)).catch(console.error);
                } else if (req.body.type === 'sticker') {
                    bot.sendSticker(chatId, fs.createReadStream(filePath)).catch(console.error);
                }

                setTimeout(() => {
                    fs.unlink(filePath, (err) => {
                        if (err) console.error(err);
                    });
                }, 60000);
            }

            await saveMessageInChat(userId, partnerId, `/uploads/${file.filename}`, req.body.type);
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(400);
    }
});


bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;

    let user = await User.findOne({ telegramId: userId });

    if (user && user.university && user.gender && user.lookingFor) {
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
    } else {
        user = new User({
            telegramId: userId,
            status: 'idle',
            isWebUser: false
        });
        await user.save();

        bot.sendMessage(chatId, 'Привет! Пожалуйста, выберите свой университет:', {
            reply_markup: {
                keyboard: [
                    [{ text: 'КБТУ' }, { text: 'Скоро' }],
                    [{ text: 'Скоро - 2' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    }
});

bot.onText(/\/end/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;

    await endChatForUser(userId);

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
});


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;
    const text = msg.text;

    let user = await User.findOne({ telegramId: userId });

    if (!user) {
        user = new User({
            telegramId: userId,
            status: 'idle',
            isWebUser: false
        });
        await user.save();
    }

    if (msg.entities && msg.entities.some(entity => entity.type === 'bot_command')) {
        if (text === '/end') {
            return;
        } else {
            return;
        }
    }


    if (text === 'Изменить предпочтения') {
        user.university = null;
        user.gender = null;
        user.lookingFor = null;
        user.status = 'idle';
        user.partnerId = null;
        await user.save();

        bot.sendMessage(chatId, 'Предпочтения сброшены. Выберите университет:', {
            reply_markup: {
                keyboard: [
                    [{ text: 'КБТУ' }, { text: 'Скоро' }],
                    [{ text: 'Скоро - 2' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }

    if (!user.university) {
        if (universities.includes(text)) {
            user.university = text;
            await user.save();

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
                        [{ text: 'КБТУ' }, { text: 'Скоро' }],
                        [{ text: 'Скоро - 2' }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            });
        }
        return;
    }

    if (!user.gender) {
        if (genders.includes(text)) {
            user.gender = text;
            await user.save();

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

    if (!user.lookingFor) {
        if (preferences.includes(text)) {
            user.lookingFor = text === 'Мужчин' ? 'Мужской' : text === 'Женщин' ? 'Женский' : 'Любой пол';
            user.status = 'idle';
            await user.save();

            bot.sendMessage(chatId, 'Предпочтения сохранены! Вы можете начать поиск собеседника.', {
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

    if (text === 'Найти нового собеседника') {
        await endChatForUser(userId);

        bot.sendMessage(chatId, 'Ищем нового собеседника для вас...');
        user.status = 'waiting';
        await user.save();

        await findPartnerForUser(userId);
        return;
    }

    if (text === 'Завершить чат') {
        await endChatForUser(userId);
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
        return;
    }

    if (user.partnerId) {
        const partner = await User.findOne({ telegramId: user.partnerId });
        if (partner) {
            if (text) {
                if (partner.isWebUser) {
                    const socketId = partner.telegramId.substring(3);
                    io.to(socketId).emit('receiveMessage', { type: 'text', content: text });
                } else {
                    const partnerChatId = partner.telegramId.substring(3);
                    bot.sendMessage(partnerChatId, text);
                }

                await saveMessageInChat(userId, partner.telegramId, text, 'text');
            }

            else if (msg.photo) {
                const photo = msg.photo[msg.photo.length - 1];
                const fileId = photo.file_id;

                const file = await bot.getFile(fileId);
                const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

                if (partner.isWebUser) {
                    const socketId = partner.telegramId.substring(3);
                    io.to(socketId).emit('receiveMessage', { type: 'photo', content: fileUrl });
                } else {
                    const partnerChatId = partner.telegramId.substring(3);
                    bot.sendPhoto(partnerChatId, fileId).catch(console.error);
                }

                await saveMessageInChat(userId, partner.telegramId, fileUrl, 'photo');
            }

            else if (msg.video) {
                const video = msg.video;
                const fileId = video.file_id;

                const file = await bot.getFile(fileId);
                const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

                if (partner.isWebUser) {
                    const socketId = partner.telegramId.substring(3);
                    io.to(socketId).emit('receiveMessage', { type: 'video', content: fileUrl });
                } else {
                    const partnerChatId = partner.telegramId.substring(3);
                    bot.sendVideo(partnerChatId, fileId).catch(console.error);
                }

                await saveMessageInChat(userId, partner.telegramId, fileUrl, 'video');
            }

            else if (msg.video_note) {
                const videoNote = msg.video_note;
                const fileId = videoNote.file_id;

                const file = await bot.getFile(fileId);
                const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

                if (partner.isWebUser) {
                    const socketId = partner.telegramId.substring(3);
                    io.to(socketId).emit('receiveMessage', { type: 'video_note', content: fileUrl });
                } else {
                    const partnerChatId = partner.telegramId.substring(3);
                    bot.sendVideoNote(partnerChatId, fileId).catch(console.error);
                }

                await saveMessageInChat(userId, partner.telegramId, fileUrl, 'video_note');
            }


            else if (msg.sticker) {
                const sticker = msg.sticker;
                const fileId = sticker.file_id;

                if (partner.isWebUser) {
                    const file = await bot.getFile(fileId);
                    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

                    const socketId = partner.telegramId.substring(3);
                    io.to(socketId).emit('receiveMessage', { type: 'sticker', content: fileUrl });
                } else {
                    const partnerChatId = partner.telegramId.substring(3);
                    bot.sendSticker(partnerChatId, fileId).catch(console.error);
                }

                await saveMessageInChat(userId, partner.telegramId, fileId, 'sticker');
            }
            else {
                bot.sendMessage(chatId, 'Извините, этот тип сообщений не поддерживается.');
            }
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

let activeChats = 0;  // Счетчик для активных чатов

async function findPartnerForUser(userId) {
    let user = await User.findOne({ telegramId: userId });

    if (!user.gender || !user.lookingFor || !user.university || user.status !== 'waiting') {
        return;
    }

    // Ищем потенциальных партнёров в базе данных
    let potentialPartners = await User.find({
        telegramId: { $ne: userId },
        partnerId: null,
        status: 'waiting',
        $or: [
            { university: 'Скоро - 2' },
            { university: user.university },
            { university: 'Скоро - 2' }
        ],
        $or: [
            { gender: user.lookingFor },
            { lookingFor: 'Любой пол' },
            { gender: 'Любой пол' }
        ],
        $or: [
            { lookingFor: user.gender },
            { lookingFor: 'Любой пол' },
            { gender: 'Любой пол' }
        ]
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

    const partner = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];
    const partnerId = partner.telegramId;

    // Обновляем данные пользователей в базе данных
    user.partnerId = partnerId;
    user.status = 'chatting';
    await user.save();

    partner.partnerId = userId;
    partner.status = 'chatting';
    await partner.save();

    activeChats++;  // Увеличиваем счетчик активных чатов
    console.log(`Чат начат, активные чаты: ${activeChats}`);

    // Уведомляем пользователей
    if (user.isWebUser) {
        const socketId = userId.substring(3);
        io.to(socketId).emit('partnerFound');
    } else {
        const chatId = userId.substring(3);
        bot.sendMessage(chatId, 'Собеседник найден! Можете начинать общение.');
    }

    if (partner.isWebUser) {
        const socketId = partnerId.substring(3);
        io.to(socketId).emit('partnerFound');
    } else {
        const chatId = partnerId.substring(3);
        bot.sendMessage(chatId, 'Собеседник найден! Можете начинать общение.');
    }
}



async function endChatForUser(userId) {
    let user = await User.findOne({ telegramId: userId });

    if (user && user.partnerId) {
        let partner = await User.findOne({ telegramId: user.partnerId });

        if (partner) {
            if (partner.isWebUser) {
                const socketId = partner.telegramId.substring(3);
                io.to(socketId).emit('chatEnded', 'Ваш собеседник завершил диалог.');
            } else {
                const chatId = partner.telegramId.substring(3);
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

            partner.partnerId = null;
            partner.status = 'idle';
            await partner.save();
        }

        user.partnerId = null;
        user.status = 'idle';
        await user.save();

        activeChats--;
        console.log(`Чат закончен, активные чаты: ${activeChats}`);

    }
}


io.on('connection', (socket) => {
    const userId = 'ws_' + socket.id;

    let user = new User({
        telegramId: userId,
        status: 'idle',
        isWebUser: true
    });
    user.save();

    socket.on('selectUniversity', async (university) => {
        user.university = university;
        await user.save();
    });

    socket.on('selectGender', async (gender) => {
        user.gender = gender;
        await user.save();
    });

    socket.on('selectLookingFor', async (lookingFor) => {
        user.lookingFor = lookingFor === 'Мужчин' ? 'Мужской' : lookingFor === 'Женщин' ? 'Женский' : 'Любой пол';
        user.status = 'idle';
        await user.save();

        socket.emit('preferencesSaved');
    });

    socket.on('startSearching', async () => {
        user.status = 'waiting';
        await user.save();
        await findPartnerForUser(userId);
    });

    socket.on('sendMessage', async (data) => {
        const user = await User.findOne({ telegramId: 'ws_' + socket.id });
        const partnerId = user.partnerId;

        if (partnerId) {
            const partner = await User.findOne({ telegramId: partnerId });
            if (partner) {
                // Сохранение сообщения в чате
                await saveMessageInChat(user.telegramId, partner.telegramId, data.content, data.type);

                if (partner.isWebUser) {
                    const socketId = partner.telegramId.substring(3);
                    io.to(socketId).emit('receiveMessage', data);
                } else {
                    const chatId = partner.telegramId.substring(3);
                    if (data.type === 'text') {
                        bot.sendMessage(chatId, data.content);
                    } else if (data.type === 'photo') {
                        bot.sendPhoto(chatId, data.content).catch(console.error);
                    } else if (data.type === 'video') {
                        bot.sendVideo(chatId, data.content).catch(console.error);
                    }
                }
            } else {
                socket.emit('noPartner', 'Партнёр не найден.');
            }
        } else {
            socket.emit('noPartner', 'У вас нет активного собеседника.');
        }
    });


    socket.on('endChat', async () => {
        await endChatForUser(userId);
        socket.emit('chatEnded', 'Вы завершили чат.');
    });

    socket.on('disconnect', async () => {
        const user = await User.findOne({ telegramId: userId });
        if (user) {
            const partnerId = user.partnerId;
            if (partnerId) {
                const partner = await User.findOne({ telegramId: partnerId });
                if (partner) {
                    if (partner.isWebUser) {
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
                    partner.partnerId = null;
                    partner.status = 'idle';
                    await partner.save();
                }
            }
            await user.deleteOne();
        }
    });
});

app.get('/active-chats', (req, res) => {
    res.json({ activeChats });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

const saveMessageInChat = async (senderId, receiverId, content, messageType) => {
    try {
        let chat = await Chat.findOne({ participants: { $all: [senderId, receiverId] } });

        if (!chat) {
            chat = new Chat({
                participants: [senderId, receiverId],
                messages: []
            });
        }

        chat.messages.push({
            senderId,
            content,
            messageType
        });

        await chat.save();
        console.log('Сообщение успешно добавлено в чат.');
    } catch (error) {
        console.error('Ошибка при сохранении сообщения:', error);
    }
};
