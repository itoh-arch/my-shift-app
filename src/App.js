import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { 
  Calendar, 
  User, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Plus, 
  Trash2, 
  Settings,
  ClipboardList,
  LogOut,
  MoreHorizontal,
  Lock, 
  ChevronLeft,
  ChevronRight,
  Edit3,
  MessageSquare,
  Save,
  X,
  Key,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Check,
  ArrowRight,
  LogIn
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAZ1DljhSsHe87xYGq7mtMz2ZPsBuz3wYk",
  authDomain: "shift-manager-app-126d2.firebaseapp.com",
  projectId: "shift-manager-app-126d2",
  storageBucket: "shift-manager-app-126d2.firebasestorage.app",
  messagingSenderId: "10042553386",
  appId: "1:10042553386:web:af0c32658646c453ff3f53"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'shift-manager-pro-v3';

// --- Constants ---
const STAFF_LIST = [
  { id: "staff-1", name: "田中 太郎" },
  { id: "staff-2", name: "佐藤 花子" },
  { id: "staff-3", name: "鈴木 一郎" },
  { id: "staff-4", name: "高橋 次郎" },
  { id: "staff-5", name: "伊藤 美紀" }
];

const INITIAL_TASKS = ["アノテーションA", "アノテーションB", "実験A", "実験B"];

const TASK_COLORS = [
  'bg-indigo-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 
  'bg-cyan-600', 'bg-fuchsia-600', 'bg-orange-600', 'bg-lime-600'
];

const App = () => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null); 
  const [currentUserProfile, setCurrentUserProfile] = useState(null); 
  const [dates, setDates] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date()); // 表示月の管理
  
  // Auth states
  const [authStep, setAuthStep] = useState('login'); 
  const [inputAccountId, setInputAccountId] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [storedPasswords, setStoredPasswords] = useState({});
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isResetDone, setIsResetDone] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Firestore Data States
  const [availability, setAvailability] = useState({});
  const [assignments, setAssignments] = useState({});
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  
  // UI States
  const [selectedTask, setSelectedTask] = useState(INITIAL_TASKS[0]);
  const [editingCell, setEditingCell] = useState(null); 
  const [tempInput, setTempInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  
  // 業務追加用
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskInput, setNewTaskInput] = useState("");

  // 1. Authentication Initialize
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Data Synchronization & Date Generation
  useEffect(() => {
    if (!user) return;

    // 月の日付を生成
    const generateMonthDates = (baseDate) => {
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      const days = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d).toISOString().split('T')[0]);
      }
      return days;
    };
    setDates(generateMonthDates(currentMonth));

    const unsubPass = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'auth'), (snap) => {
      const data = {};
      snap.forEach(d => { data[d.id] = d.data().password; });
      setStoredPasswords(data);
      setIsDataLoaded(true);
    });

    const unsubAvail = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'availability'), (snapshot) => {
      const data = {};
      snapshot.forEach(doc => { data[doc.id] = doc.data(); });
      setAvailability(data);
    });

    const unsubAssign = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'assignments'), (snapshot) => {
      const data = {};
      snapshot.forEach(doc => { data[doc.id] = doc.data(); });
      setAssignments(data);
    });

    const unsubTasks = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'tasks'), (docSnap) => {
      if (docSnap.exists()) {
        setTasks(docSnap.data().list || INITIAL_TASKS);
      }
    });

    return () => { unsubPass(); unsubAvail(); unsubAssign(); unsubTasks(); };
  }, [user, currentMonth]); // 月が変更されたら再生成

  // --- Month Navigation ---
  const changeMonth = (offset) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    setCurrentMonth(next);
  };

  // --- Handlers ---
  const handleLoginSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage("");
    setIsResetDone(false);

    const targetId = inputAccountId.trim().toLowerCase();
    if (!targetId) {
      setErrorMessage("ユーザーIDを入力してください");
      return;
    }

    let foundProfile = null;
    let role = 'staff';

    if (targetId === 'manager') {
      foundProfile = { id: 'manager', name: '管理者' };
      role = 'manager';
    } else {
      foundProfile = STAFF_LIST.find(s => s.id === targetId);
    }

    if (!foundProfile) {
      setErrorMessage("IDが見つかりません。staff-1?5 または manager を入力してください。");
      return;
    }

    const existingPass = storedPasswords[foundProfile.id];

    if (authStep === 'login') {
      if (existingPass) {
        setAuthStep('challenge');
      } else {
        setAuthStep('setup');
      }
      return;
    }

    if (authStep === 'setup') {
      if (inputPassword.length < 4) {
        setErrorMessage("4文字以上のパスワードを設定してください");
        return;
      }
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'auth', foundProfile.id), { password: inputPassword });
        setCurrentUserProfile(foundProfile);
        setUserRole(role);
      } catch (err) {
        setErrorMessage("パスワードの設定に失敗しました。");
      }
    } else if (authStep === 'challenge') {
      if (inputPassword === existingPass) {
        setCurrentUserProfile(foundProfile);
        setUserRole(role);
      } else {
        setErrorMessage("パスワードが正しくありません");
      }
    }
  };

  const handleResetPasswordAction = async () => {
    const targetId = inputAccountId.trim().toLowerCase();
    let foundProfile = targetId === 'manager' ? { id: 'manager', name: '管理者' } : STAFF_LIST.find(s => s.id === targetId);
    if (!foundProfile) return;

    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'auth', foundProfile.id));
      setShowResetConfirm(false);
      setAuthStep('setup');
      setInputPassword("");
      setErrorMessage("");
      setIsResetDone(true);
    } catch (err) {
      setErrorMessage("リセット中にエラーが発生しました。");
      setShowResetConfirm(false);
    }
  };

  const handleAddTask = async () => {
    const name = newTaskInput.trim();
    if (!name) return;
    if (tasks.includes(name)) {
      setErrorMessage("既に同じ名前の業務が存在します");
      return;
    }
    try {
      const newList = [...tasks, name];
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'tasks'), { list: newList });
      setNewTaskInput("");
      setShowAddTask(false);
    } catch (err) {
      setErrorMessage("業務の追加に失敗しました");
    }
  };

  const handleDeleteTask = async (taskName) => {
    if (!confirm(`「${taskName}」を削除しますか？`)) return;
    try {
      const newList = tasks.filter(t => t !== taskName);
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'tasks'), { list: newList });
      if (selectedTask === taskName) setSelectedTask(newList[0] || "");
    } catch (err) {
      setErrorMessage("削除に失敗しました");
    }
  };

  const getTaskColor = (taskName) => {
    const index = tasks.indexOf(taskName);
    return index === -1 ? 'bg-gray-400' : TASK_COLORS[index % TASK_COLORS.length];
  };

  const getCellKey = (staffId, date) => `${staffId}-${date}`;

  const getAvailStyles = (type) => {
    switch(type) {
      case 'ok': return 'bg-green-100 text-green-700 border-green-200';
      case 'ng': return 'bg-red-100 text-red-700 border-red-200';
      case 'partial': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'other': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-gray-50 text-gray-300 border-transparent';
    }
  };

  const saveAvail = async (staffId, date, payload) => {
    const key = getCellKey(staffId, date);
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'availability', key);
    const current = availability[key] || {};
    try {
      await setDoc(docRef, { ...current, ...payload });
      setEditingCell(null);
    } catch (err) {
      setErrorMessage("保存に失敗しました。");
    }
  };

  const saveAssign = async (staffId, date, taskName) => {
    const key = getCellKey(staffId, date);
    const avail = availability[key];

    if ((!avail || !avail.type) && taskName !== "") {
      setErrorMessage(`【制限】${staffId}さんがまだ勤務予定を入力していないためアサインできません。`);
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }
    
    if (avail?.type === 'ng' && taskName !== "") {
      setErrorMessage(`${staffId}さんはこの日勤務不可のためアサインできません`);
      setTimeout(() => setErrorMessage(""), 3000);
      return;
    }
    
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'assignments', key);
    await setDoc(docRef, { task: taskName });
  };

  const handleDragStart = (staffId, date) => {
    if (userRole === 'manager') {
      setIsDragging(true);
      setDragStart({ staffId, date });
      setDragCurrent({ staffId, date });
    }
  };

  const handleDragEnd = async () => {
    if (!isDragging) return;
    const affected = getAffectedKeys();
    for (const key of affected) {
      const [sId, d] = key.split('-');
      await saveAssign(sId, d, selectedTask);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  const getAffectedKeys = () => {
    if (!dragStart || !dragCurrent) return [];
    const sIdx1 = STAFF_LIST.findIndex(s => s.id === dragStart.staffId);
    const sIdx2 = STAFF_LIST.findIndex(s => s.id === dragCurrent.staffId);
    const dIdx1 = dates.indexOf(dragStart.date);
    const dIdx2 = dates.indexOf(dragCurrent.date);
    const keys = [];
    for (let i = Math.min(sIdx1, sIdx2); i <= Math.max(sIdx1, sIdx2); i++) {
      for (let j = Math.min(dIdx1, dIdx2); j <= Math.max(dIdx1, dIdx2); j++) {
        keys.push(getCellKey(STAFF_LIST[i].id, dates[j]));
      }
    }
    return keys;
  };

  // --- Login UI ---
  if (!currentUserProfile) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 p-4 relative overflow-hidden text-slate-800">
        {showResetConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-black mb-2">パスワードのリセット</h3>
              <p className="text-slate-500 text-sm font-bold leading-relaxed mb-8">現在のパスワードを消去し、新しく設定し直しますか？</p>
              <div className="flex gap-3">
                <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all">キャンセル</button>
                <button onClick={handleResetPasswordAction} className="flex-1 py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-700 transition-all">リセット実行</button>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-10 z-10">
          {!isDataLoaded ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
              <p className="text-slate-500 font-bold tracking-widest uppercase">Initializing...</p>
            </div>
          ) : (
            <form onSubmit={handleLoginSubmit} className="animate-in fade-in zoom-in duration-300">
              <div className="text-center mb-10">
                <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-200">
                  <Calendar className="text-white w-10 h-10" />
                </div>
                <h1 className="text-3xl font-black tracking-tight">ShiftFlow Pro</h1>
                <p className="text-slate-400 font-bold text-xs mt-2 uppercase tracking-[0.3em]">User Sign In</p>
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><User size={20}/></div>
                  <input 
                    type="text" 
                    placeholder="ユーザーID (例: staff-1)"
                    value={inputAccountId}
                    disabled={authStep !== 'login'}
                    onChange={(e) => setInputAccountId(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all disabled:opacity-50"
                  />
                  {authStep !== 'login' && (
                    <button 
                      type="button" 
                      onClick={() => {setAuthStep('login'); setInputPassword(""); setErrorMessage(""); setIsResetDone(false);}}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded"
                    >
                      変更
                    </button>
                  )}
                </div>

                {authStep !== 'login' && (
                  <div className="relative animate-in slide-in-from-top-2 duration-300">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Key size={20}/></div>
                    <input 
                      type="password" 
                      autoFocus
                      placeholder={authStep === 'setup' ? "新しいパスワードを設定" : "パスワードを入力"}
                      value={inputPassword}
                      onChange={(e) => setInputPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all shadow-inner"
                    />
                  </div>
                )}
              </div>
              
              {isResetDone && (
                <div className="mt-6 p-5 bg-emerald-50 border-2 border-emerald-100 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-500">
                  <div className="bg-emerald-500 p-1.5 rounded-full text-white mt-0.5 shadow-sm shadow-emerald-200"><Check size={14}/></div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black text-emerald-800">リセットに成功しました</span>
                    <span className="text-[10px] font-bold text-emerald-600/80">このIDで今後利用するパスワードを登録してください。</span>
                  </div>
                </div>
              )}
              
              {errorMessage && (
                <div className="mt-4 flex items-center gap-2 px-3 text-rose-500 animate-in shake duration-300">
                  <AlertTriangle size={14} />
                  <p className="text-[10px] font-black">{errorMessage}</p>
                </div>
              )}
              
              <div className="flex flex-col gap-3 mt-8">
                <button type="submit" className="w-full py-5 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3">
                  {authStep === 'login' ? '次へ進む' : authStep === 'setup' ? (isResetDone ? '再設定してログイン' : '設定してログイン') : 'ログイン'} 
                  <ArrowRight size={20} strokeWidth={3} />
                </button>
                
                {authStep === 'challenge' && (
                  <button type="button" onClick={() => setShowResetConfirm(true)} className="w-full py-3 text-slate-300 hover:text-rose-500 font-bold text-[10px] flex items-center justify-center gap-2 transition-all uppercase tracking-widest group">
                    <RefreshCw size={14}/> パスワードをリセット
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // --- Main Application UI ---
  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans select-none overflow-hidden" onMouseUp={handleDragEnd}>
      {/* Toast Notification */}
      {errorMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-rose-600 text-white px-8 py-4 rounded-2xl shadow-2xl font-black text-sm flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 border-2 border-white/20">
          <AlertTriangle /> {errorMessage}
          <button onClick={() => setErrorMessage("")} className="ml-2 bg-white/20 p-1 rounded-full hover:bg-white/40"><X size={14}/></button>
        </div>
      )}

      {/* ヘッダー */}
      <header className="bg-white border-b px-8 py-5 flex items-center justify-between shadow-sm z-50 shrink-0">
        <div className="flex items-center gap-5">
          <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-100"><Calendar className="text-white w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">ShiftFlow Pro</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] shrink-0">{userRole === 'manager' ? 'Management' : 'Staff Dashboard'}</span>
              <div className="h-3 w-[1px] bg-slate-200 mx-1"></div>
              {/* 月移動コントロール */}
              <div className="flex items-center gap-2 bg-slate-100 px-2 py-0.5 rounded-full border">
                <button onClick={() => changeMonth(-1)} className="p-0.5 hover:text-indigo-600 transition-colors"><ChevronLeft size={14}/></button>
                <span className="text-[11px] font-black text-slate-600 min-w-[80px] text-center">
                  {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
                </span>
                <button onClick={() => changeMonth(1)} className="p-0.5 hover:text-indigo-600 transition-colors"><ChevronRight size={14}/></button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="px-5 py-2.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3 shadow-inner">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${userRole === 'manager' ? 'bg-slate-900 text-white' : 'bg-emerald-500 text-white'}`}>{currentUserProfile.name[0]}</div>
            <div className="flex flex-col">
              <span className="text-sm font-black text-slate-900 leading-none">{currentUserProfile.name}</span>
              <span className="text-[9px] text-slate-400 font-bold uppercase mt-1">{userRole}</span>
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="p-3 bg-white border border-slate-100 hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-2xl transition-all"><LogOut size={22} /></button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* 社員専用サイドバー */}
        {userRole === 'manager' && (
          <aside className="w-72 bg-white border-r p-7 overflow-y-auto flex flex-col gap-10 shrink-0 shadow-[10px_0_30px_rgba(0,0,0,0.02)] z-20">
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[10px] font-black text-slate-300 uppercase tracking-widest">業務アサイン選択</h2>
                <button 
                  onClick={() => setShowAddTask(!showAddTask)}
                  className={`p-1.5 rounded-lg transition-all ${showAddTask ? 'bg-indigo-100 text-indigo-600 rotate-45' : 'bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'}`}
                >
                  <Plus size={16}/>
                </button>
              </div>

              <div className="space-y-3">
                {showAddTask && (
                  <div className="p-4 bg-indigo-50 rounded-2xl border-2 border-indigo-100 animate-in slide-in-from-top-2 duration-300 mb-4">
                    <input 
                      autoFocus
                      type="text"
                      placeholder="新しい業務名..."
                      value={newTaskInput}
                      onChange={(e) => setNewTaskInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                      className="w-full p-3 rounded-xl border-2 border-transparent focus:border-indigo-400 outline-none text-xs font-bold mb-3 shadow-inner"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setShowAddTask(false)} className="flex-1 py-2 text-[10px] font-black text-slate-400 hover:text-slate-600">閉じる</button>
                      <button onClick={handleAddTask} className="flex-[2] py-2 bg-indigo-600 text-white text-[10px] font-black rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center justify-center gap-1"><Plus size={14}/> 追加</button>
                    </div>
                  </div>
                )}

                {tasks.map(task => (
                  <div key={task} className="relative group">
                    <button 
                      onClick={() => setSelectedTask(task)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all border-2 ${selectedTask === task ? `${getTaskColor(task)} border-transparent text-white shadow-lg shadow-indigo-100 ring-4 ring-indigo-50` : 'border-slate-50 bg-slate-50/30 hover:bg-slate-50'}`}
                    >
                      <span className="text-sm font-black truncate pr-6">{task}</span>
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${selectedTask === task ? 'bg-white animate-pulse' : getTaskColor(task)} shadow-sm`} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }}
                      className={`absolute right-10 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white/50 hover:text-white transition-all opacity-0 group-hover:opacity-100 ${selectedTask === task ? 'block' : 'hidden'}`}
                    >
                      <Trash2 size={14}/>
                    </button>
                    {!(selectedTask === task) && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }}
                        className={`absolute right-8 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-300 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100`}
                      >
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-auto p-6 bg-slate-950 rounded-[2.5rem] text-white shadow-xl">
              <h3 className="text-xs font-black mb-4 flex items-center gap-2 text-indigo-400"><Settings size={14}/> 月次管理モード</h3>
              <ul className="text-[10px] space-y-3 font-bold opacity-80 leading-relaxed">
                <li className="flex items-start gap-2"><Check size={12} className="shrink-0 mt-0.5 text-indigo-400"/>1ヶ月全日程を表示中</li>
                <li className="flex items-start gap-2"><Check size={12} className="shrink-0 mt-0.5 text-indigo-400"/>ヘッダーから月を切替</li>
                <li className="flex items-start gap-2"><XCircle size={12} className="shrink-0 mt-0.5 text-rose-400"/>予定未入力セル不可</li>
              </ul>
            </div>
          </aside>
        )}

        {/* メインテーブルエリア (スクロール対応) */}
        <div className="flex-1 overflow-auto bg-slate-50/50 p-8">
          <div className="bg-white rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden min-w-max relative">
            <table className="w-full border-collapse table-auto">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="sticky left-0 z-40 bg-slate-50/90 backdrop-blur-md p-8 text-left border-r border-slate-100 w-64 shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Attendance Sheet</span>
                  </th>
                  {dates.map(date => {
                    const d = new Date(date);
                    return (
                      <th key={date} className="p-6 border-r border-slate-100 min-w-[220px] text-center">
                        <div className="text-[10px] font-black text-slate-300 uppercase mb-1">{d.toLocaleDateString('ja-JP', { weekday: 'short' })}</div>
                        <div className={`text-2xl font-black ${d.getDay() === 0 ? 'text-rose-500' : d.getDay() === 6 ? 'text-sky-500' : 'text-slate-800'}`}>{d.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {STAFF_LIST.map((staff) => {
                  const isMyRow = currentUserProfile?.id === staff.id;
                  if (userRole === 'staff' && !isMyRow) return null;

                  return (
                    <tr key={staff.id} className="border-b border-slate-50 group">
                      <td className="sticky left-0 z-30 bg-white p-6 border-r border-slate-100 group-hover:bg-slate-50 transition-colors shadow-[4px_0_10px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center font-black text-lg ${isMyRow ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>{staff.name[0]}</div>
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-slate-900">{staff.name}</span>
                            {isMyRow && <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full mt-1 w-fit shadow-sm">OWNER</span>}
                          </div>
                        </div>
                      </td>
                      {dates.map(date => {
                        const key = getCellKey(staff.id, date);
                        const avail = availability[key];
                        const assign = assignments[key]?.task;
                        const isSelected = getAffectedKeys().includes(key);
                        const canEdit = userRole === 'manager' || isMyRow;

                        return (
                          <td 
                            key={date}
                            onMouseDown={() => handleDragStart(staff.id, date)}
                            onMouseEnter={() => isDragging && setDragCurrent({ staffId: staff.id, date })}
                            onClick={() => canEdit && (userRole === 'manager' ? saveAssign(staff.id, date, assign === selectedTask ? "" : selectedTask) : setEditingCell({ staffId: staff.id, date, mode: 'avail' }))}
                            className={`relative p-4 h-36 border-r border-slate-50 transition-all cursor-pointer ${isSelected ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-200 z-10' : 'hover:bg-slate-50/50'}`}
                          >
                            <div className={`absolute top-4 right-4 p-1.5 rounded-xl border-2 transition-all shadow-sm ${getAvailStyles(avail?.type)}`}>
                              {avail?.type === 'ok' ? <CheckCircle2 size={16}/> : avail?.type === 'ng' ? <XCircle size={16}/> : avail?.type === 'partial' ? <Clock size={16}/> : avail?.type === 'other' ? <MoreHorizontal size={16}/> : null}
                            </div>

                            <div className="w-full h-full flex flex-col justify-center gap-3">
                              {assign ? (
                                <div className={`w-full py-3.5 px-3 ${getTaskColor(assign)} text-white text-[12px] font-black rounded-2xl shadow-md text-center truncate animate-in zoom-in duration-300`}>{assign}</div>
                              ) : (
                                <div className="text-[10px] text-slate-300 font-black opacity-0 group-hover:opacity-100 text-center transition-opacity whitespace-nowrap">
                                  {userRole === 'manager' ? 'Click to Assign' : 'Update Status'}
                                </div>
                              )}
                              
                              <div className="flex flex-wrap gap-1.5 justify-center">
                                {avail?.type === 'partial' && <span className="text-[10px] text-sky-600 font-black px-3 py-0.5 bg-sky-50 rounded-full border border-sky-100 shadow-sm">{avail.hours}</span>}
                                {avail?.type === 'other' && <span className="text-[10px] text-amber-600 font-black px-3 py-0.5 bg-amber-50 rounded-full border border-amber-100 max-w-[150px] truncate shadow-sm">{avail.note}</span>}
                              </div>
                              
                              {avail?.memo && (
                                <div className="mt-1 flex items-start gap-1.5 px-2 py-1.5 bg-slate-50 rounded-xl border border-slate-100 shadow-inner overflow-hidden">
                                  <MessageSquare size={12} className="text-slate-400 shrink-0 mt-0.5" />
                                  <span className="text-[10px] text-slate-500 font-bold leading-tight line-clamp-2">{avail.memo}</span>
                                </div>
                              )}
                            </div>

                            {canEdit && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setEditingCell({ staffId: staff.id, date, mode: 'memo' }); setTempInput(avail?.memo || ""); }}
                                className="absolute bottom-3 right-3 p-2 bg-white border border-slate-200 text-slate-400 rounded-xl opacity-0 group-hover:opacity-100 hover:text-indigo-600 hover:shadow-lg transition-all z-20"
                              >
                                <Edit3 size={14}/>
                              </button>
                            )}

                            {editingCell?.staffId === staff.id && editingCell?.date === date && (
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] bg-white/98 backdrop-blur-md p-6 flex flex-col gap-4 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-indigo-100 animate-in zoom-in duration-200 w-[260px] min-h-[300px]" onClick={e => e.stopPropagation()}>
                                {editingCell.mode === 'avail' ? (
                                  <div className="flex flex-col h-full gap-2.5">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mb-1">Status Selection</div>
                                    <button onClick={() => saveAvail(staff.id, date, { type: 'ok' })} className="py-3.5 bg-green-500 text-white text-[11px] font-black rounded-2xl hover:bg-green-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-100"><CheckCircle2 size={18}/> ○ 全日可能</button>
                                    <button onClick={() => saveAvail(staff.id, date, { type: 'ng' })} className="py-3.5 bg-rose-500 text-white text-[11px] font-black rounded-2xl hover:bg-rose-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-100"><XCircle size={18}/> × 終日不可</button>
                                    <button onClick={() => setEditingCell({ ...editingCell, mode: 'partial' })} className="py-3.5 bg-sky-500 text-white text-[11px] font-black rounded-2xl hover:bg-sky-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-100"><Clock size={18}/> △ 一部可能 <ChevronRight size={14}/></button>
                                    <button onClick={() => setEditingCell({ ...editingCell, mode: 'other' })} className="py-3.5 bg-amber-500 text-white text-[11px] font-black rounded-2xl hover:bg-amber-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-100"><MoreHorizontal size={18}/> 他 その他 <ChevronRight size={14}/></button>
                                    <div className="flex gap-2 mt-2">
                                      <button onClick={() => saveAvail(staff.id, date, { type: null, hours: "", note: "" })} className="flex-1 py-2.5 border-2 border-slate-100 text-slate-400 text-[10px] font-black rounded-xl hover:bg-slate-50 transition-all">リセット</button>
                                      <button onClick={() => setEditingCell(null)} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-all"><X size={20}/></button>
                                    </div>
                                  </div>
                                ) : (editingCell.mode === 'partial' || editingCell.mode === 'other' || editingCell.mode === 'memo') ? (
                                  <div className="flex flex-col h-full animate-in slide-in-from-right-2 duration-200">
                                    <div className="flex items-center gap-2 mb-4">
                                      <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600 shadow-inner">
                                        {editingCell.mode === 'memo' ? <MessageSquare size={18}/> : <Edit3 size={18}/>}
                                      </div>
                                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                                        {editingCell.mode === 'partial' ? '一部可能（時間）' : editingCell.mode === 'other' ? '備考' : '自由入力メモ'}
                                      </label>
                                    </div>
                                    <textarea 
                                      autoFocus
                                      value={tempInput}
                                      onChange={(e) => setTempInput(e.target.value)}
                                      className="flex-1 w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] outline-none text-[13px] font-bold focus:border-indigo-500 focus:bg-white transition-all resize-none mb-4 shadow-inner text-slate-800"
                                      placeholder={editingCell.mode === 'partial' ? "例: 13:00-17:00" : "詳細を入力してください..."}
                                    />
                                    <div className="flex gap-3">
                                      <button onClick={() => setEditingCell({ ...editingCell, mode: 'avail' })} className="p-3.5 bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200 transition-all"><ChevronRight className="rotate-180" size={20}/></button>
                                      <button 
                                        onClick={() => {
                                          if (editingCell.mode === 'memo') saveAvail(staff.id, date, { memo: tempInput });
                                          else if (editingCell.mode === 'partial') saveAvail(staff.id, date, { type: 'partial', hours: tempInput });
                                          else saveAvail(staff.id, date, { type: 'other', note: tempInput });
                                          setTempInput("");
                                        }}
                                        className="flex-1 py-3.5 bg-indigo-600 text-white text-[12px] font-black rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
                                      >
                                        保存して閉じる
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t px-8 py-4 flex items-center justify-between z-50 shrink-0 shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
        <div className="flex gap-8">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400"><div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-sm shadow-green-200"></div> 可能</div>
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400"><div className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-sm shadow-rose-200"></div> 不可</div>
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400"><div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-sm shadow-sky-200"></div> 一部</div>
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400"><div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-200"></div> その他</div>
        </div>
        <div className="text-[11px] font-black text-indigo-600 flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-full shadow-inner border border-indigo-100/50">
          <Calendar size={14} /> ヘッダーの矢印で月を切り替えて1ヶ月単位で管理できます。
        </div>
      </footer>
    </div>
  );
};

export default App;
