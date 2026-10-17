import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
const projectId = 'demo-classroom-diary';
const env = await initializeTestEnvironment({ projectId, firestore: { host:'127.0.0.1', port:8087, rules: await readFile(new URL('../firestore.rules', import.meta.url),'utf8') } });
const token = { firebase: { sign_in_provider:'google.com' } };
const owner = env.authenticatedContext('synthetic-owner', token).firestore(), other = env.authenticatedContext('synthetic-other', token).firestore(), anon = env.unauthenticatedContext().firestore();
const ref = db => doc(db,'diaryVaults','synthetic-owner'), partRef = (db,n='0') => doc(ref(db),'parts',n);
const revision = () => crypto.randomUUID();
const salt = 'AAAAAAAAAAAAAAAAAAAAAA==', iv = 'AAAAAAAAAAAAAAAA';
const header = rev => ({ version:1, iterations:600000, salt, iv, revision:rev, count:1, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
const part = rev => ({ revision:rev,index:0,ciphertext:'AAAAAAAAAAAAAAAAAAAAAA==' });
let passed = 0;
async function denied(label, promise) { await assertFails(promise); passed++; }
async function allowed(label, promise) { await assertSucceeds(promise); passed++; }
try {
  await env.clearFirestore();
  await denied('anonymous read',getDoc(ref(anon)));
  await denied('other owner read',getDoc(ref(other)));
  await denied('anonymous list',getDocs(collection(anon,'diaryVaults')));
  await denied('owner list',getDocs(collection(owner,'diaryVaults')));
  await denied('other owner create',setDoc(ref(other),header(revision())));
  await denied('anonymous create',setDoc(ref(anon),header(revision())));
  const rev = revision();
  const batch = writeBatch(owner); batch.set(ref(owner),header(rev)); batch.set(partRef(owner),part(rev));
  await allowed('atomic owner create',batch.commit());
  await allowed('owner read',getDoc(ref(owner))); await allowed('owner chunk read',getDoc(partRef(owner)));
  await denied('other chunk read',getDoc(partRef(other)));
  await denied('chunk list',getDocs(collection(ref(owner),'parts')));
  await denied('other update',updateDoc(ref(other),{iv}));
  await denied('other delete',deleteDoc(partRef(other)));
  await denied('orphan chunk',setDoc(doc(owner,'diaryVaults','synthetic-owner-orphan','parts','0'),part(rev)));
  const base = (await getDoc(ref(owner))).data();
  for (const [label,change] of [
    ['invalid version',{version:2}],['wrong kdf',{iterations:1}],['extra privilege',{admin:true}],['plaintext field',{body:'SYNTHETIC'}],
    ['bad count',{count:13}],['negative count',{count:-1}],['type juggling',{count:'1'}],['bad iv',{iv:1}],['invalid salt',{salt:'bad'}],
    ['salt modification',{salt:'BBBBBBBBBBBBBBBBBBBBBB=='}],['createdAt modification',{createdAt:Timestamp.fromMillis(0)}],['fake timestamp',{updatedAt:Timestamp.fromMillis(0)}],
    ['unchanged revision',{revision:base.revision}],['huge revision',{revision:'A'.repeat(1000000)}]
  ]) await denied(label,setDoc(ref(owner),{...base,revision:revision(),updatedAt:serverTimestamp(),...change}));
  const missing = {...base,revision:revision(),updatedAt:serverTimestamp()}; delete missing.iv;
  await denied('missing required field',setDoc(ref(owner),missing));
  for(const [label,change] of [['large ciphertext',{ciphertext:'A'.repeat(700001)}],['plaintext ciphertext',{ciphertext:'<script>'}],['wrong index',{index:1}],['index type',{index:'0'}],['extra data',{email:'synthetic@example.invalid'}],['wrong revision',{revision:revision()}]])
    await denied(label,setDoc(partRef(owner),{...part(base.revision),...change}));
  await denied('active chunk deletion',deleteDoc(partRef(owner)));
  await denied('head deletion',deleteDoc(ref(owner)));
  const changed = revision(), edit = writeBatch(owner);
  edit.set(ref(owner),{...base,revision:changed,updatedAt:serverTimestamp()}); edit.set(partRef(owner),part(changed));
  await allowed('atomic update',edit.commit());
  await denied('unknown collection',setDoc(doc(owner,'profiles','synthetic-owner'),{isAdmin:true}));
  console.log(`PASS: ${passed} Firestore security checks (synthetic identities only)`);
} finally { await env.cleanup(); }
