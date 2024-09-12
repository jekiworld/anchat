const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  chatId: { type: String, required: true }, // Уникальный идентификатор чата (пользователя)
  status: { type: String, enum: ['waiting', 'chatting', 'offline'], default: 'offline' }, // Статус пользователя
  partnerChatId: { type: String, default: null }, // Идентификатор собеседника, если найден
});

module.exports = mongoose.model('User', UserSchema);
