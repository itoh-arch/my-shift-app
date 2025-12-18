import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { 
  Calendar, User, CheckCircle2, XCircle, Clock, Plus, Trash2, Settings,
  LogOut, MoreHorizontal, ChevronLeft, ChevronRight, Edit3, MessageSquare,
  X, Key, RefreshCw, AlertTriangle, Loader2, Check, ArrowRight, ShieldAlert
} from 'lucide-react';

// --- Firebase Configuration ---
// 【重要】Vercelなどで公開する際は、Firebaseコンソールから取得した実際の設定に書き換えてください。
let firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Sandbox環境と本番環境の共存ロジック
const getSandboxConfig = () => {
  if (typeof window !== 'undefined' && window.__firebase_config) {
    try {
      return JSON.parse(window.__firebase_config);
    } catch (e) {
      return null;
    }
  }
  return null;
};

const sandboxConfig = getSandboxConfig();
if (sandboxConfig) {
  firebaseConfig = sandboxConfig;
}

// Firebaseの初期化
let app;
let auth;
let db;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase initialization failed:", e);
}

// appIdの定義（スラッシュが含まれる場合のセグメント数エラー対策）
const getAppId = () => {
  const sid = (typeof window !== 'undefined' && window.__app_id) ? window.__app_id : 'shift-flow-production-v1';
  return sid.replace(/\//g, '_'); // スラッシュをアンダースコアに変換
};
const appId = getAppId();

// --- 固定スタッフリスト ---
const STAFF_LIST = [
  { id: "staff-1", name: "田中 太郎" },
  { id: "staff-2", name: "佐藤 花子" },
  { id: "staff-3", name: "鈴木 一郎" },
  { id: "staff-4", name: "高橋 次郎" },
  { id: "staff-5", name: "伊藤 美紀" }
];

const INITIAL_TASKS = ["アノテーションA", "アノテーションB", "実験A", "実験B"];
const TASK_COLORS = ['bg-indigo-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-cyan-600', 'bg-fuchsia-600', 'bg-orange-600', 'bg-lime-600'];

export default function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null); 
  const [currentUserProfile, setCurrentUserProfile] = useState(null); 
  const [dates, setDates] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [authStep, setAuthStep] = useState('login'); 
  const [inputAccountId, setInputAccountId] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [storedPasswords, setStoredPasswords] = useState({});
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isResetDone, setIsResetDone] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [availability, setAvailability] = useState({});
  const [assignments, setAssignments] = useState({});
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  
  const [selectedTask, setSelectedTask] = useState("");
  const [editingCell, setEditingCell] = useState(null); 
  const [tempInput, setTempInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [permissionError, setPermissionError] = useState(false);
  const [configError, setConfigError] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskInput, setNewTaskInput] = useState("");

  // 1. 認証フロー (匿名ログインまたはトークンログイン)
  useEffect(() => {
    if (!auth) {
      setConfigError(true);
      return;
    }
    const initAuth = async () => {
      try {
        const token = (typeof window !== 'undefined' && window.__initial_auth_token) ? window.__initial_auth_token : null;
        if (token) {
          await signInWithCustomToken(auth, token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth init failed:", err);
        if (err.code === 'auth/api-key-not-valid' || err.code === 'auth/invalid-api-key') {
          setConfigError(true);
        }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // 2. データ同期 (ログイン済みユーザーのみ)
  useEffect(() => {
    if (!user || !db) return;

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = [];
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= lastDay; i++) {
      days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }
    setDates(days);

    const handleSyncError = (err) => {
      console.error("Sync error:", err);
      if (err.code === 'permission-denied') setPermissionError(true);
    };

    // odd number segments 構成のコレクションパス
    const authColl = collection(db, 'artifacts', appId, 'public', 'data', 'auth');
    const availColl = collection(db, 'artifacts', appId, 'public', 'data', 'availability');
    const assignColl = collection(db, 'artifacts', appId, 'public', 'data', 'assignments');
    const tasksDoc = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'tasks');

    const unsubPass = onSnapshot(authColl, (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data().password; });
      setStoredPasswords(data);
      setIsDataLoaded(true);
    }, handleSyncError);

    const unsubAvail = onSnapshot(availColl, (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setAvailability(data);
    }, handleSyncError);

    const unsubAssign = onSnapshot(assignColl, (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setAssignments(data);
    }, handleSyncError);

    const unsubTasks = onSnapshot(tasksDoc, (snap) => {
      if (snap.exists()) {
        const list = snap.data().list || INITIAL_TASKS;
        setTasks(list);
        if (!selectedTask && list.length > 0) setSelectedTask(list[0]);
      }
    }, handleSyncError);

    return () => { unsubPass(); unsubAvail(); unsubAssign(); unsubTasks(); };
  }, [user, currentMonth, selectedTask]);

  // --- Functions ---
  const changeMonth = (offset) => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  const getTaskColor = (name) => TASK_COLORS[tasks.indexOf(name) % TASK_COLORS.length] || 'bg-gray-400';
  const getCellKey = (sid, d) => `${sid}-${d}`;

  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage("");
    const tid = inputAccountId.trim().toLowerCase();
    if (!tid) return setErrorMessage("IDを入力してください");
    let profile = (tid === 'manager') ? { id: 'manager', name: '管理者' } : STAFF_LIST.find(s => s.id === tid);
    if (!profile) return setErrorMessage("IDが見つかりません。");

    const existingPass = storedPasswords[profile.id];
    if (authStep === 'login') return setAuthStep(existingPass ? 'challenge' : 'setup');

    if (authStep === 'setup') {
      if (inputPassword.length < 4) return setErrorMessage("4文字以上で設定してください");
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'auth', profile.id), { password: inputPassword });
      setCurrentUserProfile(profile);
      setUserRole(tid === 'manager' ? 'manager' : 'staff');
    } else if (inputPassword === existingPass) {
      setCurrentUserProfile(profile);
      setUserRole(tid === 'manager' ? 'manager' : 'staff');
    } else {
      setErrorMessage("パスワードが違います");
    }
  };

  const handleResetPasswordAction = async () => {
    const tid = inputAccountId.trim().toLowerCase();
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'auth', tid));
    setShowResetConfirm(false); setAuthStep('setup'); setInputPassword(""); setIsResetDone(true);
  };

  const saveAvail = async (sid, d, payload) => {
    const key = getCellKey(sid, d);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'availability', key), { ...(availability[key] || {}), ...payload });
    setEditingCell(null);
  };

  const saveAssign = async (sid, d, taskName) => {
    const key = getCellKey(sid, d);
    const avail = availability[key];
    if ((!avail || !avail.type) && taskName !== "") return setErrorMessage("予定未入力のためアサイン不可");
    if (avail?.type === 'ng' && taskName !== "") return setErrorMessage("勤務不可のためアサイン不可");
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'assignments', key), { task: taskName });
  };

  const handleDragStart = (sid, d) => { if (userRole === 'manager') { setIsDragging(true); setDragStart({ sid, d }); setDragCurrent({ sid, d }); } };
  const handleDragEnd = async () => {
    if (!isDragging) return;
    const s1 = STAFF_LIST.findIndex(s => s.id === dragStart.sid);
    const s2 = STAFF_LIST.findIndex(s => s.id === dragCurrent.sid);
    const d1 = dates.indexOf(dragStart.d);
    const d2 = dates.indexOf(dragCurrent.d);
    for (let i = Math.min(s1, s2); i <= Math.max(s1, s2); i++)
      for (let j = Math.min(d1, d2); j <= Math.max(d1, d2); j++)
        await saveAssign(STAFF_LIST[i].id, dates[j], selectedTask);
    setIsDragging(false); setDragStart(null); setDragCurrent(null);
  };

  // --- Error & Auth Views ---
  if (configError) return (
    <div className="flex items-center justify-center h-screen bg-slate-900 p-6 text-center text-slate-900 font-sans">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-lg">
        <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-6" />
        <h2 className="text-xl font-black mb-4">Firebase設定エラー</h2>
        <p className="text-slate-500 mb-8 font-bold text-sm">`firebaseConfig` の値が有効ではありません。Firebaseコンソールから取得した実際の設定値を貼り付けてください。</p>
        <button onClick={() => window.location.reload()} className="w-full py-4 bg-slate-100 text-slate-600 font-black rounded-2xl">再読み込み</button>
      </div>
    </div>
  );

  if (permissionError) return (
    <div className="flex items-center justify-center h-screen bg-slate-900 p-6 text-center text-slate-900 font-sans">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-lg">
        <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-6" />
        <h2 className="text-xl font-black mb-4">権限エラー</h2>
        <p className="text-slate-500 mb-8 font-bold text-sm">Firebaseコンソールの[ルール]タブの設定を完了させ、「公開」ボタンを必ず押してください。</p>
        <button onClick={() => window.location.reload()} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl">再読み込み</button>
      </div>
    </div>
  );

  if (!currentUserProfile) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 p-4 text-slate-800 font-sans">
        {showResetConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full text-center shadow-2xl text-slate-900">
              <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
              <h3 className="text-xl font-black mb-2">初期化確認</h3>
              <p className="text-sm font-bold text-slate-500 mb-8">現在の設定を消去して新しく設定し直しますか？</p>
              <div className="flex gap-3"><button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">いいえ</button><button onClick={handleResetPasswordAction} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold">はい</button></div>
            </div>
          </div>
        )}
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10">
          {!isDataLoaded ? (
            <div className="flex flex-col items-center py-10 gap-4"><Loader2 className="animate-spin text-indigo-600" size={40}/><p className="font-black text-slate-400 uppercase text-[10px]">Connecting...</p></div>
          ) : (
            <form onSubmit={handleLoginSubmit}>
              <div className="text-center mb-10"><div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"><Calendar className="text-white" size={32} /></div><h1 className="text-2xl font-black text-slate-900">ShiftFlow Pro</h1></div>
              <div className="space-y-4">
                <div className="relative"><User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20}/><input type="text" placeholder="ID (staff-1等)" value={inputAccountId} disabled={authStep !== 'login'} onChange={(e) => setInputAccountId(e.target.value)} className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-600 outline-none font-bold text-slate-900" /></div>
                {authStep !== 'login' && <div className="relative animate-in slide-in-from-top-2 duration-300"><Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20}/><input type="password" autoFocus placeholder={authStep === 'setup' ? "新パスワード" : "パスワード"} value={inputPassword} onChange={(e) => setInputPassword(e.target.value)} className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-600 outline-none font-bold text-slate-900" /></div>}
              </div>
              {errorMessage && <div className="mt-4 text-rose-500 text-[10px] font-black flex items-center gap-1"><AlertTriangle size={12}/>{errorMessage}</div>}
              <button type="submit" className="w-full py-5 rounded-2xl bg-indigo-600 text-white font-black mt-8 hover:bg-indigo-700 shadow-xl transition-all">ログイン</button>
              {authStep === 'challenge' && <button type="button" onClick={() => setShowResetConfirm(true)} className="w-full py-3 text-slate-400 font-bold text-[10px] mt-2 flex items-center justify-center gap-1 hover:text-rose-500 transition-colors uppercase tracking-widest"><RefreshCw size={12}/>初期化</button>}
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans select-none overflow-hidden" onMouseUp={handleDragEnd}>
      <header className="bg-white border-b px-8 py-4 flex items-center justify-between shadow-sm z-50 shrink-0 text-slate-800">
        <div className="flex items-center gap-5">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-md"><Calendar className="text-white" size={20} /></div>
          <div><h1 className="text-lg font-black leading-none text-slate-900">ShiftFlow Pro</h1><div className="flex items-center gap-2 mt-1"><span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">{userRole}</span><div className="flex items-center gap-2 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 text-slate-600"><button onClick={() => changeMonth(-1)}><ChevronLeft size={14}/></button><span className="text-[10px] font-black min-w-[70px] text-center">{currentMonth.getFullYear()}年 {currentMonth.getMonth()+1}月</span><button onClick={() => changeMonth(1)}><ChevronRight size={14}/></button></div></div></div>
        </div>
        <div className="flex items-center gap-4"><div className="px-4 py-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3 shadow-sm"><div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shadow-sm ${userRole === 'manager' ? 'bg-slate-800 text-white' : 'bg-emerald-500 text-white'}`}>{currentUserProfile.name[0]}</div><span className="text-sm font-black text-slate-800">{currentUserProfile.name}</span></div><button onClick={() => window.location.reload()} className="p-2 text-slate-300 hover:text-rose-500 transition-all"><LogOut size={22} /></button></div>
      </header>

      <main className="flex-1 flex overflow-hidden text-slate-800">
        {userRole === 'manager' && (
          <aside className="w-72 bg-white border-r p-6 flex flex-col gap-8 shrink-0 shadow-lg z-20 overflow-y-auto">
            <div className="flex items-center justify-between font-black text-slate-400"><h2 className="text-[10px] uppercase tracking-widest">業務選択</h2><button onClick={() => setShowAddTask(!showAddTask)} className="text-slate-400 hover:text-indigo-600 transition-colors"><Plus size={18}/></button></div>
            {showAddTask && (<div className="p-4 bg-indigo-50 rounded-2xl border-2 border-indigo-100 mb-4 animate-in slide-in-from-top-2"><input autoFocus type="text" placeholder="業務名..." value={newTaskInput} onChange={(e) => setNewTaskInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (async () => { if(!newTaskInput.trim()) return; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'tasks'), { list: [...tasks, newTaskInput.trim()] }); setNewTaskInput(""); setShowAddTask(false); })()} className="w-full p-3 rounded-xl border-none outline-none text-xs font-bold mb-3 shadow-inner text-slate-900" /><div className="flex gap-2"><button onClick={() => setShowAddTask(false)} className="flex-1 text-[10px] font-black text-slate-400">閉じる</button><button onClick={async () => { if(!newTaskInput.trim()) return; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'tasks'), { list: [...tasks, newTaskInput.trim()] }); setNewTaskInput(""); setShowAddTask(false); }} className="flex-[2] py-2 bg-indigo-600 text-white text-[10px] rounded-lg font-bold">追加</button></div></div>)}
            <div className="space-y-2">{tasks.map(t => (<button key={t} onClick={() => setSelectedTask(t)} className={`w-full flex items-center justify-between p-4 rounded-xl transition-all border-2 ${selectedTask === t ? `${getTaskColor(t)} text-white shadow-lg ring-4 ring-indigo-50` : 'border-slate-50 bg-slate-50/50 hover:bg-slate-50'}`}><span className="text-sm font-black truncate pr-6">{t}</span><div className={`w-2 h-2 rounded-full ${selectedTask === t ? 'bg-white animate-pulse' : getTaskColor(t)} shadow-sm`} /></button>))}</div>
          </aside>
        )}

        <div className="flex-1 overflow-auto p-8 bg-slate-50/50">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 min-w-max overflow-hidden relative text-slate-800">
            <table className="w-full border-collapse"><thead className="bg-slate-50 border-b"><tr><th className="sticky left-0 z-40 bg-slate-50 p-8 text-left border-r w-64 text-[10px] text-slate-400 font-black uppercase tracking-widest">Attendance</th>{dates.map(d => { const dt = new Date(d); return (<th key={d} className="p-6 border-r min-w-[220px] text-center text-slate-800"><div className="text-[10px] text-slate-400 uppercase mb-1 font-black">{dt.toLocaleDateString('ja-JP', { weekday: 'short' })}</div><div className={`text-2xl font-black ${dt.getDay() === 0 ? 'text-rose-500' : dt.getDay() === 6 ? 'text-sky-500' : 'text-slate-800'}`}>{dt.getDate()}</div></th>); })}</tr></thead>
              <tbody>{STAFF_LIST.map(staff => { const isMy = currentUserProfile?.id === staff.id; if (userRole === 'staff' && !isMy) return null; return (<tr key={staff.id} className="border-b border-slate-50 group text-slate-800">
                <td className="sticky left-0 z-30 bg-white p-6 border-r group-hover:bg-slate-50 transition-colors shadow-sm text-slate-800"><div className="flex items-center gap-4"><div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg ${isMy ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-100 text-slate-400'}`}>{staff.name[0]}</div><div className="flex flex-col text-slate-800"><span className="text-sm font-black text-slate-800">{staff.name}</span>{isMy && <span className="text-[8px] font-black text-indigo-500 uppercase tracking-tighter">Owner</span>}</div></div></td>
                {dates.map(d => {
                  const key = getCellKey(staff.id, d);
                  const avail = availability[key];
                  const assign = (assignments[key] && typeof assignments[key].task === 'string') ? assignments[key].task : "";
                  const canEdit = userRole === 'manager' || isMy;
                  const isS = !!(dragStart && dragCurrent && getAffectedKeys().includes(key));
                  return (<td key={d} onMouseDown={() => handleDragStart(staff.id, d)} onMouseEnter={() => isDragging && setDragCurrent({ sid: staff.id, d })} onClick={() => canEdit && (userRole === 'manager' ? saveAssign(staff.id, d, assign === selectedTask ? "" : selectedTask) : setEditingCell({ staffId: staff.id, d, mode: 'avail' }))} className={`relative p-4 h-32 border-r border-slate-50 transition-all cursor-pointer ${isS ? 'bg-indigo-50' : 'hover:bg-slate-50/50'}`}><div className={`absolute top-4 right-4 p-1.5 rounded-lg border transition-all shadow-sm ${avail?.type === 'ok' ? 'bg-green-100 text-green-700 border-green-200' : avail?.type === 'ng' ? 'bg-red-100 text-red-700 border-red-200' : ''}`}>{avail?.type === 'ok' ? <CheckCircle2 size={14}/> : avail?.type === 'ng' ? <XCircle size={14}/> : null}</div><div className="w-full h-full flex flex-col justify-center items-center gap-3 font-black text-slate-800">{assign && <div className={`w-full py-2.5 px-3 ${getTaskColor(assign)} text-white text-[11px] rounded-xl shadow-md truncate animate-in zoom-in`}>{assign}</div>}</div>{canEdit && (<button onClick={(e) => { e.stopPropagation(); setEditingCell({ sid: staff.id, d, mode: 'memo' }); setTempInput(avail?.memo || ""); }} className="absolute bottom-2 right-2 p-1.5 text-slate-200 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all"><Edit3 size={14}/></button>)}{editingCell?.sid === staff.id && editingCell?.d === d && (<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] bg-white p-6 flex flex-col gap-4 rounded-[2rem] shadow-2xl border border-indigo-100 w-[260px]" onClick={e => e.stopPropagation()}>{editingCell.mode === 'avail' ? (<div className="flex flex-col gap-2 font-black text-slate-800"><div className="text-[10px] uppercase text-slate-400 text-center mb-1">Status</div><button onClick={() => saveAvail(staff.id, d, { type: 'ok' })} className="py-3 bg-green-500 text-white rounded-xl shadow-lg">○ 全日可能</button><button onClick={() => saveAvail(staff.id, d, { type: 'ng' })} className="py-3 bg-rose-500 text-white rounded-xl shadow-lg">× 終日不可</button><button onClick={() => setEditingCell({ ...editingCell, mode: 'memo' })} className="py-3 bg-slate-100 rounded-xl text-slate-600 font-bold">メモ</button><div className="flex gap-2 mt-2"><button onClick={() => saveAvail(staff.id, d, { type: null, memo: "" })} className="flex-1 border-2 text-[10px] rounded-xl py-2 font-bold text-slate-400">RESET</button><button onClick={() => setEditingCell(null)} className="p-2 bg-slate-100 rounded-xl text-slate-400"><X size={20}/></button></div></div>) : (<div className="flex flex-col h-full"><div className="flex items-center gap-2 mb-4 font-black text-slate-400"><MessageSquare size={18} className="text-indigo-600"/><label className="text-[10px] uppercase">MEMO</label></div><textarea autoFocus value={tempInput} onChange={(e) => setTempInput(e.target.value)} className="flex-1 w-full p-4 bg-slate-50 border-2 rounded-[1.5rem] outline-none text-[12px] font-bold mb-4 shadow-inner text-slate-800" /><div className="flex gap-3"><button onClick={() => setEditingCell({ ...editingCell, mode: 'avail' })} className="p-3 bg-slate-100 rounded-xl text-slate-400"><ChevronLeft size={20}/></button><button onClick={() => { saveAvail(staff.id, d, { memo: tempInput }); setTempInput(""); }} className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg">保存</button></div></div>)}</div>)}</td>); })}</tr>); })}</tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
