import { useEffect, useState } from 'react'
import RepairSet, { Sprite } from './RepairSet.jsx'

// 장면 속 물건은 무료 에셋이다.
// Kenney(CC0): 컨베이어, 톱니, 상자, 경광등, 화살표, 선물 상자, 구슬 (public/repair/kenney)
// OpenMoji(CC BY-SA 4.0): 트럭, 회전목마 말, 열차 칸, 배터리, 풍선, 솜사탕 가게, 서커스 무대, 플러그, 공사 표지 (public/repair/openmoji)
// 선과 길(레일, 도로, 전선)만 직접 그린다.
// 조사 단계(field)에서는 아이가 직접 살펴본 단서(known)만 그림에 드러난다. 정답이 될 만한 표시는 미리 보여 주지 않는다.

const gold = '#d6a14f'
const mint = '#486957'
const coral = '#a84435'
const ink = '#302c24'
const clamp = (value) => Math.min(1, Math.max(0, value))
const EMOJI = (id) => `${import.meta.env.BASE_URL}repair/openmoji/${id}.svg`

function Emoji({ id, x, y, size, flip = false, opacity }) {
  return <image href={EMOJI(id)} x={x - size / 2} y={y - size / 2} width={size} height={size} opacity={opacity}
    transform={flip ? `translate(${2 * x} 0) scale(-1 1)` : undefined} />
}

function Caption({ x, y = 143, color = ink, children }) {
  return <text x={x} y={y} fill={color} textAnchor="middle" className="repair-scene-text">{children}</text>
}

function positionOn(points, progress) {
  const index = Math.min(points.length - 2, Math.floor(progress * (points.length - 1)))
  const fraction = progress * (points.length - 1) - index
  return points[index].map((value, axis) => value + (points[index + 1][axis] - value) * fraction)
}

function route(points) {
  return points.map(([x, y]) => [x, y + 10].join(',')).join(' ')
}

// 실제 물체처럼 보이게: 레일은 침목 위 두 겹 철로, 도로는 테두리와 중앙선, 관은 테두리와 광택, 전선은 피복
const asPoints = (pts) => typeof pts === 'string' ? pts : route(pts)
function Rail({ points, d }) {
  const P = (props) => d ? <path d={d} fill="none" {...props} /> : <polyline points={asPoints(points)} fill="none" {...props} />
  return <g strokeLinejoin="round" strokeLinecap="round">
    <P stroke="#6b4a33" strokeWidth="14" strokeDasharray="3 6" strokeLinecap="butt" />
    <P stroke="#3f444c" strokeWidth="7" />
    <P stroke="#c3cbd3" strokeWidth="2.4" />
  </g>
}
function Road({ points, d, width = 11, planned = false }) {
  const P = (props) => d ? <path d={d} fill="none" {...props} /> : <polyline points={asPoints(points)} fill="none" {...props} />
  if (planned) return <g strokeLinejoin="round"><P stroke="#7b8b84" strokeWidth={width} strokeDasharray="7 5" opacity=".55" /></g>
  return <g strokeLinejoin="round" strokeLinecap="round">
    <P stroke="#7a6248" strokeWidth={width + 4} />
    <P stroke="#c7ad86" strokeWidth={width} />
    <P stroke="#f6ead2" strokeWidth="1.3" strokeDasharray="6 6" />
  </g>
}
function Pipe({ d, color = '#d8c29a', opacity = 1 }) {
  return <g fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={opacity}>
    <path d={d} stroke="#5f4c3a" strokeWidth="10" />
    <path d={d} stroke={color} strokeWidth="7" />
    <path d={d} stroke="#fff" strokeWidth="1.6" opacity=".55" transform="translate(-1 -1.5)" />
  </g>
}
function Cable({ d, color, off = false }) {
  return <g fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={off ? .45 : 1}>
    <path d={d} stroke="#1f2a2e" strokeWidth="6" />
    <path d={d} stroke={color} strokeWidth="3.4" strokeDasharray={off ? '4 5' : undefined} />
  </g>
}

// 선물 상자(Kenney)
function Box({ x, y, color = 'yellow', size = 18 }) {
  return <Sprite name={`present_large_${color}`} x={x - size / 2} y={y - size / 2} w={size} />
}

