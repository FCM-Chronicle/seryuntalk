// 기본 변수들
let username = '';
let userColor = '';
let isAdmin = false;
let isSuspended = false;
let messageIdCounter = 0;
let editingMessageId = null;
const ADMIN_USERNAME = '앳새이하준';
const onlineUsers = {};
const socket = io();

// 레이싱 게임 관련 변수
let gameActive = false;
let player = null;
let gameArea = null;
let obstacles = [];
let currentLane = 1; // 0, 1, 2 (왼쪽, 가운데, 오른쪽)
let score = 0;
let gameSpeed = 2000; // 장애물 생성 간격 (밀리초)
let obstacleSpeed = 3; // 장애물 이동 속도
let gameInterval = null;
let obstacleInterval = null;

// PvP 게임 관련 변수
let pvpGameActive = false;
let pvpGameId = null;
let isPlayer1 = false;
let pvpPlayer1 = null;
let pvpPlayer2 = null;
let pvpBattlefield = null;
let player1Health = 3;
let player2Health = 3;
let bullets = [];
let myPosition = { x: 100, y: 100 };
let opponentPosition = { x: 200, y: 200 };
let myDirection = 'up'; // up, down, left, right, up-left, up-right, down-left, down-right
let opponentDirection = 'up';
let pvpKeys = {};
let gameStarted = false;
let countdownActive = false;
let lastMoveTime = 0;

// 랜덤 색상 생성
function getRandomColor() {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
        '#F8C471', '#82E0AA', '#F1948A', '#AED6F1', '#D7BDE2',
        '#FADBD8', '#D5F4E6', '#FCF3CF', '#EBDEF0', '#D6EAF8',
        '#FFB74D', '#81C784', '#64B5F6', '#F06292', '#BA68C8',
        '#FF8A65', '#4DB6AC', '#9575CD', '#7986CB', '#5DADE2',
        '#58D68D', '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471',
        '#FF9999', '#99CCFF', '#99FF99', '#FFCC99', '#FF99CC',
        '#CCFF99', '#99FFCC', '#CC99FF', '#FFFF99', '#FF6666'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// 시간 포맷
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

// 이모지만 있는지 확인하는 함수
function isEmojiOnly(text) {
    const emojiRegex = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u;
    return emojiRegex.test(text.trim());
}

// 이모지 애니메이션 함수
function createFlyingEmoji(emoji, startX, startY) {
    const flyingEmoji = document.createElement('div');
    flyingEmoji.classList.add('flying-emoji');
    flyingEmoji.textContent = emoji;
    flyingEmoji.style.left = startX + 'px';
    flyingEmoji.style.top = startY + 'px';
    
    document.body.appendChild(flyingEmoji);
    
    setTimeout(() => {
        flyingEmoji.remove();
    }, 3000);
}

// 이미지를 Base64로 변환하는 함수
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// 이미지 메시지 추가 함수
function addImageMessage(imageData, isUser = false, sender = '', color = '', timestamp = null) {
    const messagesContainer = document.getElementById('messages');
    const messageElement = document.createElement('div');
    
    messageElement.classList.add('message');
    if (isUser) {
        messageElement.classList.add('user-message');
        messageElement.style.alignSelf = 'flex-end';
    } else {
        messageElement.classList.add('other-message');
        messageElement.style.alignSelf = 'flex-start';
    }
    
    // 발신자 정보 (다른 사용자 메시지인 경우)
    if (!isUser && sender) {
        const senderInfo = document.createElement('div');
        senderInfo.innerHTML = `<strong style="color: ${color}; font-weight: 600;">${sender}</strong>`;
        messageElement.appendChild(senderInfo);
    }
    
    // 이미지 컨테이너
    const imageContainer = document.createElement('div');
    imageContainer.classList.add('image-message');
    
    const img = document.createElement('img');
    img.src = imageData;
    img.alt = '전송된 이미지';
    img.addEventListener('click', () => {
        showImageOverlay(imageData);
    });
    
    imageContainer.appendChild(img);
    messageElement.appendChild(imageContainer);
    
    // 시간 정보
    const timeInfo = document.createElement('div');
    timeInfo.classList.add('message-info');
    timeInfo.textContent = formatTime(timestamp || new Date());
    messageElement.appendChild(timeInfo);
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// 이미지 오버레이 표시 함수
function showImageOverlay(imageSrc) {
    const overlay = document.getElementById('image-overlay');
    const overlayImage = document.getElementById('overlay-image');
    overlayImage.src = imageSrc;
    overlay.style.display = 'flex';
}

// 이미지 오버레이 숨기기
function hideImageOverlay() {
    document.getElementById('image-overlay').style.display = 'none';
}

// 붙여넣기 인디케이터 표시/숨기기
function showPasteIndicator() {
    document.getElementById('paste-indicator').style.display = 'block';
}

function hidePasteIndicator() {
    document.getElementById('paste-indicator').style.display = 'none';
}

// 이미지 전송 함수
async function sendImage(file) {
    if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드할 수 있습니다.');
        return;
    }
    
    // 파일 크기 제한 (5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('이미지 크기는 5MB 이하여야 합니다.');
        return;
    }
    
    showPasteIndicator();
    
    try {
        const base64 = await fileToBase64(file);
        
        // 서버에 이미지 전송
        socket.emit('sendImage', {
            imageData: base64,
            fileName: file.name
        });
        
    } catch (error) {
        console.error('이미지 업로드 실패:', error);
        alert('이미지 업로드에 실패했습니다.');
    } finally {
        hidePasteIndicator();
    }
}

