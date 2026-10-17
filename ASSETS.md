# 교실 도구 허브 일러스트

내장 image_gen 도구로 새로 생성한 네 장을 사용한다. 기존 캐릭터나 외부 이미지 사이트에서 가져온 그림이 아니다. 생성 원본은 Codex generated_images에 보존하고 웹용 파생 파일은 아래 프로젝트 경로에 저장했다. 웹용 파일은 960×640 WebP이며, 새 npm 패키지 없이 기존 Pillow로 크기·포맷만 변환했다. 앱은 외부 이미지·글꼴·아이콘 CDN을 호출하지 않는다.

| 경로 | 내용 | 용량 |
|---|---|---|
| dist/assets/illustrations/timer-v1.webp | 살구색 배경, 초시계·연필·활동 카드 | 31,038바이트 |
| dist/assets/illustrations/pdf-v1.webp | 청록 배경, 교정지·돋보기·체크 | 45,288바이트 |
| dist/assets/illustrations/forest-v1.webp | 연두 배경, 지도 보는 다람쥐·거북이 | 62,518바이트 |
| dist/assets/illustrations/journal-v1.webp | 연보라 배경, 펼친 노트·연필·책갈피 | 42,980바이트 |

네 장 합계 181,824바이트(약 178KiB). 허브의 아래쪽 두 이미지는 지연 로딩한다. 숲 그림은 게임 선택 화면에서도 재사용한다. 실제 게임 캐릭터의 캔버스 렌더링과 물리·채점·저장은 유지한다. 이미지에는 개인정보·비밀번호·실제 문서가 들어 있지 않다. 이미지가 로드되지 않아도 카드 이름·설명·링크는 표시된다.

조작 아이콘은 CSS의 고정 SVG 도형으로 직접 작성했다. Lucide 파일·패키지를 복사하지 않았으며 새 라이브러리와 라이선스 의존성이 없다. 카드 그림은 장식으로 숨기고, 게임 표지에는 설명 alt를 제공한다. 시스템 한글 글꼴을 유지하고 컬러는 장식·태그 배경에만 사용한다.

## 최종 생성 프롬프트

아래 공통 프롬프트와 각 주제 프롬프트를 이어 붙여 한 장씩 생성했다. 투명 배경은 사용하지 않았다.

```text
Create a production web app card illustration, landscape 3:2, for a Korean teacher's classroom tool hub. Warm stationery shop editorial style, elegant playful flat hand-drawn illustration, rounded dark cocoa outlines 2-3px, solid cream fills, sparse orange #ff6f1e accents, very subtle paper texture, generous clean negative space around central composition, natural restrained shadows. Sophisticated friendly high school teacher audience, no childish huge eyes, no photorealism, no 3D. Background edge must be a flat solid specified color, no border or enclosing frame. NO letters, numbers, words, mathematical typography, watermark, brands or UI. Keep all objects inside central 75% with 12% margins.
```

타이머:
```text
Background pastel apricot #fff0e3. A large analog stopwatch with orange hand and simple tick marks, a small blank activity card and pencil, one little star sticker. Evoke focus and classroom time.
```

PDF:
```text
Background pale teal #e9f3ef. A neat stack of cream document sheets with dark horizontal lines and orange proofreader marks, magnifier over a green check mark, tiny paperclip. Evoke local document checking.
```

숲:
```text
Background pale sage #edf2df. A friendly cinnamon squirrel with a fluffy curled tail and a sage turtle, both carrying tiny ochre school satchels, exploring a folded blank trail map between two stylized trees, little acorn and star. Side-on simple character silhouettes, cohesive warm dark outlines.
```

일기:
```text
Background pale lavender #f0ebf6. An open cream notebook with blank ruled pages, terracotta pencil resting diagonally, small lavender bookmark ribbon, little orange sun sticker and leaf. Evoke a quiet personal journal.
```
