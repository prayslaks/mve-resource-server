#!/usr/bin/env node

/**
 * API 문서 자동 생성 스크립트
 *
 * 이 스크립트는 routes/*.js 파일의 Swagger 주석을 읽어
 * OpenAPI 3.0 스펙 JSON 파일(api-spec.json)을 생성합니다.
 *
 * 사용법: npm run docs
 */

const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

console.log('📝 API 문서 생성 시작...\n');

// Swagger JSDoc 옵션
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MVE Resource Server API',
      version: '1.0.0',
      description: `
MVE (Meta Virtual Environment) Resource Server API

이 API는 다음 기능을 제공합니다:
- 🎵 음원 파일 관리 (스트리밍, 업로드, 검색)
- 🎨 3D 모델 파일 관리 (GLB)
- 🤖 AI 기반 3D 모델 생성
- 🎭 아바타 악세서리 프리셋 관리
- 🎪 콘서트 세션 관리

**인증**: 모든 API는 JWT Bearer 토큰 인증이 필요합니다.
**토큰 발급**: [MVE Login Server](https://github.com/prayslaks/mve-login-server)에서 로그인하여 JWT 토큰을 발급받으세요.
      `.trim(),
      contact: {
        name: 'MVE Development Team',
        url: 'https://github.com/prayslaks'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: '로컬 개발 서버'
      },
      {
        url: 'http://your-ec2-public-ip',
        description: 'AWS EC2 프로덕션 서버 (HTTP)'
      },
      {
        url: 'https://your-domain.com',
        description: 'AWS EC2 프로덕션 서버 (HTTPS)'
      }
    ],
    tags: [
      {
        name: 'Audio',
        description: '음원 파일 관리 API (공용 리소스, JWT 인증 필요)'
      },
      {
        name: 'Models',
        description: '3D 모델 파일 관리 API (개인 소유, JWT 인증 필요)'
      },
      {
        name: 'AI Generation',
        description: 'AI 기반 3D 모델 생성 API'
      },
      {
        name: 'Accessory Presets',
        description: '아바타 악세서리 프리셋 관리 API'
      },
      {
        name: 'Concert',
        description: '콘서트 세션 관리 API'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'MVE Login Server에서 발급받은 JWT 토큰을 입력하세요.'
        }
      },
      schemas: {
        // 기하학적 데이터 타입
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

        // 액세서리 관련
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

        // 콘서트 관련
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
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  // routes 폴더의 모든 JavaScript 파일에서 주석 추출
  apis: [
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../middleware/*.js')
  ]
};

try {
  // OpenAPI 스펙 생성
  console.log('🔍 라우트 파일 스캔 중...');
  const spec = swaggerJsdoc(options);

  // working-scripts/outputs 폴더 생성 (없으면)
  const outputDir = path.join(__dirname, '..', 'working-scripts', 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // JSON 파일로 저장
  const outputPath = path.join(outputDir, 'api-spec.json');
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf8');

  console.log('✅ API 문서 생성 완료!');
  console.log(`📄 파일 위치: ${outputPath}`);
  console.log(`📊 총 엔드포인트: ${Object.keys(spec.paths || {}).length}개\n`);

  // 생성된 엔드포인트 목록 출력
  if (spec.paths) {
    console.log('📋 생성된 API 엔드포인트:');
    Object.keys(spec.paths).sort().forEach(path => {
      const methods = Object.keys(spec.paths[path]).filter(m => m !== 'parameters');
      methods.forEach(method => {
        const endpoint = spec.paths[path][method];
        console.log(`  ${method.toUpperCase().padEnd(7)} ${path.padEnd(40)} - ${endpoint.summary || '(설명 없음)'}`);
      });
    });
  }

  console.log('\n💡 다음 명령으로 Swagger UI에서 확인할 수 있습니다:');
  console.log('   npm start');
  console.log('   브라우저에서 http://localhost:3001/api-docs 접속\n');

} catch (error) {
  console.error('❌ API 문서 생성 실패:', error.message);
  console.error(error.stack);
  process.exit(1);
}
