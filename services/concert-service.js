const redisClient = require('../redis-client');

/**
 * 콘서트 생성
 * @param {string} roomId - 콘서트 방 ID
 * @param {object} concertData - 콘서트 정보 (studioUserId, studioName, concertName, songs, accessories, maxAudience, createdAt)
 * @returns {Promise<object>} - { roomId, expiresIn }
 */
async function createConcert(roomId, concertData) {
  const key = `concert:room:${roomId}:info`;

  // songs 배열이 없으면 빈 배열로 초기화
  if (!concertData.songs) {
    concertData.songs = [];
  }

  // accessories 배열이 없으면 빈 배열로 초기화
  if (!concertData.accessories) {
    concertData.accessories = [];
  }

  // 현재 재생 곡은 첫 번째 곡으로 설정 (없으면 null)
  concertData.currentSong = concertData.songs.length > 0 ? concertData.songs[0].songNum : null;

  // 콘서트 정보 저장 (2시간 TTL)
  await redisClient.setEx(key, 7200, JSON.stringify(concertData));

  // 활성 콘서트 목록에 추가 (sorted set, score는 생성 시간)
  await redisClient.zAdd('sessions:active', {
    score: Date.now(),
    value: roomId
  });

  return { roomId, expiresIn: 7200 };
}

/**
 * 콘서트 참가
 * @param {string} roomId - 콘서트 방 ID
 * @param {number} userId - 사용자 ID
 * @returns {Promise<object>} - { success: true }
 */
async function joinConcert(roomId, userId) {
  const sessionKey = `concert:room:${roomId}:info`;
  const sessionExists = await redisClient.exists(sessionKey);

  if (!sessionExists) {
    throw new Error('Concert not found or expired');
  }

  // 참가자 목록에 추가 (set 자료구조 사용)
  const audienceKey = `concert:room:${roomId}:audience`;
  await redisClient.sAdd(audienceKey, userId.toString());

  // 참가자 목록도 2시간 TTL 설정
  await redisClient.expire(audienceKey, 7200);

  return { success: true };
}

/**
 * 콘서트 접근 권한 확인
 * @param {string} roomId - 콘서트 방 ID
 * @param {number} userId - 사용자 ID
 * @returns {Promise<boolean>} - 접근 권한 여부
 */
async function verifyAccess(roomId, userId) {
  const audienceKey = `concert:room:${roomId}:audience`;
  return await redisClient.sIsMember(audienceKey, userId.toString());
}

/**
 * 콘서트 정보 조회
 * @param {string} roomId - 콘서트 방 ID
 * @returns {Promise<object>} - 콘서트 정보
 */
async function getConcertInfo(roomId) {
  const key = `concert:room:${roomId}:info`;
  const data = await redisClient.get(key);

  if (!data) {
    throw new Error('Concert not found');
  }

  return JSON.parse(data);
}

/**
 * 활성 콘서트 목록 조회 (최신 10개)
 * @returns {Promise<Array>} - 콘서트 목록
 */
async function getActiveConcerts() {
  // Redis 5.x 호환: 전체 가져와서 역순 정렬 후 slice
  const allRoomIds = await redisClient.zRange('sessions:active', 0, -1);
  const roomIds = allRoomIds.reverse().slice(0, 10);

  const concerts = await Promise.all(
    roomIds.map(async (roomId) => {
      const infoKey = `concert:room:${roomId}:info`;
      const audienceKey = `concert:room:${roomId}:audience`;

      const info = await redisClient.get(infoKey);
      const audienceCount = await redisClient.sCard(audienceKey);

      if (!info) {
        // 만료된 콘서트는 활성 목록에서 제거
        await redisClient.zRem('sessions:active', roomId);
        return null;
      }

      return {
        roomId,
        ...JSON.parse(info),
        currentAudience: audienceCount
      };
    })
  );

  // null 필터링 (만료된 콘서트 제외)
  return concerts.filter(c => c !== null);
}

/**
 * 콘서트에 노래 추가
 * @param {string} roomId - 콘서트 방 ID
 * @param {object} songData - 노래 정보 { songNum, audioId, streamUrl, stageDirectionId }
 * @returns {Promise<object>} - 업데이트된 콘서트 정보
 */
async function addSong(roomId, songData) {
  const key = `concert:room:${roomId}:info`;
  const data = await redisClient.get(key);

  if (!data) {
    throw new Error('Concert not found');
  }

  const concertInfo = JSON.parse(data);

  // songs 배열이 없으면 초기화
  if (!concertInfo.songs) {
    concertInfo.songs = [];
  }

  // 중복 songNum 체크
  const exists = concertInfo.songs.find(s => s.songNum === songData.songNum);
  if (exists) {
    throw new Error(`Song number ${songData.songNum} already exists`);
  }

  // 노래 추가
  concertInfo.songs.push(songData);

  // songNum 기준 정렬
  concertInfo.songs.sort((a, b) => a.songNum - b.songNum);

  // 첫 번째 곡이면 currentSong 설정
  if (concertInfo.songs.length === 1) {
    concertInfo.currentSong = songData.songNum;
  }

  // 업데이트된 정보 저장 (TTL 유지)
  const ttl = await redisClient.ttl(key);
  await redisClient.setEx(key, ttl > 0 ? ttl : 7200, JSON.stringify(concertInfo));

  return concertInfo;
}

/**
 * 콘서트에서 노래 삭제
 * @param {string} roomId - 콘서트 방 ID
 * @param {number} songNum - 삭제할 노래 번호
 * @returns {Promise<object>} - 업데이트된 콘서트 정보
 */
