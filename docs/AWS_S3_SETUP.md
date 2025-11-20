# AWS S3 설정 가이드

## 1. S3 버킷 생성

1. AWS Console → S3 → **버킷 만들기**
2. 버킷 이름: `mve-resource-bucket` (고유해야 함)
3. 리전: `ap-northeast-2` (서울) - EC2와 동일 리전 권장
4. 퍼블릭 액세스 차단: **모두 활성화** (Presigned URL 사용으로 퍼블릭 액세스 불필요)
5. 버킷 생성

## 2. 버킷 정책 설정

퍼블릭 액세스가 차단되어 있으므로 버킷 정책은 **설정하지 않아도 됩니다**.

서버가 IAM 자격 증명을 통해 Presigned URL을 생성하고, 클라이언트는 이 임시 URL로 파일에 접근합니다.

## 3. IAM Role 생성 (EC2용)

EC2에서 실행 시 액세스 키 대신 IAM Role을 사용합니다. (보안 권장)

1. IAM → 역할 → **역할 만들기**
2. 신뢰할 수 있는 엔터티: **AWS 서비스** → **EC2**
3. 권한 정책: **정책 생성** 클릭 후 아래 JSON 입력

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::mve-resource-bucket/*"
        }
    ]
}
```

4. 정책 이름: `mve-s3-policy`
5. 역할 이름: `mve-ec2-s3-role`
6. 역할 생성

### EC2 인스턴스에 Role 연결

1. EC2 → 인스턴스 선택 → **작업** → **보안** → **IAM 역할 수정**
2. `mve-ec2-s3-role` 선택
3. 저장

이제 EC2에서 실행되는 애플리케이션은 자동으로 S3 권한을 획득합니다. `.env`에 AWS 자격 증명을 넣을 필요가 없습니다.

## 4. 환경 변수 설정

### 프로덕션 .env (EC2)

```env
# Storage
STORAGE_TYPE=s3
S3_BUCKET=mve-resource-bucket
AWS_REGION=ap-northeast-2

# AWS 자격 증명은 IAM Role이 자동 제공 (설정 불필요)

# DB 설정
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mve_login_db
DB_USER=postgres
DB_PASSWORD=your-password

# JWT (로그인 서버와 동일)
JWT_SECRET=your-jwt-secret
```

### 개발 .env (로컬)

```env
STORAGE_TYPE=local
FILE_SERVER_PATH=./files

DB_HOST=localhost
DB_PORT=5432
DB_NAME=mve_resource
DB_USER=postgres
DB_PASSWORD=your-password

JWT_SECRET=your-jwt-secret
```

## 5. CORS 설정 (선택)

버킷 → 권한 → CORS:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": []
    }
]
```

## 6. 테스트

```bash
# EC2에서 패키지 설치
npm install

# 서버 실행
npm start

# 업로드 테스트
curl -X POST http://localhost:3001/api/audio/upload \
  -H "Authorization: Bearer <token>" \
  -F "audio=@test.aac" \
  -F "title=Test Song"
```

S3에 `audio/` 폴더에 파일이 업로드되고, DB에 S3 key가 저장됩니다.

## 7. Presigned URL 동작 방식

이 서버는 **퍼블릭 액세스 대신 Presigned URL**을 사용합니다:

1. 클라이언트가 오디오 스트리밍 요청
2. 서버가 S3에서 임시 URL 생성 (기본 1시간 유효)
3. 클라이언트에게 Presigned URL 반환
4. 클라이언트가 해당 URL로 직접 S3에서 파일 다운로드

**장점:**
- 버킷을 퍼블릭으로 열 필요 없음 (보안 강화)
- URL 만료 시간 제어 가능
- 접근 로그 추적 용이

## 비용 예상 (포트폴리오 규모)

### AWS 프리 티어 (12개월)

| 서비스 | 무료 제공량 |
|--------|-------------|
| S3 저장소 | 5GB |
| PUT/POST 요청 | 2,000건 |
| GET 요청 | 20,000건 |
| 데이터 전송 (아웃) | 100GB |

### 프리 티어 초과 시 요금

| 항목 | 요금 |
|------|------|
| 저장소 | $0.023/GB/월 |
| PUT 요청 | $0.005/1,000건 |
| GET 요청 | $0.0004/1,000건 |
| 데이터 전송 | $0.09/GB (첫 10TB) |

**예상 월 비용: $1~5 이하** (대부분 무료 티어로 커버)
