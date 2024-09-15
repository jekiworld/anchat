// Подключаемся к серверу через Socket.IO
const socket = io();

// Элементы интерфейса
const registrationDiv = document.getElementById('registration');
const selectUniversityDiv = document.getElementById('selectUniversity');
const selectGenderDiv = document.getElementById('selectGender');
const selectLookingForDiv = document.getElementById('selectLookingFor');
const startChatDiv = document.getElementById('startChat');
const chatDiv = document.getElementById('chat');
const chatWindow = document.getElementById('chatWindow');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('sendBtn');
const endChatBtn = document.getElementById('endChatBtn');

// Переменные для хранения выбранных опций
let university = null;
let gender = null;
let lookingFor = null;

// Выбор университета
const universityButtons = document.querySelectorAll('.university-btn');
universityButtons.forEach(button => {
    button.addEventListener('click', () => {
        university = button.textContent;
        socket.emit('selectUniversity', university);
        selectUniversityDiv.style.display = 'none';
        selectGenderDiv.style.display = 'block';
    });
});

// Выбор пола
const genderButtons = document.querySelectorAll('.gender-btn');
genderButtons.forEach(button => {
    button.addEventListener('click', () => {
        gender = button.textContent;
        socket.emit('selectGender', gender);
        selectGenderDiv.style.display = 'none';
        selectLookingForDiv.style.display = 'block';
    });
});

// Выбор предпочтений
const lookingForButtons = document.querySelectorAll('.lookingfor-btn');
lookingForButtons.forEach(button => {
    button.addEventListener('click', () => {
        lookingFor = button.textContent;
        socket.emit('selectLookingFor', lookingFor);
        selectLookingForDiv.style.display = 'none';
        startChatDiv.style.display = 'block';
    });
});

// Начало поиска собеседника
const startChatBtn = document.getElementById('startChatBtn');
startChatBtn.addEventListener('click', () => {
    startChatDiv.style.display = 'none';
    registrationDiv.style.display = 'none';
    chatDiv.style.display = 'block';
    chatWindow.innerHTML = '<p>Поиск собеседника...</p>';
    socket.emit('startSearching');
});

// Отправка сообщения
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '') {
        socket.emit('sendMessage', message);
        appendMessage('Вы: ' + message, 'you');
        messageInput.value = '';
    }
}

function appendMessage(message, sender = 'other') {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    if (sender === 'you') {
        messageElement.classList.add('you');
    }
    messageElement.textContent = message;
    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Завершение чата
endChatBtn.addEventListener('click', () => {
    socket.emit('endChat');
    chatDiv.style.display = 'none';
    registrationDiv.style.display = 'block';
    selectUniversityDiv.style.display = 'block';
    chatWindow.innerHTML = '';
    alert('Вы завершили чат.');
});

// Обработка событий от сервера
socket.on('receiveMessage', (message) => {
    appendMessage('Собеседник: ' + message);
});

socket.on('partnerFound', () => {
    chatWindow.innerHTML = '<p>Собеседник найден! Можете начинать общение.</p>';
});

socket.on('chatEnded', (message) => {
    alert(message);
    chatDiv.style.display = 'none';
    registrationDiv.style.display = 'block';
    selectUniversityDiv.style.display = 'block';
    chatWindow.innerHTML = '';
});

socket.on('waitingForPartner', () => {
    chatWindow.innerHTML = '<p>Ищу собеседника, пожалуйста подождите...</p>';
});

socket.on('noPartner', (message) => {
    alert(message);
});
