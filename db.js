const mongoose = require('mongoose'); // Импорт библиотеки Mongoose
require('dotenv').config(); // Импорт dotenv для переменных окружения

// Функция для подключения к базе данных
const dbConnect = async () => {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('MongoDB connected');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      process.exit(1); // Завершаем процесс при ошибке
    }
  };
  

module.exports = dbConnect; // Экспортируем функцию для подключения
