"""
Chickens vs Raccoons — every animal, built, rigged and animated in Blender.

    python3 blender/animals.py            # needs the `bpy` module (pip install bpy)
    blender -b -P blender/animals.py      # or run it inside Blender

It does two things:

  1. BUILD  — models all twenty animals out of chunky low-poly parts, gives each
     one an armature, weights every part rigidly to one bone, writes every
     animation clip as a Blender action, and saves the lot to
     blender/animals.blend so it can be opened, inspected and edited.

  2. EXPORT — reads animals.blend back (so edits made in Blender are what
     ships), and writes parts/02d_models.js: the meshes, the rest skeletons
     and the sampled clips, packed small enough to inline into the game.

Run with --export-only to skip step 1 and export an edited animals.blend.

RIG CONVENTIONS — read before editing an action by hand
  * Two rigs. `bird` (hen, rooster, gamecock, guinea, goose, turkey, hawk) and
    `quad` (every four-legged animal, raccoon included). Every animal on a rig
    has the same bone names, and every clip on a rig is one action shared by
    all of them.
  * Bones are world-aligned: each one sits at its joint and points straight
    up, with no roll. That makes a bone's local axes the game's axes for every
    animal, so one action fits a hen and a turkey alike:
        local X  = pitch   (+ tips the bone's far end forward and down;
                            on a leg hanging down, + swings the foot back)
        local Y  = yaw     (about the vertical)
        local Z  = roll    (+ lifts a left wing; + swings a left leg outward)
  * Rotation only. No bone is ever translated or scaled by a clip — the game
    moves, turns, tilts and rolls the whole animal itself.
  * Every part is weighted 100% to one bone. There is no blending, which is
    what lets the game draw five thousand of them.

GAME AXES: x = the animal's left, y = up, z = forward. Blender: x, -y, z
(the animal faces -Y, so Blender's front view looks it in the eye).
"""
import bpy, bmesh, math, os, sys, json, struct, base64
from mathutils import Vector, Matrix, Euler, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BLEND = os.path.join(HERE, 'animals.blend')
OUT_JS = os.path.join(ROOT, 'parts', '02d_models.js')

TAU = math.pi * 2

def g2b(v):
    """game (x, y up, z forward) -> Blender (x, y, z up), animal facing -Y"""
    return Vector((v[0], -v[2], v[1]))
def b2g(v):
    return (v[0], v[2], -v[1])

# ============================================================
#   PRIMITIVES — built in game coordinates, radius / height 1
# ============================================================
LODS = [
    dict(sph=(7, 5), lo=(5, 4), cyl=6, cone=5, hi=True),     # close-ups and ordinary fights
    dict(sph=(5, 4), lo=(4, 3), cyl=4, cone=4, hi=False),    # a crowd
    dict(sph=(4, 3), lo=(3, 2), cyl=3, cone=3, hi=False),    # the horde
]

def prim_sphere(w, h):
    V = [(0, 1, 0)]
    for j in range(1, h):
        th = math.pi * j / h
        y, r = math.cos(th), math.sin(th)
        for i in range(w):
            ph = TAU * i / w
            V.append((r * math.sin(ph), y, r * math.cos(ph)))
    V.append((0, -1, 0))
    bot = len(V) - 1
    F = [(0, 1 + i, 1 + (i + 1) % w) for i in range(w)]
    for j in range(h - 2):
        a, b = 1 + j * w, 1 + (j + 1) * w
        for i in range(w):
            F.append((a + i, b + i, b + (i + 1) % w, a + (i + 1) % w))
    a = 1 + (h - 2) * w
    F += [(a + i, bot, a + (i + 1) % w) for i in range(w)]
    return V, F

def prim_cyl(seg, rt=1.0, rb=1.0):
    """height 1, centred, along +Y. rt/rb = top/bottom radius (0 = a point)"""
    V, F = [], []
    ring = lambda r, y: [(r * math.sin(TAU * i / seg), y, r * math.cos(TAU * i / seg)) for i in range(seg)]
    if rt > 0: V += ring(rt, 0.5)
    else: V.append((0, 0.5, 0))
    t0 = 0; nt = seg if rt > 0 else 1
    b0 = len(V); V += ring(rb, -0.5)
    if rt > 0:
        F.append(tuple(range(seg)))
        for i in range(seg):
            F.append((t0 + i, b0 + i, b0 + (i + 1) % seg, t0 + (i + 1) % seg))
    else:
        for i in range(seg):
            F.append((0, b0 + i, b0 + (i + 1) % seg))
    F.append(tuple(b0 + i for i in range(seg)))
    return V, F

def prim_box():
    V = [(x, y, z) for x in (-.5, .5) for y in (-.5, .5) for z in (-.5, .5)]
    F = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return V, F

class Model:
    """a pile of transformed primitives, each tagged with a colour slot and a bone"""
    def __init__(self, lod):
        self.L = LODS[lod]; self.hi = self.L['hi']; self.parts = []
    def add(self, kind, slot, bone, p, r=(0, 0, 0), s=1.0, rt=1.0, rb=1.0):
        if kind == 'sph':   V, F = prim_sphere(*self.L['sph'])
        elif kind == 'lo':  V, F = prim_sphere(*self.L['lo'])
        elif kind == 'cyl': V, F = prim_cyl(self.L['cyl'], rt, rb)
        elif kind == 'cone':V, F = prim_cyl(self.L['cone'], 0.0, 1.0)
        elif kind == 'box': V, F = prim_box()
        else: raise ValueError(kind)
        if not isinstance(s, (tuple, list)): s = (s, s, s)
        # three.js Euler 'XYZ' is R = Rx*Ry*Rz, which mathutils calls 'ZYX'
        M = Matrix.Translation(p) @ Euler(r, 'ZYX').to_matrix().to_4x4() @ Matrix.Diagonal((s[0], s[1], s[2], 1))
        self.parts.append(([M @ Vector(v) for v in V], F, slot, bone))

# ============================================================
#   RIGS
# ============================================================
RIGS = {
    'bird': ['body', 'neck', 'head', 'wing.L', 'wingtip.L', 'wing.R', 'wingtip.R', 'tail',
             'leg.L', 'foot.L', 'leg.R', 'foot.R'],
    'quad': ['body', 'chest', 'neck', 'head', 'jaw', 'tail1', 'tail2',
             'legFL.u', 'legFL.l', 'legFR.u', 'legFR.l', 'legBL.u', 'legBL.l', 'legBR.u', 'legBR.l'],
}
PARENT = {
    'body': None, 'neck': 'body', 'head': 'neck', 'wing.L': 'body', 'wingtip.L': 'wing.L',
    'wing.R': 'body', 'wingtip.R': 'wing.R', 'tail': 'body', 'leg.L': 'body', 'foot.L': 'leg.L',
    'leg.R': 'body', 'foot.R': 'leg.R',
    'chest': 'body', 'jaw': 'head', 'tail1': 'body', 'tail2': 'tail1',
    'legFL.u': 'chest', 'legFL.l': 'legFL.u', 'legFR.u': 'chest', 'legFR.l': 'legFR.u',
    'legBL.u': 'body', 'legBL.l': 'legBL.u', 'legBR.u': 'body', 'legBR.l': 'legBR.u',
}

