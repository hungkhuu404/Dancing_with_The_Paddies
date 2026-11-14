"""Original illustrative Bang Rakam models. Blender 5.3, metres, Z up; front -Y -> glTF +Z.
Run blender -b --factory-startup --python this.py -- --out <review-dir>.
No external textures, copied imagery, figures, text, flags or religious icons.
"""
import bpy, math, random, argparse, sys
from pathlib import Path
from mathutils import Vector
args=argparse.ArgumentParser();args.add_argument('--out',required=True);args.add_argument('--only',nargs='+');args.add_argument('--skip-contact',action='store_true')
opt=args.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(opt.out).resolve();out.mkdir(parents=True,exist_ok=True)
WOOD=(.30,.19,.105,1);DARK=(.105,.14,.14,1);ROOF=(.31,.34,.31,1);RED=(.52,.15,.065,1);GOLD=(.64,.43,.13,1);WHITE=(.77,.76,.67,1);LEAF=(.13,.27,.075,1)
objects=[]
def reset():
 global objects
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);objects=[]
def tint(o,c):
 o.data.materials.clear();ca=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 for v in ca.data:v.color=c
 objects.append(o);return o
def box(x,y,z,w,d,h,c=WOOD):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,z));o=bpy.context.object;o.scale=(w,d,h);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return tint(o,c)
def cyl(x,y,z,r,h,c=WOOD,n=10,r2=None):
 bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=r if r2 is None else r2,depth=h,location=(x,y,z));return tint(bpy.context.object,c)
def beam(a,b,r=.04,c=WOOD):
 a,b=Vector(a),Vector(b);o=cyl(*(a+b)/2,r,(b-a).length,c,6);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def mesh(name,verts,faces,c):
 m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);return tint(o,c)
def roof(w,d,z,h,c=ROOF):
 # two thick pitched slabs, with projecting eaves and a ridge cap
 slope=math.hypot(w/2,h);ang=math.atan2(h,w/2)
 for sign in [-1,1]:
  o=box(sign*w/4,0,z+h/2,slope,d,.10,c);o.rotation_euler[1]=sign*ang
 beam((0,-d/2,z+h),(0,d/2,z+h),.065,c)
def window(x,y,z,w=.7,h=1):
 box(x,y,z,w,.07,h,DARK)
 for dx in [-w/2,w/2]:box(x+dx,y-.045,z,.06,.07,h+.1,WHITE)
 box(x,y-.045,z-h/2,w,.07,.07,WHITE)
def hull(x=0,y=0,z=0,length=5.2,width=1.05,engine=False):
 verts=[]
 for i in range(13):
  t=i/12;yy=(t-.5)*length;ww=width/2*math.sin(math.pi*t)**.6+.018;rise=.38*abs(2*t-1)**3
  verts.extend([(x-ww,y+yy,z+.18+rise),(x-ww*.62,y+yy,z-.22+rise),(x+ww*.62,y+yy,z-.22+rise),(x+ww,y+yy,z+.18+rise)])
 faces=[]
 for i in range(12):
  for j in range(3):faces.append((i*4+j,i*4+j+1,(i+1)*4+j+1,(i+1)*4+j))
 mesh('open timber hull',verts,faces,(.24,.145,.075,1))
 for i in [-1,0,1]:box(x,y+i*length*.2,z+.13,width*.8,.20,.06,WOOD)
 if engine:
  box(x,y+length*.38,z+.42,.42,.45,.35,DARK);beam((x,y+length*.4,z+.5),(x,y+length*.91,z-.16),.035,DARK)
  box(x,y+length*.91,z-.16,.35,.06,.045,DARK)
