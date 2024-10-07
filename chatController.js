// chatController.js
const Chat = require('./models/chat');  // Импорт модели

// Функция для поиска переписки между двумя пользователями
const getChatBetweenUsers = async (userId1, userId2) => {
    try {
        const chat = await Chat.findOne({ participants: { $all: [userId1, userId2] } });
        if (chat) {
            return chat.messages;
        } else {
            console.log('Чат между пользователями не найден.');
            return [];
        }
    } catch (error) {
        console.error('Ошибка при поиске чата:', error);
    }
};

module.exports = { getChatBetweenUsers };
