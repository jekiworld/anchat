const mongoose = require('mongoose');

// Определяем схему для чатов
const chatSchema = new mongoose.Schema({
    senderId: String,
    receiverId: String,
    content: String,
    messageType: String,
    timestamp: { type: Date, default: Date.now }
});

// Модель для работы с коллекцией чатов
const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
