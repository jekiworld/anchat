// models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: String,  // Уникальный идентификатор пользователя Telegram
    partnerId: { type: String, default: null },  // Идентификатор партнёра, если есть
    status: { type: String, default: 'idle' },  // Статус пользователя (idle, waiting, chatting)
    gender: String,  // Пол пользователя
    lookingFor: String,  // Кого ищет пользователь
    university: String,  // Университет пользователя
    isWebUser: { type: Boolean, default: false }  // Является ли пользователь веб-пользователем
});

const User = mongoose.model('User', userSchema);

module.exports = User;