// 메시지 삭제 함수
function deleteMessage(messageId) {
    if (confirm('이 메시지를 삭제하시겠습니까?')) {
        socket.emit('deleteMessage', { messageId });
    }
}

// 메시지 수정 함수
function editMessage(messageId, currentText) {
    editingMessageId = messageId;
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    const messageContent = messageElement.querySelector('.message-content');
    
    if (!messageContent) {
        console.error('메시지 내용을 찾을 수 없습니다');
        return;
    }
    
    // 원본 내용 저장
    messageElement.dataset.originalContent = messageContent.innerHTML;
    
    messageElement.classList.add('editing-message');
    
    const editContainer = document.createElement('div');
    editContainer.innerHTML = `
        <input type="text" class="edit-input" value="${currentText.replace(/"/g, '&quot;')}" id="edit-input-${messageId}">
        <div class="edit-actions">
            <button class="edit-save" onclick="saveEdit('${messageId}')">저장</button>
            <button class="edit-cancel" onclick="cancelEdit('${messageId}')">취소</button>
        </div>
    `;
    
    messageContent.innerHTML = '';
    messageContent.appendChild(editContainer);
    
    const input = document.getElementById(`edit-input-${messageId}`);
    input.focus();
    input.select();
}

// 수정 저장
function saveEdit(messageId) {
    const input = document.getElementById(`edit-input-${messageId}`);
    const newText = input.value.trim();
    
    if (newText) {
        socket.emit('editMessage', { messageId, newText });
    }
    
    cancelEdit(messageId);
}

// 수정 취소
function cancelEdit(messageId) {
    editingMessageId = null;
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (messageElement) {
        messageElement.classList.remove('editing-message');
        const messageContent = messageElement.querySelector('.message-content');
        
        // 원본 내용 복원
        if (messageElement.dataset.originalContent) {
            messageContent.innerHTML = messageElement.dataset.originalContent;
        }
    }
}

// 메시지 추가 (개선)
function addMessage(message, isUser = false, isSystem = false, isAdmin = false, isKick = false, messageId = null, isEdited = false) {
    console.log('addMessage 호출됨:', {
        message,
        isUser,
        isSystem,
        isAdmin,
        isKick,
        messageId,
        isEdited
    });
    
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) {
        console.error('messages 컨테이너를 찾을 수 없습니다!');
        return;
    }
    
    const messageElement = document.createElement('div');
    
    messageElement.classList.add('message');
    if (messageId) {
        messageElement.setAttribute('data-message-id', messageId);
    }
    
    // 이모지만 있는 메시지인지 확인
    const isEmojiOnlyMessage = !isSystem && !isAdmin && !isKick && isEmojiOnly(message);
    console.log('이모지 전용 메시지인가?', isEmojiOnlyMessage);
    
    if (isEmojiOnlyMessage) {
        messageElement.classList.add('emoji-only-message');
        if (isUser) {
            messageElement.style.alignSelf = 'flex-end';
        } else {
            messageElement.style.alignSelf = 'flex-start';
        }
        
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        messageContent.textContent = message;
        messageElement.appendChild(messageContent);
        
        // 시간 정보 추가
        const timeInfo = document.createElement('div');
        timeInfo.classList.add('message-info');
        timeInfo.textContent = formatTime(new Date());
        messageElement.appendChild(timeInfo);
        
        // 이모지 애니메이션 효과
        const rect = messagesContainer.getBoundingClientRect();
        const randomX = rect.left + Math.random() * rect.width;
        const randomY = rect.top + Math.random() * rect.height;
        createFlyingEmoji(message, randomX, randomY);
        
    } else if (isKick) {
        messageElement.classList.add('kick-message');
        messageElement.innerHTML = message;
    } else if (isAdmin) {
        messageElement.classList.add('admin-message');
        messageElement.innerHTML = message;
    } else if (isSystem) {
        messageElement.classList.add('system-message');
        messageElement.innerHTML = message;
    } else if (isUser) {
        messageElement.classList.add('user-message');
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        messageContent.innerHTML = message + (isEdited ? ' <span style="opacity: 0.7; font-size: 10px;">(수정됨)</span>' : '');
        messageElement.appendChild(messageContent);
        
        // 본인 메시지에 삭제/수정 버튼 추가
        if (messageId) {
            const actions = document.createElement('div');
            actions.classList.add('message-actions');
            actions.innerHTML = `
                <button class="action-btn" onclick="editMessage('${messageId}', '${message.replace(/'/g, '\\\'')}')" title="수정">✏️</button>
                <button class="action-btn" onclick="deleteMessage('${messageId}')" title="삭제">🗑️</button>
            `;
            messageElement.appendChild(actions);
        }
        
        // 시간 정보 추가
        const timeInfo = document.createElement('div');
        timeInfo.classList.add('message-info');
        timeInfo.textContent = formatTime(new Date());
        messageElement.appendChild(timeInfo);
    } else {
        messageElement.classList.add('other-message');
        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        messageContent.innerHTML = message + (isEdited ? ' <span style="opacity: 0.7; font-size: 10px;">(수정됨)</span>' : '');
        messageElement.appendChild(messageContent);
    }
    
    console.log('메시지 요소 생성 완료, DOM에 추가 중...');
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    console.log('메시지 DOM에 추가 완료');
}

