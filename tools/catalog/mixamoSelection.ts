import type { Level, Part, SegmentType } from '../../src/catalog/types'

/** One Mixamo-sourced move. `fbx` is the downloaded file name; `frames` optionally trims the clip. */
export interface MixamoRow {
  id: string
  fbx: string
  frames?: [number, number]
  name: string
  parts: readonly Part[]
  type: SegmentType
  level: Level
  impact: 'low' | 'high'
  sided: boolean
  cues: readonly string[]
  caution: string
}

export const MIXAMO_SELECTION: readonly MixamoRow[] = [
  {
    id: 'jumping-jacks', fbx: 'Jumping Jacks.fbx', name: '开合跳', parts: ['全身'], type: 'main', level: 2,
    impact: 'high', sided: false, cues: ['双脚并拢站直，双臂自然下垂', '跳起时双脚分开、双臂上举，再跳回并拢'],
    caution: '膝盖不适时改为无跳开合步',
  },
  {
    id: 'high-knees', fbx: 'High Knees.fbx', name: '高抬腿', parts: ['全身', '臀腿'], type: 'main', level: 2,
    impact: 'high', sided: false, cues: ['身体挺直，目视前方，双臂屈肘', '快速交替抬膝到髋部高度，手臂反向摆动'],
    caution: '落地用前脚掌，膝盖不适时改为原地踏步',
  },
  {
    id: 'burpee', fbx: 'Burpee.fbx', name: '波比跳', parts: ['全身'], type: 'main', level: 3,
    impact: 'high', sided: false, cues: ['双脚与肩同宽站直', '下蹲双手撑地，双脚后跳成俯撑，再收脚跳起'],
    caution: '膝盖或腰部不适时，改为后撤步，不跳',
  },
  {
    id: 'air-squat', fbx: 'Air Squat.fbx', name: '深蹲', parts: ['臀腿'], type: 'main', level: 1,
    impact: 'low', sided: false, cues: ['双脚与肩同宽，双臂前伸', '臀部向后向下坐，再用脚跟发力站起'],
    caution: '膝盖对准脚尖，不要内扣',
  },
  {
    id: 'push-up', fbx: 'Push Up.fbx', name: '俯卧撑', parts: ['胸背', '上肢'], type: 'main', level: 3,
    impact: 'low', sided: false, cues: ['双手撑地略宽于肩，身体成一条直线', '屈肘下降到胸口接近地面，再撑起'],
    caution: '做不了时改为跪姿，不要塌腰',
  },
  {
    id: 'stair-run', fbx: 'Running Up Stairs.fbx', name: '原地爬楼梯', parts: ['全身', '臀腿'], type: 'main', level: 1,
    impact: 'low', sided: false, cues: ['身体微微前倾，双臂屈肘', '像爬楼梯一样交替高抬膝，手臂反向摆动'],
    caution: '',
  },
]