# ============================================================
#   THE BIRDS
# ============================================================
def build_bird(m, o):
    """Attempted-realistic proportions executed in chunky facets. The eyes are
    still one size too large. That is still the whole joke."""
    J = {}
    # ---- legs: a feathered drumstick, a scaled shank, and real toes ----
    for sx, sd in ((1, 'L'), (-1, 'R')):
        x = .085 * sx
        leg, foot = 'leg.' + sd, 'foot.' + sd
        J[leg] = (x, .31, -.03); J[foot] = (x, .035, -.01)
        m.add('sph', 'feather', leg, (x * 1.05, .30, -.03), (0, 0, 0), (.075, .09, .085))
        m.add('cyl', 'leg', leg, (x, .165, -.02), (.08, 0, 0), (.024, .27, .024), rt=.8, rb=1.0)
        if m.hi:
            for a in (-.5, 0, .5):
                m.add('box', 'leg', foot, (x + math.sin(a) * .045 * sx, .014, -.01 + math.cos(a) * .055), (0, a * sx, 0), (.024, .022, .11))
            m.add('box', 'leg', foot, (x, .014, -.055), (0, 0, 0), (.022, .02, .06))
        else:
            m.add('box', 'leg', foot, (x, .014, .02), (0, 0, 0), (.09, .024, .15))
        if o.get('spur'):
            m.add('cone', 'spur', leg, (x + .02 * sx, .10, -.05), (2.0, 0, -.4 * sx), (.02, .12, .02))
    # ---- the body ----
    J['body'] = (0, .42, -.02)
    m.add('sph', 'feather', 'body', (0, .44, -.02), (-.12, 0, 0), (.30, .28, .40))
    m.add('sph', 'feather', 'body', (0, .40, -.20), (0, 0, 0), (.24, .22, .20))
    m.add('sph', o.get('breast', 'feather'), 'body', (0, .45, .15), (.3, 0, 0), (.21, .22, .17))
    # ---- neck: from the shoulders up to the back of the skull ----
    na, nl = o.get('neckA', .62), .26 * o.get('neckL', 1.0)
    base = Vector((0, .55, .08))
    d = Vector((0, math.cos(na), math.sin(na)))
    H = base + d * nl + Vector((0, .05, .03))                       # head centre
    J['neck'] = tuple(base)
    J['head'] = tuple(base + d * nl)
    m.add('cyl', 'feather', 'neck', tuple(base + d * nl * .5), (na, 0, 0), (.085, nl + .08, .078), rt=.85, rb=1.1)
    m.add('sph', 'feather', 'neck', tuple(base + Vector((0, .02, 0))), (0, 0, 0), (.13, .12, .13))
    if o.get('ruff'):
        m.add('cone', o['ruff'], 'neck', tuple(base + d * nl * .42), (na - .1, 0, 0), (.15, nl * .95, .14))
    # ---- the head ----
    hs = o.get('headS', 1.0)
    h = lambda dx, dy, dz: (H.x + dx * hs, H.y + dy * hs, H.z + dz * hs)
    m.add('sph', o.get('headC', 'feather'), 'head', h(0, 0, 0), (0, 0, 0), (.115 * hs, .115 * hs, .125 * hs))
    bl = o.get('beakL', 1.0)
    m.add('cone', 'beak', 'head', h(0, -.005, .14 + (bl - 1) * .06), (1.62, 0, 0), (.055 * hs, .15 * bl * hs, .045 * hs))
    m.add('cone', 'beak2', 'head', h(0, -.035, .13 + (bl - 1) * .05), (1.72, 0, 0), (.045 * hs, .12 * bl * hs, .035 * hs))
    c = o.get('comb', 1.0)
    if c > .2:
        lobes = ((-.06, .095, .085), (0, .115, .095), (.06, .105, .08)) if m.hi else ((0, .11, .095),)
        for dz, dy, hgt in lobes:
            m.add('lo', 'red', 'head', h(0, dy * (0.8 + .2 * c), dz), (0, 0, 0), (.035 * c, hgt * c * (1 if m.hi else 1.2), .045 * c * (1 if m.hi else 2.2)))
    if o.get('casque'):                                            # guinea helmet
        m.add('cone', 'casque', 'head', h(0, .13, -.01), (-.3, 0, 0), (.04, .1, .05))
    if o.get('snood'):                                             # turkey
        m.add('cyl', 'red', 'head', h(.01, .01, .19), (.25, 0, 0), (.02, .14, .02), rt=.6)
    w = o.get('wattle', 1.0)
    if w > .1 and m.hi:
        for sx in (1, -1):
            m.add('lo', 'red', 'head', h(.035 * sx, -.085 - (w - 1) * .03, .085), (0, 0, 0), (.030 * w, .055 * w, .028 * w))
    elif w > .1:
        m.add('lo', 'red', 'head', h(0, -.09, .085), (0, 0, 0), (.05 * w, .06 * w, .03 * w))
    for sx in (1, -1):
        m.add('lo', 'eye', 'head', h(.078 * sx, .025, .055), (0, 0, 0), (.052, .052, .046))
        m.add('lo', 'pupil', 'head', h(.086 * sx, .025, .088), (0, 0, 0), (.030, .030, .022))
    # ---- wings: the covert on the shoulder, primaries on the tip ----
    for sx, sd in ((1, 'L'), (-1, 'R')):
        wg, tp = 'wing.' + sd, 'wingtip.' + sd
        J[wg] = (.21 * sx, .54, .10); J[tp] = (.27 * sx, .45, -.12)
        m.add('sph', 'wing', wg, (.265 * sx, .47, .0), (-.1, 0, -.22 * sx), (.07, .19, .25))
        m.add('cone', 'wingtip', tp, (.27 * sx, .42, -.21), (-1.66, 0, .12 * sx), (.085, .22, .035))
        if m.hi:
            m.add('cone', 'wingtip', tp, (.25 * sx, .47, -.20), (-1.52, 0, .2 * sx), (.06, .19, .03))
    # ---- tail fan ----
    J['tail'] = (0, .50, -.26)
    tu, tw, tl = o['tailUp'], o['tailW'], o['tailL']
    if o.get('fan'):
        n = 9 if m.hi else 5
        for i in range(n):
            a = (i / (n - 1) - .5) * 2.5
            ax, ay = -math.sin(a), math.cos(a)
            m.add('cone', 'tail' if i % 2 else 'tail2', 'tail', (ax * .30, .50 + ay * .30, -.30 - ay * .05),
                  (-.25, 0, a), (.10, .62, .03))
        return J, .31
    m.add('cone', 'tail', 'tail', (0, .52, -.30), (-.95 + tu, 0, 0), (.20 * tw, .52 * tl, .055))
    m.add('cone', 'tail', 'tail', (.07, .50, -.29), (-1.15 + tu, 0, .22), (.12 * tw, .44 * tl, .05))
    m.add('cone', 'tail', 'tail', (-.07, .50, -.29), (-1.15 + tu, 0, -.22), (.12 * tw, .44 * tl, .05))
    if m.hi and o.get('sickle'):
        for sx in (1, -1):
            m.add('cone', 'tail2', 'tail', (.03 * sx, .58, -.36), (-.55 + tu, 0, .15 * sx), (.04, .5 * tl, .02))
    return J, .31


def build_hawk(m, o):
    """A raptor reads as one because of proportion, not detail: one long
    straight wing line, a body tapering to a fanned tail, and a head that sits
    forward instead of upright."""
    J = {'body': (0, .50, .0), 'neck': (0, .535, .15), 'head': (0, .55, .19), 'tail': (0, .52, -.17)}
    m.add('sph', 'feather', 'body', (0, .50, .02), (-.18, 0, 0), (.105, .115, .235))
    m.add('sph', 'feather', 'body', (0, .535, -.14), (-.10, 0, 0), (.085, .088, .145))
    m.add('sph', 'breast', 'body', (0, .47, .09), (-.3, 0, 0), (.085, .09, .12))
    m.add('sph', 'hood', 'neck', (0, .55, .17), (0, 0, 0), (.075, .075, .07))
    m.add('sph', 'hood', 'head', (0, .565, .235), (0, 0, 0), (.078, .076, .082))
    m.add('cone', 'beak', 'head', (0, .555, .315), (1.42, 0, 0), (.034, .075, .034))
    m.add('cone', 'beak', 'head', (0, .532, .335), (2.05, 0, 0), (.026, .045, .026))
    m.add('lo', 'feather', 'head', (0, .6, .25), (0, 0, 0), (.07, .02, .05))      # the brow ridge
    for sx in (1, -1):
        m.add('lo', 'eye', 'head', (.050 * sx, .585, .283), (0, 0, 0), (.028, .028, .022))
        m.add('lo', 'pupil', 'head', (.058 * sx, .586, .300), (0, 0, 0), (.015, .015, .012))
    for sx, sd in ((1, 'L'), (-1, 'R')):
        wg, tp, leg, ft = 'wing.' + sd, 'wingtip.' + sd, 'leg.' + sd, 'foot.' + sd
        J[wg] = (.08 * sx, .55, .04); J[tp] = (.30 * sx, .555, -.01)
        J[leg] = (.058 * sx, .45, -.02); J[ft] = (.058 * sx, .335, .02)
        m.add('sph', 'wing', wg, (.10 * sx, .545, .05), (0, 0, -.25 * sx), (.062, .070, .115))
        m.add('sph', 'feather', wg, (.195 * sx, .552, .015), (0, -.10 * sx, -.10 * sx), (.105, .042, .135))
        m.add('sph', 'wing', tp, (.40 * sx, .555, -.02), (0, -.16 * sx, -.06 * sx), (.13, .030, .115))
        m.add('cone', 'tail', tp, (.555 * sx, .552, -.055), (-1.50, -.30 * sx, 0), (.052, .155, .026))
        if m.hi:
            m.add('cone', 'tail', tp, (.52 * sx, .552, -.10), (-1.62, -.45 * sx, 0), (.045, .13, .022))
        m.add('sph', 'feather', leg, (.055 * sx, .44, -.02), (0, 0, 0), (.04, .06, .05))
        m.add('cyl', 'beak', leg, (.058 * sx, .39, -.0), (.3, 0, 0), (.017, .12, .017))
        m.add('cone', 'talon', ft, (.058 * sx, .325, .045), (2.5, 0, 0), (.022, .070, .022))
        if m.hi:
            m.add('cone', 'talon', ft, (.058 * sx + .02 * sx, .325, .035), (2.3, .5 * sx, 0), (.015, .05, .015))
    m.add('cone', 'tail', 'tail', (0, .515, -.245), (-1.42, 0, 0), (.155, .300, .036))
    m.add('cone', 'tail', 'tail', (.075, .515, -.235), (-1.46, 0, .20), (.085, .255, .030))
    m.add('cone', 'tail', 'tail', (-.075, .515, -.235), (-1.46, 0, -.20), (.085, .255, .030))
    return J, .45