// 메시지 전송 (개선)
function sendMessage() {
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    
    console.log('sendMessage 호출됨, 메시지:', message);
    
    if (message) {
        // 관리자 명령어 처리
        if (isAdmin) {
            if (message.startsWith('/정지 ')) {
                const parts = message.split(' ');
                if (parts.length >= 3) {
                    const targetUsername = parts[1];
                    const duration = parseInt(parts[2]);
                    if (!isNaN(duration)) {
                        console.log('정지 명령어 전송:', targetUsername, duration);
                        socket.emit('suspendUser', { targetUsername, duration });
                        messageInput.value = '';
                        return;
                    }
                }
            }
            if (message.startsWith('/강퇴 ')) {
                const parts = message.split(' ');
                if (parts.length >= 2) {
                    const targetUsername = parts[1];
                    console.log('강퇴 명령어 전송:', targetUsername);
                    socket.emit('kickUser', { targetUsername });
                    messageInput.value = '';
                    return;
                }
            }
        }
        
        // 메시지 ID 생성
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('일반 메시지 전송 준비:', {
            text: message,
            messageId: messageId,
            username: username
        });
        
        socket.emit('sendMessage', {
            text: message,
            messageId: messageId
        });
        
        console.log('socket.emit sendMessage 완료');
        messageInput.value = '';
    } else {
        console.log('빈 메시지라서 전송하지 않음');
    }
}

// 사용자 목록 업데이트
function updateOnlineUsersList() {
    const usersListElement = document.getElementById('users-list');
    usersListElement.innerHTML = '';
    
    for (const userId in onlineUsers) {
        const user = onlineUsers[userId];
        const userElement = document.createElement('div');
        userElement.classList.add('user-item');
        userElement.innerHTML = `
            <div class="user-info">
                <div class="user-color" style="background-color: ${user.color}"></div>
                <div class="user-name">
                    ${user.username}${user.id === socket.id ? ' (나)' : ''}
                    ${user.isAdmin ? '<span class="admin-badge">관리자</span>' : ''}
                </div>
            </div>
        `;
        usersListElement.appendChild(userElement);
    }
}

// 게임 선택 모달 표시
function showGameSelection() {
    document.getElementById('game-selection-modal').style.display = 'flex';
}

// 게임 선택 모달 숨기기
function hideGameSelection() {
    document.getElementById('game-selection-modal').style.display = 'none';
}

// 레이싱 게임 시작
function startRacingGame() {
    hideGameSelection();
    gameActive = true;
    score = 0;
    currentLane = 1;
    obstacles = [];
    gameSpeed = 2000;
    obstacleSpeed = 3;
    
    document.getElementById('game-container').style.display = 'flex';
    gameArea = document.getElementById('game-area');
    player = document.getElementById('player');
    
    // 플레이어 초기 위치 설정
    updatePlayerPosition();
    
    // 게임 루프 시작
    gameInterval = setInterval(updateGame, 16); // 60fps
    
    // 장애물 생성 시작
    createObstacles();
    obstacleInterval = setInterval(createObstacles, gameSpeed);
}