// 트럭(OpenMoji). 원래 왼쪽을 보고 있어서 오른쪽으로 뒤집는다.
function Truck({ point, cargo = false, tilt = 0, size = 44 }) {
  return <g transform={`translate(${point.join(' ')}) rotate(${tilt})`}>
    {cargo && <Box x={-9} y={-9} color="red" size={16} />}
    <Emoji id="1F69A" x={0} y={-4} size={size} flip />
  </g>
}

// 컨베이어 벨트(Kenney 산업 타일). arrows가 false면 방향 표시를 숨긴다.
function Belt({ x = 28, y = 102, width = 364, reverse = false, arrows = true }) {
  const h = 13
  const tile = (70 * h) / 22
  const middle = Math.max(0, Math.ceil((width - 2 * tile) / tile))
  return <g>
    {Array.from({ length: middle }, (_, i) => <Sprite key={i} name="industrial_036" x={x + tile + i * tile} y={y} w={Math.min(tile, width - tile - (tile + i * tile)) + 0.5} h={h} />)}
    <Sprite name="industrial_035" x={x} y={y} w={tile} h={h} />
    <Sprite name="industrial_037" x={x + width - tile} y={y} w={tile} h={h} />
    {arrows && [.25, .5, .75].map(ratio => <Sprite key={ratio} name={reverse ? 'industrial_098' : 'industrial_070'}
      x={x + width * ratio - 5} y={y - 11} w={10} />)}
  </g>
}

const ingredients = {
  base: ['바닥 빵', 'bun', 15],
  patty: ['패티', 'beef', 13],
  cheese: ['치즈', 'cheese', 12],
  greens: ['채소', 'lettuce', 14],
  top: ['윗빵', 'bun', 27],
}

function Ingredient({ id }) {
  const [, file, height] = ingredients[id]
  return <image href={`${import.meta.env.BASE_URL}repair/last-bite/${file}.png`}
    x="-30" y={6 - height} width="60" height={height} preserveAspectRatio="none" />
}

function BurgerLine({ x, width, label, extra, early, diverted, progress }) {
  const order = extra
    ? early ? ['cheese', 'base', 'patty', 'greens', 'top'] : ['base', 'patty', 'cheese', 'greens', 'top']
    : ['base', 'patty', 'greens', 'top']
  const step = progress * (order.length + 1)
  const current = progress > 0 && progress < .98 ? ingredients[order[Math.min(order.length - 1, Math.floor(step))]] : null
  const center = x + width / 2
  return <g>
    <rect x={center - 44} y="11" width="88" height="20" rx="5" fill="#fff8df" opacity=".9" />
    <Caption x={center} y={25} color={progress >= .98 && (early || diverted) ? coral : ink}>{label}</Caption>
    {/* 재료 투입기: Kenney 산업 기계 */}
    <Sprite name="industrial_031" x={center - 13} y={30} w={26} />
    <Belt x={x + 5} y={105} width={width - 10} arrows={false} />
    {order.map((id, index) => {
      const move = clamp(step - index)
      if (move <= 0) return null
      const side = id === 'greens' && diverted
      const xPosition = center + (side ? Math.min(width / 2 - 22, 145) * move * move : 0)
      const stack = diverted && id === 'top' ? index - 1 : index
      const y = 58 + ((side ? 101 : 99 - stack * 9) - 58) * move * move
      return <g key={id} transform={`translate(${xPosition} ${y}) rotate(${side ? 16 * move : 0})`}>
        <Ingredient id={id} />
      </g>
    })}
    <Caption x={center} color={progress >= .98 && (early || diverted) ? coral : ink}>
      {current ? `${current[0]} 투입` : progress >= .98 && (early ? '치즈가 빵 아래에 깔림' : diverted ? '채소가 옆 통로로 빠짐' : '빠진 재료 없이 완성')}
    </Caption>
  </g>
}

