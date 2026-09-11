/* محاكٍ لواجهة Firebase compat التي يستخدمها horofi-v11-9-29.html.
   يُقدَّم بدل firebase-app-compat.js، ويغطّي فقط ما يستدعيه التطبيق فعلاً:
     firebase.initializeApp / auth() / firestore() / functions()
     auth.onAuthStateChanged, currentUser, signInAnonymously, signOut,
     signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail
     user.linkWithCredential, user.delete
     firebase.auth.EmailAuthProvider.credential
     db.collection().doc().get/set/update/delete/onSnapshot
     firebase.firestore.FieldValue.serverTimestamp
   لا يُطلق onAuthStateChanged من تلقاء نفسه — الاختبار يتحكّم بذلك عبر
   window.__fb.setUser(user) كي يكون كل سيناريو حتمياً. */
(function () {
  const authListeners = [];
  const store = Object.create(null);        // 'users/uid' -> بيانات المستند
  const snapListeners = Object.create(null); // path -> [callback]
  const calls = { createUserWithEmailAndPassword: 0, linkWithCredential: 0, signInAnonymously: 0, signOut: 0 };
  let currentUser = null;

  function mkUser(props) {
    const u = Object.assign({
      uid: 'u_' + Math.random().toString(36).slice(2, 8),
      isAnonymous: false,
      email: null,
      async linkWithCredential(cred) {
        calls.linkWithCredential++;
        this.isAnonymous = false;
        this.email = cred.email;
        return { user: this };
      },
      async delete() { setUser(null); },
      async getIdToken() { return 'mock-token'; },
    }, props || {});
    return u;
  }

  function setUser(u) {
    currentUser = u;
    auth.currentUser = u;
    authListeners.slice().forEach(cb => { try { cb(u); } catch (e) { console.error('onAuthStateChanged listener threw', e); } });
  }

  const auth = {
    currentUser: null,
    onAuthStateChanged(cb) { authListeners.push(cb); return () => {}; },
    async signInAnonymously() { calls.signInAnonymously++; setUser(mkUser({ uid: 'anon_' + Date.now(), isAnonymous: true })); return { user: currentUser }; },
    async signOut() { calls.signOut++; setUser(null); },
    async signInWithEmailAndPassword(email) { setUser(mkUser({ uid: 'email_' + email, email })); return { user: currentUser }; },
    async createUserWithEmailAndPassword(email) { calls.createUserWithEmailAndPassword++; setUser(mkUser({ uid: 'new_' + Date.now(), email })); return { user: currentUser }; },
    async sendPasswordResetEmail() {},
  };

  function snapshotOf(path) { return { exists: path in store, data: () => store[path] }; }
  function notify(path) { (snapListeners[path] || []).forEach(cb => cb(snapshotOf(path))); }

  function docRef(path) {
    return {
      path,
      async get() { return snapshotOf(path); },
      async set(data, opts) {
        store[path] = (opts && opts.merge) ? Object.assign({}, store[path] || {}, data) : Object.assign({}, data);
        notify(path);
      },
      async update(data) { store[path] = Object.assign({}, store[path] || {}, data); notify(path); },
      async delete() { delete store[path]; notify(path); },
      onSnapshot(cb) {
        (snapListeners[path] = snapListeners[path] || []).push(cb);
        cb(snapshotOf(path));
        return () => { snapListeners[path] = (snapListeners[path] || []).filter(x => x !== cb); };
      },
      collection(name) { return colRef(path + '/' + name); },
    };
  }
  function colRef(path) { return { doc(id) { return docRef(path + '/' + id); } }; }
  const db = { collection(name) { return colRef(name); } };

  const authFn = () => auth;
  authFn.EmailAuthProvider = { credential: (email, password) => ({ email, password }) };
  const fsFn = () => db;
  fsFn.FieldValue = { serverTimestamp: () => '__server_ts__' };

  window.firebase = {
    initializeApp() { return {}; },
    auth: authFn,
    firestore: fsFn,
    functions: () => ({ httpsCallable: () => async () => ({ data: {} }) }),
  };

  /* مقبض الاختبار */
  window.__fb = {
    setUser, mkUser, store, calls,
    get currentUser() { return currentUser; },
    /* كتابة مستند مع إخطار المستمعين — يحاكي تغييراً من الخادم (مثل Cloud Function تكتب subscribed) */
    serverWrite(path, data) { store[path] = Object.assign({}, store[path] || {}, data); notify(path); },
  };
})();