# ============================================================
#   THE FOUR-LEGGED
# ============================================================
def build_quad(m, o):
    s_ = o.get
    bl, bh, bw, lg = s_('len', .52), s_('high', .42), s_('wide', .24), s_('leg', .34)
    lr = s_('legR', .05)
    J = {}
    # ---- legs: an upper that tapers into the body, and a lower with a hoof or paw ----
    lx, lz = bw * 0.86, bl * 0.62
    top = lg + bh * 0.22
    for nm, x, z, par in (('FL', lx, lz, 'chest'), ('FR', -lx, lz, 'chest'),
                          ('BL', lx * .92, -lz, 'body'), ('BR', -lx * .92, -lz, 'body')):
        up, lo = 'leg%s.u' % nm, 'leg%s.l' % nm
        knee = lg * 0.5
        J[up] = (x, top - .02, z); J[lo] = (x, knee, z)
        hind = nm[0] == 'B'
        m.add('cyl', 'legs', up, (x, (top + knee) / 2, z), (0, 0, 0), (lr * (1.7 if hind else 1.45), top - knee + .04, lr * (1.9 if hind else 1.5)), rt=1.0, rb=.7)
        m.add('cyl', 'legs', lo, (x, knee / 2 + .02, z), (0, 0, 0), (lr, knee + .02, lr), rt=1.0, rb=.85)
        m.add('box', 'hoof', lo, (x, lg * .06, z + .02), (0, 0, 0), (lr * 2.1, lg * .14, lr * 3.0))
    # ---- barrel, chest, haunch ----
    J['body'] = (0, lg + bh * 0.42, -bl * .15)
    J['chest'] = (0, lg + bh * 0.45, bl * .28)
    m.add('sph', 'body', 'body', (0, lg + bh * .42, -bl * .05), (0, 0, 0), (bw, bh * .5, bl * .85))
    m.add('sph', 'rump', 'body', (0, lg + bh * .44, -bl * .60), (0, 0, 0), (bw * .92, bh * .46, bl * .32))
    m.add('sph', 'body', 'chest', (0, lg + bh * .46, bl * .52), (0, 0, 0), (bw * .94, bh * .48, bl * .34))
    m.add('sph', 'body', 'chest', (0, lg + bh * .55, bl * .18), (0, 0, 0), (bw * .80, bh * .26, bl * .22))
    if s_('bib'):
        m.add('sph', 'bib', 'chest', (0, lg + bh * .30, bl * .66), (0, 0, 0), (bw * .55, bh * .30, bl * .20))
    if s_('hump'):                                                        # bear shoulders
        m.add('sph', 'body', 'chest', (0, lg + bh * .78, bl * .30), (0, 0, 0), (bw * .7, bh * .3, bl * .3))
    # ---- neck + head ----
    nk, na = s_('neck', .26), s_('neckA', -.55)
    nr = s_('neckR', .10)
    hy = lg + bh * .52 + math.cos(na) * nk * .9
    hz = bl * .72 + math.sin(-na) * nk * .9
    J['neck'] = (0, lg + bh * .50, bl * .62)
    m.add('cyl', 'body', 'neck', (0, lg + bh * .50 + math.cos(na) * nk * .45, bl * .66 + math.sin(-na) * nk * .45),
          (na, 0, 0), (nr, nk + .06, nr * .9), rt=.9, rb=1.15)
    if s_('mane'):
        m.add('box', s_('mane'), 'neck', (0, lg + bh * .56 + math.cos(na) * nk * .5, bl * .60 + math.sin(-na) * nk * .5),
              (na, 0, 0), (nr * .5, nk + .1, nr * 1.3))
    hs = s_('head', .14)
    J['head'] = (0, hy - hs * .15, hz - hs * .55)
    m.add('sph', 'body', 'head', (0, hy, hz), (0, 0, 0), (hs, hs * .92, hs * 1.05))
    # ---- muzzle over a jaw that opens ----
    ml = s_('snout', .20)
    J['jaw'] = (0, hy - hs * .35, hz + hs * .15)
    if ml > .01:
        if s_('blunt'):
            m.add('box', 'muzzle', 'head', (0, hy - hs * .14, hz + hs * .72), (0, 0, 0), (hs * 1.05, hs * .50, ml))
            m.add('box', 'muzzle', 'jaw', (0, hy - hs * .48, hz + hs * .66), (0, 0, 0), (hs * .9, hs * .22, ml * .9))
            m.add('lo', 'black', 'head', (0, hy - hs * .08, hz + hs * .72 + ml * .52), (0, 0, 0), (hs * .30, hs * .16, hs * .08))
        else:
            m.add('cone', 'muzzle', 'head', (0, hy - hs * .12, hz + hs * .52), (1.55, 0, 0), (hs * .60, ml * 1.5, hs * .48))
            m.add('cone', 'muzzle', 'jaw', (0, hy - hs * .40, hz + hs * .45), (1.70, 0, 0), (hs * .42, ml * 1.3, hs * .20))
            m.add('lo', 'black', 'head', (0, hy - hs * .12, hz + hs * .55 + ml * 1.05), (0, 0, 0), (hs * .20, hs * .16, hs * .14))
        if m.hi:
            m.add('lo', 'mouth', 'jaw', (0, hy - hs * .32, hz + hs * .70), (0, 0, 0), (hs * .35, hs * .06, ml * .6))
    # ---- ears ----
    ey, ex, ez = hy + hs * .72, hs * .62, hz - hs * .18
    ear = s_('ear', 'round')
    for sx in (1, -1):
        if ear == 'prick':
            m.add('cone', 'body', 'head', (ex * sx, ey, ez), (.12, 0, .22 * sx), (hs * .36, hs * .86, hs * .20))
            if m.hi: m.add('cone', 'inner', 'head', (ex * sx, ey + hs * .03, ez + hs * .06), (.12, 0, .22 * sx), (hs * .20, hs * .58, hs * .11))
        elif ear == 'long':
            m.add('cyl', 'body', 'head', (ex * .8 * sx, ey + hs * .55, ez), (.1, 0, .30 * sx), (hs * .20, hs * 1.5, hs * .13), rt=.7)
            if m.hi: m.add('sph', 'inner', 'head', (ex * .8 * sx, ey + hs * 1.15, ez + hs * .06), (0, 0, .30 * sx), (hs * .11, hs * .55, hs * .06))
        elif ear == 'flop':
            m.add('sph', 'dark', 'head', (ex * sx, ey - hs * .18, ez), (.2, 0, .5 * sx), (hs * .16, hs * .60, hs * .34))
        else:
            m.add('sph', 'body', 'head', (ex * sx, ey, ez), (0, 0, 0), (hs * .30, hs * .30, hs * .14))
            if m.hi: m.add('lo', 'inner', 'head', (ex * sx, ey, ez + hs * .06), (0, 0, 0), (hs * .18, hs * .18, hs * .06))
        # horns
        if s_('horn') == 'goat':
            m.add('cone', 'horn', 'head', (hs * .38 * sx, ey + hs * .42, ez - hs * .30), (-0.9, 0, .25 * sx), (hs * .16, hs * 1.25, hs * .16))
        elif s_('horn') == 'bull':
            m.add('cone', 'horn', 'head', (hs * .85 * sx, ey + hs * .12, ez), (0, 0, 1.35 * sx), (hs * .19, hs * 1.05, hs * .19))
        # eyes: the same oversized, forward-set treatment as the birds
        eox, eoy, eoz = hs * .52, hy + hs * .14, hz + hs * .62
        m.add('lo', 'eye', 'head', (eox * sx, eoy, eoz), (0, 0, 0), (hs * .26, hs * .26, hs * .20))
        m.add('lo', 'pupil', 'head', (eox * 1.05 * sx, eoy, eoz + hs * .13), (0, 0, 0), (hs * .15, hs * .15, hs * .10))
        if s_('mask'):
            m.add('sph', 'mask', 'head', (eox * 1.1 * sx, eoy + hs * .08, eoz - hs * .10), (0, -.3 * sx, 0), (hs * .34, hs * .22, hs * .14))
    if s_('beard') and m.hi:
        m.add('cone', 'dark', 'jaw', (0, hy - hs * .7, hz + hs * .55), (math.pi, 0, 0), (hs * .15, hs * .5, hs * .12))
    # ---- tail, in two bones so it can whip ----
    tz, ty = -bl * .80, lg + bh * .48
    J['tail1'] = (0, ty, tz + .02)
    tail = s_('tail')
    if tail == 'bush':
        J['tail2'] = (0, ty + .05, tz - .17)
        for i in range(5):
            t = i / 4
            m.add('sph', 'tailTip' if (i > 2 and s_('tailTip')) else 'tailC', 'tail1' if i < 2 else 'tail2',
                  (0, ty + t * .10, tz - t * .34), (0, 0, 0), (.10 - t * .02, .10 - t * .02, .13))
    elif tail == 'ring':
        J['tail2'] = (0, ty + .08, tz - .20)
        for i in range(6):
            t = i / 5
            m.add('sph', 'dark' if i % 2 else 'body', 'tail1' if i < 3 else 'tail2',
                  (0, ty + t * .16, tz - t * .40), (-.5 - t * .4, 0, 0), (.085 - t * .03, .085 - t * .03, .10))
    elif tail == 'tuft':
        J['tail2'] = (0, ty - .16, tz - .10)
        m.add('cyl', 'tailC', 'tail1', (0, ty - .08, tz - .05), (.35, 0, 0), (.04, .22, .035), rt=1, rb=.75)
        m.add('cyl', 'tailC', 'tail2', (0, ty - .24, tz - .12), (.25, 0, 0), (.045, .16, .04), rt=.7, rb=1.3)
    elif tail == 'rat':                                                   # bare, and long
        pts = [(ty, tz + .04), (ty + .03, tz - .24), (ty - .08, tz - .50)]
        J['tail2'] = (0,) + pts[1]
        for n_, (a_, b_) in enumerate(zip(pts, pts[1:])):
            dy, dz = b_[0] - a_[0], b_[1] - a_[1]; ln = math.hypot(dy, dz)
            m.add('cyl', 'tailC', 'tail1' if n_ == 0 else 'tail2', (0, (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2),
                  (math.atan2(dz, dy), 0, 0), (.034 if n_ == 0 else .026, ln + .02, .034 if n_ == 0 else .026),
                  rt=1 if n_ == 0 else .95, rb=.78 if n_ == 0 else .35)
    elif tail == 'curl':
        J['tail2'] = (0, ty + .10, tz - .06)
        m.add('cyl', 'body', 'tail1', (0, ty + .06, tz - .02), (-1.1, 0, 0), (.024, .18, .024))
        m.add('sph', 'body', 'tail2', (0, ty + .15, tz - .10), (0, 0, 0), (.05, .05, .05))
    else:  # stub
        J['tail2'] = (0, ty + .02, tz - .06)
        m.add('sph', 'tailC', 'tail1', (0, ty + .03, tz - .03), (0, 0, 0), (.07, .07, .09))
    return J, top


def build_coon(m, o):
    """The raccoon keeps its own silhouette — low, long, hunched — on the quad rig."""
    J = {}
    lg = .32
    for nm, x, z, par in (('FL', .175, .24, 'chest'), ('FR', -.175, .24, 'chest'),
                          ('BL', .175, -.20, 'body'), ('BR', -.175, -.20, 'body')):
        up, lo = 'leg%s.u' % nm, 'leg%s.l' % nm
        J[up] = (x, .36, z); J[lo] = (x, .16, z)
        m.add('cyl', 'dk', up, (x, .27, z), (0, 0, 0), (.062, .22, .066), rt=1.0, rb=.75)
        m.add('cyl', 'dk', lo, (x, .09, z), (0, 0, 0), (.046, .17, .046), rt=1.0, rb=.9)
        m.add('box', 'black', lo, (x, .03, z + .04), (0, 0, 0), (.10, .05, .16))
        if m.hi:  # the hands
            for dx in (-.03, 0, .03):
                m.add('box', 'black', lo, (x + dx, .02, z + .13), (0, 0, 0), (.022, .03, .06))
    J['body'] = (0, .34, -.10); J['chest'] = (0, .36, .18)
    m.add('sph', 'gy', 'body', (0, .34, -.04), (0, 0, 0), (.25, .23, .40))
    m.add('sph', 'gy', 'body', (0, .36, -.30), (0, 0, 0), (.21, .20, .20))
    m.add('sph', 'dk', 'body', (0, .30, -.34), (0, 0, 0), (.19, .14, .16))
    m.add('sph', 'gy', 'chest', (0, .37, .22), (0, 0, 0), (.23, .21, .24))
    J['neck'] = (0, .40, .34)
    m.add('sph', 'gy', 'neck', (0, .42, .37), (0, 0, 0), (.14, .13, .12))
    J['head'] = (0, .44, .36)
    m.add('sph', 'gy', 'head', (0, .46, .44), (0, 0, 0), (.17, .16, .17))
    m.add('cone', 'lt', 'head', (0, .41, .58), (1.55, 0, 0), (.085, .26, .065))
    J['jaw'] = (0, .38, .48)
    m.add('cone', 'lt', 'jaw', (0, .375, .55), (1.68, 0, 0), (.06, .20, .03))
    m.add('lo', 'black', 'head', (0, .405, .70), (0, 0, 0), (.033, .028, .028))
    m.add('box', 'black', 'head', (0, .50, .55), (0, 0, 0), (.09, .035, .04))
    for sx in (1, -1):
        m.add('sph', 'black', 'head', (.085 * sx, .48, .545), (0, -.3 * sx, 0), (.075, .055, .035))
        m.add('lo', 'eye', 'head', (.085 * sx, .482, .560), (0, 0, 0), (.040, .040, .032))
        m.add('lo', 'black', 'head', (.090 * sx, .482, .585), (0, 0, 0), (.024, .024, .018))
        m.add('cone', 'gy', 'head', (.115 * sx, .58, .38), (.1, 0, .18 * sx), (.072, .13, .05))
        if m.hi: m.add('cone', 'inner', 'head', (.115 * sx, .585, .395), (.1, 0, .18 * sx), (.042, .09, .03))
        m.add('lo', 'lt', 'head', (.12 * sx, .44, .50), (0, 0, 0), (.05, .045, .05))   # cheek ruff
    # ringed tail, arcing back and up
    J['tail1'] = (0, .36, -.44); J['tail2'] = (0, .48, -.70)
    for i in range(7):
        t = i / 6; a = -0.55 - t * 0.55
        m.add('sph', 'dk' if i % 2 else 'gy', 'tail1' if i < 3 else 'tail2',
              (0, .34 + t * .30, -.46 - t * .52), (a, 0, 0), (.105 - t * .045, .105 - t * .04, .11))
    return J, .36

# ============================================================
#   THE ROSTER — shape parameters and colour variants
#   (colours are the game's existing palettes, carried over as-is)
# ============================================================
K = '#131118'
def bird_var(feather, wingC, tail, red, scale, beak='#e8a423', leg='#e8a423', beak2='#c98a1a', **kw):
    d = dict(feather=feather, wing=wingC, wingtip=wingC, tail=tail, tail2=tail, red=red, beak=beak,
             beak2=beak2, leg=leg, eye='#fdfcf8', pupil=K, spur='#f2e6c8', casque='#d9c29a')
    d.update(kw); return (scale, d)

SPECIES = {}
def species(k, rig, build, shape, variants, atk, extra=None):
    SPECIES[k] = dict(rig=rig, build=build, shape=shape, variants=variants, atk=atk, extra=extra or {})

species('hen', 'bird', build_bird, dict(comb=.55, tailUp=.55, tailW=.75, tailL=.55, wattle=.7), [
    bird_var('#c8b39a', '#b39d84', '#8a745c', '#c2402f', .90),
    bird_var('#efe9dd', '#e2dbcc', '#cfc6b4', '#c2402f', .86),
    bird_var('#4e4a55', '#3f3c46', '#2e2c35', '#b83a2b', .88),
    bird_var('#8a5a33', '#7a4d2b', '#5a3c22', '#c2402f', .92)], 'peck')
species('rooster', 'bird', build_bird, dict(comb=1.15, tailUp=.28, tailW=1.15, tailL=1.05, sickle=1, ruff='ruff'), [
    bird_var('#8f3a18', '#b25325', '#1d2a20', '#d8342a', 1.0, ruff='#c9702e'),
    bird_var('#22202a', '#33303d', '#122018', '#e03a2c', 1.02, ruff='#3d3a48'),
    bird_var('#f2ece0', '#e4ddce', '#d9d0bd', '#e03a2c', .99, ruff='#f7f2e8'),
    bird_var('#c98d22', '#e0a52c', '#2b2418', '#d8342a', 1.04, ruff='#e6b447')], 'peck')
species('gamecock', 'bird', build_bird, dict(comb=1.35, tailUp=.15, tailW=1.3, tailL=1.3, spur=1, sickle=1, ruff='ruff', neckL=1.15), [
    bird_var('#b0341c', '#d94f24', '#0f1a14', '#ff3b2a', 1.10, ruff='#e0662c'),
    bird_var('#1a1822', '#2c2836', '#0c140f', '#ff3b2a', 1.12, ruff='#2e2a3a'),
    bird_var('#d9b23a', '#f0c94a', '#1b1710', '#ff4632', 1.08, ruff='#f5d764'),
    bird_var('#6d6f7a', '#83858f', '#23252c', '#ff3b2a', 1.11, ruff='#9a9ca6')], 'flog')
species('guinea', 'bird', build_bird, dict(comb=0, casque=1, tailUp=.7, tailW=.6, tailL=.45, wattle=.8, headS=.85, headC='bare'), [
    bird_var('#4a4d58', '#5a5e6a', '#33363f', '#c95a3a', .82, bare='#9fb6c9'),
    bird_var('#5c5f6b', '#6b6f7c', '#3d404a', '#d0623f', .80, bare='#a9bdce')], 'peck')
species('goose', 'bird', build_bird, dict(comb=0, wattle=0, tailUp=.75, tailW=.7, tailL=.5, neckL=1.9, neckA=.28, beakL=1.3, headS=.9), [
    bird_var('#eae6dc', '#d8d3c6', '#c8c2b3', '#e88a12', 1.55, beak='#ee8a18', beak2='#d0700c', leg='#ee8a18'),
    bird_var('#5a5f52', '#6a6f60', '#3f4438', '#1a1a1a', 1.52, beak='#1f1f1f', beak2='#151515', leg='#2a2a2a', headC='#1c1c1c')], 'wingatk')
species('turkey', 'bird', build_bird, dict(comb=0, snood=1, fan=1, wattle=1.6, tailUp=.05, tailW=2.0, tailL=1.5, headC='bare', headS=.9, neckL=1.2, breast='breast'), [
    bird_var('#3a2f26', '#4a3c30', '#5a4a38', '#d0403a', 1.45, bare='#b8c4d8', breast='#2a221b'),
    bird_var('#2b241d', '#3a3128', '#4a3e30', '#c8382f', 1.48, bare='#c2cbe0', breast='#1f1914')], 'wingatk')
species('hawk', 'bird', build_hawk, {}, [
    (1.15, dict(feather='#6b533a', wing='#7d6244', tail='#a8482a', hood='#5a4632', beak='#e8b022', breast='#d9c7a8', eye='#f6c542', pupil=K, talon=K)),
    (1.10, dict(feather='#4a3d30', wing='#5c4d3c', tail='#7a4030', hood='#3a3126', beak='#e0a820', breast='#b8a58a', eye='#f6c542', pupil=K, talon=K))], 'strike')

def quad_var(scale, body, dark=None, legs=None, muzzle=None, **kw):
    dark = dark or body; legs = legs or dark
    d = dict(body=body, rump=body, dark=dark, legs=legs, muzzle=muzzle or body, hoof=K, black=K,
             eye='#f4e6c2', pupil=K, inner='#e5b9bd', horn='#c9bda0', mask=K, bib=body,
             tailC=body, mouth='#5a2a2a')
    d.update(kw)
    if 'tailTip' not in kw: d['tailTip'] = d['tailC']
    return (scale, d)

Q = dict  # shape params, carried over from the game's quadruped table
species('cat', 'quad', build_quad, Q(ear='prick', tail='bush', len=.34, high=.26, wide=.13, leg=.20, legR=.032, neck=.13, head=.10, snout=.09), [
    quad_var(1.0, '#3b3a40', '#2a292e', '#33323a', '#c9c4bc', tailC='#2a292e', eye='#bfe36a'),
    quad_var(.97, '#b8823f', '#8a6030', '#a5743a', '#e8dcc4', tailC='#8a6030', eye='#e0c14a')], 'swipe')
species('capybara', 'quad', build_quad, Q(ear='round', tail='stub', blunt=1, len=.54, high=.32, wide=.25, leg=.19, legR=.055, neck=.09, neckA=-.1, head=.16, snout=.15), [
    quad_var(1.18, '#7d5a36', '#5a4026', '#6a4a2c', '#9c7c52', tailC='#5a4026', eye='#3a2a18', inner='#5a4026'),
    quad_var(1.15, '#94693e', '#6b4b2b', '#7d5832', '#b08c5e', tailC='#6b4b2b', eye='#3a2a18', inner='#6b4b2b')], 'bite')
species('goat', 'quad', build_quad, Q(ear='flop', tail='stub', horn='goat', beard=1, len=.46, high=.38, wide=.19, leg=.34, legR=.042, neck=.22, head=.13, snout=.14), [
    quad_var(1.05, '#e6e0d2', '#b8b0a0', '#c9c2b2', '#f2ece0'),
    quad_var(1.08, '#57493c', '#3d332a', '#4a3f34', '#cbbfa8')], 'butt')
species('pig', 'quad', build_quad, Q(ear='flop', tail='curl', blunt=1, len=.52, high=.36, wide=.24, leg=.22, legR=.055, neck=.12, neckA=-.2, head=.15, snout=.12), [
    quad_var(1.15, '#e0a7a4', '#c98d8a', '#c98d8a', '#f0c2bf', black='#8a4a4a', hoof='#5a3a36'),
    quad_var(1.18, '#6d5f57', '#524741', '#524741', '#9c8b80', hoof='#2a2220')], 'butt')
species('llama', 'quad', build_quad, Q(ear='long', tail='tuft', len=.44, high=.36, wide=.19, leg=.46, legR=.045, neck=.58, neckA=-.15, neckR=.075, head=.13, snout=.13), [
    quad_var(1.15, '#dcc9a8', '#b9a58c', '#c4ae8c', '#efe4cf', inner='#d8b2a8', tailC='#b9a58c'),
    quad_var(1.12, '#8b7460', '#6a5748', '#7a6553', '#c9b6a0', inner='#d8b2a8', tailC='#6a5748')], 'spit')
species('donkey', 'quad', build_quad, Q(ear='long', tail='tuft', mane='mane', len=.60, high=.46, wide=.22, leg=.48, legR=.052, neck=.32, neckA=-.5, neckR=.095, head=.16, snout=.17), [
    quad_var(1.30, '#8e8880', '#5f5a54', '#7d7770', '#d8d2c6', hoof='#2a2620', inner='#d8b2a8', mane='#3a3632', tailC='#3a3632'),
    quad_var(1.33, '#6a5f56', '#463e38', '#5c524a', '#c2b8a8', hoof='#2a2620', inner='#d8b2a8', mane='#2a2522', tailC='#2a2522')], 'kick')
species('dog', 'quad', build_quad, Q(ear='flop', tail='bush', bib=1, len=.54, high=.36, wide=.19, leg=.34, legR=.045, neck=.20, neckA=-.35, head=.145, snout=.19), [
    quad_var(1.22, '#4a3a2c', '#2e241b', '#3f3126', '#1d1712', bib='#e8e2d4', tailTip='#e8e2d4', tailC='#4a3a2c'),
    quad_var(1.26, '#151318', '#0d0c10', '#1a181e', '#8a6a3a', bib='#8a6a3a', tailC='#151318')], 'bite')
species('bull', 'quad', build_quad, Q(ear='round', tail='tuft', horn='bull', blunt=1, len=.78, high=.60, wide=.32, leg=.50, legR=.070, neck=.20, neckA=-.25, neckR=.15, head=.22, snout=.17, hump=1), [
    quad_var(1.55, '#2b2621', '#191512', '#221e1a', '#c9bfae', hoof='#141210', horn='#d9d2bd', inner='#4a3a30', tailC='#191512'),
    quad_var(1.58, '#8a5a34', '#5f3c22', '#744c2c', '#d8cbb4', hoof='#141210', horn='#d9d2bd', inner='#6a4a30', tailC='#5f3c22')], 'butt')
species('coon', 'quad', build_coon, {}, [
    (1.00, dict(gy='#8b8792', dk='#2a2731', lt='#c3bfc9', black=K, eye='#f7e9c8', inner='#e9c6c9')),
    (1.06, dict(gy='#77737e', dk='#211e28', lt='#b2aeb8', black=K, eye='#f7e9c8', inner='#e9c6c9')),
    (0.95, dict(gy='#9a95a2', dk='#332f3b', lt='#d0ccd6', black=K, eye='#f7e9c8', inner='#e9c6c9'))], 'swipe')
species('possum', 'quad', build_quad, Q(ear='round', tail='rat', mask=1, len=.44, high=.30, wide=.18, leg=.22, legR=.040, neck=.14, head=.13, snout=.20), [
    quad_var(1.05, '#b9b4ac', '#6e6a64', '#57534d', '#f2ece2', tailC='#e8c9b8', mask='#3a3630', inner='#3a3630'),
    quad_var(1.02, '#9a958d', '#5c5852', '#4a4741', '#e6dfd2', tailC='#dbbfae', mask='#332f2a', inner='#332f2a')], 'bite')
species('fox', 'quad', build_quad, Q(ear='prick', tail='bush', bib=1, len=.48, high=.30, wide=.16, leg=.28, legR=.038, neck=.17, neckA=-.35, head=.125, snout=.20), [
    quad_var(1.10, '#c05a1e', '#8a3c12', '#2a2320', '#f2eadc', bib='#f2eadc', tailTip='#f2eadc', tailC='#c05a1e', inner='#2a2320'),
    quad_var(1.07, '#a8481a', '#78310f', '#241e1b', '#e8dfd0', bib='#e8dfd0', tailTip='#e8dfd0', tailC='#a8481a', inner='#241e1b')], 'bite')
species('coyote', 'quad', build_quad, Q(ear='prick', tail='bush', bib=1, len=.56, high=.36, wide=.18, leg=.38, legR=.042, neck=.21, neckA=-.4, head=.14, snout=.21), [
    quad_var(1.20, '#8f7a5c', '#645440', '#6d5c46', '#ddd2bc', bib='#ddd2bc', tailTip='#3a3128', tailC='#8f7a5c', inner='#c9b8a0'),
    quad_var(1.17, '#7a684f', '#544738', '#5d4f3c', '#cec3ad', bib='#cec3ad', tailTip='#332c24', tailC='#7a684f', inner='#bfae96')], 'bite')
species('bear', 'quad', build_quad, Q(ear='round', tail='stub', blunt=1, hump=1, len=1.05, high=.80, wide=.44, leg=.52, legR=.105, neck=.20, neckA=-.2, neckR=.20, head=.30, snout=.22), [
    quad_var(1.9, '#3a2a1e', '#241a12', '#2e2118', '#a8875f', tailC='#241a12', inner='#5a4030', hoof='#1a120c')], 'swipe')

# ============================================================
#   ANIMATION — each clip is a function of t in [0,1) returning
#   {bone: (pitch, yaw, roll)} in game axes. Written into Blender
#   as actions, sampled back out on export.
# ============================================================
def S(x): return math.sin(TAU * x)
def Cc(x): return math.cos(TAU * x)
def sm(x):
    x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)
