import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBN2SAf14WVGubUDY7x0PQf1f8S_kPF22w",
  authDomain: "budget-app-ea711.firebaseapp.com",
  projectId: "budget-app-ea711",
  storageBucket: "budget-app-ea711.firebasestorage.app",
  messagingSenderId: "515535768732",
  appId: "1:515535768732:web:ce7ffd1dcb555ad53cf159",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);