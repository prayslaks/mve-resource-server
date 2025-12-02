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
 * POST /api/presets/save
 * 액세서리 프리셋 저장
 *
 * Request Body:
 * - presetName: 프리셋 이름
 * - accessories: 액세서리 배열 [{ socketName, relativeLocation, relativeRotation, modelUrl }]
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
        error: 'MISSING_FIELDS',
        message: 'presetName and accessories are required'
      });
    }

    // accessories 배열 검증
    if (!Array.isArray(accessories)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ACCESSORIES',
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
      preset
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 저장 에러:', error);

    // 중복 프리셋 이름 에러 처리
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_PRESET_NAME',
        message: 'A preset with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'SAVE_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/presets/list
 * 프리셋 목록 조회
 *
 * Query Parameters:
 * - includePublic: 공개 프리셋 포함 여부 (optional, default: false)
 */
router.get('/list', verifyToken, async (req, res) => {
  try {
    const includePublic = req.query.includePublic === 'true';

    const presets = await getUserPresets(req.userId, includePublic);

    console.log(`[PRESET] 프리셋 목록 조회: ${req.email} - ${presets.length}개`);

    res.json({
      success: true,
      count: presets.length,
      presets
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 목록 조회 에러:', error);
    res.status(500).json({
      success: false,
      error: 'LIST_FAILED',
      message: error.message
    });
  }
});

/**
 * GET /api/presets/:id
 * 프리셋 상세 조회 (액세서리 데이터 포함)
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const presetId = parseInt(req.params.id);

    if (isNaN(presetId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid preset ID'
      });
    }

    const preset = await getPreset(presetId, req.userId);

    console.log(`[PRESET] 프리셋 조회: ${presetId} by ${req.email}`);

    res.json({
      success: true,
      preset
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 조회 에러:', error);

    if (error.message === 'Preset not found') {
      return res.status(404).json({
        success: false,
        error: 'PRESET_NOT_FOUND',
        message: error.message
      });
    }

    if (error.message === 'Access denied') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'GET_FAILED',
      message: error.message
    });
  }
});

/**
 * PUT /api/presets/:id
 * 프리셋 업데이트
 *
 * Request Body:
 * - presetName: 프리셋 이름 (optional)
 * - description: 설명 (optional)
 * - accessories: 액세서리 배열 (optional)
 * - isPublic: 공개 여부 (optional)
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const presetId = parseInt(req.params.id);

    if (isNaN(presetId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid preset ID'
      });
    }

    const { presetName, description, accessories, isPublic } = req.body;

    // accessories 배열 검증 (있는 경우)
    if (accessories !== undefined && !Array.isArray(accessories)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ACCESSORIES',
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
      preset
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 업데이트 에러:', error);

    if (error.message === 'Preset not found') {
      return res.status(404).json({
        success: false,
        error: 'PRESET_NOT_FOUND',
        message: error.message
      });
    }

    if (error.message === 'Access denied') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: error.message
      });
    }

    // 중복 프리셋 이름 에러 처리
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_PRESET_NAME',
        message: 'A preset with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: error.message
    });
  }
});

/**
 * DELETE /api/presets/:id
 * 프리셋 삭제
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const presetId = parseInt(req.params.id);

    if (isNaN(presetId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Invalid preset ID'
      });
    }

    await deletePreset(presetId, req.userId);

    console.log(`[PRESET] 프리셋 삭제: ${presetId} by ${req.email}`);

    res.json({
      success: true,
      message: 'Preset deleted successfully'
    });
  } catch (error) {
    console.error('[PRESET] 프리셋 삭제 에러:', error);

    if (error.message === 'Preset not found') {
      return res.status(404).json({
        success: false,
        error: 'PRESET_NOT_FOUND',
        message: error.message
      });
    }

    if (error.message === 'Access denied') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'DELETE_FAILED',
      message: error.message
    });
  }
});

module.exports = router;
