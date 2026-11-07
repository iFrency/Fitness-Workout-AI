# Retarget one Mixamo FBX onto the 16-bone mannequin rig by segment direction.
# Usage: blender -b --python retarget.py -- --rig <rig.glb> --fbx <x.fbx> --id <id> --out <dir>
#        [--frames <start> <end>] [--sheet]
# Writes <out>/<id>.glb, <out>/<id>.report.json and, with --sheet, <out>/<id>.sheet.png.
import argparse
import json
import math
import os
import sys
import traceback

import bpy
import numpy as np
from mathutils import Matrix, Vector

P = 'mixamorig:'
REQUIRED = ['Hips', 'Spine', 'Neck', 'HeadTop_End', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle1',
            'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle1', 'LeftUpLeg', 'LeftLeg', 'LeftFoot',
            'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
SEG = {  # target bone: (target child or None, source from, source to)
    'armL': ('elbowL', 'LeftArm', 'LeftForeArm'), 'elbowL': ('handL', 'LeftForeArm', 'LeftHand'),
    'handL': (None, 'LeftHand', 'LeftHandMiddle1'), 'legL': ('kneeL', 'LeftUpLeg', 'LeftLeg'),
    'kneeL': ('footL', 'LeftLeg', 'LeftFoot'), 'footL': (None, 'LeftFoot', 'LeftToeBase'),
    'armR': ('elbowR', 'RightArm', 'RightForeArm'), 'elbowR': ('handR', 'RightForeArm', 'RightHand'),
    'handR': (None, 'RightHand', 'RightHandMiddle1'), 'legR': ('kneeR', 'RightUpLeg', 'RightLeg'),
    'kneeR': ('footR', 'RightLeg', 'RightFoot'), 'footR': (None, 'RightFoot', 'RightToeBase'),
    'neck': (None, 'Neck', 'HeadTop_End'),
}
HAND_PARENT = {'handL': 'elbowL', 'handR': 'elbowR'}
ORDER = ['hips', 'spine', 'neck', 'armL', 'elbowL', 'handL', 'armR', 'elbowR', 'handR',
         'legL', 'kneeL', 'footL', 'legR', 'kneeR', 'footR']
SHEET_W, SHEET_H, SHEET_FRAMES, SHEET_OFFSET = 360, 300, 8, 1.2


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument('--rig', required=True)
    p.add_argument('--fbx', required=True)
    p.add_argument('--id', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--frames', nargs=2, type=int)
    p.add_argument('--sheet', action='store_true')
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:])


def write_report(args: argparse.Namespace, values: dict) -> None:
    path = os.path.join(args.out, args.id + '.report.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'id': args.id, **values}, fh, indent=2)
    print('REPORT', path, json.dumps(values))


def load_scene(args: argparse.Namespace):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.rig)
    tgt = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    tgt.animation_data_clear()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=args.fbx)
    src = next(o for o in bpy.data.objects if o.type == 'ARMATURE' and o not in before)
    return tgt, src


def basis(x: Vector, up: Vector) -> Matrix:
    # Right-handed frame from a lateral and an up vector.
    x = x.normalized()
    z = (up - x * up.dot(x)).normalized()
    return Matrix((x, z.cross(x), z)).transposed()


class Retargeter:
    def __init__(self, tgt, src, f0: int):
        self.tgt, self.src = tgt, src
        bpy.context.scene.frame_set(f0)
        th = {b.name: b.head_local.copy() for b in tgt.data.bones}
        self.th = th
        self.rest_q = {b.name: b.matrix_local.to_quaternion() for b in tgt.data.bones}
        self.rest_dir = {b: self._rest_dir(b) for b in SEG}
        self.bh_rest = basis(th['legL'] - th['legR'], th['spine'] - th['hips'])
        self.bs_rest = basis(th['armL'] - th['armR'], th['neck'] - th['spine'])
        self.k = (th['legL'] - th['footL']).length / (self.sr('LeftUpLeg') - self.sr('LeftFoot')).length
        self.hips_rest = self.sr('Hips')

    def sw(self, name: str) -> Vector:
        return self.src.matrix_world @ self.src.pose.bones[P + name].head

    def sr(self, name: str) -> Vector:
        return self.src.matrix_world @ self.src.data.bones[P + name].head_local

    def _rest_dir(self, b: str) -> Vector:
        child, s0, s1 = SEG[b]
        if child:
            return (self.th[child] - self.th[b]).normalized()
        if b.startswith('foot'):
            d = self.sr(s1) - self.sr(s0)
            d.z = 0
            return d.normalized()
        if b in HAND_PARENT:
            return (self.th[b] - self.th[HAND_PARENT[b]]).normalized()
        return Vector((0, 0, 1))

    def raw_hips(self, f: int) -> Vector:
        bpy.context.scene.frame_set(f)
        return self.th['hips'] + (self.sw('Hips') - self.hips_rest) * self.k

    def pose_bone(self, name: str, drift: Vector) -> None:
        pb = self.tgt.pose.bones[name]
        bpy.context.view_layer.update()
        sw = self.sw
        if name == 'hips':
            q = (basis(sw('LeftUpLeg') - sw('RightUpLeg'), sw('Spine') - sw('Hips')) @ self.bh_rest.inverted())
            q = q.to_quaternion()
            pos = self.th['hips'] + (sw('Hips') - self.hips_rest) * self.k - drift
        elif name == 'spine':
            q = (basis(sw('LeftArm') - sw('RightArm'), sw('Neck') - sw('Spine')) @ self.bs_rest.inverted())
            q = q.to_quaternion()
            pos = pb.head.copy()
        else:
            _, s0, s1 = SEG[name]
            q = self.rest_dir[name].rotation_difference((sw(s1) - sw(s0)).normalized())
            pos = pb.head.copy()
        pb.matrix = Matrix.Translation(pos) @ (q @ self.rest_q[name]).to_matrix().to_4x4()
        bpy.context.view_layer.update()
        pb.keyframe_insert('rotation_quaternion', frame=bpy.context.scene.frame_current)
        if name == 'hips':
            pb.keyframe_insert('location', frame=bpy.context.scene.frame_current)


