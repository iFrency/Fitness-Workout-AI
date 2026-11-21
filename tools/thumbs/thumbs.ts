import { AmbientLight, AnimationMixer, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer, type Bone } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { MODEL_URL } from '../../src/catalog/constants'
import { CAMERA_POSITIONS } from '../../src/stage/Stage'

const SIZE = 256
const SAMPLES = 8

declare global {
  interface Window { renderClip?: (clip: string) => string; thumbsReady?: boolean }
}

async function setup(): Promise<void> {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(SIZE, SIZE)
  document.body.appendChild(renderer.domElement)
  const scene = new Scene()
  scene.add(new AmbientLight(0xffffff, 0.8))
  const sun = new DirectionalLight(0xffffff, 1.6)
  sun.position.set(3, 5, 4)
  scene.add(sun)
  const camera = new PerspectiveCamera(40, 1, 0.1, 50)
  camera.position.set(...CAMERA_POSITIONS.threeQuarter)
  camera.lookAt(0, 0.9, 0)
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(MODEL_URL)
  scene.add(gltf.scene)
  const mixer = new AnimationMixer(gltf.scene)
  window.renderClip = (name: string) => {
    const clip = gltf.animations.find(a => a.name === name)
    if (!clip) throw new Error(`missing clip ${name}`)
    mixer.stopAllAction()
    const action = mixer.clipAction(clip)
    action.play()
    const bones: Bone[] = []
    gltf.scene.traverse(o => { if ((o as Bone).isBone) bones.push(o as Bone) })
    const poseAt = (t: number) => {
      action.time = t
      mixer.update(0)
      return bones.map(b => b.quaternion.clone())
    }
    const rest = poseAt(0)
    const samples = Array.from({ length: SAMPLES }, (_, i) => (clip.duration * (i + 1)) / (SAMPLES + 1))
    const spread = (t: number) => poseAt(t).reduce((sum, q, i) => sum + q.angleTo(rest[i]), 0)
    const best = samples.reduce((a, b) => (spread(b) > spread(a) ? b : a))
    poseAt(best)
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL('image/png')
  }
  window.thumbsReady = true
}

void setup()