// 레이싱 게임 종료
function endRacingGame() {
    gameActive = false;
    clearInterval(gameInterval);
    clearInterval(obstacleInterval);
    
    // 모든 장애물 제거
    obstacles.forEach(obstacle => obstacle.element.remove());
    obstacles = [];
    
    document.getElementById('game-container').style.display = 'none';
    
    // 게임 결과 채팅에 전송
    if (score > 0) {
        socket.emit('sendMessage', {
            text: `🎮 레이싱 게임 결과: ${score}점! 장애물을 ${score}개 피했어요!`,
            messageId: `game_${Date.now()}`
        });
    }
}

// PvP 게임 요청 (사용자 선택 방식)
function requestPvPGame() {
    hideGameSelection();
    
    // 온라인 사용자 목록 표시 (자신 제외)
    const availableUsers = [];
    for (const userId in onlineUsers) {
        if (userId !== socket.id && onlineUsers[userId].username !== username) {
            availableUsers.push(onlineUsers[userId]);
        }
    }
    
    if (availableUsers.length === 0) {
        alert('대전할 수 있는 다른 사용자가 없습니다.');
        return;
    }
    
    // 사용자 선택 다이얼로그
    let userList = '대전할 상대를 선택하세요:\n\n';
    availableUsers.forEach((user, index) => {
        userList += `${index + 1}. ${user.username}\n`;
    });
    
    const choice = prompt(userList + '\n번호를 입력하세요:');
    const choiceNum = parseInt(choice);
    
    if (choiceNum && choiceNum >= 1 && choiceNum <= availableUsers.length) {
        const targetUser = availableUsers[choiceNum - 1];
        socket.emit('sendPvPRequest', { targetUsername: targetUser.username });
        alert(`${targetUser.username}님에게 대전 신청을 보냈습니다. 응답을 기다려주세요.`);
    }
}

// PvP 게임 초기화
function initPvPGame(gameData) {
    pvpGameActive = true;
    pvpGameId = gameData.gameId;
    isPlayer1 = gameData.isPlayer1;
    gameStarted = false;
    
    // UI 업데이트
    document.getElementById('player1-name').textContent = gameData.player1.username;
    document.getElementById('player2-name').textContent = gameData.player2.username;
    
    // 체력 초기화
    player1Health = 3;
    player2Health = 3;
    updateHealthBars();
    
    // 플레이어 위치 초기화
    pvpBattlefield = document.getElementById('pvp-battlefield');
    pvpPlayer1 = document.getElementById('pvp-player1');
    pvpPlayer2 = document.getElementById('pvp-player2');
    
    // 대기 메시지 숨기기
    document.getElementById('waiting-message').style.display = 'none';
    
    // 플레이어 표시
    pvpPlayer1.style.display = 'block';
    pvpPlayer2.style.display = 'block';
    
    // 초기 위치 설정
    if (isPlayer1) {
        myPosition = { x: 100, y: 100 };
        opponentPosition = { x: 600, y: 400 };
    } else {
        myPosition = { x: 600, y: 400 };
        opponentPosition = { x: 100, y: 100 };
    }
    
    updatePvPPlayerPositions();
    
    // 카운트다운 시작
    startCountdown();
}

// 카운트다운 시작
function startCountdown() {
    countdownActive = true;
    let count = 3;
    
    const waitingDiv = document.getElementById('waiting-message');
    waitingDiv.style.display = 'block';
    
    const countdownInterval = setInterval(() => {
        if (count > 0) {
            waitingDiv.innerHTML = `<div class="countdown">${count}</div><div>게임 시작까지...</div>`;
            count--;
        } else {
            waitingDiv.innerHTML = '<div class="countdown">START!</div>';
            setTimeout(() => {
                waitingDiv.style.display = 'none';
                gameStarted = true;
                countdownActive = false;
            }, 1000);
            clearInterval(countdownInterval);
        }
    }, 1000);
}

// PvP 플레이어 위치 업데이트
function updatePvPPlayerPositions() {
    if (!pvpPlayer1 || !pvpPlayer2) return;
    
    // 내 플레이어 위치 업데이트
    if (isPlayer1) {
        pvpPlayer1.style.left = myPosition.x + 'px';
        pvpPlayer1.style.top = myPosition.y + 'px';
        pvpPlayer1.className = `pvp-player player1 facing-${myDirection}`;
        
        pvpPlayer2.style.left = opponentPosition.x + 'px';
        pvpPlayer2.style.top = opponentPosition.y + 'px';
        pvpPlayer2.className = `pvp-player player2 facing-${opponentDirection}`;
    } else {
        pvpPlayer2.style.left = myPosition.x + 'px';
        pvpPlayer2.style.top = myPosition.y + 'px';
        pvpPlayer2.className = `pvp-player player2 facing-${myDirection}`;
        
        pvpPlayer1.style.left = opponentPosition.x + 'px';
        pvpPlayer1.style.top = opponentPosition.y + 'px';
        pvpPlayer1.className = `pvp-player player1 facing-${opponentDirection}`;
    }
}

