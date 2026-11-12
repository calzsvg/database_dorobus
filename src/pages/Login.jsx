import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Header.jsx'
import { useStore } from '../store.jsx'
import { MIN_BIRTH_DATE, ageOn, todayInSeoul } from '../accounts.js'

function BusArt() {
  return (
    <svg viewBox="0 0 640 440" className="login-art" role="img" aria-label="교실을 싣고 달리는 도로버스 일러스트">
      <path d="M40 170 C120 110 200 200 280 140 S420 60 560 120" fill="none" stroke="#9DB5D9" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
      <path d="M520 300 C560 330 590 320 610 300" fill="none" stroke="#9DB5D9" strokeWidth="3" strokeLinecap="round" />
      {/* 정류장 */}
      <rect x="30" y="300" width="170" height="16" rx="8" fill="#E9E4DA" />
      <rect x="40" y="190" width="150" height="16" rx="8" fill="#9ED8C6" />
      <rect x="48" y="206" width="6" height="96" fill="#9DB5D9" />
      <rect x="60" y="262" width="110" height="12" rx="4" fill="#EE8670" />
      {/* 버스 몸통 */}
      <rect x="150" y="210" width="420" height="140" rx="26" fill="#F1ECE3" />
      <rect x="150" y="290" width="420" height="60" rx="20" fill="#A9BEE3" />
      <rect x="300" y="150" width="90" height="210" rx="14" fill="#9ED8C6" />
      <rect x="170" y="225" width="115" height="70" rx="12" fill="#CFEDE3" stroke="#9ED8C6" strokeWidth="4" />
      <rect x="405" y="225" width="150" height="70" rx="12" fill="#CFEDE3" stroke="#9ED8C6" strokeWidth="4" />
      {/* 창 안의 책상 */}
      <rect x="190" y="265" width="34" height="8" rx="2" fill="#E9B27C" />
      <rect x="236" y="265" width="34" height="8" rx="2" fill="#E9B27C" />
      <rect x="425" y="265" width="34" height="8" rx="2" fill="#E9B27C" />
      <rect x="470" y="265" width="34" height="8" rx="2" fill="#E9B27C" />
      <rect x="515" y="265" width="28" height="8" rx="2" fill="#E9B27C" />
      {/* 가운데 화면 */}
      <rect x="315" y="180" width="60" height="70" rx="8" fill="#3E4A68" />
      <rect x="325" y="215" width="8" height="24" fill="#9ED8C6" />
      <rect x="338" y="205" width="8" height="34" fill="#9ED8C6" />
      <circle cx="361" cy="224" r="10" fill="#EE8670" />
      {/* 지붕 위 태양광 · 안테나 */}
      <rect x="400" y="190" width="70" height="22" rx="4" fill="#4B6CB7" />
      <rect x="478" y="190" width="70" height="22" rx="4" fill="#4B6CB7" />
      <rect x="342" y="110" width="6" height="42" fill="#3E4A68" />
      <circle cx="345" cy="104" r="8" fill="#EE8670" />
      {/* 바퀴 */}
      <circle cx="225" cy="352" r="28" fill="#3E4A68" />
      <circle cx="225" cy="352" r="12" fill="#C8D2E6" />
      <circle cx="495" cy="352" r="28" fill="#3E4A68" />
      <circle cx="495" cy="352" r="12" fill="#C8D2E6" />
      {/* 체크 · 말풍선 · 메달 */}
      {[[450, 70], [600, 220], [340, 410]].map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="22" fill="#EE8670" />
          <path d={`M${x - 9} ${y} l6 7 l12 -13`} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      <rect x="150" y="40" width="70" height="46" rx="12" fill="#F1ECE3" />
      <rect x="190" y="62" width="70" height="46" rx="12" fill="#A9BEE3" />
      <rect x="560" y="70" width="64" height="80" rx="10" fill="#EE8670" />
      <rect x="568" y="80" width="48" height="62" rx="6" fill="#F1ECE3" />
      <circle cx="590" cy="320" r="24" fill="#6F8FD6" />
      <circle cx="590" cy="320" r="10" fill="#F5C451" />
    </svg>
  )
}

function EyeIcon({ show }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!show && <path d="M4 4l16 16" />}
    </svg>
  )
}