function Food({ settings, trial, inspected, field, known, progress }) {
  const early = field ? inspected !== 'delay' : settings.timing === 0
  const diverted = !early && (field || settings.junction !== 2)
  if (field && inspected === 'run') return <>
    <path d="M210 14v116" stroke="#ad8561" strokeDasharray="3 5" />
    <BurgerLine x={12} width={188} label="기본 주문" progress={progress} />
    <BurgerLine x={220} width={188} label="치즈 추가" extra early progress={progress} />
  </>
  const extra = field || trial?.index !== 0
  const branchX = [104, 241, 301][settings.junction]
  // 갈림길이 어디로 열려 있는지는 투입 순서를 점검하거나 치즈 늦추기를 해 봐야 보인다
  const showBranch = extra && (!field || known.includes('order') || known.includes('delay'))
  return <>
    {showBranch && <Pipe d={diverted ? 'M245 76h66l61 23' : `M${branchX} 64v23h${branchX < 210 ? 63 : -55}`} color={diverted ? '#e3a48f' : '#ecd39c'} />}
    {showBranch && <Sprite name="industrial_067" x={(diverted ? 245 : branchX) - 8} y={(diverted ? 76 : 64) - 8} w={16} />}
    <BurgerLine x={22} width={376} label={field && !inspected ? '조리대' : inspected === 'delay' ? '치즈 늦게 넣기' : extra ? '치즈 추가' : '기본 주문'}
      extra={extra} early={extra && early} diverted={extra && diverted} progress={progress} />
  </>
}

// 받침대는 Kenney 나무 상자를 칸 수만큼 쌓아 보여 준다
function Pillar({ x, blocks, top }) {
  return <g>{Array.from({ length: blocks }, (_, i) => <Sprite key={i} name="industrial_029" x={x - 6} y={top - (i + 1) * 9} w={12} h={9} />)}</g>
}

function Carousel({ settings, trial, field, known, progress }) {
  const level = settings.height - 4
  const spin = trial ? progress * (trial.ok ? 2 : .88) * Math.PI : 0
  // 받침대 높이는 직접 재 보기 전에는 덤불에 가려 있다
  const measured = !field || known.includes('height')
  return <>
    <rect x="86" y="124" width="249" height="9" rx="3" fill="#8f7a62" stroke="#5f4c3a" strokeWidth="1.2" />
    <rect x="86" y="124" width="249" height="2.5" rx="1" fill="#c9b293" />
    {/* 직접 재기 전에는 받침대가 덤불에 가려 있다 */}
    {!measured && [86, 160, 236, 300].map((x) => <Sprite key={x} name="bushAlt1" x={x} y={100} w={44} />)}
    {measured && [105, 213, 320].map((x, i) => {
      const blocks = i === 1 ? settings.height : 4
      return <g key={x}>
        <Pillar x={x} blocks={blocks} top={126} />
        <Caption x={x} y={145} color={i === 1 ? gold : mint}>{`${'ABC'[i]} ${blocks}칸`}</Caption>
      </g>
    })}
    <g transform={`rotate(${-level * 3} 210 84)`}>
      <ellipse cx="210" cy="86" rx="123" ry="12" fill="#a97259" stroke="#704938" strokeWidth="2" />
      <path d="M210 33v52" stroke="#b87e42" strokeWidth="3" />
      <Sprite name="curtain_straight" x={130} y={36} w={160} h={20} />
      <path d="M128 37 210 18l82 19z" fill="#e7c27a" stroke="#79493a" strokeWidth="1.5" strokeLinejoin="round" />
      {[0, 1, 2, 3].map(i => {
        const phase = spin + i * Math.PI / 2
        const x = 210 + Math.cos(phase) * 92
        const y = 70 + Math.sin(phase) * 7
        return <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M0-14v18" stroke="#b87e42" />
          <Emoji id="1F3A0" x={0} y={-2} size={28} flip={Math.sin(phase) < 0} />
        </g>
      })}
      {/* 노란 표식과 구슬 */}
      <Sprite name="ball_yellow" x={292} y={82} w={8} />
      {known.includes('level') && <>
        <Sprite name="ball_blue" x={150} y={81} w={7} />
        <Sprite name="ball_blue" x={206} y={81} w={7} />
        <Sprite name="ball_blue" x={268} y={81} w={7} />
      </>}
    </g>
  </>
}