def lerp(a, b, t): return a + (b - a) * t
def pos(x): return x if x > 0 else 0.0

CONTACT = 0.4           # every attack clip lands its blow at 40% of the way through

def strike(t):
    """0 -> rear back (-0.35) -> commit (+1 at contact) -> recover. The shape of every blow."""
    if t < .25: return -.35 * sm(t / .25)
    if t < CONTACT: return lerp(-.35, 1.0, sm((t - .25) / (CONTACT - .25)))
    return 1.0 - sm((t - CONTACT) / (1 - CONTACT))
def flinch_e(t):
    return (1 - t) ** 2 * math.sin(min(1.0, t * 4) * math.pi / 2)
def bump(t, a, b):
    if t <= a or t >= b: return 0.0
    return math.sin(math.pi * (t - a) / (b - a))

def LR(d, base, p=0, y=0, r=0, mirror_roll=True, mirror_yaw=True):
    """set a left/right pair: roll and yaw mirror, pitch doesn't"""
    d[base + '.L'] = (p, y, r)
    d[base + '.R'] = (p, -y if mirror_yaw else y, -r if mirror_roll else r)

# ---------------- bird clips ----------------
def b_idle(t):
    look = [0, .45, .45, -.3, -.3, .15, .15, 0][int(t * 8) % 8]
    look2 = [0, .45, .45, -.3, -.3, .15, .15, 0][(int(t * 8) + 1) % 8]
    f = (t * 8) % 1
    yaw = lerp(look, look2, sm((f - .8) / .2))
    d = {'body': (.02 * S(t), 0, 0), 'neck': (.06 * S(2 * t), 0, 0), 'head': (-.04 * S(2 * t), yaw, .08 * S(t)),
         'tail': (.06 * S(t + .3), .05 * S(t), 0)}
    LR(d, 'wing', r=.03 * S(t)); LR(d, 'wingtip', r=.02 * S(t))
    return d