// 학생 회원가입. 생년월일은 필수이며 입력하면 만 나이를 바로 보여 준다.
function SignupForm({ onBack }) {
  const { signup } = useStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({ id: '', name: '', password: '', passwordConfirm: '', birthDate: '' })
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const today = todayInSeoul()
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setError('') }
  const age = form.birthDate && form.birthDate >= MIN_BIRTH_DATE && form.birthDate <= today ? ageOn(form.birthDate, today) : null

  const submit = (e) => {
    e.preventDefault()
    const err = signup(form)
    if (err) setError(err)
    else navigate('/', { replace: true })
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <h2>회원가입</h2>
      <p className="signup-note">학생 계정을 만들어요. 강사 계정은 관리자에게 요청해 주세요.</p>
      <input className="field" placeholder="아이디 (영문 소문자·숫자 3~20자)" autoComplete="username" value={form.id} onChange={set('id')} aria-label="아이디" />
      <input className="field" placeholder="이름" autoComplete="name" value={form.name} onChange={set('name')} aria-label="이름" maxLength={50} />
      <div className="pw">
        <input className="field" type={show ? 'text' : 'password'} placeholder="비밀번호 (4자 이상)" autoComplete="new-password" value={form.password} onChange={set('password')} aria-label="비밀번호" />
        <button type="button" className="eye" onClick={() => setShow((v) => !v)} aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>
          <EyeIcon show={show} />
        </button>
      </div>
      <input className="field" type={show ? 'text' : 'password'} placeholder="비밀번호 확인" autoComplete="new-password" value={form.passwordConfirm} onChange={set('passwordConfirm')} aria-label="비밀번호 확인" />
      <label className="birth">
        <span className="birth-label">생년월일 <em>필수</em></span>
        <input className="field" type="date" min={MIN_BIRTH_DATE} max={today} value={form.birthDate} onChange={set('birthDate')} aria-label="생년월일" required />
        {age !== null && <span className="birth-age">만 {age}세</span>}
      </label>
      {error && <p className="err" role="alert">{error}</p>}
      <button type="submit" className="login-btn">가입하기</button>
      <div className="login-links">
        <button type="button" onClick={onBack}>이미 계정이 있어요 · 로그인</button>
      </div>
    </form>
  )
}

export default function Login() {
  const { login } = useStore()
  const [mode, setMode] = useState('login')
  const navigate = useNavigate()
  const [role, setRole] = useState('student')
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!id.trim() || !pw) {
      setError('아이디와 비밀번호를 입력해 주세요.')
      return
    }
    const err = login(id, pw, role)
    if (err) setError(err)
    else navigate('/', { replace: true })
  }

  const notReady = () => setError('체험판에서는 지원하지 않아요. 받은 체험 계정으로 로그인해 주세요.')
  const openSignup = () => { setError(''); setMode('signup') }

  return (
    <div className="login-page">
      <header className="login-head">
        <div className="container"><Logo /></div>
      </header>
      <main className="container login-main">
        <section className="login-copy">
          <h1>배우고 만들고 함께 움직이는 DOROBUS</h1>
          <p>수업 참여부터 소통, 활동 기록, 마이룸까지<br />AI·로봇 교육에 필요한 흐름을 한곳에 담은 교육 통합 플랫폼</p>
          <BusArt />
        </section>

        {mode === 'signup' ? <SignupForm onBack={() => setMode('login')} /> : (
        <form className="login-form" onSubmit={submit} noValidate>
          <h2>로그인</h2>
          <div className="seg" role="tablist" aria-label="계정 종류">
            {[['student', '학생'], ['teacher', '강사']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={role === k}
                className={role === k ? 'on' : ''}
                onClick={() => { setRole(k); setError('') }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            id="login-id"
            className="field"
            placeholder="아이디"
            autoComplete="username"
            value={id}
            onChange={(e) => { setId(e.target.value); setError('') }}
            aria-label="아이디"
          />
          <div className="pw">
            <input
              id="login-pw"
              className="field"
              type={show ? 'text' : 'password'}
              placeholder="비밀번호"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError('') }}
              aria-label="비밀번호"
            />
            <button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>
              <EyeIcon show={show} />
            </button>
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <button type="submit" className="login-btn">login</button>
          <div className="login-links">
            <button type="button" onClick={openSignup}>회원가입</button>
            <button type="button" onClick={notReady}>아이디, 비밀번호를 잊어버렸나요?</button>
          </div>
        </form>
        )}
      </main>
    </div>
  )
}