function Safari({ settings, trial, field, known, progress }) {
  const hill = [[40, 99], [138, 99], [254, 57], [369, 47]]
  const cargo = settings.cargo === 0
  const beltTest = trial?.index === 1
  const arrival = cargo ? .64 : 1
  const point = positionOn(hill, beltTest ? 0 : progress * arrival)
  const boxTravel = !cargo && beltTest ? progress * (settings.direction ? 1 : -.12) : 0
  // 짐칸은 열어 봐야 보이고, 무게는 재 봐야 보인다
  const showCargo = cargo && (!field || known.includes('cargo') || known.includes('weight'))
  return <>
    <Caption x={82} y={27}>투어 차량 노선</Caption>
    <Caption x={345} y={27} color={mint}>동물 구역</Caption>
    <Road points={hill} width={12} />
    <Truck point={point} cargo={showCargo} tilt={!beltTest && progress > .34 && progress < .87 ? -13 : 0} />
    <Belt x={55} y={120} width={310} reverse={!settings.direction} arrows={!field || known.includes('cargo')} />
    {!cargo && <Box x={104 + boxTravel * 228} y={114} />}
    {field && known.includes('weight') && <Caption x={point[0]} y={point[1] - 30} color={coral}>짐칸 210kg</Caption>}
    <Caption x={210} y={150}>먹이 전용 운반 벨트</Caption>
  </>
}

function Viking({ settings, trial, field, known, progress }) {
  const spins = trial && trial.kind !== 'kids' && trial.index !== 0
  const imbalance = settings.side === 1 ? 2 - settings.mass : 2 + settings.mass
  const swing = trial ? Math.sin(progress * Math.PI * (trial.ok ? 2 : 1.3)) * 26 : 0
  const shake = spins && imbalance !== 0 && progress > .6 && progress < .94 ? Math.sin(progress * 125) * 7 : 0
  const rotation = spins ? progress * (trial.ok ? 360 : 130) + shake : 0
  // 좌석 밑 상자(교체 부품)는 직접 살펴봐야 보인다
  const showPart = !field || known.includes('npc')
  return <>
    <path d="M117 136 174 29h72l57 107" fill="none" stroke="#75a797" strokeWidth="9" strokeLinejoin="round" />
    <g transform={`rotate(${swing} 210 32)`}>
      <path d="M210 32v64" stroke={gold} strokeWidth="8" strokeLinecap="round" />
      <g transform={`translate(210 105) rotate(${rotation})`}>
        <Sprite name="industrial_067" x={-34} y={-34} w={68} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = i * Math.PI / 4 - 1.18
          return <g key={i} transform={`translate(${Math.cos(a) * 26} ${Math.sin(a) * 26})`}>
            <Sprite name="ball_red" x={-4} y={-5} w={8} />
            <text y="2.6" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fff">{i + 1}</text>
          </g>
        })}
        {showPart && <Emoji id="1F50B" x={12} y={-9} size={18} />}
        {settings.mass > 0 && <Sprite name="industrial_057" x={(settings.side ? -15 : 15) - (4 + settings.mass * 2) / 2} y={8 - (4 + settings.mass * 2) / 2} w={4 + settings.mass * 2} />}
      </g>
    </g>
    <circle cx="210" cy="32" r="9" fill="#f3d28c" stroke={ink} strokeWidth="3" />
    {field && known.includes('weight') && <Caption x={64} y={104} color={coral}>1~4번 쪽 120kg</Caption>}
    {field && known.includes('weight') && <Caption x={356} y={104} color={mint}>5~8번 쪽 80kg</Caption>}
    {!field && <Caption x={353} y={104} color={gold}>{settings.mass ? `균형추 ${settings.mass}칸` : '균형추 없음'}</Caption>}
    {trial && <Caption x={210} y={150}>{trial.kind === 'kids' || trial.index === 0 ? '어린이 모드, 팔만 움직임' : '스릴 모드, 팔과 원판'}</Caption>}
  </>
}

