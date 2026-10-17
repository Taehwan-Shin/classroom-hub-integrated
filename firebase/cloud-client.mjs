import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, runTransaction, serverTimestamp, setLogLevel } from 'firebase/firestore/lite';
import { renderDiary } from '../dist/diary-view.mjs';
import { splitVault, joinVault } from './vault-parts.mjs';

// SDK failures can include user-scoped paths and request bodies in console logs.
setLogLevel('silent');
let initialized;
async function services() {
  if (!initialized) initialized = (async () => {
    const response = await fetch('./firebase-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Firebase 설정을 읽을 수 없습니다.');
    const config = await response.json();
    if (config.projectId !== 'classroom-diary-098bae6e' || config.authDomain !== `${config.projectId}.firebaseapp.com`) throw new Error('Firebase 설정이 일치하지 않습니다.');
    const app = initializeApp(config);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
    auth.languageCode = 'ko';
    const db = getFirestore(app);
    await auth.authStateReady();
    return { auth, db };
  })().catch(error => { initialized = null; throw error; });
  return initialized;
}
export function cloudBackend(auth, db, uid) {
  const head = doc(db, 'diaryVaults', uid), part = index => doc(head, 'parts', String(index));
  const check = () => { if (auth.currentUser?.uid !== uid) throw new Error('로그인 계정이 변경되었습니다. 다시 로그인해주세요.'); };
  return {
    async read() {
      check();
      for (let attempt = 0; attempt < 2; attempt++) {
        const snapshot = await getDoc(head); check();
        if (!snapshot.exists()) return { revision: null, vault: null };
        const data = snapshot.data();
        if (!Number.isInteger(data.count) || data.count < 1 || data.count > 12) throw new Error('저장 데이터가 손상되었습니다.');
        const parts = await Promise.all(Array.from({ length: data.count }, (_, i) => getDoc(part(i)))); check();
        const latest = await getDoc(head); check();
        if (latest.data()?.revision === data.revision) return joinVault(data, parts.map(p => p.exists() ? p.data() : null));
      }
      throw new Error('다른 창에서 기록이 변경되었습니다. 일기장을 다시 열어주세요.');
    },
    async write({ revision, vault }) {
      check();
      const nextRevision = crypto.randomUUID();
      const { header, parts } = splitVault(vault, nextRevision);
      try {
        await runTransaction(db, async tx => {
          check(); const snapshot = await tx.get(head); check();
          const previous = snapshot.exists() ? snapshot.data() : null;
          if ((previous?.revision || null) !== revision) throw new Error('DIARY_CONFLICT');
          if (previous && previous.salt !== vault.salt) throw new Error('DIARY_SALT');
          tx.set(head, { ...header, createdAt: previous?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
          parts.forEach((data, i) => tx.set(part(i), data));
          for (let i = parts.length; i < (previous?.count || 0); i++) tx.delete(part(i));
        });
        check(); return { revision: nextRevision };
      } catch (error) {
        let conflict = error.message === 'DIARY_CONFLICT';
        if (!conflict && auth.currentUser?.uid === uid) {
          try { const latest = await getDoc(head); conflict = (latest.data()?.revision || null) !== revision; } catch { /* Keep the original safe error message. */ }
        }
        throw new Error(conflict ? '다른 창에서 기록이 변경되었습니다. 입력을 보관한 뒤 잠금 후 다시 여세요.' : '클라우드에 저장하지 못했습니다. 로그인과 네트워크를 확인해주세요. 입력 내용은 유지됩니다.');
      }
    }
  };
}

export function renderCloudDiary(main) {
  let alive = true, cleanup = null, unsubscribe = null, signingIn = false;
  function loginScreen(message = 'Google 계정으로 로그인하여 내 일기장을 여세요.') {
    main.innerHTML = `<section class="diary-page"><a class="back-link" href="#/">← 도구함으로</a><div class="diary-heading"><div><p class="eyebrow">나를 위한 작은 기록</p><h1 tabindex="-1">오늘의 일기</h1><p>어디에서나, 나만의 하루를 이어 쓰세요.</p></div><span class="diary-flower" aria-hidden="true">✳</span></div><section class="diary-paper" id="cloud-login"><h2>나만의 일기장에 오신 것을 환영해요</h2><p id="cloud-status" role="status"></p><button type="button" id="google-sign-in">Google로 로그인</button><p class="diary-help">일기는 암호화하여 내 계정에 저장합니다. Google 로그인 후 별도의 일기장 비밀번호로 내용을 열 수 있습니다. 로그인을 위해 Google에 계정 인증 정보를 제공하며 이 앱은 이름·이메일을 일기 데이터베이스에 복사하지 않습니다. 브라우저를 새로 열면 다시 로그인합니다.</p></section></section>`;
    main.querySelector('#cloud-status').textContent = message;
    main.querySelector('#google-sign-in').addEventListener('click', async event => {
      if (signingIn) return; signingIn = true; event.currentTarget.disabled = true;
      try {
        const { auth } = await services(); if (!alive) return;
        const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
      } catch (error) {
        if (!alive) return;
        const messages = { 'auth/popup-closed-by-user': '로그인을 취소했습니다. 다시 시도할 수 있습니다.', 'auth/popup-blocked': '팝업을 허용한 뒤 다시 로그인해주세요.', 'auth/unauthorized-domain': '이 접속 주소의 로그인이 허용되지 않았습니다. 배포 주소에서 열어주세요.', 'auth/network-request-failed': 'Google에 연결할 수 없습니다. 네트워크를 확인해주세요.' };
        main.querySelector('#cloud-status')?.replaceChildren(document.createTextNode(messages[error.code] || '로그인하지 못했습니다. 잠시 후 다시 시도해주세요.'));
      } finally { signingIn = false; if (alive) { const button = main.querySelector('#google-sign-in'); if (button) button.disabled = false; } }
    });
  }
  loginScreen();
  services().then(({ auth, db }) => {
    if (!alive) return;
    unsubscribe = onAuthStateChanged(auth, user => {
      if (!alive) return;
      cleanup?.(); cleanup = null;
      if (!user) { loginScreen(); return; }
      cleanup = renderDiary(main, cloudBackend(auth, db, user.uid));
      const button = document.createElement('button'); button.type = 'button'; button.className = 'diary-secondary'; button.textContent = 'Google 로그아웃'; button.id = 'google-sign-out';
      main.querySelector('.diary-heading').append(button);
      button.addEventListener('click', async () => {
        if (!cleanup?.canLeave()) return;
        button.disabled = true;
        try { await signOut(auth); } catch { if (alive) { button.disabled = false; main.querySelector('#diary-status').textContent = '로그아웃에 실패했습니다. 다시 시도해주세요.'; } }
      });
    });
  }).catch(() => { if (alive) loginScreen('클라우드 연결을 준비하지 못했습니다. 새로고침 후 다시 시도해주세요.'); });
  const release = () => { alive = false; unsubscribe?.(); cleanup?.(); cleanup = null; main.replaceChildren(); };
  release.canLeave = () => cleanup?.canLeave ? cleanup.canLeave() : !signingIn;
  return release;
}
