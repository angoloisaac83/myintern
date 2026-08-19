import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAKkg9fQyGJl7O4XB8b9SN4v5VAmZDY9LE",
  authDomain: "clover-ddbe7.firebaseapp.com",
  databaseURL: "https://clover-ddbe7-default-rtdb.firebaseio.com",
  projectId: "clover-ddbe7",
  storageBucket: "clover-ddbe7.firebasestorage.app",
  messagingSenderId: "958427777468",
  appId: "1:958427777468:web:3df1c7ec4dbb2f4df9c3b9",
  measurementId: "G-VTVJJYSS70"
};

export function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig)
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp())
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp())
}
