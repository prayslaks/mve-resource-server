const fs = require('fs');
const path = require('path');

/**
 * 전체 코드베이스에서 'code: '...' 패턴을 검색하고 통계를 내는 스크립트
 */

// 검색할 디렉토리 목록
const searchDirs = [
  './'
];

// 제외할 디렉토리
const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage'];

// 검색할 파일 확장자
const includeExtensions = ['.js', '.ts', '.jsx', '.tsx'];

// code 패턴 정규식 (code: 'VALUE' 또는 code: "VALUE" 형태)
const codePatternRegex = /code:\s*['"]([^'"]+)['"]/g;

/**
 * 디렉토리를 재귀적으로 탐색하여 파일 목록 가져오기
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) {
    return arrayOfFiles;
  }

  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // 제외 디렉토리가 아니면 재귀 탐색
      if (!excludeDirs.includes(file)) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      }
    } else {
      // 확장자 필터링
      const ext = path.extname(file);
      if (includeExtensions.includes(ext)) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

/**
 * 파일에서 code 패턴 추출
 */
function extractCodesFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const codes = [];
  let match;

  while ((match = codePatternRegex.exec(content)) !== null) {
    codes.push({
      code: match[1],
      file: filePath,
      line: content.substring(0, match.index).split('\n').length
    });
  }

  return codes;
}

/**
 * 메인 실행 함수
 */
function main() {
  console.log('='.repeat(80));
  console.log('코드베이스 Error Code 통계 분석');
  console.log('='.repeat(80));
  console.log();

  // 모든 파일 수집
  let allFiles = [];
  searchDirs.forEach(dir => {
    const files = getAllFiles(dir);
    allFiles = allFiles.concat(files);
  });

  console.log(`📁 검색 대상 파일: ${allFiles.length}개`);
  console.log();

  // 모든 파일에서 code 패턴 추출
  const allCodes = [];
  const fileWithCodes = [];

  allFiles.forEach(file => {
    const codes = extractCodesFromFile(file);
    if (codes.length > 0) {
      allCodes.push(...codes);
      fileWithCodes.push({ file, count: codes.length });
    }
  });

  console.log(`✅ 총 발견된 code 패턴: ${allCodes.length}개`);
  console.log(`📄 code가 포함된 파일: ${fileWithCodes.length}개`);
  console.log();

  // 통계 집계
  const codeStats = {};
  allCodes.forEach(item => {
    if (!codeStats[item.code]) {
      codeStats[item.code] = {
        count: 0,
        locations: []
      };
    }
    codeStats[item.code].count++;
    codeStats[item.code].locations.push({
      file: path.relative(process.cwd(), item.file),
      line: item.line
    });
  });

  // 정렬 (빈도순)
  const sortedCodes = Object.entries(codeStats).sort((a, b) => b[1].count - a[1].count);

  // 결과 출력
  console.log('='.repeat(80));
  console.log('📊 Error Code 통계 (빈도순)');
  console.log('='.repeat(80));
  console.log();

  sortedCodes.forEach(([code, data], index) => {
    console.log(`${index + 1}. ${code}: ${data.count}회`);
  });

  console.log();
  console.log('='.repeat(80));
  console.log('📋 상세 정보 (코드별 사용 위치)');
  console.log('='.repeat(80));
  console.log();

  sortedCodes.forEach(([code, data]) => {
    console.log(`\n🔹 ${code} (${data.count}회)`);
    console.log('-'.repeat(60));

    // 최대 10개까지만 표시
    const locationsToShow = data.locations.slice(0, 10);
    locationsToShow.forEach(loc => {
      console.log(`   ${loc.file}:${loc.line}`);
    });

    if (data.locations.length > 10) {
      console.log(`   ... 외 ${data.locations.length - 10}개 위치`);
    }
  });

  console.log();
  console.log('='.repeat(80));
  console.log('📈 요약');
  console.log('='.repeat(80));
  console.log(`총 고유 코드 종류: ${sortedCodes.length}개`);
  console.log(`총 사용 횟수: ${allCodes.length}회`);
  console.log(`평균 사용 횟수: ${(allCodes.length / sortedCodes.length).toFixed(2)}회/코드`);
  console.log();

  // JSON 파일로 저장
  const outputData = {
    summary: {
      totalCodes: allCodes.length,
      uniqueCodes: sortedCodes.length,
      filesWithCodes: fileWithCodes.length,
      totalFilesScanned: allFiles.length,
      generatedAt: new Date().toISOString()
    },
    statistics: sortedCodes.map(([code, data]) => ({
      code,
      count: data.count,
      locations: data.locations
    }))
  };

  // working-scripts/outputs 폴더 생성 (없으면)
  const outputDir = path.join(__dirname, '..', 'working-scripts', 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'response-code-statistics.json');
  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2), 'utf-8');
  console.log(`💾 상세 통계가 ${path.relative(process.cwd(), outputFile)}에 저장되었습니다.`);
  console.log();
}

// 실행
try {
  main();
} catch (error) {
  console.error('오류 발생:', error.message);
  process.exit(1);
}