function Coaster({ settings, trial, field, known, progress }) {
  const compare = field && trial?.kind === 'run'
  const evening = compare ? progress >= .5 : trial?.index === 1 || field
  const moving = compare ? (progress < .5 ? progress * 2 : (progress - .5) * 2) : progress
  const dusty = field ? evening : !settings.clean || (evening && settings.screen !== 1)
  const track = [[25, 89], [74, 55], [107, 61], [154, 111], [211, 116], [268, 91], [316, 44], [348, 45], [392, 90]]
  const [x, y] = positionOn(track, moving * (dusty ? .65 : 1))
  // 하얀 가루와 바람 방향은 레일을 직접 점검해야 보인다
  const seenDust = !field || known.includes('rail')
  return <>
    <RepairSet id="coaster" dusk={evening} />
    <Caption x={60} y={22}>{evening ? '저녁 운행' : '아침 운행'}</Caption>
    {/* 솜사탕 가게 */}
    <Sprite name="curtain_straight" x={124} y={50} w={40} h={12} />
    <Emoji id="1F36D" x={144} y={72} size={20} />
    {track.filter((_, i) => i % 2).map(([x, y]) => <g key={x}>
      <rect x={x - 3.5} y={y + 12} width="7" height={124 - y} rx="2" fill="#4f7a6f" stroke="#2f4a43" strokeWidth="1" />
      <rect x={x - 3.5} y={y + 12} width="2.2" height={124 - y} fill="#8fb5aa" opacity=".6" />
    </g>)}
    <Rail points={track} />
    {dusty && seenDust && [0, 1, 2, 3, 4, 5, 6].map((i) => <circle key={i} cx={215 + i * 8} cy={117 - i * 4} r={i % 2 ? 2 : 3} fill="#fff" stroke="#c9b9a0" strokeWidth=".6" />)}
    {settings.screen !== 0 && <Sprite name="fence" x={settings.screen === 1 ? 240 : 341} y={34} w={24} />}
    {seenDust && evening && <path d="M161 66h74l-9-6m9 6-9 6" fill="none" stroke={coral} strokeDasharray="4 3" />}
    <g transform={`translate(${x} ${y})`}>
      <Emoji id="1F683" x={0} y={-2} size={30} />
    </g>
    <Caption x={275} y={151} color={dusty && seenDust ? coral : mint}>{dusty && seenDust ? '하얀 가루가 묻은 구간' : '마지막 언덕'}</Caption>
  </>
}

function Sign({ settings, trial, inspected, field, known, progress }) {
  const night = trial ? (field ? progress >= .45 : trial.index === 1) : inspected === 'wire'
  const lit = night && settings.wire !== 2
  const overload = lit && settings.wire === 0
  const flicker = overload && (progress === 1 || Math.floor(progress * 8) % 2 === 0)
  // 전선이 어디로 이어지는지는 3번 줄 전선을 따라가 봐야 보인다
  const traced = !field || known.includes('wire')
  return <>
    <RepairSet id="sign" dusk={night} />
    <rect x="32" y="17" width="214" height="116" rx="12" fill={night ? '#10292e' : '#31584d'} stroke="#719d8e" />
    {['도로랜드 축제', '퍼레이드 안내', flicker ? '■ ░ ■' : '오후 6시 개막'].map((line, i) => <g key={i}>
      <rect x="47" y={30 + i * 31} width="184" height="25" rx="5" fill={i === 2 && overload ? '#753e3c' : '#21493f'} />
      <Caption x={139} y={47 + i * 31} color={i === 2 && overload ? '#ffc5a2' : '#f9dda2'}>{line}</Caption>
    </g>)}
    {traced && <Cable d={settings.wire === 0 ? 'M246 107h53V67h75' : 'M274 128h34V67h66'} color={overload ? '#e0644f' : '#5fb487'} off={settings.wire === 2} />}
    {traced && <Emoji id="1F50C" x={settings.wire === 0 ? 262 : 290} y={settings.wire === 0 ? 107 : 128} size={16} />}
    {[311, 338, 365].map(x => <Sprite key={x} name={lit ? 'industrial_040' : 'industrial_039'} x={x - 9} y={58} w={18} opacity={lit ? 1 : .45} />)}
    <Caption x={337} y={43}>{night ? '밤, 장식 조명' : '낮, 안내 표시'}</Caption>
    {traced && <Caption x={336} y={109} color={overload ? coral : mint}>{field ? '갈라진 전선 → 장식 조명' : ['3번 줄과 전선 함께 씀', '장식 전원 따로', '장식 전원 꺼짐'][settings.wire]}</Caption>}
  </>
}

