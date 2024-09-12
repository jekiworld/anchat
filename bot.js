require('dotenv').config(); // Загружаем переменные окружения
const mongoose = require('mongoose'); // Импорт библиотеки Mongoose
const dbConnect = require('./db'); // Импортируем функцию подключения к базе данных
const TelegramBot = require('node-telegram-bot-api');
const User = require('./models/User'); // Модель пользователя

// Подключение к базе данных
dbConnect();

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log('Token:', token);

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    let user = await User.findOne({ chatId });

    if (!user) {
        user = new User({ chatId, status: 'waiting' });
        await user.save();
        bot.sendMessage(chatId, 'Вы зарегистрированы! Ищу собеседника...');
    } else if (user.status === 'offline') {
        user.status = 'waiting';
        await user.save();
        bot.sendMessage(chatId, 'Возвращаю вас в очередь поиска!');
    } else {
        bot.sendMessage(chatId, 'Вы уже находитесь в процессе.');
    }

    // Поиск собеседника
    const partner = await User.findOne({ status: 'waiting', chatId: { $ne: chatId } });

    if (partner) {
        // Если найден другой пользователь, связываем их
        user.status = 'chatting';
        user.partnerChatId = partner.chatId;
        partner.status = 'chatting';
        partner.partnerChatId = chatId;

        await user.save();
        await partner.save();

        bot.sendMessage(chatId, 'Собеседник найден! Можете общаться.');
        bot.sendMessage(partner.chatId, 'Собеседник найден! Можете общаться.');
    } else {
        bot.sendMessage(chatId, 'Ищу собеседника...');
    }

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;

        // Проверяем, существует ли пользователь и находится ли он в чате с кем-то
        let user = await User.findOne({ chatId });

        if (user && user.status === 'chatting' && user.partnerChatId) {
            // Если пользователь в чате, перенаправляем его сообщение собеседнику
            bot.sendMessage(user.partnerChatId, msg.text);
        }
    });

});
