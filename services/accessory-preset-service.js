const db = require('../db');
const fs = require('fs').promises;
const path = require('path');

// S3 설정 (프로덕션용)
const isS3Storage = process.env.STORAGE_TYPE === 's3';
let s3Client = null;
let S3Client = null;
let GetObjectCommand = null;
let PutObjectCommand = null;
let DeleteObjectCommand = null;

if (isS3Storage) {
  const AWS = require('@aws-sdk/client-s3');
  S3Client = AWS.S3Client;
  GetObjectCommand = AWS.GetObjectCommand;
  PutObjectCommand = AWS.PutObjectCommand;
  DeleteObjectCommand = AWS.DeleteObjectCommand;

  const s3Config = {
    region: process.env.AWS_REGION || 'ap-northeast-2'
  };

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3Config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
  }

  s3Client = new S3Client(s3Config);
}

/**
 * Stream을 String으로 변환 (S3용 헬퍼 함수)
 */
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

/**
 * 파일 업로드 (S3 or 로컬)
 */
async function uploadFile(filePath, fileBuffer, contentType) {
  if (isS3Storage) {
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: filePath,
      Body: fileBuffer,
      ContentType: contentType
    });
    await s3Client.send(command);
  } else {
    // 로컬 파일 시스템
    const fullPath = path.join(process.env.FILE_SERVER_PATH || './files', filePath);
    const dir = path.dirname(fullPath);

    // 디렉토리 생성
    await fs.mkdir(dir, { recursive: true });

    // 파일 쓰기
    await fs.writeFile(fullPath, fileBuffer);
  }
}

/**
 * 파일 읽기 (S3 or 로컬)
 */
async function readFile(filePath) {
  if (isS3Storage) {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: filePath
    });
    const response = await s3Client.send(command);
    return await streamToString(response.Body);
  } else {
    // 로컬 파일 시스템
    const fullPath = path.join(process.env.FILE_SERVER_PATH || './files', filePath);
    return await fs.readFile(fullPath, 'utf-8');
  }
}

/**
 * 파일 삭제 (S3 or 로컬)
 */
