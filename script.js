const socket = io();

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
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const stickerBtn = document.getElementById('stickerBtn');

let university = null;
let gender = null;
let lookingFor = null;

// Университет
const universityButtons = document.querySelectorAll('.university-btn');
universityButtons.forEach(button => {
    button.addEventListener('click', () => {
        university = button.textContent;
        socket.emit('selectUniversity', university);
        selectUniversityDiv.style.display = 'none';
        selectGenderDiv.style.display = 'block';
    });
});

// Пол
const genderButtons = document.querySelectorAll('.gender-btn');
genderButtons.forEach(button => {
    button.addEventListener('click', () => {
        gender = button.textContent;
        socket.emit('selectGender', gender);
        selectGenderDiv.style.display = 'none';
        selectLookingForDiv.style.display = 'block';
    });
});

// Предпочтение
const lookingForButtons = document.querySelectorAll('.lookingfor-btn');
lookingForButtons.forEach(button => {
    button.addEventListener('click', () => {
        lookingFor = button.textContent;
        socket.emit('selectLookingFor', lookingFor);
        selectLookingForDiv.style.display = 'none';
        startChatDiv.style.display = 'block';
    });
});

// Кнопка для начала поиска собеседника
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
messageInput.addEventListener('keypress', function (event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

stickerBtn.addEventListener('click', () => {
    // Открываем диалог выбора файла для стикера
    fileInput.accept = 'image/*';
    fileInput.dataset.isSticker = 'true';
    fileInput.click();
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message !== '') {
        socket.emit('sendMessage', { type: 'text', content: message });
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

// Получение сообщения от партнера
socket.on('receiveMessage', (data) => {
    if (data.type === 'text') {
        appendMessage('Собеседник: ' + data.content);
    } else if (data.type === 'photo') {
        appendImage(data.content);
    } else if (data.type === 'video') {
        appendVideo(data.content);
    } else if (data.type === 'sticker') {
        appendSticker(data.content);
    }
});


function appendSticker(url) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    const img = document.createElement('img');
    img.src = url;
    img.classList.add('sticker');
    messageElement.appendChild(img);
    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendImage(url) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    const img = document.createElement('img');
    img.src = url;
    messageElement.appendChild(img);
    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendVideo(url) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    const video = document.createElement('video');
    video.src = url;
    video.controls = true;
    messageElement.appendChild(video);
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

// Прикрепление файла
attachBtn.addEventListener('click', () => {
    fileInput.accept = 'image/*,video/*';
    fileInput.dataset.isSticker = 'false';
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
        const formData = new FormData();
        formData.append('file', file);

        let fileType = '';
        if (fileInput.dataset.isSticker === 'true') {
            fileType = 'sticker';
        } else if (file.type.startsWith('image/')) {
            fileType = 'photo';
        } else if (file.type.startsWith('video/')) {
            fileType = 'video';
        } else {
            alert('Этот тип файла не поддерживается.');
            return;
        }

        formData.append('type', fileType);
        formData.append('userId', socket.id);

        fetch('/upload', {
            method: 'POST',
            body: formData
        }).then(response => {
            if (response.ok) {
                appendMessage('Вы отправили ' + (fileType === 'photo' ? 'фото' : fileType === 'video' ? 'видео' : 'стикер'), 'you');
            } else {
                alert('Ошибка при отправке файла.');
            }
        }).catch(error => {
            console.error(error);
            alert('Ошибка при отправке файла.');
        });

        fileInput.value = '';
        fileInput.accept = 'image/*,video/*';
        fileInput.dataset.isSticker = 'false';
    }
});


// Событие после сохранения предпочтений
socket.on('preferencesSaved', () => {
    selectLookingForDiv.style.display = 'none';
    startChatDiv.style.display = 'block';
});
