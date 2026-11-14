"""Build five designed posters from original vector brand assets and generated illustration scenes.
Usage: python3 packages/design/social/thread/build.py; node packages/design/social/thread/render.mjs
"""
from pathlib import Path
import sys,re,json
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from build import text,fonts
from base64 import b64encode
ROOT=Path(__file__).resolve().parent
DESIGN=ROOT.parents[1]
BLUE,INK,SLATE='#2453e0','#0a1526','#4e5d76'
W,H=1600,1100

def measure(value,size,weight=560,tracking=-.03,stretch=112):
 text(value,0,0,size,weight=weight,tracking=tracking,width=stretch)
 f=fonts[(weight,stretch)];scale=size/f['head'].unitsPerEm;cmap=f.getBestCmap()
 return sum(f['hmtx'][cmap[ord(c)]][0]*scale+size*tracking for c in value)-size*tracking

def t(value,x,y,size,color=INK,weight=560,tracking=-.03,stretch=112):
 return text(value,x,y,size,color,weight,tracking,stretch)

def center(value,x,y,size,color=INK,weight=560,tracking=-.03,stretch=112):
 return t(value,x-measure(value,size,weight,tracking,stretch)/2,y,size,color,weight,tracking,stretch)

items=[
 {'slug':'01-shared-machines','topic':'SHARED MACHINES','lines':['Shared','machines.'],'size':78,'tag':'Community rules.','sub':['Book access. Fund upkeep.','Earn usage rights.'],'labels':['Bookings','Community budgets','Earned access']},
 {'slug':'02-book-access','topic':'RESERVE & USE','lines':['Book','shared','access.'],'size':76,'sub':['Choose a time.','Your deposit returns after','a clean, approved return.'],'labels':['Time slot','Usage fee','Refundable deposit']},
 {'slug':'03-community-budget','topic':'COMMUNITY MONEY','lines':['Give','machines','a budget.'],'size':76,'sub':['Capped operating float.','Surplus to Sputnik DAO.','Larger purchases need a vote.'],'labels':['Capped float','DAO surplus','Machine-opened proposals']},
 {'slug':'04-earned-access','topic':'CONTRIBUTE & EARN','lines':['Contribute.','Earn access.'],'size':66,'sub':['Independently approved','upkeep and teaching can','earn usage-right NFTs.'],'labels':['Independent approval','Usage fee: 0*','Deposit still applies']},
 {'slug':'05-inspect-proof','topic':'VERIFY ON NEAR','lines':['Inspect','the proof.'],'size':76,'sub':['Live views.','Recorded transactions.','Read-only verification.'],'labels':['Inspect live accounts','Trace transactions','Run the verifier']},
]
lock=(DESIGN/'logo/concepts/a/lockup-nav.svg').read_text()
lock=re.sub(r' width="[^"]+" height="[^"]+"','',lock,count=1)
lock=lock.replace('<svg ','<svg x="64" y="56" width="320" height="39.55" ',1)
near=b64encode((DESIGN/'assets/near/near-mark.svg').read_bytes()).decode()
manifest=[]
for i,item in enumerate(items,1):
 body=lock
 body+=t(f'{i:02d} / 05',1440,83,22,SLATE,520,0,100)
 body+=t(item['topic'],66,174,16,BLUE,600,.07,100)
 size=item['size']
 while max(measure(line,size) for line in item['lines'])>405: size-=1
 y=275
 for line in item['lines']:
  body+=t(line,60,y,size,INK,560,-.04,112);y+=size*1.1
 if item.get('tag'):
  body+=t(item['tag'],66,y+28,31,INK,560,-.025,100);y+=90
 else:y+=44
 for line in item['sub']:
  assert measure(line,24,520,-.015,100)<465
  body+=t(line,66,y,24,SLATE,520,-.015,100);y+=34
 if i==4:
  body+=t('*Recorded earned-right booking.',66,y+35,17,SLATE,400,0,100)
 if i==5:
  for value,label,cx in [('8','Keyless accounts',750),('4','Machines',1005),('21','Recorded steps',1260)]:
   body+=center(value,cx,824,66,'#ffffff',600,-.025,100)
   body+=center(label,cx,858,25,'#ffffff',520,0,100)
 body+='<path d="M64 975H1536" stroke="#c6d1e1" stroke-width="1.2"/>'
 for label,x in zip(item['labels'],[64,565,1066]):
  body+=f'<rect x="{x}" y="1005" width="4" height="26" fill="{BLUE}"/>'
  body+=t(label,x+18,1026,23,INK,520,-.015,100)
 body+=t('commonkit.cayvox.com',64,1080,17,SLATE,400,0,100)
 body+=center('NEAR testnet · illustrated devices',800,1080,16,SLATE,400,0,100)
 body+=t('Built on',1300,1080,17,SLATE,400,0,100)
 body+=f'<image href="data:image/svg+xml;base64,{near}" x="1381" y="1060" width="23.1" height="22"/>'
 body+=t('NEAR',1420,1080,24,'#11181c',600,.01,100)
 title='COMMONKIT — '+ ' '.join(item['lines'])
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100" role="img"><title>{title}</title>{body}</svg>'
 html='<!doctype html><meta charset="utf-8"><title>'+title+'</title><style>*{box-sizing:border-box}html,body{margin:0;width:1600px;height:1100px;overflow:hidden;background:#f5f8fc}.scene{position:absolute;inset:0 auto auto 0;width:1600px;height:1000px;object-fit:fill}.art{position:absolute;inset:0;width:1600px;height:1100px}</style>'+f'<img class="scene" src="scene-{i:02d}.png" alt="">'+svg.replace('<svg ','<svg class="art" ',1)
 (ROOT/(item['slug']+'.html')).write_text(html)
 (ROOT/(item['slug']+'.svg')).write_text(svg)
 manifest.append({'image':item['slug']+'.png','scene':f'scene-{i:02d}.png','headline':' '.join(item['lines']),'labels':item['labels'],'scope':'Illustrated device scene; real testnet workflow described in paired post.'})
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Five poster sources built with original outlined typography and logos')