def bake(rt: Retargeter, clip_id: str, f0: int, f1: int) -> dict:
    tgt = rt.tgt
    d = rt.raw_hips(f1) - rt.raw_hips(f0)
    d.z = 0
    tgt.animation_data_create()
    tgt.animation_data.action = bpy.data.actions.new(clip_id)
    for pb in tgt.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    quats, hips, ankle = {}, {}, math.inf
    span = max(f1 - f0, 1)
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        for name in ORDER:
            rt.pose_bone(name, d * ((f - f0) / span))
        if f in (f0, f1):
            quats[f] = {n: tgt.pose.bones[n].rotation_quaternion.copy() for n in ORDER}
            hips[f] = tgt.matrix_world @ tgt.pose.bones['hips'].head
        for foot in ('footL', 'footR'):
            ankle = min(ankle, (tgt.matrix_world @ tgt.pose.bones[foot].head).z)
    return seam_report(quats[f0], quats[f1], hips[f0], hips[f1], ankle, f0, f1)


def seam_report(qa: dict, qb: dict, ha: Vector, hb: Vector, ankle: float, f0: int, f1: int) -> dict:
    def angle(n: str) -> float:
        a = qa[n].rotation_difference(qb[n]).angle
        return min(a, 2 * math.pi - a)

    horiz = Vector((hb.x - ha.x, hb.y - ha.y, 0))
    scene = bpy.context.scene
    return {
        'missingBones': [],
        'seamMaxAngleDeg': round(math.degrees(max(angle(n) for n in ORDER)), 4),
        'seamHipsDistance': round((hb - ha).length, 5),
        'minAnkleHeight': round(ankle, 5),
        'driftAfterFix': round(horiz.length, 5),
        'durationSeconds': round((f1 - f0) / (scene.render.fps / scene.render.fps_base), 5),
    }


def render_sheet(tgt, src, f0: int, f1: int, path: str) -> None:
    # Mannequin (left) vs Mixamo source (right); bottom row front, top row side.
    scene = bpy.context.scene
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            o.hide_render = True
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = SHEET_W, SHEET_H
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0.6, 0.6, 0))
    cam = bpy.data.objects.new('sheet_cam', bpy.data.cameras.new('sheet_cam'))
    scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 3.2
    scene.camera = cam
    frames = [int(round(x)) for x in np.linspace(f0, f1, SHEET_FRAMES)]
    tmp = path + '.tmp.png'
    rows = []
    for view in ('front', 'side'):
        if view == 'front':
            src.location = (SHEET_OFFSET, 0, 0)
            cam.location, cam.rotation_euler = (0.6, -6, 1.0), (math.pi / 2, 0, 0)
        else:
            src.location = (0, SHEET_OFFSET, 0)
            cam.location, cam.rotation_euler = (-6, 0.6, 1.0), (math.pi / 2, 0, -math.pi / 2)
        row = []
        for f in frames:
            scene.frame_set(f)
            scene.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp)
            row.append(np.array(img.pixels[:]).reshape(SHEET_H, SHEET_W, 4))
            bpy.data.images.remove(img)
        rows.append(np.concatenate(row, axis=1))
    os.remove(tmp)
    sheet = np.concatenate(rows[::-1], axis=0)
    out = bpy.data.images.new('sheet', sheet.shape[1], sheet.shape[0])
    out.pixels = sheet.ravel()
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()


def export_glb(tgt, src, keep, path: str) -> None:
    # Drop the FBX armature, its meshes and every action except the new one.
    for o in [src, *src.children_recursive]:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a != keep:
            bpy.data.actions.remove(a)
    for o in bpy.data.objects:
        o.select_set(o == tgt or o.parent == tgt)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_animation_mode='ACTIONS')


def main() -> None:
    args = parse_args()
    args.out = os.path.abspath(args.out)
    os.makedirs(args.out, exist_ok=True)
    tgt, src = load_scene(args)
    missing = [P + n for n in REQUIRED if P + n not in src.data.bones]
    if missing:
        write_report(args, {'missingBones': missing, 'seamMaxAngleDeg': 0, 'seamHipsDistance': 0,
                            'minAnkleHeight': 0, 'driftAfterFix': 0, 'durationSeconds': 0})
        return
    if args.frames:
        f0, f1 = args.frames
    else:
        f0, f1 = (int(x) for x in src.animation_data.action.frame_range)
    rt = Retargeter(tgt, src, f0)
    print('scale', round(rt.k, 4), 'frames', f0, f1)
    report = bake(rt, args.id, f0, f1)
    write_report(args, report)
    if args.sheet:
        render_sheet(tgt, src, f0, f1, os.path.join(args.out, args.id + '.sheet.png'))
    export_glb(tgt, src, tgt.animation_data.action, os.path.join(args.out, args.id + '.glb'))
    print('DONE', args.id)


try:
    main()
except Exception:
    # Blender ignores script exceptions in its exit code; fail loudly instead.
    traceback.print_exc()
    sys.exit(1)
