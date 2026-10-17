import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, getDoc, doc } from 'firebase/firestore/lite';
import { cloudBackend } from '../firebase/cloud-client.mjs';
import { deriveKey, newSalt, seal, unseal } from '../dist/diary-crypto.mjs';
const config = { projectId:'demo-classroom-diary', apiKey:'synthetic-emulator-key', authDomain:'demo-classroom-diary.firebaseapp.com' };
async function client(sub,name) {
  const app = initializeApp(config,name), auth = initializeAuth(app,{persistence:inMemoryPersistence});
  connectAuthEmulator(auth,'http://127.0.0.1:9098',{disableWarnings:true});
  const db=getFirestore(app); connectFirestoreEmulator(db,'127.0.0.1',8087);
  const credential=GoogleAuthProvider.credential(JSON.stringify({sub,email:`${sub}@example.invalid`,email_verified:true,name:'Synthetic'}));
  const result=await signInWithCredential(auth,credential);
  return {app,auth,db,uid:result.user.uid,backend:cloudBackend(auth,db,result.user.uid)};
}
const apps=[];
try {
  const a=await client('synthetic-flow-owner','synthetic-flow-a'); apps.push(a.app);
  assert.equal((await a.backend.read()).vault,null);
  const salt=newSalt(),key=await deriveKey('synthetic-flow-password',salt);
  const entries=Array.from({length:12},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,title:'Synthetic',body:'합성'.repeat(9500),mood:'평온'}));
  let result=await a.backend.write({revision:null,vault:await seal(entries,key,salt)});
  const stored=await a.backend.read(); assert.deepEqual(await unseal(stored.vault,key),entries);
  const head=await getDoc(doc(a.db,'diaryVaults',a.uid)); assert.ok(head.data().count>1);
  assert.ok(!JSON.stringify(head.data()).includes('Synthetic'));
  const other=await client('synthetic-flow-other','synthetic-flow-other-client');apps.push(other.app);
  await assert.rejects(getDoc(doc(other.db,'diaryVaults',a.uid)));
  const fresh=await client('synthetic-flow-owner','synthetic-flow-fresh');apps.push(fresh.app);
  assert.deepEqual(await unseal((await fresh.backend.read()).vault,key),entries);
  const one=await seal([entries[0]],key,salt);
  const concurrency=await Promise.allSettled([a.backend.write({revision:result.revision,vault:one}),fresh.backend.write({revision:result.revision,vault:await seal([],key,salt)})]);
  assert.equal(concurrency.filter(x=>x.status==='fulfilled').length,1);
  assert.ok(concurrency.find(x=>x.status==='rejected').reason.message.includes('다른 창'));
  const current=await a.backend.read();
  result=await a.backend.write({revision:current.revision,vault:one});
  assert.equal((await getDoc(doc(a.db,'diaryVaults',a.uid))).data().count,1);
  assert.equal((await getDoc(doc(a.db,'diaryVaults',a.uid,'parts','1'))).exists(),false);
  await a.backend.write({revision:result.revision,vault:await seal([],key,salt)});
  assert.deepEqual(await unseal((await a.backend.read()).vault,key),[]);
  await signOut(a.auth); await assert.rejects(a.backend.read());
  console.log('PASS: Google Auth emulator → encrypted multi-part Firestore → recovery, owner isolation, conflict, shrink cleanup, delete, logout');
} finally { await Promise.all(apps.map(deleteApp)); }
