/**
 * OpenAPI 스키마 정의 파일
 *
 * 이 파일은 MVE Resource Server의 모든 API 스키마를 단일 소스로 관리합니다.
 * generate-api-specs.js에서 이 파일을 import하여 사용합니다.
 *
 * ⚠️ 중요: routes/*.js 파일에는 스키마를 정의하지 마세요!
 * 모든 스키마 정의는 이 파일에서만 수정하세요.
 */

module.exports = {
  // ============================================
  // 공통 응답 스키마
  // ============================================
  BaseResponse: {
    type: 'object',
    description: '기본 API 응답 포맷 (모든 API가 이 구조를 따름)',
    required: ['success', 'code', 'message'],
    properties: {
      success: {
        type: 'boolean',
        description: '요청 성공 여부',
        example: true
      },
      code: {
        type: 'integer',
        description: '응답 코드 (HTTP 상태 코드와 유사)',
        example: 200
      },
      message: {
        type: 'string',
        description: '응답 메시지',
        example: 'Success'
      }
    }
  },

  ErrorResponse: {
    type: 'object',
    description: '에러 응답 포맷',
    required: ['success', 'code', 'message'],
    properties: {
      success: {
        type: 'boolean',
        description: '항상 false',
        example: false
      },
      code: {
        type: 'integer',
        description: '에러 코드',
        example: 400
      },
      message: {
        type: 'string',
        description: '에러 메시지',
        example: 'Invalid request'
      }
    }
  },

  // ============================================
  // 기하학적 데이터 타입
  // ============================================
  Vector3D: {
    type: 'object',
    description: '3D 벡터 (위치)',
    required: ['x', 'y', 'z'],
    properties: {
      x: {
        type: 'number',
        description: 'X 좌표',
        example: 0
      },
      y: {
        type: 'number',
        description: 'Y 좌표',
        example: 0
      },
      z: {
        type: 'number',
        description: 'Z 좌표',
        example: 0
      }
    }
  },

  Rotator: {
    type: 'object',
    description: '3D 회전 (Pitch, Yaw, Roll)',
    required: ['pitch', 'yaw', 'roll'],
    properties: {
      pitch: {
        type: 'number',
        description: 'Pitch (상하 회전)',
        example: 0
      },
      yaw: {
        type: 'number',
        description: 'Yaw (좌우 회전)',
        example: 0
      },
      roll: {
        type: 'number',
        description: 'Roll (롤 회전)',
        example: 0
      }
    }
  },

  // ============================================
  // Audio 관련 스키마
  // ============================================
  AudioFile: {
    type: 'object',
    description: '음원 파일 정보',
    required: ['id', 'title', 'filePath', 'fileSize', 'format', 'createdAt'],
    properties: {
      id: {
        type: 'integer',
        description: '음원 ID',
        example: 1
      },
      title: {
        type: 'string',
        description: '음원 제목',
        example: 'Sample Track 1'
      },
      artist: {
        type: 'string',
        nullable: true,
        description: '아티스트',
        example: 'Artist A'
      },
      filePath: {
        type: 'string',
        description: '파일 경로',
        example: 'audio/sample1.m4a'
      },
      fileSize: {
        type: 'integer',
        description: '파일 크기 (bytes)',
        example: 3145728
      },
      duration: {
        type: 'integer',
        nullable: true,
        description: '재생 시간 (초)',
        example: 180
      },
      format: {
        type: 'string',
        description: '파일 포맷',
        example: 'm4a'
      },
      createdAt: {
        type: 'string',
        format: 'date-time',
        description: '생성 시간'
      }
    }
  },

  // ============================================
  // Model 관련 스키마
  // ============================================
  ModelInfo: {
    type: 'object',
    description: '3D 모델 파일 정보',
    required: ['id', 'modelName', 'filePath', 'fileSize', 'isAiGenerated', 'createdAt', 'updatedAt'],
    properties: {
      id: {
        type: 'integer',
        description: '모델 ID',
        example: 1
      },
      modelName: {
        type: 'string',
        description: '모델 이름',
        example: 'My Avatar'
      },
      filePath: {
        type: 'string',
        description: '파일 경로',
        example: 'models/user1/avatar.glb'
      },
      fileSize: {
        type: 'integer',
        description: '파일 크기 (bytes)',
        example: 5242880
      },
      thumbnailPath: {
        type: 'string',
        nullable: true,
        description: '썸네일 경로',
        example: 'models/user1/avatar_thumb.jpg'
      },
      isAiGenerated: {
        type: 'boolean',
        description: 'AI로 생성된 모델 여부 (true: AI 생성, false: 직접 업로드)',
        example: false
      },
      createdAt: {
        type: 'string',
        format: 'date-time',
        description: '생성 시간'
      },
      updatedAt: {
        type: 'string',
        format: 'date-time',
        description: '수정 시간'
      }
    }
  },

  AIJobStatus: {
    type: 'object',
    description: 'AI 작업 상태 정보',
    required: ['jobId', 'status', 'prompt', 'createdAt'],
    properties: {
      jobId: {
        type: 'string',
        format: 'uuid',
        description: '작업 ID',
        example: '123e4567-e89b-12d3-a456-426614174000'
      },
      status: {
        type: 'string',
        enum: ['queued', 'processing', 'completed', 'failed'],
        description: '작업 상태',
        example: 'processing'
      },
      prompt: {
        type: 'string',
        description: 'AI 생성 프롬프트',
        example: 'A futuristic robot character'
      },
      createdAt: {
        type: 'string',
        format: 'date-time',
        description: '작업 생성 시간'
      },
      completedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: '작업 완료 시간'
      },
      modelId: {
        type: 'integer',
        nullable: true,
        description: '생성된 모델 ID (완료 시)',
        example: 42
      },
      downloadUrl: {
        type: 'string',
        nullable: true,
        description: '다운로드 URL (완료 시)',
        example: 'https://example.com/models/generated/model.glb'
      },
      errorMessage: {
        type: 'string',
        nullable: true,
        description: '에러 메시지 (실패 시)',
        example: 'Model generation failed'
      }
    }
  },

  DeletedModelInfo: {
    type: 'object',
    description: '삭제된 모델 정보',
    required: ['id', 'modelName'],
    properties: {
      id: {
        type: 'integer',
        description: '모델 ID',
        example: 1
      },
      modelName: {
        type: 'string',
        description: '모델 이름',
        example: 'My Avatar'
      }
    }
  },

  // ============================================
  // Accessory 관련 스키마
  // ============================================
  Accessory: {
    type: 'object',
    description: '아바타 액세서리',
    required: ['socketName', 'relativeLocation', 'relativeRotation', 'modelUrl'],
    properties: {
      socketName: {
        type: 'string',
        description: '소켓 이름',
        example: 'hand_socket'
      },
      relativeLocation: {
        $ref: '#/components/schemas/Vector3D'
      },
      relativeRotation: {
        $ref: '#/components/schemas/Rotator'
      },
      relativeScale: {
        type: 'number',
        format: 'float',
        description: '상대적 스케일',
        example: 1.0
      },
      modelUrl: {
        type: 'string',
        description: '3D 모델 URL',
        example: 'https://example.com/models/microphone.glb'
      }
    }
  },

  AccessoryPreset: {
    type: 'object',
    description: '액세서리 프리셋',
    required: ['id', 'userId', 'presetName', 'accessories', 'isPublic', 'createdAt', 'updatedAt'],
    properties: {
      id: {
        type: 'integer',
        description: '프리셋 ID',
        example: 1
      },
      userId: {
        type: 'integer',
        description: '소유자 사용자 ID',
        example: 1
      },
      presetName: {
        type: 'string',
        description: '프리셋 이름',
        example: 'My Preset'
      },
      description: {
        type: 'string',
        nullable: true,
        description: '프리셋 설명',
        example: 'My favorite accessories'
      },
      accessories: {
        type: 'array',
        description: '액세서리 목록',
        items: {
          $ref: '#/components/schemas/Accessory'
        }
      },
      isPublic: {
        type: 'boolean',
        description: '공개 여부',
        example: false
      },
      createdAt: {
        type: 'string',
        format: 'date-time',
        description: '생성 시간'
      },
      updatedAt: {
        type: 'string',
        format: 'date-time',
        description: '수정 시간'
      }
    }
  },

  // ============================================
  // Concert 관련 스키마
  // ============================================
  ConcertSong: {
    type: 'object',
    description: '콘서트 노래',
    required: ['songNum', 'audioId', 'streamUrl', 'stageDirectionId'],
    properties: {
      songNum: {
        type: 'integer',
        description: '곡 번호',
        example: 1
      },
      audioId: {
        type: 'integer',
        description: '오디오 ID',
        example: 12345
      },
      streamUrl: {
        type: 'string',
        description: '스트림 URL',
        example: 'https://example.com/stream/song1.mp3'
      },
      stageDirectionId: {
        type: 'integer',
        description: '무대 연출 ID',
        example: 1
      }
    }
  },

  ListenServer: {
    type: 'object',
    description: '리슨 서버 정보',
    required: ['localIP', 'port'],
    properties: {
      localIP: {
        type: 'string',
        description: '로컬 IP 주소',
        example: '192.168.0.100'
      },
      port: {
        type: 'integer',
        description: '포트 번호',
        example: 7777
      },
      publicIP: {
        type: 'string',
        nullable: true,
        description: '공인 IP 주소',
        example: '203.0.113.1'
      },
      publicPort: {
        type: 'integer',
        nullable: true,
        description: '공인 포트 번호',
        example: 7777
      }
    }
  },

  ConcertInfo: {
    type: 'object',
    description: '콘서트 정보',
    required: ['roomId', 'studioUserId', 'studioName', 'concertName', 'songs', 'accessories', 'maxAudience', 'createdAt', 'isOpen', 'currentSong', 'currentAudience'],
    properties: {
      roomId: {
        type: 'string',
        description: '콘서트 방 ID',
        example: 'concert_1702345678901_abc123def'
      },
      studioUserId: {
        type: 'integer',
        description: '스튜디오 사용자 ID',
        example: 1
      },
      studioName: {
        type: 'string',
        description: '스튜디오 이름',
        example: 'studio@example.com'
      },
      concertName: {
        type: 'string',
        description: '콘서트 이름',
        example: 'My Concert'
      },
      songs: {
        type: 'array',
        description: '노래 목록',
        items: {
          $ref: '#/components/schemas/ConcertSong'
        }
      },
      accessories: {
        type: 'array',
        description: '액세서리 목록',
        items: {
          $ref: '#/components/schemas/Accessory'
        }
      },
      maxAudience: {
        type: 'integer',
        description: '최대 관객 수',
        example: 100
      },
      createdAt: {
        type: 'integer',
        description: '생성 시간 (Unix timestamp)',
        example: 1702345678901
      },
      listenServer: {
        allOf: [
          { $ref: '#/components/schemas/ListenServer' }
        ],
        nullable: true,
        description: '리슨 서버 정보'
      },
      isOpen: {
        type: 'boolean',
        description: '개방 여부',
        example: true
      },
      currentSong: {
        type: 'integer',
        description: '현재 재생 중인 곡 번호',
        example: 0
      },
      currentAudience: {
        type: 'integer',
        description: '현재 관객 수',
        example: 5
      }
    }
  }
};