def home(variant=0,floating=False,concrete=False,hut=False):
 floor=.72 if floating else .7 if concrete else 1.8+variant*.3
 w,d=(3.8,5.5) if floating else (3.2,4) if hut else (5.7+variant*.35,7.3+variant*.4)
 wall=1.9 if hut else 2.45
 if floating:
  for x in [-w*.4,w*.4]:cyl(x,0,-.18,.38,d+1,ROOF,10).rotation_euler[0]=math.pi/2
 else:
  for x in [-w*.43,w*.43]:
   for y in [-d*.43,0,d*.43]:box(x,y,floor/2,.19,.19,floor,WHITE if concrete else (.26,.23,.18,1))
 for j in range(int((d+1)/.25)):box(0,-(d+1)/2+j*.25,floor,w+1,.242,.10,WOOD if not concrete else WHITE)
 if concrete:box(0,.65,floor+wall/2,w,d-1.3,wall,(.58,.66,.62,1))
 else:
  for j in range(12):
   z=floor+.14+j*(wall/12);color=tuple(v*(.87+.13*(j%3)/2) for v in WOOD[:3])+(1,)
   box(0,d/2-.06,z,w,.12,wall/12-.012,color)
   for sign in [-1,1]:box(sign*(w/2-.06),.65,z,.12,d-1.3,wall/12-.012,color)
  box(0,-d/2+1.25,floor+wall/2,w,.12,wall,WOOD)
 for x in [-w*.29,w*.28]:window(x,-d/2+1.15,floor+1.35)
 box(.3,-d/2+1.12,floor+.93,.8,.08,1.84,DARK)
 for x in [-w/2,w/2]:box(x,-d/2+.1,floor+wall/2,.13,.13,wall,WOOD)
 for x in [-w/2,w/2]:
  beam((x,-d/2,floor+.85),(x,-d/2+1.2,floor+.85),.035)
  for y in [-d/2,-d/2+.4,-d/2+.8]:beam((x,y,floor),(x,y,floor+.85),.025)
 for yy in [-d/2+1.25,d/2]:mesh('timber gable',[(-w/2,yy,floor+wall),(w/2,yy,floor+wall),(0,yy,floor+wall+(.85 if hut else 1.55))],[(0,1,2),(2,1,0)],WHITE if concrete else WOOD)
 roof(w+1.1,d+1,floor+wall,.85 if hut else 1.55,RED if variant==1 or concrete else ROOF)
 if not floating:
  n=max(3,int(floor/.19));run=n*.23
  for j in range(n):box(-w*.3,-d/2-.22*(j+1),floor*(1-(j+.5)/n),.95,.26,.10,WHITE if concrete else WOOD)
  for side in [-.55,.55]:beam((-w*.3+side,-d/2,floor+.8),(-w*.3+side,-d/2-run,.75),.035)
  if not concrete and not hut:
   hull(0,0,.22,length=4.1,width=.8)
   cyl(w*.35,-d*.2,.53,.35,.72,(.43,.29,.17,1),12,r2=.28)
 else:
  for x in [-w*.4,w*.4]:beam((x,d/2+1,-.4),(x,d/2+1,2),.055)
def temple():
 box(0,0,.45,10,16,.9,WHITE);box(0,0,2.8,7,12,4.2,(.86,.82,.67,1))
 for sign in [-1,1]:
  for y in [-6,-3,0,3,6]:box(sign*4,y,2.8,.28,.28,4.2,WHITE)
 for x in [-2.3,0,2.3]:window(x,-6.05,2.9,1,2.15)
 for i in range(3):roof(10-i*1.45,16-i*2.4,4.9+i*.73,2.2-i*.2,RED)
 for y in [-8,8]:
  for sign in [-1,1]:beam((sign*4.9,y,5),(sign*5.3,y,5.8),.08,GOLD)
 for i in range(5):box(0,-8.2-i*.3,.9*(1-(i+.5)/5),3,.33,.18,WHITE)
 # Architecturally illustrative bell chedi beside the hall, no statues or sacred images.
 for i in range(3):box(8,4,.2+i*.3,4-i*.5,4-i*.5,.3,WHITE)
 for z,r,h in [(1.5,1.35,1.4),(2.7,1.15,1),(3.7,.9,1),(4.55,.6,.7)]:cyl(8,4,z,r,h,WHITE,20,r2=r*.72)
 cyl(8,4,5.8,.48,2.1,GOLD,16,r2=.025)
 for i in range(5):cyl(8,4,5+i*.3,.55-i*.08,.06,WHITE,16)
def spirit():
 box(0,0,.09,.95,.95,.18,WHITE);box(0,0,.73,.22,.22,1.3,WHITE);box(0,0,1.4,.95,.8,.13,WHITE)
 for x in [-.32,.32]:
  for y in [-.24,.24]:box(x,y,1.72,.06,.06,.54,WHITE)
 box(0,.28,1.72,.7,.06,.55,WHITE);roof(1.04,.95,2,.4,RED)
