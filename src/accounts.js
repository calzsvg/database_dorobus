// 체험용 계정. 프론트엔드에만 있는 데모 데이터라 실제 보안은 없다.
// 실제 서비스로 옮길 때는 서버(DB)에서 비밀번호 해시로 확인해야 한다.
// 발표 시연 단계. demoPark: 시연 계정은 상점 재개장 전에도 테마파크 운영(어트랙션 강화, 시설 설치)을 열어 둔다
export const DEMO_STAGES = {
  // 처음부터: 첫 수업도 듣기 전 (CELL, 가구, 출석, 퀘스트 기록까지 모두 처음 상태)
  start: { demoPark: true },
  // 시연 ① 마이룸: 자동차 점검을 마치고 운전면허증을 받기 직전 → 받침대에서 면허증 GET
  license: { classDone: true, introSeen: true, carCheckDone: true, demoPark: true },
  // 시연 ② 하모니아 광장: 멜로디 복원, 하모니아 수리까지 끝나고 광장 전등 연결 직전 → 전등 연결 미션 → 옆의 방문객 요청 → 바로 어트랙션 강화와 설치
  lights: {
    classDone: true, introSeen: true, carCheckDone: true, licenseGot: true, licenseDate: '2026-10-21',
    caveIntroSeen: true, diaryFound: true, caveCleared: true, plazaOpen: true, harmoniaRestored: true,
    demoPark: true,
  },
}

export const ACCOUNTS = [
  { id: 'a1', password: '1234', role: 'student', name: 'A1 학생', level: 1, cell: 1000 },
  { id: 'a2', password: '1234', role: 'student', name: 'A2 학생', level: 2, cell: 1500 },
  { id: 'a3', password: '1234', role: 'student', name: 'A3 학생', level: 3, cell: 2000 },
  { id: 'a4', password: '1234', role: 'student', name: 'A4 학생', level: 1, cell: 800 },
  { id: 'a5', password: '1234', role: 'student', name: 'A5 학생', level: 2, cell: 1200 },
  { id: 't1', password: '1234', role: 'teacher', name: 'T1 강사', level: 5, cell: 5000 },
  // 발표 시연용: 처음 로그인하면 시연 ① 상태로 시작. 프로필 메뉴에서 시연 ①, ② 상태로 바로 바꿀 수 있다
  { id: 'd1', password: '1234', role: 'student', name: '시연 학생 1', level: 1, cell: 3000, preset: DEMO_STAGES.license },
  { id: 'd2', password: '1234', role: 'student', name: '시연 학생 2', level: 2, cell: 3000, preset: DEMO_STAGES.license },
]

// 회원가입 규칙. DB의 dorobus.register_user / dorobus.age_on과 같은 기준을 쓴다.
// 체험판에서는 가입 계정도 이 브라우저(localStorage)에만 저장되며 비밀번호 보안이 없다.
// 서버(DB) 연결 후에는 서버가 비밀번호를 해시로 확인하고 register_user로 users 행을 만든다.
export const MIN_BIRTH_DATE = '1900-01-01'

// 한국 시간 기준 오늘 날짜 'YYYY-MM-DD'
export const todayInSeoul = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// 만 나이: 생일이 지나야 한 살 늘어난다. 2월 29일생은 평년에 3월 1일부터 늘어난다(DB age_on과 같음).
export function ageOn(birthDate, onDate = todayInSeoul()) {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = onDate.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

const isRealDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// 입력값을 검사하고 저장할 형태로 정리한다. 문제가 있으면 { error }를 돌려준다.
export function validateSignup({ id, name, password, passwordConfirm, birthDate }, takenIds) {
  const loginId = id.trim().toLowerCase()
  const displayName = name.trim()
  if (!/^[a-z0-9_-]{3,20}$/.test(loginId)) return { error: '아이디는 영문 소문자, 숫자, -, _로 3~20자 입력해 주세요.' }
  if (takenIds.includes(loginId)) return { error: '이미 쓰고 있는 아이디예요.' }
  if (!displayName || displayName.length > 50) return { error: '이름을 입력해 주세요. (50자 이내)' }
  if (password.length < 4) return { error: '비밀번호는 4자 이상 입력해 주세요.' }
  if (password !== passwordConfirm) return { error: '비밀번호 확인이 맞지 않아요.' }
  if (!birthDate) return { error: '생년월일을 입력해 주세요.' }
  if (!isRealDate(birthDate) || birthDate < MIN_BIRTH_DATE) return { error: '생년월일을 다시 확인해 주세요.' }
  if (birthDate > todayInSeoul()) return { error: '생년월일은 오늘 이후일 수 없어요.' }
  return { account: { id: loginId, password, role: 'student', name: displayName, birthDate, level: 1, cell: 0 } }
}
