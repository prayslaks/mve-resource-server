const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const {
  leaveConcert,
  createConcert,
  joinConcert,
  verifyAccess,
  getConcertInfo,
  getConcerts,
  addSong,
  removeSong,
  changeSong,
  getCurrentSong,
  addAccessory,
  removeAccessory,
  updateAccessories,
  updateListenServer,
  toggleConcertOpen,
  destroyConcert,
  expireAllConcerts
} = require('../services/concert-service');

/**
 * @swagger
 * /api/concert/create:
 *   post:
 *     summary: 콘서트 생성
 *     description: 콘서트 세션을 생성합니다 (스튜디오 사용자 전용)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - concertName
 *             properties:
 *               concertName:
 *                 type: string
 *                 example: "My Concert"
 *               songs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     songNum:
 *                       type: integer
 *                     audioId:
 *                       type: integer
 *                     streamUrl:
 *                       type: string
 *                     stageDirectionId:
 *                       type: integer
 *               accessories:
 *                 type: array
 *                 items:
 *                   type: object
 *               maxAudience:
 *                 type: integer
 *                 default: 100
 *     responses:
 *       200:
 *         description: 콘서트 생성 성공
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 실패
 */
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
 code: 'SUCCESS',
 message: 'Operation successful',
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
        code: 'MISSING_FIELDS',
        message: 'concertName is required'
      });
    }

    // songs 배열 검증 (있는 경우)
    if (songs && !Array.isArray(songs)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_SONGS',
        message: 'songs must be an array'
      });
    }

    // accessories 배열 검증 (있는 경우)
    if (accessories && !Array.isArray(accessories)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ACCESSORIES',
        message: 'accessories must be an array'
      });
    }

    // 고유한 방 ID 생성
    const roomId = `concert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 콘서트 데이터 구성
    const concertData = {
      studioUserId: req.userId,
      studioName: req.email,
      concertName,
      songs: songs || [],
      accessories: accessories || [],
      maxAudience: maxAudience || 100,
      createdAt: Date.now()
    };

    // 콘서트 생성
    const result = await createConcert(roomId, concertData);

    console.log(`[CONCERT] 콘서트 생성: ${roomId} by ${req.email}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Operation successful',
      roomId: result.roomId,
      expiresIn: result.expiresIn
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 생성 에러:', error);
    res.status(500).json({
      success: false,
      code: 'CREATE_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/list:
 *   get:
 *     summary: 활성 콘서트 목록 조회
 *     description: 현재 진행 중인 모든 콘서트 목록을 조회합니다
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 콘서트 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 concerts:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.get('/list', verifyToken, async (req, res) => {
  try {
    const concerts = await getConcerts();

    console.log(`[CONCERT] 콘서트 목록 조회: ${concerts.length}개`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Operation successful',
      count: concerts.length,
      concerts
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 목록 조회 에러:', error);
    res.status(500).json({
      success: false,
      code: 'LIST_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/join:
 *   post:
 *     summary: 콘서트 참가
 *     description: 클라이언트를 콘서트에 참가시킵니다 (리슨 서버가 클라이언트 접속 시 호출)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientId
 *             properties:
 *               clientId:
 *                 type: integer
 *                 description: 참가한 클라이언트의 사용자 ID
 *     responses:
 *       200:
 *         description: 참가 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오 리슨 서버만 호출 가능)
 *       401:
 *         description: 인증 실패
 */
router.post('/:roomId/join', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_CLIENT_ID',
        message: 'clientId is required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인 (리슨 서버만 호출 가능)
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only the studio listen server can register a client.'
      });
    }

    // 콘서트 참가
    await joinConcert(roomId, clientId);

    console.log(`[CONCERT] 클라이언트 참가: ${clientId} → ${roomId} (요청자: ${req.email})`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Client joined concert successfully'
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 참가 에러:', error);
    res.status(400).json({
      success: false,
      code: 'JOIN_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/leave:
 *   post:
 *     summary: 콘서트 퇴장
 *     description: 클라이언트를 콘서트에서 퇴장시킵니다 (리슨 서버가 클라이언트 접속 종료 시 호출)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientId
 *             properties:
 *               clientId:
 *                 type: integer
 *                 description: 퇴장한 클라이언트의 사용자 ID
 *     responses:
 *       200:
 *         description: 퇴장 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오 리슨 서버만 호출 가능)
 *       401:
 *         description: 인증 실패
 */
router.post('/:roomId/leave', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_CLIENT_ID',
        message: 'clientId is required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인 (리슨 서버만 호출 가능)
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only the studio listen server can unregister a client.'
      });
    }

    await leaveConcert(roomId, clientId);
    console.log(`[CONCERT] 클라이언트 퇴장: ${clientId} ← ${roomId} (요청자: ${req.email})`);

    res.json({ success: true, message: 'Client left concert successfully' });
    code: 'SUCCESS',
    message: 'Operation successful',
  } catch (error) {
    console.error('[CONCERT] 콘서트 퇴장 에러:', error);
    res.status(400).json({ success: false, code: 'LEAVE_FAILED', message: error.message });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/info:
 *   get:
 *     summary: 콘서트 정보 조회
 *     description: 특정 콘서트의 상세 정보를 조회합니다
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 concert:
 *                   type: object
 *       404:
 *         description: 콘서트를 찾을 수 없음
 *       401:
 *         description: 인증 실패
 */
router.get('/:roomId/info', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;

    const concertInfo = await getConcertInfo(roomId);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Operation successful',
      concert: concertInfo
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 정보 조회 에러:', error);
    res.status(404).json({
      success: false,
      code: 'CONCERT_NOT_FOUND',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/songs/add:
 *   post:
 *     summary: 콘서트에 노래 추가
 *     description: 콘서트 플레이리스트에 노래를 추가합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - songNum
 *               - audioId
 *               - streamUrl
 *               - stageDirectionId
 *             properties:
 *               songNum:
 *                 type: integer
 *               audioId:
 *                 type: integer
 *               streamUrl:
 *                 type: string
 *               stageDirectionId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: 노래 추가 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       401:
 *         description: 인증 실패
 */
router.post('/:roomId/songs/add', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { songNum, audioId, streamUrl, stageDirectionId } = req.body;

    // 필수 필드 검증
    if (!songNum || !audioId || !streamUrl || !stageDirectionId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'songNum, audioId, streamUrl, stageDirectionId are required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only studio can add songs'
      });
    }

    // 노래 추가
    const updatedConcert = await addSong(roomId, { songNum, audioId, streamUrl, stageDirectionId });

    console.log(`[CONCERT] 노래 추가: ${roomId} - Song ${songNum}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Song added successfully',
      songs: updatedConcert.songs,
      currentSong: updatedConcert.currentSong
    });
  } catch (error) {
    console.error('[CONCERT] 노래 추가 에러:', error);
    res.status(400).json({
      success: false,
      code: 'ADD_SONG_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/songs/{songNum}:
 *   delete:
 *     summary: 콘서트에서 노래 삭제
 *     description: 콘서트 플레이리스트에서 노래를 삭제합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *       - in: path
 *         name: songNum
 *         required: true
 *         schema:
 *           type: integer
 *         description: 노래 번호
 *     responses:
 *       200:
 *         description: 노래 삭제 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       401:
 *         description: 인증 실패
 */
router.delete('/:roomId/songs/:songNum', verifyToken, async (req, res) => {
  try {
    const { roomId, songNum } = req.params;

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only studio can remove songs'
      });
    }

    // 노래 삭제
    const updatedConcert = await removeSong(roomId, parseInt(songNum));

    console.log(`[CONCERT] 노래 삭제: ${roomId} - Song ${songNum}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Song removed successfully',
      songs: updatedConcert.songs,
      currentSong: updatedConcert.currentSong
    });
  } catch (error) {
    console.error('[CONCERT] 노래 삭제 에러:', error);
    res.status(400).json({
      success: false,
      code: 'REMOVE_SONG_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/songs/change:
 *   post:
 *     summary: 현재 재생 곡 변경
 *     description: 콘서트에서 재생할 곡을 변경합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - songNum
 *             properties:
 *               songNum:
 *                 type: integer
 *                 description: 재생할 노래 번호
 *     responses:
 *       200:
 *         description: 곡 변경 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       401:
 *         description: 인증 실패
 */
router.post('/:roomId/songs/change', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { songNum } = req.body;

    if (!songNum) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'songNum is required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only studio can change songs'
      });
    }

    // 현재 곡 변경
    const updatedConcert = await changeSong(roomId, songNum);

    console.log(`[CONCERT] 곡 변경: ${roomId} - Song ${songNum}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Song changed successfully',
      currentSong: updatedConcert.currentSong
    });
  } catch (error) {
    console.error('[CONCERT] 곡 변경 에러:', error);
    res.status(400).json({
      success: false,
      code: 'CHANGE_SONG_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/current-song:
 *   get:
 *     summary: 현재 재생 중인 노래 정보 조회
 *     description: 콘서트에서 현재 재생 중인 노래 정보를 조회합니다 (참가자 전용)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     responses:
 *       200:
 *         description: 현재 곡 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 currentSong:
 *                   type: object
 *       403:
 *         description: 접근 권한 없음
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
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
        code: 'ACCESS_DENIED',
        message: 'Not in concert room'
      });
    }

    // 현재 재생 곡 정보 조회
    const currentSong = await getCurrentSong(roomId);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Operation successful',
      currentSong
    });
  } catch (error) {
    console.error('[CONCERT] 현재 곡 조회 에러:', error);
    res.status(500).json({
      success: false,
      code: 'GET_CURRENT_SONG_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/accessories/add:
 *   post:
 *     summary: 액세서리 추가
 *     description: 콘서트에 액세서리를 추가합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - socketName
 *               - relativeLocation
 *               - relativeRotation
 *               - modelUrl
 *             properties:
 *               socketName:
 *                 type: string
 *               relativeLocation:
 *                 type: object
 *                 properties:
 *                   x:
 *                     type: number
 *                   y:
 *                     type: number
 *                   z:
 *                     type: number
 *               relativeRotation:
 *                 type: object
 *                 properties:
 *                   pitch:
 *                     type: number
 *                   yaw:
 *                     type: number
 *                   roll:
 *                     type: number
 *               modelUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: 액세서리 추가 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       401:
 *         description: 인증 실패
 */
router.post('/:roomId/accessories/add', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { socketName, relativeLocation, relativeRotation, modelUrl } = req.body;

    // 필수 필드 검증
    if (!socketName || !relativeLocation || !relativeRotation || !modelUrl) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'socketName, relativeLocation, relativeRotation, modelUrl are required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
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
      code: 'SUCCESS',
      message: 'Accessory added successfully',
      accessories: updatedConcert.accessories
    });
  } catch (error) {
    console.error('[CONCERT] 액세서리 추가 에러:', error);
    res.status(400).json({
      success: false,
      code: 'ADD_ACCESSORY_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/accessories/{index}:
 *   delete:
 *     summary: 액세서리 삭제
 *     description: 콘서트에서 액세서리를 삭제합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *       - in: path
 *         name: index
 *         required: true
 *         schema:
 *           type: integer
 *         description: 액세서리 인덱스
 *     responses:
 *       200:
 *         description: 액세서리 삭제 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       401:
 *         description: 인증 실패
 */
router.delete('/:roomId/accessories/:index', verifyToken, async (req, res) => {
  try {
    const { roomId, index } = req.params;

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only studio can remove accessories'
      });
    }

    // 액세서리 삭제
    const updatedConcert = await removeAccessory(roomId, parseInt(index));

    console.log(`[CONCERT] 액세서리 삭제: ${roomId} - index ${index}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Accessory removed successfully',
      accessories: updatedConcert.accessories
    });
  } catch (error) {
    console.error('[CONCERT] 액세서리 삭제 에러:', error);
    res.status(400).json({
      success: false,
      code: 'REMOVE_ACCESSORY_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/accessories:
 *   put:
 *     summary: 모든 액세서리 교체
 *     description: 콘서트의 액세서리를 전체 교체합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accessories
 *             properties:
 *               accessories:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     socketName:
 *                       type: string
 *                     relativeLocation:
 *                       type: object
 *                     relativeRotation:
 *                       type: object
 *                     modelUrl:
 *                       type: string
 *     responses:
 *       200:
 *         description: 액세서리 교체 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       401:
 *         description: 인증 실패
 */
router.put('/:roomId/accessories', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { accessories } = req.body;

    if (!Array.isArray(accessories)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ACCESSORIES',
        message: 'accessories must be an array'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only studio can update accessories'
      });
    }

    // 액세서리 전체 교체
    const updatedConcert = await updateAccessories(roomId, accessories);

    console.log(`[CONCERT] 액세서리 전체 교체: ${roomId} - ${accessories.length}개`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Accessories updated successfully',
      accessories: updatedConcert.accessories
    });
  } catch (error) {
    console.error('[CONCERT] 액세서리 교체 에러:', error);
    res.status(400).json({
      success: false,
      code: 'UPDATE_ACCESSORIES_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/listen-server:
 *   post:
 *     summary: 리슨 서버 정보 등록/업데이트
 *     description: 콘서트의 리슨 서버 정보를 등록하거나 업데이트합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - localIP
 *               - port
 *             properties:
 *               localIP:
 *                 type: string
 *                 description: 로컬 IP 주소
 *                 example: "192.168.0.100"
 *               port:
 *                 type: integer
 *                 description: 포트 번호
 *                 example: 7777
 *               publicIP:
 *                 type: string
 *                 description: 공인 IP 주소 (선택)
 *               publicPort:
 *                 type: integer
 *                 description: 공인 포트 번호 (선택)
 *     responses:
 *       200:
 *         description: 리슨 서버 정보 등록 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       401:
 *         description: 인증 실패
 */
router.post('/:roomId/listen-server', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { localIP, port, publicIP, publicPort } = req.body;

    // 필수 필드 검증
    if (!localIP || !port) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'localIP and port are required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
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
      code: 'SUCCESS',
      message: 'Listen server info updated successfully',
      listenServer: updatedConcert.listenServer
    });
  } catch (error) {
    console.error('[CONCERT] 리슨 서버 정보 등록 에러:', error);
    res.status(400).json({
      success: false,
      code: 'UPDATE_LISTEN_SERVER_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}/toggle-open:
 *   post:
 *     summary: 콘서트 개방/비공개 상태 토글
 *     description: 콘서트의 개방 여부를 변경합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isOpen
 *             properties:
 *               isOpen:
 *                 type: boolean
 *                 description: 개방 여부 (true - 개방, false - 비공개)
 *     responses:
 *       200:
 *         description: 상태 변경 성공
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       401:
 *         description: 인증 실패
 */
router.post('/:roomId/toggle-open', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { isOpen } = req.body;

    // 필수 필드 검증
    if (typeof isOpen !== 'boolean') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'isOpen (boolean) is required'
      });
    }

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only studio can toggle concert open status'
      });
    }

    // 개방 상태 토글
    const updatedConcert = await toggleConcertOpen(roomId, isOpen);

    console.log(`[CONCERT] 콘서트 개방 상태 변경: ${roomId} - ${isOpen ? 'OPEN' : 'CLOSED'}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: `Concert is now ${isOpen ? 'open' : 'closed'}`,
      isOpen: updatedConcert.isOpen
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 개방 상태 변경 에러:', error);
    res.status(400).json({
      success: false,
      code: 'TOGGLE_OPEN_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/{roomId}:
 *   delete:
 *     summary: 콘서트 세션 파괴
 *     description: 콘서트 세션을 명시적으로 종료하고 모든 관련 데이터를 삭제합니다 (스튜디오만 가능)
 *     tags:
 *       - Concert
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: 콘서트 방 ID
 *     responses:
 *       200:
 *         description: 콘서트 세션 파괴 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 code:
 *                   type: string
 *                 message:
 *                   type: string
 *                 roomId:
 *                   type: string
 *       403:
 *         description: 권한 없음 (스튜디오만 가능)
 *       404:
 *         description: 콘서트를 찾을 수 없음
 *       401:
 *         description: 인증 실패
 */
router.delete('/:roomId', verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params;

    // 콘서트 정보 조회하여 스튜디오 권한 확인
    const concertInfo = await getConcertInfo(roomId);
    if (concertInfo.studioUserId !== req.userId) {
      return res.status(403).json({
        success: false,
        code: 'PERMISSION_DENIED',
        message: 'Only studio can destroy the concert'
      });
    }

    // 콘서트 세션 파괴
    const result = await destroyConcert(roomId);

    console.log(`[CONCERT] 콘서트 세션 파괴: ${roomId} by ${req.email}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Concert session destroyed successfully',
      roomId: result.roomId
    });
  } catch (error) {
    console.error('[CONCERT] 콘서트 세션 파괴 에러:', error);
    const statusCode = error.message === 'Concert not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      code: 'DESTROY_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/concert/dev/expire-all:
 *   post:
 *     summary: 모든 콘서트 세션 일괄 만료 (개발 환경 전용)
 *     description: Redis에 저장된 모든 콘서트 세션을 일괄 삭제합니다. 프로덕션 환경에서는 사용 불가합니다.
 *     tags:
 *       - Concert (Development)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 모든 콘서트 만료 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 expiredCount:
 *                   type: integer
 *                   description: 만료된 콘서트 수
 *                 expiredRooms:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: 만료된 콘서트 방 ID 목록
 *       403:
 *         description: 프로덕션 환경에서는 사용 불가
 *       401:
 *         description: 인증 실패
 */
router.post('/dev/expire-all', verifyToken, async (req, res) => {
  try {
    // 프로덕션 환경에서는 차단
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        code: 'DEV_ONLY_API',
        message: 'This API is only available in development environment'
      });
    }

    // 모든 콘서트 세션 만료
    const result = await expireAllConcerts();

    console.log(`[CONCERT] [DEV] 모든 콘서트 만료: ${result.expiredCount}개 (요청자: ${req.email})`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'All concert sessions have been expired',
      expiredCount: result.expiredCount,
      expiredRooms: result.expiredRooms
    });
  } catch (error) {
    console.error('[CONCERT] [DEV] 모든 콘서트 만료 에러:', error);
    res.status(500).json({
      success: false,
      code: 'EXPIRE_ALL_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