def b_walk(t):
    d = {}
    for sd, ph in (('L', 0), ('R', .5)):
        lp = .55 * S(t + ph)
        swing = pos(-Cc(t + ph))
        d['leg.' + sd] = (lp, 0, 0)
        d['foot.' + sd] = (-lp + .7 * swing, 0, 0)
    d['body'] = (.03 * S(2 * t), 0, .05 * S(t))
    d['neck'] = (.20 * S(2 * t), 0, 0)
    d['head'] = (-.18 * S(2 * t), 0, 0)
    d['tail'] = (.07 * S(2 * t), .06 * S(t), 0)
    LR(d, 'wing', r=.05 * S(2 * t)); LR(d, 'wingtip', r=.03 * S(2 * t))
    return d
def b_run(t):
    d = {}
    for sd, ph in (('L', 0), ('R', .5)):
        lp = .95 * S(t + ph)
        d['leg.' + sd] = (lp, 0, 0)
        d['foot.' + sd] = (-lp + 1.0 * pos(-Cc(t + ph)), 0, 0)
    d['body'] = (.25 + .05 * S(2 * t), 0, .06 * S(t))
    d['neck'] = (.35 + .12 * S(2 * t), 0, 0)
    d['head'] = (-.45 - .1 * S(2 * t), .1 * S(t), 0)
    d['tail'] = (-.3 + .12 * S(2 * t), 0, 0)
    LR(d, 'wing', r=.7 + .75 * S(2 * t)); LR(d, 'wingtip', r=.4 * S(2 * t - .1))
    return d
