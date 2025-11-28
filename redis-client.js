const redis = require('redis');

// Redis 클라이언트 생성
const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  password: process.env.REDIS_PASSWORD || undefined
});

// 연결 성공 이벤트
client.on('connect', () => {
  console.log('✅ Redis 연결 성공');
});

// 에러 이벤트
client.on('error', (err) => {
  console.error('❌ Redis 에러:', err);
});

// Redis 연결 시작
(async () => {
  try {
    await client.connect();
  } catch (error) {
    console.error('❌ Redis 연결 실패:', error);
  }
})();

module.exports = client;
