const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Express 앱 생성
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 정적 파일 제공 (public 폴더)
app.use(express.static(path.join(__dirname, 'public')));

// 루트 경로에서 index.html 제공
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  console.log('Looking for index.html at:', indexPath);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('파일을 찾을 수 없습니다.');
    }
  });
});

// JavaScript 파일 직접 서빙
app.get('/script.js', (req, res) => {
  const jsPath = path.join(__dirname, 'public', 'script.js');
  console.log('Looking for script.js at:', jsPath);
  res.sendFile(jsPath, (err) => {
    if (err) {
      console.error('Error serving script.js:', err);
      res.status(404).send('JavaScript 파일을 찾을 수 없습니다.');
    }
  });
});

// 디버깅을 위한 파일 시스템 확인
const fs = require('fs');
console.log('Current directory:', __dirname);
console.log('Files in root:', fs.readdirSync(__dirname));
if (fs.existsSync(path.join(__dirname, 'public'))) {
  console.log('Files in public:', fs.readdirSync(path.join(__dirname, 'public')));
} else {
  console.log('Public directory does not exist!');
}

// 활성 사용자 저장 객체
const activeUsers = {};
const userMessages = {}; // 사용자별 메시지 저장

// PvP 게임 관련 저장소
const pvpGames = {}; // 진행 중인 PvP 게임들
const pvpRequests = {}; // 대전 신청들 { requestId: { challenger, target, timestamp } }
let gameIdCounter = 1;
let requestIdCounter = 1;

// PvP 게임 클래스
class PvPGame {
  constructor(player1, player2) {
    this.id = `pvp_${gameIdCounter++}`;
    this.player1 = {
      id: player1.id,
      username: player1.username,
      position: { x: 100, y: 100 },
      direction: 'up',
      health: 3
    };
    this.player2 = {
      id: player2.id,
      username: player2.username,
      position: { x: 600, y: 400 },
      direction: 'up',
      health: 3
    };
    this.bullets = [];
    this.gameStarted = false;
    this.gameEnded = false;
  }

  // 플레이어 이동
  movePlayer(playerId, position, direction) {
    if (this.gameEnded) return;
    
    if (this.player1.id === playerId) {
      this.player1.position = position;
      this.player1.direction = direction;
    } else if (this.player2.id === playerId) {
      this.player2.position = position;
      this.player2.direction = direction;
    }
  }

  // 총알 발사
  shootBullet(playerId, position, direction) {
    if (this.gameEnded) return;
    
    const bullet = {
      id: `bullet_${Date.now()}_${Math.random()}`,
      playerId: playerId,
      position: { x: position.x + 15, y: position.y + 15 },
      direction: direction,
      speed: 5
    };
    
    this.bullets.push(bullet);
    
    // 총알 이동 시뮬레이션 (서버에서 충돌 검사)
    this.moveBullet(bullet);
  }

  // 총알 이동 및 충돌 검사
  moveBullet(bullet) {
    const moveInterval = setInterval(() => {
      if (this.gameEnded) {
        clearInterval(moveInterval);
        return;
      }
      
      // 총알 이동 (대각선 지원)
      const directions = bullet.direction.split('-');
      const speed = bullet.speed;
      
      directions.forEach(dir => {
        switch (dir) {
          case 'up': bullet.position.y -= speed; break;
          case 'down': bullet.position.y += speed; break;
          case 'left': bullet.position.x -= speed; break;
          case 'right': bullet.position.x += speed; break;
        }
      });
      
      // 경계 체크
      if (bullet.position.x < 0 || bullet.position.x > 760 || 
          bullet.position.y < 0 || bullet.position.y > 520) {
        this.removeBullet(bullet.id);
        clearInterval(moveInterval);
        return;
      }
      
      // 충돌 검사
      this.checkBulletCollisions(bullet);
      
    }, 16); // 60fps
    
    // 3초 후 총알 제거 (범위 감소)
    setTimeout(() => {
      this.removeBullet(bullet.id);
      clearInterval(moveInterval);
    }, 3000);
  }