// 체력바 업데이트
function updateHealthBars() {
    const player1HealthBar = document.getElementById('player1-health');
    const player2HealthBar = document.getElementById('player2-health');
    
    player1HealthBar.style.width = (player1Health / 3 * 100) + '%';
    player2HealthBar.style.width = (player2Health / 3 * 100) + '%';
}

// 총알 발사
function shootBullet() {
    if (!gameStarted || !pvpGameActive) return;
    
    socket.emit('pvpShoot', {
        gameId: pvpGameId,
        position: myPosition,
        direction: myDirection
    });
}

// 총알 생성
function createBullet(position, direction, isMyBullet = false) {
    const bullet = document.createElement('div');
    bullet.classList.add('bullet');
    bullet.style.left = position.x + 15 + 'px'; // 플레이어 중앙에서 시작
    bullet.style.top = position.y + 15 + 'px';
    
    if (isMyBullet) {
        bullet.style.background = '#00ff00'; // 내 총알은 초록색
    }
    
    pvpBattlefield.appendChild(bullet);
    
    // 총알 이동
    const speed = 5;
    let dx = 0, dy = 0;
    
    switch (direction) {
        case 'up': dy = -speed; break;
        case 'down': dy = speed; break;
        case 'left': dx = -speed; break;
        case 'right': dx = speed; break;
    }
    
    const moveBullet = () => {
        const currentX = parseInt(bullet.style.left);
        const currentY = parseInt(bullet.style.top);
        
        bullet.style.left = (currentX + dx) + 'px';
        bullet.style.top = (currentY + dy) + 'px';
        
        // 경계 체크
        if (currentX < 0 || currentX > 760 || currentY < 0 || currentY > 520) {
            bullet.remove();
            return;
        }
        
        requestAnimationFrame(moveBullet);
    };
    
    moveBullet();
    
    // 5초 후 자동 제거
    setTimeout(() => {
        if (bullet.parentNode) {
            bullet.remove();
        }
    }, 5000);
}

// PvP 게임 종료
function endPvPGame(winner = null) {
    pvpGameActive = false;
    gameStarted = false;
    countdownActive = false;
    
    // 모든 총알 제거
    const bullets = document.querySelectorAll('.bullet');
    bullets.forEach(bullet => bullet.remove());
    
    if (winner) {
        const gameOverScreen = document.getElementById('game-over-screen');
        const gameOverText = document.getElementById('game-over-text');
        
        if (winner === username) {
            gameOverText.textContent = '승리!';
            gameOverText.className = 'game-over-text game-over-winner';
        } else {
            gameOverText.textContent = '패배!';
            gameOverText.className = 'game-over-text game-over-loser';
        }
        
        gameOverScreen.style.display = 'flex';
        
        // 3초 후 게임 종료
        setTimeout(() => {
            document.getElementById('pvp-game-container').style.display = 'none';
            gameOverScreen.style.display = 'none';
        }, 3000);
        
        // 결과 채팅에 전송
        socket.emit('sendMessage', {
            text: `⚔️ PvP 게임 결과: ${winner}님이 승리했습니다!`,
            messageId: `pvp_${Date.now()}`
        });
    } else {
        document.getElementById('pvp-game-container').style.display = 'none';
    }
    
    // 변수 초기화
    pvpGameId = null;
    isPlayer1 = false;
    player1Health = 3;
    player2Health = 3;
    pvpKeys = {};
}

// 플레이어 초기 위치 설정 (레이싱 게임)
function updatePlayerPosition() {
    const lanes = document.querySelectorAll('.game-lane');
    const lane = lanes[currentLane];
    const laneRect = lane.getBoundingClientRect();
    const gameRect = gameArea.getBoundingClientRect();
    
    const laneCenter = (laneRect.left - gameRect.left) + (laneRect.width / 2);
    player.style.left = laneCenter + 'px';
}

// 장애물 생성 (레이싱 게임)
function createObstacles() {
    if (!gameActive) return;
    
    // 3개 레인 중 2개에 장애물 생성 (1개는 비워둠)
    const lanes = [0, 1, 2];
    const safeLane = Math.floor(Math.random() * 3); // 안전한 레인
    
    lanes.forEach(laneIndex => {
        if (laneIndex !== safeLane) {
            createObstacle(laneIndex);
        }
    });
    
    // 점수 증가
    score++;
    document.getElementById('game-score').textContent = score;
    
    // 게임 속도 증가 (점수가 높을수록 빨라짐)
    if (score % 5 === 0) {
        gameSpeed = Math.max(800, gameSpeed - 100); // 최소 0.8초까지
        obstacleSpeed += 0.5; // 장애물 이동 속도도 증가
        
        clearInterval(obstacleInterval);
        obstacleInterval = setInterval(createObstacles, gameSpeed);
    }
}

