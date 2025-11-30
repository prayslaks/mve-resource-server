const redis = require('redis');

// Redis 클라이언트 생성
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      // 최대 10번 재시도, 지수 백오프
      if (retries > 10) {
        console.error('[REDIS] Max reconnection attempts reached');
        return new Error('Max reconnection attempts reached');
      }
      const delay = Math.min(retries * 100, 3000);
      console.log(`[REDIS] Reconnecting in ${delay}ms... (attempt ${retries})`);
      return delay;
    }
  },

  // 비밀번호가 필요한 경우
  password: process.env.REDIS_PASSWORD || undefined
});

// 연결 이벤트 리스너
redisClient.on('connect', () => {
  console.log('[REDIS] Connecting to Redis server...');
});

redisClient.on('ready', () => {
  console.log('[REDIS] Redis client ready');
  console.log(`[REDIS] Connected to ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
});

redisClient.on('error', (err) => {
  console.error('[REDIS] Redis client error:', err.message);
});

redisClient.on('reconnecting', () => {
  console.log('[REDIS] Redis client reconnecting...');
});

redisClient.on('end', () => {
  console.log('[REDIS] Redis client disconnected');
});

// 서버 시작 시 Redis 연결
(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('[REDIS] Failed to connect to Redis:', error.message);
    console.error('[REDIS] Server will continue without Redis.');
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[REDIS] Closing Redis connection...');
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[REDIS] Closing Redis connection...');
  await redisClient.quit();
  process.exit(0);
});

module.exports = redisClient;