async function deleteFile(filePath) {
  if (isS3Storage) {
    const command = new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: filePath
    });
    await s3Client.send(command);
  } else {
    // 로컬 파일 시스템
    const fullPath = path.join(process.env.FILE_SERVER_PATH || './files', filePath);
    try {
      await fs.unlink(fullPath);
    } catch (error) {
      // 파일이 없어도 무시 (이미 삭제됨)
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

/**
 * 프리셋 저장
 * @param {number} userId - 사용자 ID
 * @param {string} presetName - 프리셋 이름
 * @param {Array} accessories - 액세서리 배열
 * @param {string} description - 프리셋 설명 (optional)
 * @param {boolean} isPublic - 공개 여부 (optional)
 * @returns {Promise<object>} - 생성된 프리셋 정보
 */
async function savePreset(userId, presetName, accessories, description = '', isPublic = false) {
  // 프리셋 JSON 파일 생성
  const presetData = {
    accessories,
    createdAt: Date.now()
  };

  // 파일 경로 생성
  const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
  const filePath = `presets/accessories/${userId}/${fileName}`;

  // JSON을 Buffer로 변환
  const fileBuffer = Buffer.from(JSON.stringify(presetData, null, 2));

  // S3 또는 로컬 스토리지에 저장
  await uploadFile(filePath, fileBuffer, 'application/json');

  // DB에 메타데이터 저장
  const result = await db.query(
    `INSERT INTO accessory_presets (user_id, preset_name, description, file_path, is_public)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, preset_name, description, file_path, is_public, created_at, updated_at`,
    [userId, presetName, description, filePath, isPublic]
  );

  return result.rows[0];
}

/**
 * 사용자의 프리셋 목록 조회
 * @param {number} userId - 사용자 ID
 * @param {boolean} includePublic - 공개 프리셋 포함 여부
 * @returns {Promise<Array>} - 프리셋 목록
 */
async function getUserPresets(userId, includePublic = false) {
  let query;
  let params;

  if (includePublic) {
    // 본인 프리셋 + 공개 프리셋
    query = `
      SELECT id, user_id, preset_name, description, file_path, is_public, created_at, updated_at
      FROM accessory_presets
      WHERE user_id = $1 OR is_public = true
      ORDER BY created_at DESC
    `;
    params = [userId];
  } else {
    // 본인 프리셋만
    query = `
      SELECT id, user_id, preset_name, description, file_path, is_public, created_at, updated_at
      FROM accessory_presets
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    params = [userId];
  }

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * 프리셋 상세 조회 (액세서리 데이터 포함)
 * @param {number} presetId - 프리셋 ID
 * @param {number} userId - 요청 사용자 ID
 * @returns {Promise<object>} - 프리셋 정보 및 액세서리 데이터
 */
async function getPreset(presetId, userId) {
  // DB에서 메타데이터 조회
  const result = await db.query(
    `SELECT id, user_id, preset_name, description, file_path, is_public, created_at, updated_at
     FROM accessory_presets
     WHERE id = $1`,
    [presetId]
  );

  if (result.rows.length === 0) {
    throw new Error('Preset not found');
  }

  const preset = result.rows[0];

  // 권한 확인 (본인이거나 공개 프리셋이어야 함)
  if (preset.user_id !== userId && !preset.is_public) {
    throw new Error('Access denied');
  }

  // S3/로컬에서 파일 읽기
  const fileContent = await readFile(preset.file_path);
  const presetData = JSON.parse(fileContent);

  return {
    ...preset,
    accessories: presetData.accessories
  };
}

/**
 * 프리셋 업데이트
 * @param {number} presetId - 프리셋 ID
 * @param {number} userId - 사용자 ID
 * @param {object} updates - 업데이트할 데이터 { presetName, description, accessories, isPublic }
 * @returns {Promise<object>} - 업데이트된 프리셋 정보
 */
async function updatePreset(presetId, userId, updates) {
  // 기존 프리셋 조회
  const checkResult = await db.query(
    'SELECT user_id, file_path FROM accessory_presets WHERE id = $1',
    [presetId]
  );

  if (checkResult.rows.length === 0) {
    throw new Error('Preset not found');
  }

  const preset = checkResult.rows[0];

  // 권한 확인
  if (preset.user_id !== userId) {
    throw new Error('Access denied');
  }

  // accessories 업데이트가 있는 경우 파일 업데이트
  if (updates.accessories) {
    const presetData = {
      accessories: updates.accessories,
      updatedAt: Date.now()
    };

    const fileBuffer = Buffer.from(JSON.stringify(presetData, null, 2));
    await uploadFile(preset.file_path, fileBuffer, 'application/json');
  }

  // DB 메타데이터 업데이트
  const dbUpdates = [];
  const params = [];
  let paramIndex = 1;

  if (updates.presetName !== undefined) {
    dbUpdates.push(`preset_name = $${paramIndex++}`);
    params.push(updates.presetName);
  }

  if (updates.description !== undefined) {
    dbUpdates.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }

  if (updates.isPublic !== undefined) {
    dbUpdates.push(`is_public = $${paramIndex++}`);
    params.push(updates.isPublic);
  }

  if (dbUpdates.length > 0) {
    params.push(presetId);
    const query = `
      UPDATE accessory_presets
      SET ${dbUpdates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, user_id, preset_name, description, file_path, is_public, created_at, updated_at
    `;

    const result = await db.query(query, params);
    return result.rows[0];
  }

  // 업데이트할 내용이 없으면 기존 데이터 반환
  const result = await db.query(
    `SELECT id, user_id, preset_name, description, file_path, is_public, created_at, updated_at
     FROM accessory_presets WHERE id = $1`,
    [presetId]
  );
  return result.rows[0];
}

/**
 * 프리셋 삭제
 * @param {number} presetId - 프리셋 ID
 * @param {number} userId - 사용자 ID
 * @returns {Promise<void>}
 */
async function deletePreset(presetId, userId) {
  // 기존 프리셋 조회
  const result = await db.query(
    'SELECT user_id, file_path FROM accessory_presets WHERE id = $1',
    [presetId]
  );

  if (result.rows.length === 0) {
    throw new Error('Preset not found');
  }

  const preset = result.rows[0];

  // 권한 확인
  if (preset.user_id !== userId) {
    throw new Error('Access denied');
  }

  // S3/로컬에서 파일 삭제
  await deleteFile(preset.file_path);

  // DB에서 메타데이터 삭제
  await db.query('DELETE FROM accessory_presets WHERE id = $1', [presetId]);
}

module.exports = {
  savePreset,
  getUserPresets,
  getPreset,
  updatePreset,
  deletePreset
};
