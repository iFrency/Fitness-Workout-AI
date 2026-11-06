import { ContactShadows, OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'
import { IDLE_CLIP, MODEL_URL, THUMB_URL } from '../catalog/constants'
import type { Exercise } from '../catalog/types'
import type { Plan } from '../planner/types'
import type { TrainingSession } from '../player/session'
import { stateAt, type Step } from '../player/timeline'
import { blendWeight, computePose, shouldMirror, type ClipInfo } from './pose'
import { hasWebGL } from './webgl'

export type CameraPreset = 'threeQuarter' | 'front' | 'side'
export const CAMERA_POSITIONS: Readonly<Record<CameraPreset, [number, number, number]>> = {
  threeQuarter: [2.2, 1.4, 2.6],
  front: [0, 1.2, 3.2],
  side: [3.2, 1.2, 0],
}
const LOOK_AT: [number, number, number] = [0, 0.9, 0]

export interface StageProps {
  readonly session: TrainingSession
  readonly steps: readonly Step[]
  readonly plan: Plan
  readonly catalog: readonly Exercise[]
  readonly mirror: boolean
  readonly preset: CameraPreset
}

function useClipOf(plan: Plan, catalog: readonly Exercise[]): (i: number) => ClipInfo {
  return useMemo(() => {
    const byId = new Map(catalog.map(e => [e.id, e]))
    return (i: number) => {
      const e = byId.get(plan.items[i].exerciseId)!
      return { clip: e.clip, clipSeconds: e.clipSeconds }
    }
  }, [plan, catalog])
}

function Mannequin({ session, steps, plan, catalog, mirror }: Omit<StageProps, 'preset'>) {
  const group = useRef<Group>(null)
  const { scene, animations } = useGLTF(MODEL_URL)
  const { actions, mixer } = useAnimations(animations, group)
  const clipOf = useClipOf(plan, catalog)
  const blend = useRef({ current: IDLE_CLIP, previous: IDLE_CLIP, switchedAt: -1 })
  const idleSeconds = animations.find(a => a.name === IDLE_CLIP)?.duration ?? 1

  useFrame(() => {
    const t = session.time()
    const state = stateAt(steps, t)
    const pose = computePose(state, t, clipOf, idleSeconds)
    const b = blend.current
    if (pose.clip !== b.current) blend.current = { current: pose.clip, previous: b.current, switchedAt: t }
    const { current, previous, switchedAt } = blend.current
    const w = blendWeight(t, switchedAt)
    for (const [name, action] of Object.entries(actions)) {
      if (!action) continue
      const weight = name === current ? w : name === previous && previous !== current ? 1 - w : 0
      if (weight === 0) { action.stop(); continue }
      if (!action.isRunning()) action.play()
      action.setEffectiveWeight(weight)
      if (name === current) action.time = pose.clipTime
    }
    mixer.update(0)
    if (group.current) group.current.scale.x = shouldMirror(mirror, state.step.side) ? -1 : 1
  })

  return <group ref={group}><primitive object={scene} /></group>
}

function CameraRig({ preset }: { preset: CameraPreset }) {
  const camera = useThree(s => s.camera)
  useEffect(() => {
    camera.position.set(...CAMERA_POSITIONS[preset])
    camera.lookAt(...LOOK_AT)
  }, [camera, preset])
  return <OrbitControls target={LOOK_AT} enablePan={false} enableZoom={false} />
}

interface BoundaryProps { readonly children: ReactNode; readonly onError: () => void }
class LoadBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) {
    console.error('3D 模型加载失败', error)
    this.props.onError()
  }
  render() { return this.state.failed ? null : this.props.children }
}

export function Stage(props: StageProps) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const webgl = useMemo(hasWebGL, [])
  const clipOf = useClipOf(props.plan, props.catalog)

  if (!webgl) {
    const state = stateAt(props.steps, props.session.time())
    return <img className="stage-fallback" alt="动作示意" src={THUMB_URL(clipOf(state.step.itemIndex).clip)} />
  }
  const onError = () => {
    useGLTF.clear(MODEL_URL)
    if (attempt === 0) setAttempt(1)
    else setFailed(true)
  }
  if (failed) {
    return (
      <div className="stage-error">
        <p>网络不佳，3D 模型加载失败</p>
        <button type="button" onClick={() => { setFailed(false); setAttempt(a => a + 1) }}>重试</button>
      </div>
    )
  }
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 40, position: CAMERA_POSITIONS[props.preset] }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <LoadBoundary key={attempt} onError={onError}>
        <Suspense fallback={null}>
          <Mannequin {...props} />
        </Suspense>
      </LoadBoundary>
      <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={4} blur={2.5} />
      <CameraRig preset={props.preset} />
    </Canvas>
  )
}
