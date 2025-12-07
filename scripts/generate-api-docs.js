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

  // JSON 파일로 저장
  const outputPath = path.join(__dirname, '../docs/api-spec.json');
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