function Parade({ settings, trial, inspected, field, known, progress }) {
  const routeTest = trial?.index === 1 || inspected === 'route'
  const [x, y] = positionOn(
    settings.route ? [[44, 101], [153, 111], [235, 111], [324, 90]] : [[44, 101], [128, 101], [216, 75], [324, 75]],
    progress * (routeTest ? settings.route ? 1 : .65 : settings.load && settings.balance ? 1 : .52),
  )
  const seen = (id) => !field || known.includes(id)
  return <>
    <Road d="M125 114h127l82-18" width={9} planned={!settings.route} />
    <Road d="M35 112h89l93-26h122" width={11} />
    <Emoji id="1F3AA" x={352} y={52} size={62} />
    {[329, 351, 376].map((lamp, index) => {
      const on = settings.power || Math.floor(progress * 16 + index) % 3 === 0
      return <Sprite key={lamp} name={on ? 'industrial_040' : 'industrial_039'} x={lamp - 7} y={14} w={14} opacity={on ? 1 : .45} />
    })}
    <Caption x={351} y={92} color={ink}>축제 무대</Caption>
    {!settings.route && seen('route') && <Emoji id="1F6A7" x={248} y={72} size={22} />}
    <Truck point={[x, y]} cargo={!settings.load && seen('load')} tilt={!settings.balance ? -8 : 0} />
    {[0, 1, 2].map(i => {
      const dx = settings.balance ? (i - 1) * 15 : -19 - i * 10
      return <g key={i}><path d={`M${x - 6} ${y - 14}l${dx + 6} -21`} stroke={mint} />
        <Emoji id="1F388" x={x + dx} y={y - 40 - i % 2 * 5} size={20} /></g>
    })}
    {seen('load') && <Caption x={105} y={142} color={settings.load && settings.balance ? mint : coral}>{settings.load ? '짐 따로 운반' : '짐과 장식을 차에 실음'}</Caption>}
    {seen('route') && <Caption x={317} y={142} color={settings.route ? mint : coral}>{settings.route ? '우회로 연결' : '길 한가운데 무대 기둥'}</Caption>}
  </>
}

function Delivery({ settings, trial, field, known, progress }) {
  const emptyTest = trial?.index === 0
  const stop = settings.direction ? settings.clear ? 1 : .83 : .46
  const rollers = !field || known.includes('roller')
  const blocked = !settings.clear && (!field || known.includes('obstacle'))
  return <>
    <Caption x={103} y={43}>첫 번째 롤러</Caption>
    <Caption x={243} y={43} color={rollers && !settings.direction ? coral : ink}>두 번째 롤러</Caption>
    <Belt x={27} y={88} width={144} arrows={rollers} />
    <Belt x={173} y={88} width={153} reverse={!settings.direction} arrows={rollers} />
    <Sprite name="industrial_057" x={334} y={70} w={58} h={40} />
    {blocked && <Sprite name="present_small_orange" x={305} y={74} w={12} />}
    {!emptyTest && <Box x={51 + 311 * progress * stop} y={78} />}
    {emptyTest && <Sprite name="ball_blue" x={46 + 267 * progress * (settings.direction ? 1 : .52)} y={78} w={10} />}
    <Caption x={361} y={133}>{blocked ? '입구에 포장 조각' : '도착 상자'}</Caption>
  </>
}

