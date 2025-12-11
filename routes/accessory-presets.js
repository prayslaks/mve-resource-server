const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth');
const {
  savePreset,
  getUserPresets,
  getPreset,
  updatePreset,
  deletePreset
} = require('../services/accessory-preset-service');

/**
 * @swagger
 * components:
 *   schemas:
 *     Accessory:
 *       type: object
 *       properties:
 *         socketName:
 *           type: string
 *           example: "head_socket"
 *         relativeLocation:
 *           type: object
 *           properties:
 *             x:
 *               type: number
 *               format: float
 *             y:
 *               type: number
 *               format: float
 *             z:
 *               type: number
 *               format: float
 *         relativeRotation:
 *           type: object
 *           properties:
 *             pitch:
 *               type: number
 *               format: float
 *             yaw:
 *               type: number
 *               format: float
 *             roll:
 *               type: number
 *               format: float
 *         relativeScale:
 *           type: number
 *           format: float
 *           example: 1.0
 *         modelUrl:
 *           type: string
 *           example: "/models/hat.glb"
 *     AccessoryPreset:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         presetName:
 *           type: string
 *         accessories:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Accessory'
 *         description:
 *           type: string
 *         isPublic:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/presets/save:
 *   post:
 *     summary: 액세서리 프리셋 저장
 *     description: 아바타 액세서리 프리셋을 저장합니다
 *     tags:
 *       - Accessory Presets
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - presetName
 *               - accessories
 *             properties:
 *               presetName:
 *                 type: string
 *                 example: "My Preset"
 *               accessories:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Accessory'
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: 프리셋 저장 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AccessoryPreset'
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 실패
 */
/**
 * POST /api/presets/save
 * 액세서리 프리셋 저장
 *
 * Request Body:
 * - presetName: 프리셋 이름
 * - accessories: 액세서리 배열 [{ socketName, relativeLocation, relativeRotation, relativeScale, modelUrl }]
 * - description: 설명 (optional)
 * - isPublic: 공개 여부 (optional, default: false)
 */
