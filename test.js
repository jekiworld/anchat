const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = "7446481430:AAE-_fol828uSStm_ICB24zH4IU8gMLXdik"
const bot = new TelegramBot(token, { polling: true });

let users = {};
const commands = [
    {
        command: "start",
        description: "Запуск бота"
    },
]

bot.setMyCommands(commands);

// bot.on('text', async msg => {
//     try {
//         if (msg.text.startsWith('/start')) {
//             await bot.sendMessage(msg.chat.id, `Вы запустили бота!`);
//             if (msg.text.length > 6) {
//                 const refID = msg.text.slice(7);
//                 await bot.sendMessage(msg.chat.id, `Вы зашли по ссылке пользователя с ID ${refID}`);
//             }
//         }
//         else if (msg.text == '/ref') {
//             await bot.sendMessage(msg.chat.id, `${process.env.URL_TO_BOT}?start=${msg.from.id}`);
//         }
//         else if (msg.text == '/help') {
//             await bot.sendMessage(msg.chat.id, `Раздел помощи`);
//         }
//         else {
//             await bot.sendMessage(msg.chat.id, msg.text);
//         }
//     }
//     catch (error) {
//         console.log(error);
//     }
// })




bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;
    users[userId] = {
        userId: userId,
        partnerId: null,
        status: 'idle',
        gender: null,
        lookingFor: null,
        isWebUser: false
    };

    console.log(users[userId]);


    if (users[userId] && users[userId].gender && users[userId].lookingFor) {
        bot.sendMessage(chatId, `вот твой ${userId}`, {



            reply_markup: {

                keyboard: [

                    [
                        "Изменить предпочтения"
                    ],
                    [
                        "Найти нового собеседника"
                    ],
                    [
                        "Завершить чат"
                    ]

                ],
                resize_keyboard: true,
                one_time_keyboard: false

            }
        });
    }


    bot.sendMessage(chatId, 'Привет, пожалуйста, выберите свой пол:', {
        reply_markup: {
            keyboard: [
                [{ text: 'Мужской' }, { text: 'Женский' }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    })
})


bot.onText(/\/end/, (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;

    if (users[userId] && users[userId].partnerId) {
        endChatFor(userId);
        bot.sendMessage(chatId, 'Вы завершили чат.', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Найти нового собеседника' }],
                    [{ text: 'Изменить предпочтения' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        })
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
})


//

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = 'tg_' + chatId;
    const text = msg.text;

    if (msg.entities && msg.entities.some(entity => entity.type === 'bot_command' && text !== '/end')) {
        return;
    }
})
//

if (!users[userId] || users[userId].gender) {
    if (text === 'Мужской' || text === 'Женский') {
        users[userId].gender = text === 'Мужской' ? 'male' : 'female';

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

if (users[userId] && users[userId].partnerId) {
    const partnerId = users[userId].partnerId;

    if (users[partnerId].isWebUser) {
        const socketId = partnerId.substring(3);
        io.to(socketId).emit('receiveMessage', text);
    } else {
        const partnerChatId = partnerId.substring(3);
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

function findPartnerForUser(userId) {
    const user = users[userId];


    if (!user.gender || !user.lookingFor || user.status !== 'waiting') {
        console.log(`Пользователь ${userId} не готов к поиску собеседника`);
        return;
    }

    console.log(`Пользователь ${userId} ищет собеседника`);
    console.log('Текущие пользователи:', users);

    const potentialPartners = Object.keys(users).filter(id => {
        const potentialPartner = users[id];

        return potentialPartner.partnerId === null
            && id !== userId
            && potentialPartner.gender === user.lookingFor
            && potentialPartner.lookingFor === user.gender
            && potentialPartner.status === 'waiting';

    });

    if (potentialPartners.length === 0) {
        console.log('Нет подходящих партнёров, продолжаем поиск...');
        if (user.isWebUser) {
            const socketId = userId.substring(3);
            io.to(socketId).emit('waitingForPartner');
        } else {
            const chatId = userId.substring(3);
            bot.sendMessage(chatId, 'Ищу собеседника, пожалуйста подождите...')
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
            bot.sendMessage(chatId, 'Собеседник найден! Вы общаетесь с пользователем с вебсайта.')
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

        console.log(`Чат между пользователями ${userId} и ${partnerId} завершён.`);
    }
}

io.on('connection', (socket) => {
    const userId = 'ws_' + socket.id;
    console.log('Пользователь подключился с вебсайта:', userId);

    users[userId] = { partnerId: null, status: 'idle', gender: null, lookingFor: null, isWebUser: true };

    socket.on('disconnect', () => {
    });

    socket.on('sendMessage', (message) => {
    });

    socket.on('selectGender', (gender) => {
        users[userId].gender = gender;
        console.log(`Пользователь ${userId} выбрал пол: ${gender}`);
    });

    socket.on('selectLookingFor', (lookingFor) => {
        users[userId].lookingFor = lookingFor;
        console.log(`Пользователь ${userId} ищет: ${lookingFor}`);
        users[userId].status = 'waiting';
        findPartnerForUser(userId);
    });

    socket.on('startSearching', () => {
        users[userId].status = 'waiting';
        findPartnerForUser(userId);
    });

    socket.on('endChat', () => {
        endChatForUser(userId);
    });

});


const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