// 개별 장애물 생성 (레이싱 게임)
function createObstacle(laneIndex) {
    const lanes = document.querySelectorAll('.game-lane');
    const lane = lanes[laneIndex];
    
    const obstacle = document.createElement('div');
    obstacle.classList.add('obstacle');
    obstacle.style.animationDuration = `${3 / obstacleSpeed}s`; // 속도에 따른 애니메이션 조정
    
    lane.appendChild(obstacle);
    
    obstacles.push({
        element: obstacle,
        lane: laneIndex,
        y: -50
    });
    
    // 장애물이 화면을 벗어나면 제거
    setTimeout(() => {
        if (obstacle.parentNode) {
            obstacle.remove();
            obstacles = obstacles.filter(obs => obs.element !== obstacle);
        }
    }, (3 / obstacleSpeed) * 1000 + 100);
}

// 레이싱 게임 업데이트
function updateGame() {
    if (!gameActive) return;
    
    // 충돌 검사
    obstacles.forEach(obstacle => {
        const obstacleRect = obstacle.element.getBoundingClientRect();
        const playerRect = player.getBoundingClientRect();
        
        // 충돌 검사 (같은 레인에 있고 Y 위치가 겹치는 경우)
        if (obstacle.lane === currentLane) {
            if (obstacleRect.bottom > playerRect.top && 
                obstacleRect.top < playerRect.bottom) {
                // 충돌 발생!
                endRacingGame();
                return;
            }
        }
    });
}

// 이벤트 리스너들
document.addEventListener('DOMContentLoaded', () => {
    // 사용자 이름 입력
    document.getElementById('username-submit').addEventListener('click', () => {
        const usernameInput = document.getElementById('username-input');
        username = usernameInput.value.trim();
        
        if (username) {
            userColor = getRandomColor();
            isAdmin = (username === ADMIN_USERNAME);
            document.getElementById('username-modal').style.display = 'none';
            
            socket.emit('join', {
                username: username,
                color: userColor,
                isAdmin: isAdmin
            });
        }
    });
    
    // 메시지 입력
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    document.getElementById('send-button').addEventListener('click', sendMessage);
    
    // 사용자 목록 토글
    document.getElementById('users-toggle').addEventListener('click', () => {
        const panel = document.getElementById('users-panel');
        const icon = document.querySelector('.toggle-icon');
        panel.classList.toggle('active');
        icon.classList.toggle('active');
    });
    
    // 이모지 버튼
    document.getElementById('emoji-button').addEventListener('click', () => {
        const picker = document.getElementById('emoji-picker');
        picker.classList.toggle('active');
    });
    
    // 이모지 선택
    document.querySelectorAll('.emoji-item').forEach(button => {
        button.addEventListener('click', () => {
            const emoji = button.textContent;
            const messageInput = document.getElementById('message-input');
            messageInput.value += emoji;
            messageInput.focus();
            document.getElementById('emoji-picker').classList.remove('active');
        });
    });
    
    // 게임 버튼 - 게임 선택 모달 표시
    document.getElementById('game-button').addEventListener('click', showGameSelection);
    
    // 게임 선택 모달 관련
    document.getElementById('close-game-selection').addEventListener('click', hideGameSelection);
    document.getElementById('racing-game-option').addEventListener('click', startRacingGame);
    document.getElementById('pvp-game-option').addEventListener('click', requestPvPGame);
    
    // 레이싱 게임 닫기
    document.getElementById('game-close').addEventListener('click', endRacingGame);
    
    // PvP 게임 닫기
    document.getElementById('pvp-close').addEventListener('click', () => {
        if (pvpGameActive) {
            socket.emit('leavePvPGame', { gameId: pvpGameId });
        }
        endPvPGame();
    });
    
    // PvP 대전 신청 관련
    document.getElementById('pvp-accept').addEventListener('click', () => {
        socket.emit('acceptPvPRequest');
        document.getElementById('pvp-request-modal').style.display = 'none';
    });
    
    document.getElementById('pvp-decline').addEventListener('click', () => {
        socket.emit('declinePvPRequest');
        document.getElementById('pvp-request-modal').style.display = 'none';
    });
    
    // 이모지 선택기 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('emoji-picker');
        const button = document.getElementById('emoji-button');
        
        if (!picker.contains(e.target) && !button.contains(e.target)) {
            picker.classList.remove('active');
        }
    });
    
    // 이미지 오버레이 클릭 시 닫기
    document.getElementById('image-overlay').addEventListener('click', hideImageOverlay);
    
    // 클립보드에서 이미지 붙여넣기 감지
    document.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                await sendImage(file);
                break;
            }
        }
    });
    
    // 드래그 앤 드롭 이미지 업로드
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    document.addEventListener('drop', async (e) => {
        e.preventDefault();
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                await sendImage(file);
            }
        }
    });
});