router.post('/save', verifyToken, async (req, res) => {
  try {
    const { presetName, accessories, description, isPublic } = req.body;

    // 필수 필드 검증
    if (!presetName || !accessories) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: 'presetName and accessories are required'
      });
    }

    // accessories 배열 검증
    if (!Array.isArray(accessories)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ACCESSORIES',
        message: 'accessories must be an array'
      });
    }

    // 프리셋 저장
    const preset = await savePreset(
      req.userId,
      presetName,
      accessories,
      description || '',
      isPublic || false
    );

    console.log(`[PRESET] 프리셋 저장: ${preset.id} by ${req.email}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Operation successful',
      preset
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 저장 에러:', error);

    // 중복 프리셋 이름 에러 처리
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_PRESET_NAME',
        message: 'A preset with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      code: 'SAVE_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/presets/list:
 *   get:
 *     summary: 프리셋 목록 조회
 *     description: 사용자의 액세서리 프리셋 목록을 조회합니다
 *     tags:
 *       - Accessory Presets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includePublic
 *         schema:
 *           type: boolean
 *           default: false
 *         description: 공개 프리셋 포함 여부
 *     responses:
 *       200:
 *         description: 프리셋 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 presets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AccessoryPreset'
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.get('/list', verifyToken, async (req, res) => {
  try {
    const includePublic = req.query.includePublic === 'true';

    const presets = await getUserPresets(req.userId, includePublic);

    console.log(`[PRESET] 프리셋 목록 조회: ${req.email} - ${presets.length}개`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Operation successful',
      count: presets.length,
      presets
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 목록 조회 에러:', error);
    res.status(500).json({
      success: false,
      code: 'LIST_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/presets/{id}:
 *   get:
 *     summary: 프리셋 상세 조회
 *     description: 특정 프리셋의 상세 정보를 조회합니다 (액세서리 데이터 포함)
 *     tags:
 *       - Accessory Presets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 프리셋 ID
 *     responses:
 *       200:
 *         description: 프리셋 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 preset:
 *                   $ref: '#/components/schemas/AccessoryPreset'
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 접근 권한 없음
 *       404:
 *         description: 프리셋을 찾을 수 없음
 *       401:
 *         description: 인증 실패
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const presetId = parseInt(req.params.id);

    if (isNaN(presetId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid preset ID'
      });
    }

    const preset = await getPreset(presetId, req.userId);

    console.log(`[PRESET] 프리셋 조회: ${presetId} by ${req.email}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Operation successful',
      preset
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 조회 에러:', error);

    if (error.message === 'Preset not found') {
      return res.status(404).json({
        success: false,
        code: 'PRESET_NOT_FOUND',
        message: error.message
      });
    }

    if (error.message === 'Access denied') {
      return res.status(403).json({
        success: false,
        code: 'ACCESS_DENIED',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      code: 'GET_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/presets/{id}:
 *   put:
 *     summary: 프리셋 업데이트
 *     description: 프리셋 정보를 업데이트합니다
 *     tags:
 *       - Accessory Presets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 프리셋 ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               presetName:
 *                 type: string
 *               description:
 *                 type: string
 *               accessories:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Accessory'
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 프리셋 업데이트 성공
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AccessoryPreset'
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 접근 권한 없음
 *       404:
 *         description: 프리셋을 찾을 수 없음
 *       409:
 *         description: 중복된 프리셋 이름
 *       401:
 *         description: 인증 실패
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const presetId = parseInt(req.params.id);

    if (isNaN(presetId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid preset ID'
      });
    }

    const { presetName, description, accessories, isPublic } = req.body;

    // accessories 배열 검증 (있는 경우)
    if (accessories !== undefined && !Array.isArray(accessories)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ACCESSORIES',
        message: 'accessories must be an array'
      });
    }

    const updates = {};
    if (presetName !== undefined) updates.presetName = presetName;
    if (description !== undefined) updates.description = description;
    if (accessories !== undefined) updates.accessories = accessories;
    if (isPublic !== undefined) updates.isPublic = isPublic;

    const preset = await updatePreset(presetId, req.userId, updates);

    console.log(`[PRESET] 프리셋 업데이트: ${presetId} by ${req.email}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Operation successful',
      preset
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 업데이트 에러:', error);

    if (error.message === 'Preset not found') {
      return res.status(404).json({
        success: false,
        code: 'PRESET_NOT_FOUND',
        message: error.message
      });
    }

    if (error.message === 'Access denied') {
      return res.status(403).json({
        success: false,
        code: 'ACCESS_DENIED',
        message: error.message
      });
    }

    // 중복 프리셋 이름 에러 처리
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_PRESET_NAME',
        message: 'A preset with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      code: 'UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/presets/{id}:
 *   delete:
 *     summary: 프리셋 삭제
 *     description: 프리셋을 삭제합니다
 *     tags:
 *       - Accessory Presets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 프리셋 ID
 *     responses:
 *       200:
 *         description: 프리셋 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         description: 접근 권한 없음
 *       404:
 *         description: 프리셋을 찾을 수 없음
 *       401:
 *         description: 인증 실패
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const presetId = parseInt(req.params.id);

    if (isNaN(presetId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_ID',
        message: 'Invalid preset ID'
      });
    }

    await deletePreset(presetId, req.userId);

    console.log(`[PRESET] 프리셋 삭제: ${presetId} by ${req.email}`);

    res.json({
      success: true,
      code: 'SUCCESS',
      message: 'Preset deleted successfully'
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 삭제 에러:', error);

    if (error.message === 'Preset not found') {
      return res.status(404).json({
        success: false,
        code: 'PRESET_NOT_FOUND',
        message: error.message
      });
    }

    if (error.message === 'Access denied') {
      return res.status(403).json({
        success: false,
        code: 'ACCESS_DENIED',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      code: 'DELETE_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
