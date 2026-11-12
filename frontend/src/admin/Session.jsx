import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { adminObject, adminRequest, clearAdminCsrf, hasPermission, ROLE_PERMISSIONS, setAdminCsrf } from './api.js';

const SessionContext = createContext(null);
const NoticeContext = createContext(null);
export function useSession() { const ctx = useContext(SessionContext); if (!ctx) throw new Error('Admin session provider missing'); return ctx; }
export function useNotices() { const ctx = useContext(NoticeContext); if (!ctx) throw new Error('Admin notices missing'); return ctx; }

function assertBackendSession(data) {
  if (!data?.user?.id || !ROLE_PERMISSIONS[data.user.role] || !data.csrfToken || !data.expiresAt) throw new Error('Backend không cung cấp phiên CMS hợp lệ.');
  return data;
}
export function SessionProvider({ children }) {
  const [state,setState] = useState({status:'loading',user:null,expiresAt:null,error:null});
  const [notices,setNotices] = useState([]);
  const refresh = useCallback(async(signal) => {
    setState(current=>({...current,status:'loading'}));
    try {
      const data=assertBackendSession(await adminObject('/auth/session',{signal}));
      if (!signal?.aborted) { setAdminCsrf(data.csrfToken); setState({status:'authenticated',user:data.user,expiresAt:data.expiresAt,error:null}); }
      return data.user;
    } catch(error) {
      if (!signal?.aborted) { clearAdminCsrf(); setState({status:error.status===401?'guest':'error',user:null,expiresAt:null,error}); }
      return null;
    }
  },[]);
  useEffect(()=>{const ctrl=new AbortController();refresh(ctrl.signal);return()=>ctrl.abort();},[refresh]);
  const login=useCallback(async(credentials)=>{
    const data=assertBackendSession(await adminObject('/auth/login',{method:'POST',data:credentials}));
    setAdminCsrf(data.csrfToken);
    setState({status:'authenticated',user:data.user,expiresAt:data.expiresAt,error:null});
    return data.user;
  },[]);
  const logout=useCallback(async()=>{await adminRequest('/auth/logout',{method:'POST',data:{}});clearAdminCsrf();setState({status:'guest',user:null,expiresAt:null,error:null});},[]);
  const notice=useCallback((message,kind='success')=>setNotices(n=>[...n.slice(-3),{id:Date.now()+Math.random(),message,kind}]),[]);
  const dismiss=useCallback(id=>setNotices(n=>n.filter(x=>x.id!==id)),[]);
  const ctx=useMemo(()=>({...state,refresh,login,logout,can:permission=>hasPermission(state.user,permission)}),[state,refresh,login,logout]);
  return <SessionContext.Provider value={ctx}><NoticeContext.Provider value={{notice,dismiss}}>{children}<div className="cms-toasts" aria-live="polite">{notices.map(x=><div className={`cms-toast cms-toast--${x.kind}`} key={x.id} role={x.kind==='error'?'alert':'status'}>{x.message}<button type="button" onClick={()=>dismiss(x.id)} aria-label="Đóng thông báo">×</button></div>)}</div></NoticeContext.Provider></SessionContext.Provider>;
}
export function RequireAdmin({permission,children}) {
  const {status,can,error,refresh}=useSession();const loc=useLocation();
  if(status==='loading')return <div className="cms-auth-gate" role="status"><div className="cms-spinner"/>Đang xác minh tài khoản…</div>;
  if(status==='guest')return <Navigate to="/admin/login" state={{from:loc.pathname}} replace/>;
  if(status==='error')return <div className="cms-auth-gate cms-auth-error"><h1>Không thể xác minh phiên</h1><p>{error?.message}</p><button className="cms-btn cms-btn--primary" type="button" onClick={()=>refresh()}>Thử kết nối lại</button><a href="/">Trang chủ</a></div>;
  if(permission&&!can(permission))return <div className="cms-auth-gate cms-auth-error"><h1>Không đủ quyền truy cập</h1><p>Vai trò của bạn không được cấp quyền cho chuyên mục này. Backend sẽ kiểm tra mọi thao tác riêng.</p><a href="/admin/dashboard">Về tổng quan</a></div>;
  return children;
}
export function LoginPage(){
  const {status,login,error:sessionError,refresh}=useSession();
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
  const navigate=useNavigate(),loc=useLocation();
  if(status==='authenticated')return <Navigate to={loc.state?.from?.startsWith('/admin/')?loc.state.from:'/admin/dashboard'} replace/>;
  async function submit(e){e.preventDefault();setPending(true);setError('');try{await login({email:email.trim(),password});setPassword('');navigate(loc.state?.from?.startsWith('/admin/')?loc.state.from:'/admin/dashboard',{replace:true});}catch(err){setError(err.message);}finally{setPending(false);}}
  return <div className="cms-login-page"><div className="cms-login-side"><a className="cms-login-brand" href="/">CONSPACE<span>.</span></a><div className="cms-login-illustration" aria-hidden="true"><div className="cms-login-blueprint"><span className="cms-login-abstract">C</span><span>EDITORIAL OPERATIONS / 01</span></div></div><p className="cms-kicker">TÒA SOẠN CONSPACE</p><h1>Góc làm việc của<br/>những người nói thật.</h1><p>Biên tập có kiểm chứng. Duyệt có trách nhiệm. Mọi thay đổi đều để lại dấu vết.</p><span className="cms-login-small">CONSPACE · Sự thật ngành Xây</span></div><main className="cms-login-main"><div className="cms-login-card"><div className="cms-login-icon" aria-hidden="true">✳</div><p className="cms-overline">TRUY CẬP NỘI BỘ</p><h2>Đăng nhập quản trị</h2><p className="cms-muted">Chỉ dành cho tài khoản tòa soạn được cấp tại máy chủ.</p>{status==='loading'?<div className="cms-inline-state">Đang kiểm tra phiên…</div>:<form onSubmit={submit} className="cms-login-form"><label htmlFor="cms-email">Email công việc</label><input id="cms-email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="ten@conspace.vn"/><label htmlFor="cms-password">Mật khẩu</label><input id="cms-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Nhập mật khẩu"/>{(error||sessionError?.status===404)&&<p className="cms-form-error" role="alert">{error||sessionError.message}</p>}<button className="cms-btn cms-btn--primary cms-btn--wide" type="submit" disabled={pending}>{pending?'Đang đăng nhập…':'Đăng nhập an toàn'} →</button></form>}{status==='error'&&<button type="button" className="cms-link-button" onClick={()=>refresh()}>Thử kiểm tra lại</button>}<div className="cms-login-help">Phiên đăng nhập dùng cookie HttpOnly; token chống CSRF chỉ giữ trong bộ nhớ phiên trang.</div><a className="cms-back-public" href="/">← Về website CONSPACE</a></div></main></div>;
}
