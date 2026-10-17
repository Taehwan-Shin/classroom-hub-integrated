# PDF 기능의 외부 구성 요소

| 구성 요소 | 고정 버전 | 공식 출처·라이선스 |
|---|---|---|
| pdfjs-dist | 6.4.299 | [Mozilla PDF.js](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299), Apache-2.0 |
| tesseract.js | 6.0.1 | [Tesseract.js](https://github.com/naptha/tesseract.js), Apache-2.0 |
| tesseract.js-core | 6.1.2 | [Tesseract.js Core](https://github.com/naptha/tesseract.js-core), Apache-2.0 |
| @tesseract.js-data/kor, /eng | 각 1.0.0, best_int | [언어 데이터 출처](https://github.com/naptha/tessdata), [학습 데이터 Apache-2.0](https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE) |

npm 패키지 메타데이터에서 언어 데이터 포장은 MIT로 표시되지만 실제 학습 데이터는 출처의 Apache-2.0 라이선스를 함께 보존한다. PDF 글꼴·CMap의 별도 저작권 고지도 `dist/vendor/pdfjs`에 보존했다. 엔진·번들 고지는 `dist/vendor/tesseract`에 포함했다.

npm 공식 레지스트리 tarball만 내려받아 메타데이터의 SHA-512 integrity와 대조한 뒤 필요한 브라우저 파일을 복사했다. 설치·postinstall 스크립트는 실행하지 않았다. tarball URL·버전·해시는 `dist/vendor/pdfjs-source.json`, `dist/vendor/ocr-source.json`에 기록했다. npm의 해시는 패키지 일치 검증이며 소스의 완전한 보안 감사를 의미하지 않는다.

기존 번들 PDF.js 5.6.205 대신 보안 수정 이후 버전을 선택했다. [Mozilla 공식 권고 GHSA-hq66-cqwq-w95j](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j)의 수정 버전은 6.2.108이다. PDF JavaScript 평가·XFA·외부 폰트 로딩을 비활성화하고 파일을 URL이 아닌 바이트로 전달한다.

OCR은 검증한 Tesseract.js 6.x 프로토콜과 호환되는 core 6.1.2를 고정했다. `local-ocr.mjs`는 해당 worker의 RPC를 직접 호출하므로 엔진을 바꿀 때 로딩·초기화·인식·오류·초기화 중 취소를 다시 검사해야 한다. 모델은 압축 데이터를 정적 JavaScript에 포함하고 worker 내부의 지정된 모델 경로에만 메모리 응답을 제공한다. 임의 URL은 거부하며 IndexedDB 캐시를 사용하지 않는다. WebAssembly는 내장된 core 스크립트로 제공한다.

엑셀 생성에는 외부 라이브러리를 추가하지 않았다. ZIP CRC32와 OOXML을 작성하며 모든 문자열을 inlineStr로 기록해 수식 실행을 막는다. 검증에는 기존 JSZip·openpyxl·pypdf를 사용했으며 이들은 실행 앱에 포함하지 않는다.

업데이트 시 공식 보안 권고·라이선스·변경 내용을 검토하고 새 버전·integrity를 기록한다. `scripts/vendor-local.mjs`는 검증된 로컬 추출본만 복사하며 자동 다운로드나 자동 업데이트를 하지 않는다. 일반적인 손상 문서 검사는 했지만 임의 악성 PDF 전체에 대한 안전성을 증명한 것은 아니다. 파서·OCR은 브라우저 sandbox와 자원 제한 안에서 실행한다.
