const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const {
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
  updateAccessories,
  updateListenServer,
  toggleConcertOpen
} = require('../services/concert-service');

/**
 * POST /api/concert/create
 * 콘서트 생성 (스튜디오 사용자)
 *
 * Request Body:
 * - concertName: 콘서트 이름
 * - songs: 노래 목록 배열 (optional) [{ songNum, audioId, streamUrl, stageDirectionId }]
 * - accessories: 액세서리 목록 배열 (optional) [{ socketName, relativeLocation, relativeRotation, modelUrl }]
 * - maxAudience: 최대 관객 수 (기본값 100)
 *
 * Response:
 * - success: true/false
 * - roomId: 생성된 콘서트 방 ID
 * - expiresIn: 만료 시간 (초)
 */
router.post('/create', verifyToken, async (req, res) => {
  try {
    const { concertName, songs, accessories, maxAudience } = req.body;

    // 필수 필드 검증
    if (!concertName) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'concertName is required'
      });
    }

    // songs 배열 검증 (있는 경우)
    if (songs && !Array.isArray(songs)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SONGS',
        message: 'songs must be an array'
      });
    }

    // accessories 배열 검증 (있는 경우)
    if (accessories && !Array.isArray(accessories)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ACCESSORIES',
        message: 'accessories must be an array'
      });
    }

    // 고유한 방 ID 생성
    const roomId = `concert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 콘서트 데이터 구성
    const concertData = {
      studioUserId: req.userId,
      studioName: req.username,
      concertName,
      songs: songs || [],
      accessories: accessories || [],
      maxAudience: maxAudience || 100,
      createdAt: Date.now()
    };

    // 콘서트 생성
    const result = await createConcert(roomId, concertData);

    console.log(`[CONCERT] 콘서트 생성: ${roomId} by ${req.username}`);

    res.json({
      success: true,
      roomId: result.roomId,
      expiresIn: result.expiresIn
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 생성 에러:', error);
    res.status(500).json({
      success: false,
      error: 'CREATE_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/concert/list
 * 활성 콘서트 목록 조회
 *
 * Response:
 * - success: true/false
 * - count: 콘서트 개수
 * - concerts: 콘서트 목록 배열
 */
router.get('/list', verifyToken, async (req, res) => {
  try {
    const concerts = await getActiveConcerts();

    console.log(`[CONCERT] 콘서트 목록 조회: ${concerts.length}개`);

    res.json({
      success: true,
      count: concerts.length,
      concerts
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 목록 조회 에러:', error);
    res.status(500).json({
      success: false,
      error: 'LIST_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/concert/:roomId/join
 * 콘서트 참가
 *
 * Response:
 * - success: true/false
 * - message: 메시지
 * - concert: 콘서트 정보 (songs, currentSong, listenServer 포함)
 */
router.post('/:roomId/join', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    // 콘서트 참가
    await joinConcert(roomId, userId);

    // 콘서트 정보 조회
    const concertInfo = await getConcertInfo(roomId);

    console.log(`[CONCERT] 콘서트 참가: ${req.username} → ${roomId}`);

    res.json({
      success: true,
      message: 'Joined concert successfully',
      concert: {
        concertName: concertInfo.concertName,
        studioName: concertInfo.studioName,
        songs: concertInfo.songs,
        currentSong: concertInfo.currentSong,
        listenServer: concertInfo.listenServer,
        isOpen: concertInfo.isOpen,
        studioMetadataUrl: concertInfo.studioMetadataUrl
      }
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 참가 에러:', error);
    res.status(400).json({
      success: false,
      error: 'JOIN_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/concert/:roomId/info
 * 콘서트 정보 조회
 *
 * Response:
 * - success: true/false
 * - concert: 콘서트 정보
 */
router.get('/:roomId/info', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;

    const concertInfo = await getConcertInfo(roomId);

    res.json({
      success: true,
      concert: concertInfo
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 정보 조회 에러:', error);
    res.status(404).json({
      success: false,
      error: 'CONCERT_NOT_FOUND',
      message: error.message
    });
  }
});

/**
 * POST /api/concert/:roomId/songs/add
 * 콘서트에 노래 추가 (스튜디오만 가능)
 *
 * Request Body:
 * - songNum: 노래 번호
 * - audioId: 음악 ID
 * - streamUrl: 스트림 URL
 * - stageDirectionId: 무대 연출 ID
 */
router.post('/:roomId/songs/add', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { songNum, audioId, streamUrl, stageDirectionId } = req.body;

    // 필수 필드 검증
    if (!songNum || !audioId || !streamUrl || !stageDirectionId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'songNum, audioId, streamUrl, stageDirectionId are required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Only studio can add songs'
      });
    }

    // 노래 추가
    const updatedConcert = await addSong(roomId, { songNum, audioId, streamUrl, stageDirectionId });

    console.log(`[CONCERT] 노래 추가: ${roomId} - Song ${songNum}`);

    res.json({
      success: true,
      message: 'Song added successfully',
      songs: updatedConcert.songs,
      currentSong: updatedConcert.currentSong
    });
  } catch (error) {
    console.error('[CONCERT] 노래 추가 에러:', error);
    res.status(400).json({
      success: false,
      error: 'ADD_SONG_FAILED',
      message: error.message
    });
  }
});

/**
 * DELETE /api/concert/:roomId/songs/:songNum
 * 콘서트에서 노래 삭제 (스튜디오만 가능)
 */
router.delete('/:roomId/songs/:songNum', verifyToken, async (req, res) => {
  try {
    const { roomId, songNum } = req.params;

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Only studio can remove songs'
      });
    }

    // 노래 삭제
    const updatedConcert = await removeSong(roomId, parseInt(songNum));

    console.log(`[CONCERT] 노래 삭제: ${roomId} - Song ${songNum}`);

    res.json({
      success: true,
      message: 'Song removed successfully',
      songs: updatedConcert.songs,
      currentSong: updatedConcert.currentSong
    });
  } catch (error) {
    console.error('[CONCERT] 노래 삭제 에러:', error);
    res.status(400).json({
      success: false,
      error: 'REMOVE_SONG_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/concert/:roomId/songs/change
 * 현재 재생 곡 변경 (스튜디오만 가능)
 *
 * Request Body:
 * - songNum: 재생할 노래 번호
 */
router.post('/:roomId/songs/change', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { songNum } = req.body;

    if (!songNum) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'songNum is required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Only studio can change songs'
      });
    }

    // 현재 곡 변경
    const updatedConcert = await changeSong(roomId, songNum);

    console.log(`[CONCERT] 곡 변경: ${roomId} - Song ${songNum}`);

    res.json({
      success: true,
      message: 'Song changed successfully',
      currentSong: updatedConcert.currentSong
    });
  } catch (error) {
    console.error('[CONCERT] 곡 변경 에러:', error);
    res.status(400).json({
      success: false,
      error: 'CHANGE_SONG_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/concert/:roomId/current-song
 * 현재 재생 중인 노래 정보 조회 (참가자 전용)
 */
router.get('/:roomId/current-song', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.userId;

    // 접근 권한 확인
    const hasAccess = await verifyAccess(roomId, userId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Not in concert room'
      });
    }

    // 현재 재생 곡 정보 조회
    const currentSong = await getCurrentSong(roomId);

    res.json({
      success: true,
      currentSong
    });
  } catch (error) {
    console.error('[CONCERT] 현재 곡 조회 에러:', error);
    res.status(500).json({
      success: false,
      error: 'GET_CURRENT_SONG_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/concert/:roomId/accessories/add
 * 액세서리 추가 (스튜디오만 가능)
 *
 * Request Body:
 * - socketName: 소켓 이름
 * - relativeLocation: 상대적 위치 { x, y, z }
 * - relativeRotation: 상대적 회전 { pitch, yaw, roll }
 * - modelUrl: 모델 URL
 */
router.post('/:roomId/accessories/add', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { socketName, relativeLocation, relativeRotation, modelUrl } = req.body;

    // 필수 필드 검증
    if (!socketName || !relativeLocation || !relativeRotation || !modelUrl) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'socketName, relativeLocation, relativeRotation, modelUrl are required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Only studio can add accessories'
      });
    }

    // 액세서리 추가
    const updatedConcert = await addAccessory(roomId, {
      socketName,
      relativeLocation,
      relativeRotation,
      modelUrl
    });

    console.log(`[CONCERT] 액세서리 추가: ${roomId} - ${socketName}`);

    res.json({
      success: true,
      message: 'Accessory added successfully',
      accessories: updatedConcert.accessories
    });
  } catch (error) {
    console.error('[CONCERT] 액세서리 추가 에러:', error);
    res.status(400).json({
      success: false,
      error: 'ADD_ACCESSORY_FAILED',
      message: error.message
    });
  }
});

/**
 * DELETE /api/concert/:roomId/accessories/:index
 * 액세서리 삭제 (스튜디오만 가능)
 */
router.delete('/:roomId/accessories/:index', verifyToken, async (req, res) => {
  try {
    const { roomId, index } = req.params;

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Only studio can remove accessories'
      });
    }

    // 액세서리 삭제
    const updatedConcert = await removeAccessory(roomId, parseInt(index));

    console.log(`[CONCERT] 액세서리 삭제: ${roomId} - index ${index}`);

    res.json({
      success: true,
      message: 'Accessory removed successfully',
      accessories: updatedConcert.accessories
    });
  } catch (error) {
    console.error('[CONCERT] 액세서리 삭제 에러:', error);
    res.status(400).json({
      success: false,
      error: 'REMOVE_ACCESSORY_FAILED',
      message: error.message
    });
  }
});

/**
 * PUT /api/concert/:roomId/accessories
 * 모든 액세서리 교체 (스튜디오만 가능)
 *
 * Request Body:
 * - accessories: 액세서리 배열 [{ socketName, relativeLocation, relativeRotation, modelUrl }]
 */
router.put('/:roomId/accessories', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { accessories } = req.body;

    if (!Array.isArray(accessories)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ACCESSORIES',
        message: 'accessories must be an array'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Only studio can update accessories'
      });
    }

    // 액세서리 전체 교체
    const updatedConcert = await updateAccessories(roomId, accessories);

    console.log(`[CONCERT] 액세서리 전체 교체: ${roomId} - ${accessories.length}개`);

    res.json({
      success: true,
      message: 'Accessories updated successfully',
      accessories: updatedConcert.accessories
    });
  } catch (error) {
    console.error('[CONCERT] 액세서리 교체 에러:', error);
    res.status(400).json({
      success: false,
      error: 'UPDATE_ACCESSORIES_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/concert/:roomId/listen-server
 * 리슨 서버 정보 등록/업데이트 (스튜디오만 가능)
 *
 * Request Body:
 * - localIP: 로컬 IP 주소 (예: 192.168.0.100)
 * - port: 포트 번호 (예: 7777)
 * - publicIP: 공인 IP 주소 (optional, 외부 접속용)
 * - publicPort: 공인 포트 번호 (optional, 외부 접속용)
 */
router.post('/:roomId/listen-server', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { localIP, port, publicIP, publicPort } = req.body;

    // 필수 필드 검증
    if (!localIP || !port) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'localIP and port are required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Only studio can update listen server info'
      });
    }

    // 리슨 서버 정보 업데이트
    const updatedConcert = await updateListenServer(roomId, {
      localIP,
      port,
      publicIP,
      publicPort
    });

    console.log(`[CONCERT] 리슨 서버 정보 등록: ${roomId} - ${localIP}:${port}`);

    res.json({
      success: true,
      message: 'Listen server info updated successfully',
      listenServer: updatedConcert.listenServer
    });
  } catch (error) {
    console.error('[CONCERT] 리슨 서버 정보 등록 에러:', error);
    res.status(400).json({
      success: false,
      error: 'UPDATE_LISTEN_SERVER_FAILED',
      message: error.message
    });
  }
});

/**
 * POST /api/concert/:roomId/toggle-open
 * 콘서트 개방/비공개 상태 토글 (스튜디오만 가능)
 *
 * Request Body:
 * - isOpen: 개방 여부 (true: 개방, false: 비공개)
 */
router.post('/:roomId/toggle-open', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { isOpen } = req.body;

    // 필수 필드 검증
    if (typeof isOpen !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'isOpen (boolean) is required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'Only studio can toggle concert open status'
      });
    }

    // 개방 상태 토글
    const updatedConcert = await toggleConcertOpen(roomId, isOpen);

    console.log(`[CONCERT] 콘서트 개방 상태 변경: ${roomId} - ${isOpen ? 'OPEN' : 'CLOSED'}`);

    res.json({
      success: true,
      message: `Concert is now ${isOpen ? 'open' : 'closed'}`,
      isOpen: updatedConcert.isOpen
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 개방 상태 변경 에러:', error);
    res.status(400).json({
      success: false,
      error: 'TOGGLE_OPEN_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