def b_flail(t):
    d = {'leg.L': (.9 * S(t), 0, .2), 'leg.R': (.9 * S(t + .25), 0, -.2),
         'foot.L': (.6 * S(t + .2), 0, 0), 'foot.R': (.6 * S(t + .45), 0, 0),
         'neck': (.6 * S(t), .3 * S(t + .3), 0), 'head': (-.4 * S(t + .2), 0, 0), 'tail': (.5 * S(2 * t), 0, 0),
         'body': (0, 0, 0)}
    LR(d, 'wing', r=.4 + .9 * S(2 * t)); LR(d, 'wingtip', r=.5 * S(2 * t - .15))
    return d
def b_fly(t):
    d = {'leg.L': (.9, 0, 0), 'leg.R': (.9, 0, 0), 'foot.L': (.7, 0, 0), 'foot.R': (.7, 0, 0),
         'tail': (.1 * S(t), 0, 0), 'body': (.05 * S(t + .25), 0, 0), 'neck': (-.1, 0, 0), 'head': (.1, 0, 0)}
    LR(d, 'wing', r=.15 + .75 * S(t)); LR(d, 'wingtip', r=.45 * S(t - .12))
    return d
def b_glide(t):
    d = {'leg.L': (.9, 0, 0), 'leg.R': (.9, 0, 0), 'foot.L': (.7, 0, 0), 'foot.R': (.7, 0, 0),
         'tail': (.08 * S(t), .1 * S(t + .5), 0), 'body': (0, 0, 0), 'neck': (-.1, 0, 0), 'head': (.1, .25 * S(t), 0)}
    LR(d, 'wing', r=.08 + .05 * S(t)); LR(d, 'wingtip', r=.1 + .06 * S(t + .2))
    return d
def b_peck(t):
    k = strike(t)
    d = {'neck': (.8 * k, 0, 0), 'head': (.35 * k, 0, 0), 'body': (.14 * k, 0, 0), 'tail': (-.25 * k, 0, 0),
         'leg.L': (-.12 * k, 0, 0), 'leg.R': (-.12 * k, 0, 0), 'foot.L': (.12 * k, 0, 0), 'foot.R': (.12 * k, 0, 0)}
    LR(d, 'wing', r=.3 * pos(k) + .15 * pos(-k)); LR(d, 'wingtip', r=.15 * pos(k))
    return d
def b_flog(t):
    k = strike(t)
    d = {'body': (-.45 * k, 0, 0), 'neck': (-.35 * k, 0, 0), 'head': (.3 * k, 0, 0), 'tail': (.35 * k, 0, 0),
         'leg.L': (-1.15 * pos(k) + .25 * pos(-k), 0, .1 * pos(k)), 'leg.R': (-1.05 * pos(k) + .25 * pos(-k), 0, -.1 * pos(k)),
         'foot.L': (-.35 * pos(k), 0, 0), 'foot.R': (-.35 * pos(k), 0, 0)}
    LR(d, 'wing', r=1.0 * abs(k)); LR(d, 'wingtip', r=.5 * abs(k))
    return d
def b_wingatk(t):
    k = strike(t)
    d = {'neck': (.95 * k, 0, 0), 'head': (-.55 * k, 0, 0), 'body': (.15 * k, 0, 0), 'tail': (-.3 * k, 0, 0),
         'leg.L': (-.1 * k, 0, 0), 'leg.R': (-.1 * k, 0, 0)}
    LR(d, 'wing', r=1.15 * pos(k) + .35 * pos(-k)); LR(d, 'wingtip', r=.45 * k)
    return d
def b_strike(t):
    k = strike(t)
    d = {'leg.L': (-1.5 * pos(k) + .9 * (1 - abs(k)), 0, 0), 'leg.R': (-1.5 * pos(k) + .9 * (1 - abs(k)), 0, 0),
         'foot.L': (-.7 * pos(k) + .7 * (1 - abs(k)), 0, 0), 'foot.R': (-.7 * pos(k) + .7 * (1 - abs(k)), 0, 0),
         'body': (-.35 * k, 0, 0), 'neck': (.3 * k, 0, 0), 'head': (.25 * k, 0, 0), 'tail': (.4 * k, 0, 0)}
    LR(d, 'wing', r=.9 * pos(k) - .3 * pos(-k)); LR(d, 'wingtip', r=.5 * pos(k))
    return d
def b_flinch(t):
    e = flinch_e(t)
    d = {'body': (-.25 * e, 0, 0), 'neck': (-.5 * e, 0, 0), 'head': (.3 * e, 0, .15 * e), 'tail': (.45 * e, 0, 0),
         'leg.L': (.15 * e, 0, 0), 'leg.R': (.15 * e, 0, 0)}
    LR(d, 'wing', r=.75 * e); LR(d, 'wingtip', r=.4 * e)
    return d
def b_die(t):
    dd = sm(t / .7)
    spasm = .2 * math.sin(t * 26) * (1 - t) ** 2
    d = {'leg.L': (-.95 * dd + spasm, 0, .3 * dd), 'leg.R': (-.85 * dd - spasm, 0, -.3 * dd),
         'foot.L': (.85 * dd, 0, 0), 'foot.R': (.85 * dd, 0, 0),
         'neck': (1.15 * dd + .5 * spasm, .3 * dd, 0), 'head': (.5 * dd, .3 * dd, 0),
         'tail': (-.45 * dd, 0, 0), 'body': (.1 * dd, 0, 0)}
    LR(d, 'wing', r=.85 * dd); LR(d, 'wingtip', r=.45 * dd)
    return d

# ---------------- quadruped clips ----------------
LEGS = ('FL', 'FR', 'BL', 'BR')
def q_idle(t):
    d = {'body': (.015 * S(t), 0, 0), 'chest': (-.01 * S(t), 0, 0), 'neck': (.06 * S(t + .2), .2 * S(t), 0),
         'head': (-.04 * S(t + .2), .15 * S(2 * t + .1), .04 * S(t)), 'jaw': (.03 * pos(S(2 * t)), 0, 0),
         'tail1': (0, .22 * S(2 * t), 0), 'tail2': (0, .25 * S(2 * t - .15), 0)}
    return d
def q_walk(t):
    d = {}
    for nm, ph in (('BL', 0), ('FL', .25), ('BR', .5), ('FR', .75)):
        d['leg%s.u' % nm] = (.42 * S(t + ph), 0, 0)
        d['leg%s.l' % nm] = ((.75 if nm[0] == 'F' else .55) * pos(-Cc(t + ph)), 0, 0)
    d['body'] = (.03 * S(2 * t), 0, .03 * S(t))
    d['chest'] = (-.02 * S(2 * t), .03 * S(t), 0)
    d['neck'] = (.08 * S(2 * t + .2), .04 * S(t), 0)
    d['head'] = (-.06 * S(2 * t + .2), 0, 0)
    d['jaw'] = (0, 0, 0)
    d['tail1'] = (.05 * S(2 * t), .25 * S(t), 0); d['tail2'] = (0, .25 * S(t - .15), 0)
    return d