async function removeSong(roomId, songNum) {
  const key = `concert:room:${roomId}:info`;
  const data = await redisClient.get(key);

  if (!data) {
    throw new Error('Concert not found');
  }

  const concertInfo = JSON.parse(data);

  // 노래 찾기
  const index = concertInfo.songs.findIndex(s => s.songNum === songNum);
  if (index === -1) {
    throw new Error(`Song number ${songNum} not found`);
  }

  // 노래 삭제
  concertInfo.songs.splice(index, 1);

  // 현재 재생 곡이 삭제된 경우 다음 곡으로 변경
  if (concertInfo.currentSong === songNum) {
    concertInfo.currentSong = concertInfo.songs.length > 0 ? concertInfo.songs[0].songNum : null;
  }

  // 업데이트된 정보 저장 (TTL 유지)
  const ttl = await redisClient.ttl(key);
  await redisClient.setEx(key, ttl > 0 ? ttl : 7200, JSON.stringify(concertInfo));

  return concertInfo;
}

/**
 * 현재 재생 곡 변경
 * @param {string} roomId - 콘서트 방 ID
 * @param {number} songNum - 재생할 노래 번호
 * @returns {Promise<object>} - 업데이트된 콘서트 정보
 */
async function changeSong(roomId, songNum) {
  const key = `concert:room:${roomId}:info`;
  const data = await redisClient.get(key);

  if (!data) {
    throw new Error('Concert not found');
  }

  const concertInfo = JSON.parse(data);

  // 노래 존재 여부 확인
  const song = concertInfo.songs.find(s => s.songNum === songNum);
  if (!song) {
    throw new Error(`Song number ${songNum} not found`);
  }

  // 현재 곡 변경
  concertInfo.currentSong = songNum;

  // 업데이트된 정보 저장 (TTL 유지)
  const ttl = await redisClient.ttl(key);
  await redisClient.setEx(key, ttl > 0 ? ttl : 7200, JSON.stringify(concertInfo));

  return concertInfo;
}

/**
 * 현재 재생 중인 노래 정보 조회
 * @param {string} roomId - 콘서트 방 ID
 * @returns {Promise<object>} - 현재 노래 정보
 */
async function getCurrentSong(roomId) {
  const concertInfo = await getConcertInfo(roomId);

  if (!concertInfo.currentSong) {
    throw new Error('No song is currently playing');
  }

  const currentSong = concertInfo.songs.find(s => s.songNum === concertInfo.currentSong);

  if (!currentSong) {
    throw new Error('Current song not found in song list');
  }

  return {
    ...currentSong,
    concertName: concertInfo.concertName,
    studioName: concertInfo.studioName
  };
}

/**
 * 액세서리 추가
 * @param {string} roomId - 콘서트 방 ID
 * @param {object} accessoryData - 액세서리 정보 { socketName, relativeLocation, relativeRotation, modelUrl }
 * @returns {Promise<object>} - 업데이트된 콘서트 정보
 */
async function addAccessory(roomId, accessoryData) {
  const key = `concert:room:${roomId}:info`;
  const data = await redisClient.get(key);

  if (!data) {
    throw new Error('Concert not found');
  }

  const concertInfo = JSON.parse(data);

  // accessories 배열이 없으면 초기화
  if (!concertInfo.accessories) {
    concertInfo.accessories = [];
  }

  // 액세서리 추가
  concertInfo.accessories.push(accessoryData);

  // 업데이트된 정보 저장 (TTL 유지)
  const ttl = await redisClient.ttl(key);
  await redisClient.setEx(key, ttl > 0 ? ttl : 7200, JSON.stringify(concertInfo));

  return concertInfo;
}

/**
 * 액세서리 삭제 (인덱스 기반)
 * @param {string} roomId - 콘서트 방 ID
 * @param {number} index - 삭제할 액세서리 인덱스
 * @returns {Promise<object>} - 업데이트된 콘서트 정보
 */
async function removeAccessory(roomId, index) {
  const key = `concert:room:${roomId}:info`;
  const data = await redisClient.get(key);

  if (!data) {
    throw new Error('Concert not found');
  }

  const concertInfo = JSON.parse(data);

  if (!concertInfo.accessories || index >= concertInfo.accessories.length || index < 0) {
    throw new Error(`Invalid accessory index: ${index}`);
  }

  // 액세서리 삭제
  concertInfo.accessories.splice(index, 1);

  // 업데이트된 정보 저장 (TTL 유지)
  const ttl = await redisClient.ttl(key);
  await redisClient.setEx(key, ttl > 0 ? ttl : 7200, JSON.stringify(concertInfo));

  return concertInfo;
}

/**
 * 모든 액세서리 교체
 * @param {string} roomId - 콘서트 방 ID
 * @param {Array} accessories - 새로운 액세서리 배열
 * @returns {Promise<object>} - 업데이트된 콘서트 정보
 */
async function updateAccessories(roomId, accessories) {
  const key = `concert:room:${roomId}:info`;
  const data = await redisClient.get(key);

  if (!data) {
    throw new Error('Concert not found');
  }

  const concertInfo = JSON.parse(data);

  // 액세서리 전체 교체
  concertInfo.accessories = accessories;

  // 업데이트된 정보 저장 (TTL 유지)
  const ttl = await redisClient.ttl(key);
  await redisClient.setEx(key, ttl > 0 ? ttl : 7200, JSON.stringify(concertInfo));

  return concertInfo;
}

module.exports = {
  createConcert,
  joinConcert,
  verifyAccess,
  getConcertInfo,
  getActiveConcerts,
  addSong,
  removeSong,
  changeSong,
  getCurrentSong,
  addAccessory,
  removeAccessory,
  updateAccessories
};