  // 총알과 플레이어 충돌 검사
  checkBulletCollisions(bullet) {
    const hitRadius = 25; // 충돌 반경 증가
    
    // 자신의 총알로는 자신을 맞힐 수 없음
    const targetPlayer = bullet.playerId === this.player1.id ? this.player2 : this.player1;
    
    const distance = Math.sqrt(
      Math.pow(bullet.position.x - (targetPlayer.position.x + 15), 2) +
      Math.pow(bullet.position.y - (targetPlayer.position.y + 15), 2)
    );
    
    if (distance < hitRadius) {
      // 충돌 발생!
      targetPlayer.health--;
      this.removeBullet(bullet.id);
      
      console.log(`플레이어 피격! ${targetPlayer.username} 체력: ${targetPlayer.health}`);
      
      // 피격 이벤트 전송
      io.to(this.player1.id).emit('pvpPlayerHit', {
        isPlayer1: targetPlayer.id === this.player1.id,
        health: targetPlayer.health,
        winner: targetPlayer.health <= 0 ? (targetPlayer.id === this.player1.id ? this.player2.username : this.player1.username) : null
      });
      
      io.to(this.player2.id).emit('pvpPlayerHit', {
        isPlayer1: targetPlayer.id === this.player1.id,
        health: targetPlayer.health,
        winner: targetPlayer.health <= 0 ? (targetPlayer.id === this.player1.id ? this.player2.username : this.player1.username) : null
      });
      
      // 게임 종료 체크
      if (targetPlayer.health <= 0) {
        this.endGame(targetPlayer.id === this.player1.id ? this.player2.username : this.player1.username);
      }
    }
  }

  // 총알 제거
  removeBullet(bulletId) {
    this.bullets = this.bullets.filter(b => b.id !== bulletId);
  }

  // 게임 종료
  endGame(winner) {
    if (this.gameEnded) return;
    
    this.gameEnded = true;
    
    // 게임 종료 이벤트 전송
    io.to(this.player1.id).emit('pvpGameEnded', { winner });
    io.to(this.player2.id).emit('pvpGameEnded', { winner });
    
    // 게임 정리
    delete pvpGames[this.id];
    
    console.log(`PvP 게임 ${this.id} 종료. 승자: ${winner}`);
  }
}