def net():
 for x in [-3,3]:beam((x,0,-.2),(x,0,1.1),.035)
 beam((-3,0,.78),(3,0,.78),.012,WHITE)
 for i in range(31):beam((-3+i*.2,0,.1),(-3+i*.2,0,.78),.004,(.48,.52,.46,1))
 for i in range(5):beam((-3,0,.12+i*.14),(3,0,.12+i*.14),.004,(.48,.52,.46,1))
def trap():
 for i in range(14):
  a=2*math.pi*i/14;beam((.22*math.cos(a),-.45,.22+.22*math.sin(a)),(.16*math.cos(a),.45,.22+.16*math.sin(a)),.009,(.49,.37,.18,1))
 for yy in [-.4,0,.4]:
  for i in range(14):
   a,b=2*math.pi*i/14,2*math.pi*(i+1)/14;beam((.22*math.cos(a),yy,.22+.22*math.sin(a)),(.22*math.cos(b),yy,.22+.22*math.sin(b)),.012,WOOD)
def tree(palm=False):
 rng=random.Random(39 if palm else 42)
 if palm:
  cyl(0,0,4.5,.23,9,(.29,.26,.19,1),10,r2=.16)
  for i in range(12):
   a=i*2.399;x,y=math.cos(a),math.sin(a);tip=(x*2.8,y*2.8,9.1+rng.random())
   beam((0,0,8.8),tip,.035,LEAF)
   base=(x*1.4,y*1.4,9.2);verts=[base];
   for k in range(10):
    angle=a-.75+1.5*k/9;verts.append((tip[0]+math.cos(angle)*.9,tip[1]+math.sin(angle)*.9,tip[2]-.5+.15*(k%2)))
   mesh('fan leaf',verts,[(0,k,k+1) for k in range(1,10)],LEAF)
 else:
  cyl(0,0,2.4,.27,4.8,WOOD,10,r2=.13)
  for i in range(12):
   a=i*2.399;r=1.5+rng.random()*1.8;z=3.8+rng.random()*2
   beam((0,0,2.7),(math.cos(a)*r,math.sin(a)*r,z),.08,WOOD)
   bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(math.cos(a)*r,math.sin(a)*r,z));o=bpy.context.object;o.scale=(1.4,1.4,.85);tint(o,tuple(v*(.8+rng.random()*.3) for v in LEAF[:3])+(1,))
   for face in o.data.polygons:face.use_smooth=True
def save(name):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
 mat=bpy.data.materials.new('Original vertex-colour timber plaster and metal');mat.use_nodes=True
 bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.82
 col=mat.node_tree.nodes.new('ShaderNodeVertexColor');col.layer_name='Color';mat.node_tree.links.new(col.outputs['Color'],bs.inputs['Base Color']);o.data.materials.append(mat)
 bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_materials='EXPORT',export_yup=True)
 return o
factories={'thai_stilt_a':lambda:home(0),'thai_stilt_b':lambda:home(1),'thai_stilt_c':lambda:home(2),'thai_raised':lambda:home(concrete=True),'thai_raft':lambda:home(floating=True),'thai_hut':lambda:home(hut=True),'thai_temple':temple,'thai_spirit':spirit,'thai_longtail':lambda:hull(engine=True),'thai_net':net,'thai_trap':trap,'thai_borassus':lambda:tree(True),'thai_tamarind':tree}
if opt.only and any(name not in factories for name in opt.only):raise ValueError('Unknown model')
for name,fn in factories.items():
 if not opt.only or name in opt.only:reset();fn();save(name)
if opt.skip_contact:sys.exit(0)
# Source-free Cycles contact sheet; review evidence, not a published texture.
reset()
for i,name in enumerate(factories):
 bpy.ops.import_scene.gltf(filepath=str(out/(name+'.glb')))
 imported=[o for o in bpy.context.selected_objects if o.type=='MESH']
 for o in imported:o.location.x+=(i%4)*22;o.location.y+=(i//4)*24
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=24
world=bpy.data.worlds.new('Studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.55,.61,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;sc.world=world
bpy.ops.object.light_add(type='AREA',location=(12,-18,50));bpy.context.object.data.energy=18000;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=35
bpy.ops.object.camera_add(location=(100,-125,135));cam=bpy.context.object;cam.rotation_euler=(Vector((30,35,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=137;sc.camera=cam
sc.render.resolution_x=1400;sc.render.resolution_y=1000;sc.render.resolution_percentage=100;sc.render.filepath=str(out/'contact-sheet.png');bpy.ops.render.render(write_still=True)
