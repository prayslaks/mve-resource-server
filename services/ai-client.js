const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

/**
 * AI 서버 클라이언트
 * 언리얼 클라이언트의 USenderReceiver 기능을 Node.js로 구현
 */
class AIClient {
    constructor() {
        this.serverURL = process.env.AI_SERVER_URL || 'http://localhost:8000';
        this.timeout = parseInt(process.env.AI_SERVER_TIMEOUT) || 180000; // 3분
        this.generateEndpoint = '/generate_3D_obj';

        console.log(`[AI Client] Initialized with server: ${this.serverURL}`);
    }

    /**
     * AI 생성 요청 (언리얼의 RequestGeneration 함수와 동일)
     * @param {string} prompt - 생성 프롬프트
     * @param {string} userEmail - 사용자 이메일
     * @param {string|null} imagePath - 선택적 이미지 파일 경로
     * @returns {Promise<Object>} 서버 응답
     */
    async requestGeneration(prompt, userEmail, imagePath = null) {
        console.log('[AI Client] 생성 요청 시작');
        console.log(`  - Prompt: ${prompt}`);
        console.log(`  - User Email: ${userEmail}`);
        console.log(`  - Image: ${imagePath || '없음'}`);

        try {
            // FormData 객체 생성 (multipart/form-data)
            const formData = new FormData();

            // 1. 이미지 파일 먼저 추가 (있는 경우)
            if (imagePath && fs.existsSync(imagePath)) {
                console.log(`[AI Client] 이미지 파일 로드: ${imagePath}`);
                const ext = path.extname(imagePath).toLowerCase();

                // MIME 타입 결정
                let mimeType = 'image/png';
                if (ext === '.jpg' || ext === '.jpeg') {
                    mimeType = 'image/jpeg';
                } else if (ext === '.webp') {
                    mimeType = 'image/webp';
                }

                // 파일 스트림으로 추가 (Postman과 동일)
                formData.append('image', fs.createReadStream(imagePath), {
                    filename: path.basename(imagePath),
                    contentType: mimeType
                });
            } else if (imagePath) {
                console.warn(`[AI Client] 이미지 파일이 존재하지 않음: ${imagePath}`);
            }

            // 2. Prompt 추가
            formData.append('prompt', prompt);

            // 3. User Email 추가
            formData.append('user_email', userEmail);

            // HTTP 요청 전송 (axios 사용 - Postman과 동일한 방식)
            const fullURL = this.serverURL + this.generateEndpoint;
            console.log(`[AI Client] API Full URL: ${fullURL}`);
            console.log(`[AI Client] 요청 전송 중...`);

            const response = await axios.post(fullURL, formData, {
                headers: formData.getHeaders(),
                timeout: this.timeout,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            // 응답 처리
            console.log(`[AI Client] 응답 코드: ${response.status}`);
            console.log(`[AI Client] 응답 내용:`, response.data);

            if (response.status === 200) {
                console.log('[AI Client] ✓ 생성 요청이 큐에 등록되었습니다');
                return {
                    success: true,
                    data: response.data
                };
            }

            return {
                success: false,
                error: 'UNKNOWN_ERROR',
                message: response.data,
                statusCode: response.status
            };

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error(`[AI Client] ✗ 요청 타임아웃 (${this.timeout}ms)`);
                return {
                    success: false,
                    error: 'TIMEOUT',
                    message: `Request timeout after ${this.timeout}ms`
                };
            }

            if (error.response) {
                // 서버가 응답했지만 오류 상태 코드
                const statusCode = error.response.status;
                const message = error.response.data;

                console.error(`[AI Client] ✗ 서버 응답 오류 (${statusCode}):`, message);

                if (statusCode >= 400 && statusCode < 500) {
                    return {
                        success: false,
                        error: 'CLIENT_ERROR',
                        message: message,
                        statusCode: statusCode
                    };
                } else if (statusCode >= 500) {
                    return {
                        success: false,
                        error: 'SERVER_ERROR',
                        message: message,
                        statusCode: statusCode
                    };
                }
            }

            console.error('[AI Client] ✗ 요청 실패:', error.message);
            return {
                success: false,
                error: 'NETWORK_ERROR',
                message: error.message
            };
        }
    }

    /**
     * 에셋 다운로드 (언리얼의 DownloadFileServer 함수와 동일)
     * @param {string} assetURL - 다운로드할 에셋 URL
     * @param {string} savePath - 저장할 로컬 경로
     * @returns {Promise<Object>} 다운로드 결과
     */
    async downloadAsset(assetURL, savePath) {
        console.log('[AI Client] 에셋 다운로드 시작');
        console.log(`  - URL: ${assetURL}`);
        console.log(`  - Save Path: ${savePath}`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(assetURL, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.status !== 200) {
                console.error(`[AI Client] 다운로드 실패 (코드: ${response.status})`);
                return {
                    success: false,
                    error: 'DOWNLOAD_FAILED',
                    statusCode: response.status
                };
            }

            // 바이너리 데이터 추출
            const buffer = await response.buffer();
            console.log(`[AI Client] 다운로드 완료: ${buffer.length} bytes`);

            // 디렉토리 생성 (필요시)
            const dir = path.dirname(savePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`[AI Client] 디렉토리 생성: ${dir}`);
            }

            // 파일 저장
            fs.writeFileSync(savePath, buffer);
            console.log(`[AI Client] ✓ 파일 저장 완료: ${savePath}`);

            return {
                success: true,
                filePath: savePath,
                size: buffer.length
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error(`[AI Client] ✗ 다운로드 타임아웃 (${this.timeout}ms)`);
                return {
                    success: false,
                    error: 'TIMEOUT',
                    message: `Download timeout after ${this.timeout}ms`
                };
            }

            console.error('[AI Client] ✗ 다운로드 실패:', error.message);
            return {
                success: false,
                error: 'DOWNLOAD_ERROR',
                message: error.message
            };
        }
    }

    /**
     * 요청 ID 생성 (UUID v4 형식)
     * @returns {string} UUID
     */
    generateRequestId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 파일 확장자로부터 에셋 타입 결정
     * @param {string} extension - 파일 확장자 (예: 'glb', 'png')
     * @returns {string} 에셋 타입
     */
    getAssetTypeFromExtension(extension) {
        const ext = extension.toLowerCase().replace('.', '');
        const typeMap = {
            'glb': 'MESH',
            'gltf': 'MESH',
            'png': 'IMAGE',
            'jpg': 'IMAGE',
            'jpeg': 'IMAGE',
            'webp': 'IMAGE',
            'wav': 'AUDIO',
            'mp3': 'AUDIO',
            'mp4': 'VIDEO'
        };
        return typeMap[ext] || 'GENERIC';
    }
}

// 싱글톤 인스턴스 생성
const aiClient = new AIClient();

module.exports = aiClient;