def q_run(t):
    d = {}
    for nm, ph in (('FL', 0), ('FR', .08), ('BL', .5), ('BR', .58)):
        d['leg%s.u' % nm] = (.85 * S(t + ph), 0, 0)
        d['leg%s.l' % nm] = ((1.1 if nm[0] == 'F' else .8) * pos(-Cc(t + ph)), 0, 0)
    d['body'] = (.12 * S(t + .25), 0, 0)
    d['chest'] = (-.10 * S(t + .25), 0, 0)
    d['neck'] = (.15 + .15 * S(t), 0, 0)
    d['head'] = (-.12 - .1 * S(t), 0, 0)
    d['jaw'] = (.22, 0, 0)
    d['tail1'] = (.35 + .15 * S(2 * t), .15 * S(t), 0); d['tail2'] = (.1 * S(2 * t - .2), .2 * S(t - .2), 0)
    return d
def q_flail(t):
    d = {}
    for nm, ph in (('FL', 0), ('FR', .3), ('BL', .55), ('BR', .8)):
        d['leg%s.u' % nm] = (.9 * S(t + ph), 0, (.3 if nm[1] == 'L' else -.3))
        d['leg%s.l' % nm] = (.6 * pos(S(t + ph + .2)), 0, 0)
    d['neck'] = (.4 * S(t), .3 * S(t + .25), 0); d['head'] = (-.3 * S(t + .2), 0, 0)
    d['jaw'] = (.25 + .25 * S(2 * t), 0, 0)
    d['tail1'] = (.3, .8 * S(2 * t), 0); d['tail2'] = (0, .8 * S(2 * t - .2), 0)
    d['body'] = (0, 0, 0); d['chest'] = (0, 0, 0)
    return d
def q_bite(t):
    k = strike(t)
    jaw = .8 * bump(t, .05, CONTACT) + .1 * bump(t, CONTACT + .05, .8)
    d = {'neck': (.45 * k, 0, 0), 'head': (-.2 * k, 0, 0), 'jaw': (jaw, 0, 0), 'chest': (.14 * k, 0, 0),
         'body': (.05 * k, 0, 0), 'tail1': (.35 * k, 0, 0), 'tail2': (.2 * k, 0, 0)}
    for nm in ('FL', 'FR'): d['leg%s.u' % nm] = (-.25 * k, 0, 0); d['leg%s.l' % nm] = (.1 * pos(-k), 0, 0)
    for nm in ('BL', 'BR'): d['leg%s.u' % nm] = (.25 * k, 0, 0)
    return d
def q_butt(t):
    if t < .36: n = .65 * sm(t / .36)
    elif t < .5: n = lerp(.65, -.55, sm((t - .36) / .14))
    else: n = lerp(-.55, 0, sm((t - .5) / .5))
    d = {'neck': (.5 * n, 0, 0), 'head': (.45 * n, 0, 0), 'jaw': (0, 0, 0), 'chest': (.18 * pos(n) - .1 * pos(-n), 0, 0),
         'body': (.06 * pos(n), 0, 0), 'tail1': (.45 * abs(n), 0, 0), 'tail2': (.2 * abs(n), 0, 0)}
    for nm in ('FL', 'FR'): d['leg%s.u' % nm] = (-.3 * pos(n), 0, 0)
    for nm in ('BL', 'BR'): d['leg%s.u' % nm] = (.4 * pos(n), 0, 0); d['leg%s.l' % nm] = (.15 * pos(n), 0, 0)
    return d
def q_kick(t):
    k = strike(t)
    d = {'body': (.38 * k, 0, 0), 'chest': (-.18 * k, 0, 0), 'neck': (.35 * k, 0, 0), 'head': (.1 * k, 0, 0),
         'jaw': (.15 * pos(k), 0, 0), 'tail1': (.7 * k, 0, 0), 'tail2': (.3 * k, 0, 0)}
    for nm in ('FL', 'FR'): d['leg%s.u' % nm] = (-.3 * k, 0, 0)
    d['legBL.u'] = (1.3 * pos(k) - .35 * pos(-k), 0, .05); d['legBR.u'] = (1.2 * pos(k) - .35 * pos(-k), 0, -.05)
    d['legBL.l'] = (-.25 * pos(k) + .6 * pos(-k), 0, 0); d['legBR.l'] = (-.2 * pos(k) + .6 * pos(-k), 0, 0)
    return d
def q_swipe(t):
    r = sm(t / .3) if t < CONTACT else 1 - sm((t - CONTACT) / .35)
    if t < .35: arm = -1.7 * sm(t / .35)
    elif t < .5: arm = lerp(-1.7, .45, sm((t - .35) / .15))
    else: arm = lerp(.45, 0, sm((t - .5) / .5))
    k = strike(t)
    jaw = .7 * bump(t, .1, .55)
    d = {'body': (-.5 * r, 0, 0), 'chest': (-.25 * r, .25 * k, 0), 'neck': (.25 * k, 0, 0), 'head': (-.25 * k, -.2 * k, 0),
         'jaw': (jaw, 0, 0), 'tail1': (-.2 * r, 0, 0), 'tail2': (0, 0, 0),
         'legFL.u': (arm, -.35 * k, .35 * pos(-arm) * .4), 'legFL.l': (-.4 * pos(-arm) * .5, 0, 0),
         'legFR.u': (-.9 * r, 0, -.15 * r), 'legFR.l': (.5 * r, 0, 0),
         'legBL.u': (.5 * r, 0, 0), 'legBR.u': (.5 * r, 0, 0), 'legBL.l': (-.1 * r, 0, 0), 'legBR.l': (-.1 * r, 0, 0)}
    return d
def q_spit(t):
    if t < .38: n = -.4 * sm(t / .38)
    elif t < .5: n = lerp(-.4, .5, sm((t - .38) / .12))
    else: n = lerp(.5, 0, sm((t - .5) / .5))
    d = {'neck': (n, 0, 0), 'head': (-.35 * n, 0, 0), 'jaw': (.55 * bump(t, .36, .55), 0, 0),
         'chest': (-.06 * n, 0, 0), 'body': (0, 0, 0), 'tail1': (.2 * abs(n), 0, 0), 'tail2': (0, 0, 0)}
    return d
def q_flinch(t):
    e = flinch_e(t)
    d = {'body': (-.08 * e, 0, .08 * e), 'chest': (-.15 * e, 0, 0), 'neck': (-.4 * e, 0, 0), 'head': (-.25 * e, .15 * e, 0),
         'jaw': (.4 * e, 0, 0), 'tail1': (-.35 * e, 0, 0), 'tail2': (-.2 * e, 0, 0)}
    for nm in ('FL', 'FR'): d['leg%s.u' % nm] = (-.18 * e, 0, 0)
    for nm in ('BL', 'BR'): d['leg%s.u' % nm] = (.12 * e, 0, 0)
    return d
def q_die(t):
    dd = sm(t / .7)
    sp = .25 * math.sin(t * 24) * (1 - t) ** 2
    d = {'neck': (.55 * dd, .25 * dd, 0), 'head': (.35 * dd, .2 * dd, 0), 'jaw': (.5 * dd, 0, 0),
         'tail1': (-.35 * dd, 0, 0), 'tail2': (-.25 * dd, 0, 0), 'body': (0, 0, 0), 'chest': (0, 0, 0)}
    for nm in LEGS:
        side = 1 if nm[1] == 'L' else -1
        front = nm[0] == 'F'
        d['leg%s.u' % nm] = ((-.55 if front else .55) * dd + sp * (1 if front else -1), 0, .4 * dd * side)
        d['leg%s.l' % nm] = (.2 * dd, 0, 0)
    return d

CLIPS = {
    'bird': [('idle', 32, True, b_idle), ('walk', 16, True, b_walk), ('run', 12, True, b_run),
             ('flail', 8, True, b_flail), ('fly', 12, True, b_fly), ('glide', 24, True, b_glide),
             ('peck', 16, False, b_peck), ('flog', 16, False, b_flog), ('wingatk', 16, False, b_wingatk),
             ('strike', 16, False, b_strike), ('flinch', 8, False, b_flinch), ('die', 16, False, b_die)],
    'quad': [('idle', 32, True, q_idle), ('walk', 16, True, q_walk), ('run', 12, True, q_run),
             ('flail', 8, True, q_flail), ('bite', 16, False, q_bite), ('butt', 16, False, q_butt),
             ('kick', 16, False, q_kick), ('swipe', 16, False, q_swipe), ('spit', 16, False, q_spit),
             ('flinch', 8, False, q_flinch), ('die', 16, False, q_die)],
}

def euler_quat(p, y, r):
    """game-axis pitch/yaw/roll -> quaternion in a world-aligned bone's local frame"""
    return (Quaternion((0, 1, 0), y) @ Quaternion((1, 0, 0), p) @ Quaternion((0, 0, 1), r))