// 키보드 이벤트
document.addEventListener('keydown', (e) => {
    // 레이싱 게임 키보드 조작
    if (gameActive && !pvpGameActive) {
        switch(e.code) {
            case 'ArrowLeft':
                e.preventDefault();
                if (currentLane > 0) {
                    currentLane--;
                    updatePlayerPosition();
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (currentLane < 2) {
                    currentLane++;
                    updatePlayerPosition();
                }
                break;
            case 'KeyA':
                e.preventDefault();
                if (currentLane > 0) {
                    currentLane--;
                    updatePlayerPosition();
                }
                break;
            case 'KeyD':
                e.preventDefault();
                if (currentLane < 2) {
                    currentLane++;
                    updatePlayerPosition();
                }
                break;
        }
    }
    
    // PvP 게임 키보드 조작
    if (pvpGameActive && gameStarted && !countdownActive) {
        const currentTime = Date.now();
        if (currentTime - lastMoveTime < 16) return; // 60fps 제한
        
        pvpKeys[e.code] = true;
        
        // 이동 처리 (속도 증가)
        const speed = 8; // 3에서 8로 증가
        let moved = false;
        let newDirection = myDirection;
        
        // 대각선 이동을 위한 방향 계산
        let vertical = '';
        let horizontal = '';
        
        if (pvpKeys['KeyW'] || pvpKeys['ArrowUp']) {
            if (myPosition.y > 0) {
                myPosition.y -= speed;
                vertical = 'up';
                moved = true;
            }
        }
        if (pvpKeys['KeyS'] || pvpKeys['ArrowDown']) {
            if (myPosition.y < 490) {
                myPosition.y += speed;
                vertical = 'down';
                moved = true;
            }
        }
        if (pvpKeys['KeyA'] || pvpKeys['ArrowLeft']) {
            if (myPosition.x > 0) {
                myPosition.x -= speed;
                horizontal = 'left';
                moved = true;
            }
        }
        if (pvpKeys['KeyD'] || pvpKeys['ArrowRight']) {
            if (myPosition.x < 730) {
                myPosition.x += speed;
                horizontal = 'right';
                moved = true;
            }
        }
        
        // 대각선 방향 설정
        if (vertical && horizontal) {
            newDirection = vertical + '-' + horizontal;
        } else if (vertical) {
            newDirection = vertical;
        } else if (horizontal) {
            newDirection = horizontal;
        }
        
        // 방향이 바뀌었으면 업데이트
        if (newDirection !== myDirection) {
            myDirection = newDirection;
            moved = true;
        }
        
        // 스페이스바로 총알 발사
        if (e.code === 'Space') {
            e.preventDefault();
            shootBullet();
        }
        
        // 위치나 방향이 변경되었으면 서버에 전송
        if (moved) {
            lastMoveTime = currentTime;
            updatePvPPlayerPositions();
            socket.emit('pvpMove', {
                gameId: pvpGameId,
                position: myPosition,
                direction: myDirection
            });
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (pvpGameActive) {
        pvpKeys[e.code] = false;
    }
});

// 소켓 이벤트들
socket.on('userJoined', (data) => {
    console.log('userJoined 이벤트 수신:', data);
    addMessage(`${data.username}님이 입장했습니다.`, false, true);
    document.getElementById('user-count').textContent = data.userCount;
    onlineUsers[data.id] = data;
    updateOnlineUsersList();
});

socket.on('userLeft', (data) => {
    console.log('userLeft 이벤트 수신:', data);
    addMessage(`${data.username}님이 퇴장했습니다.`, false, true);
    document.getElementById('user-count').textContent = data.userCount;
    for (const userId in onlineUsers) {
        if (onlineUsers[userId].username === data.username) {
            delete onlineUsers[userId];
            break;
        }
    }
    updateOnlineUsersList();
});

socket.on('newMessage', (data) => {
    console.log('newMessage 이벤트 수신:', data);
    const isMyMessage = data.sender === username;
    console.log('내 메시지인가?', isMyMessage, '발신자:', data.sender, '내 이름:', username);
    
    if (isMyMessage) {
        console.log('내 메시지로 표시');
        addMessage(data.text, true, false, false, false, data.messageId, data.isEdited);
    } else {
        console.log('다른 사용자 메시지로 표시');
        const messageWithSender = `<strong style="color: ${data.color}">${data.sender}</strong>: ${data.text}`;
        addMessage(messageWithSender, false, false, false, false, data.messageId, data.isEdited);
    }
});

// 이미지 메시지 수신
socket.on('newImage', (data) => {
    console.log('newImage 이벤트 수신:', data);
    const isMyMessage = data.sender === username;
    addImageMessage(data.imageData, isMyMessage, data.sender, data.color, data.timestamp);
});

// 메시지 삭제 이벤트
socket.on('messageDeleted', (data) => {
    console.log('messageDeleted 이벤트 수신:', data);
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        messageElement.classList.add('deleted-message');
        const content = messageElement.querySelector('.message-content');
        if (content) {
            content.innerHTML = '<em>삭제된 메시지입니다</em>';
        }
        const actions = messageElement.querySelector('.message-actions');
        if (actions) {
            actions.remove();
        }
    }
});

// 메시지 수정 이벤트
socket.on('messageEdited', (data) => {
    console.log('messageEdited 이벤트 수신:', data);
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        const content = messageElement.querySelector('.message-content');
        if (content) {
            content.innerHTML = data.newText + ' <span style="opacity: 0.7; font-size: 10px;">(수정됨)</span>';
        }
    }
});

// PvP 게임 관련 소켓 이벤트들
socket.on('pvpRequestReceived', (data) => {
    console.log('PvP 대전 신청 받음:', data);
    document.getElementById('challenger-name').textContent = data.challengerName;
    document.getElementById('pvp-request-modal').style.display = 'flex';
});

socket.on('pvpRequestAccepted', (gameData) => {
    console.log('PvP 대전 신청 수락됨:', gameData);
    initPvPGame(gameData);
});

socket.on('pvpRequestDeclined', (data) => {
    console.log('PvP 대전 신청 거절됨:', data);
    alert(`${data.targetName}님이 대전 신청을 거절했습니다.`);
});

socket.on('pvpGameCreated', (gameData) => {
    console.log('PvP 게임 생성됨:', gameData);
    initPvPGame(gameData);
});

socket.on('pvpGameJoined', (gameData) => {
    console.log('PvP 게임 참가됨:', gameData);
    initPvPGame(gameData);
});

socket.on('pvpPlayerMove', (data) => {
    if (data.playerId !== socket.id) {
        opponentPosition = data.position;
        opponentDirection = data.direction;
        updatePvPPlayerPositions();
    }
});

socket.on('pvpPlayerShoot', (data) => {
    console.log('상대방 총알 발사:', data);
    createBullet(data.position, data.direction, data.playerId === socket.id);
});

socket.on('pvpPlayerHit', (data) => {
    console.log('플레이어 피격:', data);
    
    if (data.isPlayer1) {
        player1Health = data.health;
    } else {
        player2Health = data.health;
    }
    
    updateHealthBars();
    
    // 체력이 0이 되면 게임 종료
    if (data.health <= 0) {
        endPvPGame(data.winner);
    }
});

socket.on('pvpGameEnded', (data) => {
    console.log('PvP 게임 종료:', data);
    endPvPGame(data.winner);
});

socket.on('pvpGameError', (data) => {
    console.log('PvP 게임 오류:', data);
    alert(data.message);
    endPvPGame();
});

socket.on('connect', () => {
    console.log('서버에 연결됨, 소켓 ID:', socket.id);
    addMessage('서버에 연결되었습니다.', false, true);
    socket.emit('getActiveUsers');
});

socket.on('disconnect', () => {
    console.log('서버 연결 끊어짐');
    addMessage('서버와의 연결이 끊어졌습니다. 재연결 중...', false, true);
});

socket.on('activeUsers', (users) => {
    console.log('activeUsers 이벤트 수신:', users);
    for (const userId in users) {
        onlineUsers[userId] = users[userId];
    }
    updateOnlineUsersList();
});

socket.on('joinError', (data) => {
    console.log('joinError 이벤트 수신:', data);
    alert(data.message);
    document.getElementById('username-modal').style.display = 'flex';
    document.getElementById('username-input').focus();
});

// 관리자 기능 소켓 이벤트들
socket.on('userSuspended', (data) => {
    addMessage(`${data.adminUsername}님이 ${data.username}님을 ${data.duration}초 동안 정지했습니다.`, false, false, true);
});

socket.on('userKicked', (data) => {
    addMessage(`${data.adminUsername}님이 ${data.username}님을 강퇴했습니다.`, false, false, false, true);
});

socket.on('kicked', (data) => {
    addMessage(`${data.adminUsername}님에 의해 강퇴되었습니다.`, false, false, false, true);
    document.getElementById('message-input').disabled = true;
    document.getElementById('send-button').disabled = true;
});

window.onload = () => {
    document.getElementById('username-input').focus();
};