// 첫 자동차: 오른쪽 뒷바퀴 바람이 빠지면 차가 기울고, 달리는 동안 차의 오른쪽으로 휜다
function Car({ settings, trial, inspected, field, known, progress }) {
  const low = settings.tire !== 2
  const leaky = settings.cap !== 1
  const reverse = trial?.kind === 'floor' // 반대 방향으로 달려 보기
  const longRun = trial?.kind === 'test' && trial.index === 1
  // 오래 달리기 시험에서 뚜껑이 없으면 중간부터 다시 바람이 빠진다
  const leaking = longRun && !low && leaky ? Math.max(0, progress - .45) / .55 : 0
  const drift = (low ? 1 : 0) * progress + leaking * .8
  const x = reverse ? 360 - 300 * progress : 60 + 300 * progress
  // 차의 오른쪽: 오른쪽으로 갈 때는 화면 아래, 왼쪽으로 갈 때는 화면 위
  const y = 104 + (reverse ? -1 : 1) * drift * 26
  const tilt = (low || leaking > .3) ? (reverse ? -4 : 4) : 0
  const showPressure = !field || known.includes('pressure')
  const rear = low ? settings.tire === 0 ? 12 : settings.tire === 1 ? 20 : 40 : leaking > .3 ? 18 : 30
  return <>
    {/* 차고 바닥의 주행 시험 선 */}
    <rect x="20" y="86" width="380" height="44" rx="6" fill="#5f5a52" opacity=".55" />
    <path d="M30 108h360" stroke="#f2e3b5" strokeWidth="2" strokeDasharray="10 8" />
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <Emoji id="1F699" x={0} y={-6} size={58} flip={!reverse} />
    </g>
    {(field && known.includes('look')) && <Caption x={210} y={30} color={coral}>오른쪽 뒤가 살짝 낮아 보여요</Caption>}
    {showPressure && <g>
      <Caption x={330} y={30} color={ink}>바퀴 공기압</Caption>
      {[['앞 왼', 30], ['앞 오', 30], ['뒤 왼', 30], ['뒤 오', rear]].map(([label, value], i) => (
        <g key={label} transform={`translate(${282 + (i % 2) * 52} ${40 + Math.floor(i / 2) * 18})`}>
          <rect width="48" height="15" rx="4" fill={value === 30 ? '#dbe8d6' : '#f6d2c8'} />
          <text x="24" y="11" textAnchor="middle" fontSize="9" fontWeight="700" fill={value === 30 ? mint : coral}>{label} {value}</text>
        </g>
      ))}
    </g>}
    {(!field || known.includes('valve')) && <Caption x={92} y={30} color={leaky ? coral : mint}>{leaky ? '밸브 뚜껑 없음' : '새 밸브 뚜껑'}</Caption>}
    {trial && <Caption x={210} y={150}>{reverse ? '반대 방향 주행' : longRun ? '오래 달리기' : '직진 주행'}</Caption>}
  </>
}

const scenes = { food: Food, carousel: Carousel, safari: Safari, viking: Viking, coaster: Coaster, sign: Sign, parade: Parade, delivery: Delivery, car: Car }
const locations = {
  food: '푸드코트 안쪽 조리대',
  carousel: '회전목마 승강장',
  safari: '사파리 투어 출발점',
  viking: '이클립스 탑승장',
  coaster: '롤러코스터 마지막 언덕',
  sign: '광장 입구 전광판',
  parade: '퍼레이드 리허설 구간',
  delivery: '작업실 포장대',
  car: '마이룸 차고',
}

export default function RepairScene({ item, settings, trial, inspected, field, known = [], finished = false, stage = false }) {
  const [frame, setFrame] = useState(null)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const animate = Boolean(trial && !reduceMotion && !finished)

  useEffect(() => {
    if (!animate) return
    let animation
    const step = (now) => {
      const progress = clamp((now - trial.start) / trial.duration)
      setFrame({ trial, progress })
      if (progress < 1) animation = requestAnimationFrame(step)
    }
    animation = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animation)
  }, [animate, trial])

  const Scene = scenes[item.id]
  if (!Scene) return null
  const showBurger = item.id === 'food' && (!field || inspected === 'run' || inspected === 'delay')
  const progress = animate ? frame?.trial === trial ? frame.progress : 0 : trial || showBurger ? 1 : 0
  const testing = trial?.kind === 'test'
  const status = testing ? progress < 1 ? '시험 중' : trial.ok ? '통과' : '재점검'
    : trial && progress < 1 ? '작동 중' : null

  const art = <>
    {item.id !== 'coaster' && item.id !== 'sign' && <RepairSet id={item.id} />}
    <Scene settings={settings} trial={trial} inspected={inspected} field={field} known={known} progress={progress} />
  </>
  const caption = <figcaption><span>{locations[item.id]}</span>{status && <b data-failed={testing && progress >= 1 && !trial.ok}>{status}</b>}</figcaption>
  if (stage) return (
    <figure className={`repair-scene repair-scene-stage repair-scene-${item.id}`}>
      <svg className="repair-stage-main" viewBox="0 0 420 158" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${item.district} 장치 작동 그림`}>{art}</svg>
      {caption}
    </figure>
  )
  return (
    <figure className={`repair-scene repair-scene-${item.id}`}>
      <svg viewBox="0 0 420 158" role="img" aria-label={`${item.district} 장치 작동 그림`}>{art}</svg>
      {caption}
    </figure>
  )
}