# ============================================================
#   BUILD — write everything into animals.blend
# ============================================================
def hexcol(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def srgb2lin(c):
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def make_mesh(name, model, bone_names, slot_names, mats):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    slot_idx = {s: i for i, s in enumerate(slot_names)}
    deform = bm.verts.layers.deform.verify()
    for V, F, slot, bone in model.parts:
        vs = [bm.verts.new(g2b(v)) for v in V]
        bi = bone_names.index(bone)
        for v in vs: v[deform][bi] = 1.0
        for f in F:
            face = bm.faces.new([vs[i] for i in f])
            face.material_index = slot_idx[slot]
            face.smooth = False
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for mt in mats: me.materials.append(mt)
    return me

def build_blend():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30
    # ---- actions, one per clip per rig, shared by every animal on that rig ----
    actions = {}
    for rig, clips in CLIPS.items():
        for cname, n, loop, fn in clips:
            act = bpy.data.actions.new('%s.%s' % (rig, cname))
            act.use_fake_user = True
            act['clip_frames'] = n; act['clip_loop'] = int(loop)
            if not loop: act['clip_contact'] = CONTACT
            samples = [fn((f / n) % 1.0 if loop else f / n) for f in range(n + 1)]
            for b in RIGS[rig]:
                path = 'pose.bones["%s"].rotation_quaternion' % b
                qs = [euler_quat(*s.get(b, (0, 0, 0))) for s in samples]
                for i in range(1, len(qs)):                       # keep one hemisphere
                    if qs[i].dot(qs[i - 1]) < 0: qs[i].negate()
                for ci in range(4):
                    fc = act.fcurves.new(path, index=ci, action_group=b)
                    fc.keyframe_points.add(len(qs))
                    for f, q in enumerate(qs):
                        kp = fc.keyframe_points[f]; kp.co = (f, q[ci]); kp.interpolation = 'LINEAR'
            actions[(rig, cname)] = act
    # ---- the animals ----
    col_x = 0.0
    for k, sp in SPECIES.items():
        rig = sp['rig']; bones = RIGS[rig]
        coll = bpy.data.collections.new(k); sc.collection.children.link(coll)
        models, joints, hip = [], None, None
        for lod in range(len(LODS)):
            m = Model(lod)
            J, h = sp['build'](m, dict(sp['shape']))
            models.append(m)
            if joints is None: joints, hip = J, h
        missing = [b for b in bones if b not in joints]
        assert not missing, (k, missing)
        slots = []
        for m in models:
            for _, _, s, _ in m.parts:
                if s not in slots: slots.append(s)
        assert len(slots) <= 16, (k, slots)
        # materials: variant 0's colour, one per slot
        mats = []
        for s in slots:
            mt = bpy.data.materials.new('%s.%s' % (k, s))
            c = srgb2lin(hexcol(sp['variants'][0][1].get(s, '#ff00ff')))
            mt.diffuse_color = (*c, 1.0)
            mt.use_nodes = True
            bsdf = mt.node_tree.nodes.get('Principled BSDF')
            if bsdf: bsdf.inputs['Base Color'].default_value = (*c, 1.0); bsdf.inputs['Roughness'].default_value = .8
            mats.append(mt)
        # armature
        arm = bpy.data.armatures.new(k + '.rig')
        ao = bpy.data.objects.new(k, arm); coll.objects.link(ao)
        ao.location = (col_x, 0, 0)
        bpy.context.view_layer.objects.active = ao
        bpy.ops.object.mode_set(mode='EDIT')
        eb = {}
        for b in bones:
            e = arm.edit_bones.new(b)
            hd = g2b(joints[b]); e.head = hd; e.tail = hd + Vector((0, 0, .06)); e.roll = 0
            eb[b] = e
        for b in bones:
            if PARENT[b]: eb[b].parent = eb[PARENT[b]]
        bpy.ops.object.mode_set(mode='OBJECT')
        arm.display_type = 'STICK'
        for pb in ao.pose.bones: pb.rotation_mode = 'QUATERNION'
        ao.animation_data_create(); ao.animation_data.action = actions[(rig, 'walk')]
        ao['rig'] = rig; ao['hip'] = hip; ao['atk'] = sp['atk']
        ao['variants'] = json.dumps([[sc_, pal] for sc_, pal in sp['variants']])
        ao['slots'] = json.dumps(slots)
        for lod, m in enumerate(models):
            me = make_mesh('%s.lod%d' % (k, lod), m, bones, slots, mats)
            mo = bpy.data.objects.new('%s.lod%d' % (k, lod), me); coll.objects.link(mo)
            mo.parent = ao
            for b in bones: mo.vertex_groups.new(name=b)
            mod = mo.modifiers.new('rig', 'ARMATURE'); mod.object = ao
            if lod > 0: mo.hide_viewport = True; mo.hide_render = True
        col_x += 1.4 * max(1.0, sp['variants'][0][0] * (2.2 if rig == 'quad' else 1.0))
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    print('saved', BLEND)

# ============================================================
#   EXPORT — read animals.blend, write parts/02d_models.js
# ============================================================
def b64(b): return base64.b64encode(b).decode('ascii')

def pack_mesh(mo, bones):
    """One LOD, packed small. Vertices are split per colour slot and grouped by
    island (each separate part of the model), so every triangle can index its
    own island with a single byte; bone and slot are run-length coded."""
    me = mo.data
    gname = {g.index: g.name for g in mo.vertex_groups}
    me.calc_loop_triangles()
    # islands: faces connected through shared vertices
    parent = list(range(len(me.vertices)))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for e in me.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b: parent[a] = b
    by_island = {}
    for tri in me.loop_triangles:
        by_island.setdefault(find(tri.vertices[0]), []).append(tri)
    P, attr, islands, I = [], [], [], []
    wide = False
    for root in sorted(by_island):
        vmap, base = {}, len(P)
        tris = by_island[root]
        for tri in tris:
            slot = tri.material_index
            for vi in tri.vertices:
                key = (vi, slot)
                if key not in vmap:
                    v = me.vertices[vi]
                    g = max(v.groups, key=lambda gg: gg.weight).group if len(v.groups) else 0
                    vmap[key] = len(P) - base
                    P.append(b2g(v.co)); attr.append((bones.index(gname[g]), slot))
        nv = len(P) - base
        if nv > 256: wide = True
        islands += [nv, len(tris)]
        for tri in tris:
            I += [vmap[(vi, tri.material_index)] for vi in tri.vertices]
    runs = []
    for a in attr:
        if runs and runs[-1][1:] == list(a) and runs[-1][0] < 255: runs[-1][0] += 1
        else: runs.append([1, a[0], a[1]])
    ext = max(abs(c) for p in P for c in p) or 1
    sc_ = ext / 32767
    return dict(n=len(P), t=len(I) // 3, s=sc_,
                p=b64(struct.pack('<%dh' % (len(P) * 3), *[round(c / sc_) for p in P for c in p])),
                a=b64(bytes(x for r in runs for x in r)),
                g=b64(struct.pack('<%dH' % len(islands), *islands)),
                w=int(wide),
                i=b64(struct.pack('<%dH' % len(I), *I) if wide else bytes(I)))

def export():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    out = {'rigs': {}, 'species': {}}
    # ---- clips: sampled from the actions as they now stand in the file ----
    for rig in RIGS:
        bones = RIGS[rig]
        acts = [a for a in bpy.data.actions if a.name.startswith(rig + '.')]
        order = [c[0] for c in CLIPS[rig]]
        acts.sort(key=lambda a: order.index(a.name.split('.', 1)[1]) if a.name.split('.', 1)[1] in order else 99)
        clips, rows, row = {}, [], 0
        for a in acts:
            cname = a.name.split('.', 1)[1]
            n = int(a.get('clip_frames', 16)); loop = int(a.get('clip_loop', 0))
            fcs = {}
            for fc in a.fcurves:
                bn = fc.data_path.split('"')[1] if '"' in fc.data_path else None
                if bn and fc.data_path.endswith('rotation_quaternion'): fcs[(bn, fc.array_index)] = fc
            for f in range(n + 1):
                for b in bones:
                    q = Quaternion([fcs[(b, i)].evaluate(f) if (b, i) in fcs else (1 if i == 0 else 0) for i in range(4)])
                    q.normalize()
                    rows.append((q.w, q.x, q.y, q.z))
            clips[cname] = [row, n, loop]
            row += n + 1
        qdata = struct.pack('<%dh' % (len(rows) * 4), *[max(-32767, min(32767, round(v * 32767))) for q in rows for v in q])
        out['rigs'][rig] = dict(bones=bones, parent=[bones.index(PARENT[b]) if PARENT[b] else -1 for b in bones],
                                clips=clips, rows=row, contact=CONTACT, q=b64(qdata))
    # ---- the animals ----
    for k in SPECIES:
        ao = bpy.data.objects[k]; arm = ao.data; rig = ao['rig']; bones = RIGS[rig]
        heads = []
        for b in bones: heads += [round(x, 5) for x in b2g(arm.bones[b].head_local)]
        slots = json.loads(ao['slots'])
        lods = []
        li = 0
        while ('%s.lod%d' % (k, li)) in bpy.data.objects:
            mo = bpy.data.objects['%s.lod%d' % (k, li)]
            lods.append(pack_mesh(mo, bones))
            li += 1
        variants = json.loads(ao['variants'])
        out['species'][k] = dict(rig=rig, head=heads, hip=round(float(ao['hip']), 4), atk=ao['atk'], slots=slots,
                                 var=[dict(s=v[0], c=[v[1].get(s, '#ff00ff') for s in slots]) for v in variants],
                                 lod=lods)
    js = ('/* GENERATED by blender/animals.py from blender/animals.blend — do not edit by hand.\n'
          '   Every animal: its meshes (two levels of detail), its rest skeleton, its colour\n'
          '   variants, and the sampled clips of the rig it shares. See blender/README.md. */\n'
          'const MODELS=' + json.dumps(out, separators=(',', ':')) + ';\n')
    open(OUT_JS, 'w').write(js)
    tri = {k: [l['t'] for l in v['lod']] for k, v in out['species'].items()}
    print('wrote', OUT_JS, round(len(js) / 1024), 'KB'); print('triangles per LOD:', tri)

if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if '--export-only' not in argv: build_blend()
    export()