// Socket.IO 연결 처리
io.on('connection', (socket) => {
  console.log('사용자가 연결되었습니다:', socket.id);
  
  // 사용자 입장 처리
  socket.on('join', (userData) => {
    console.log('사용자 입장 시도:', userData.username);
    
    // 닉네임 검증: 공백 확인
    if (userData.username.includes(' ')) {
      socket.emit('joinError', {
        error: 'username_space',
        message: '닉네임에 공백을 포함할 수 없습니다.'
      });
      return;
    }
    
    // 닉네임 검증: 중복 확인
    let isDuplicate = false;
    for (const id in activeUsers) {
      if (activeUsers[id].username === userData.username) {
        isDuplicate = true;
        break;
      }
    }
    
    if (isDuplicate) {
      socket.emit('joinError', {
        error: 'username_taken',
        message: '이미 사용 중인 닉네임입니다. 다른 닉네임을 선택해주세요.'
      });
      return;
    }
    
    console.log('사용자 입장:', userData.username);
    
    // 사용자 정보 저장
    activeUsers[socket.id] = {
      username: userData.username,
      color: userData.color,
      isAdmin: userData.isAdmin || false,
      isSuspended: false
    };
    
    // 사용자별 메시지 저장소 초기화
    userMessages[socket.id] = [];
      
    // 입장 메시지 브로드캐스트
    io.emit('userJoined', {
      id: socket.id,
      username: userData.username,
      color: userData.color,
      isAdmin: userData.isAdmin || false,
      userCount: Object.keys(activeUsers).length
    });
    
    // 현재 활성 사용자 수 전송
    io.emit('updateUserCount', {
      userCount: Object.keys(activeUsers).length
    });
  });
  
  // 활성 사용자 목록 요청 처리
  socket.on('getActiveUsers', () => {
    socket.emit('activeUsers', activeUsers);
  });
  
  // 메시지 수신 및 브로드캐스트
  socket.on('sendMessage', (messageData) => {
    console.log('sendMessage 이벤트 수신:', messageData, '발신자 소켓 ID:', socket.id);
    
    const user = activeUsers[socket.id];
    console.log('발신자 정보:', user);
    
    if (user && !user.isSuspended) {
      console.log('메시지 처리 중...');
      
      // 멘션 처리
      const broadcastData = {
        sender: user.username,
        color: user.color,
        text: messageData.text,
        timestamp: Date.now(),
        messageId: messageData.messageId,
        isEdited: false
      };
      
      // 멘션이 포함된 경우 추가 정보 설정
      if (messageData.mentions && messageData.mentions.length > 0) {
        broadcastData.mentions = messageData.mentions;
        console.log('멘션 포함:', messageData.mentions);
      }
      
      // 메시지 저장
      if (!userMessages[socket.id]) {
        userMessages[socket.id] = [];
      }
      userMessages[socket.id].push({
        messageId: messageData.messageId,
        text: messageData.text,
        timestamp: Date.now()
      });
      
      console.log('브로드캐스트할 데이터:', broadcastData);
      console.log('현재 연결된 클라이언트 수:', Object.keys(activeUsers).length);
      
      // 모든 클라이언트에게 메시지 브로드캐스트
      io.emit('newMessage', broadcastData);
      console.log('newMessage 이벤트 브로드캐스트 완료');
    } else {
      if (!user) {
        console.log('사용자 정보를 찾을 수 없음. 소켓 ID:', socket.id);
        console.log('현재 활성 사용자들:', Object.keys(activeUsers));
      } else if (user.isSuspended) {
        console.log('정지된 사용자가 메시지를 보내려고 함:', user.username);
      }
    }
  });
  
  // 이미지 수신 및 브로드캐스트
  socket.on('sendImage', (imageData) => {
    const user = activeUsers[socket.id];
    
    if (user && !user.isSuspended) {
      // 이미지 브로드캐스트 데이터
      const broadcastData = {
        sender: user.username,
        color: user.color,
        imageData: imageData.imageData,
        fileName: imageData.fileName,
        timestamp: Date.now()
      };
      
      console.log(`${user.username}님이 이미지를 전송했습니다: ${imageData.fileName}`);
      
      // 모든 클라이언트에게 이미지 브로드캐스트
      io.emit('newImage', broadcastData);
    }
  });
  
  // 메시지 삭제 처리
  socket.on('deleteMessage', (data) => {
    const user = activeUsers[socket.id];
    
    if (user && userMessages[socket.id]) {
      // 사용자의 메시지인지 확인
      const messageIndex = userMessages[socket.id].findIndex(msg => msg.messageId === data.messageId);
      
      if (messageIndex !== -1) {
        // 메시지 삭제 표시
        userMessages[socket.id][messageIndex].deleted = true;
        
        // 모든 클라이언트에게 삭제 알림
        io.emit('messageDeleted', {
          messageId: data.messageId,
          deletedBy: user.username
        });
        
        console.log(`${user.username}님이 메시지를 삭제했습니다: ${data.messageId}`);
      }
    }
  });
  
  // 메시지 수정 처리
  socket.on('editMessage', (data) => {
    const user = activeUsers[socket.id];
    
    if (user && userMessages[socket.id]) {
      // 사용자의 메시지인지 확인
      const messageIndex = userMessages[socket.id].findIndex(msg => msg.messageId === data.messageId);
      
      if (messageIndex !== -1) {
        // 메시지 수정
        userMessages[socket.id][messageIndex].text = data.newText;
        userMessages[socket.id][messageIndex].edited = true;
        userMessages[socket.id][messageIndex].editedAt = Date.now();
        
        // 모든 클라이언트에게 수정 알림
        io.emit('messageEdited', {
          messageId: data.messageId,
          newText: data.newText,
          editedBy: user.username
        });
        
        console.log(`${user.username}님이 메시지를 수정했습니다: ${data.messageId}`);
      }
    }
  });

  // PvP 대전 신청 보내기
  socket.on('sendPvPRequest', (data) => {
    const challenger = activeUsers[socket.id];
    
    if (!challenger) return;
    
    // 대상 사용자 찾기
    let targetSocketId = null;
    for (const id in activeUsers) {
      if (activeUsers[id].username === data.targetUsername) {
        targetSocketId = id;
        break;
      }
    }
    
    if (!targetSocketId) {
      socket.emit('pvpGameError', { message: '대상 사용자를 찾을 수 없습니다.' });
      return;
    }
    
    // 이미 게임 중인지 확인
    for (const gameId in pvpGames) {
      const game = pvpGames[gameId];
      if (game.player1.id === socket.id || game.player2.id === socket.id ||
          game.player1.id === targetSocketId || game.player2.id === targetSocketId) {
        socket.emit('pvpGameError', { message: '이미 게임에 참여 중입니다.' });
        return;
      }
    }
    
    // 대전 신청 생성
    const requestId = `req_${requestIdCounter++}`;
    pvpRequests[requestId] = {
      challengerId: socket.id,
      challengerName: challenger.username,
      targetId: targetSocketId,
      targetName: activeUsers[targetSocketId].username,
      timestamp: Date.now()
    };
    
    // 대상에게 대전 신청 전송
    io.to(targetSocketId).emit('pvpRequestReceived', {
      requestId: requestId,
      challengerName: challenger.username
    });
    
    console.log(`${challenger.username}님이 ${activeUsers[targetSocketId].username}님에게 PvP 대전 신청`);
    
    // 30초 후 자동 만료
    setTimeout(() => {
      if (pvpRequests[requestId]) {
        delete pvpRequests[requestI
