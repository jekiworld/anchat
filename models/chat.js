const mongoose = require('mongoose');

// Определяем схему для сообщений
const messageSchema = new mongoose.Schema({
    senderId: String,
    content: String,
    messageType: String,
    timestamp: { type: Date, default: Date.now }
});

// Определяем схему для чатов
const chatSchema = new mongoose.Schema({
    participants: [String],  // Массив из двух пользователей (их ID)
    messages: [messageSchema]  // Массив сообщений между участниками
});

// Создаём модель чата
const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
