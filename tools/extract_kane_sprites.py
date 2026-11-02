#!/usr/bin/env python3
"""Extrai os frames do Kane da sheet de referência e gera as sprite sheets do jogo.

Uso: python3 tools/extract_kane_sprites.py [assets/kane/source/kane_sheet_source.jpg]
Saída: assets/kane/idle_sheet.png, run_flight_sheet.png, attack_sheet.png
(frames 192x144, pés na origem 96,140). Requer Pillow e numpy.
"""
import sys
from PIL import Image
import numpy as np, json, sys
SRC=sys.argv[1] if len(sys.argv)>1 else 'assets/kane/source/kane_sheet_source.jpg'
im=Image.open(SRC).convert('RGB')
S=2576/1998
cols4=[(736,1023),(1032,1325),(1335,1630),(1640,1934)]
rows={'idle':((72,336),cols4),'move':((396,578),cols4),'laser':((636,806),cols4),
      'punch':((866,1088),[(722,951),(961,1200),(1211,1452),(1462,1693),(1703,1934)])}
I=8
out={}
for name,((y0,y1),cols) in rows.items():
    out[name]=[im.crop((int(a*S)+I,int(y0*S)+I,int(b*S)-I,int(y1*S)-I)) for a,b in cols]

import numpy as np
from collections import deque
from PIL import Image

def flood(seed_mask, allowed):
    h,w=allowed.shape; out=np.zeros_like(allowed); dq=deque()
    ys,xs=np.nonzero(seed_mask & allowed)
    for y,x in zip(ys,xs): out[y,x]=True; dq.append((y,x))
    while dq:
        y,x=dq.popleft()
        for ny,nx in ((y+1,x),(y-1,x),(y,x+1),(y,x-1)):
            if 0<=ny<h and 0<=nx<w and allowed[ny,nx] and not out[ny,nx]:
                out[ny,nx]=True; dq.append((ny,nx))
    return out

def components(mask):
    h,w=mask.shape; seen=np.zeros_like(mask); comps=[]
    for y,x in zip(*np.nonzero(mask)):
        if seen[y,x]: continue
        dq=deque([(y,x)]); seen[y,x]=True; pts=[]
        while dq:
            cy,cx=dq.popleft(); pts.append((cy,cx))
            for ny,nx in ((cy+1,cx),(cy-1,cx),(cy,cx+1),(cy,cx-1)):
                if 0<=ny<h and 0<=nx<w and mask[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True; dq.append((ny,nx))
        comps.append(pts)
    return comps


def key2(img):
    """Remove o fundo cinzento com grelha (cor fria, r 49-104) por flood fill a partir das bordas."""
    a=np.array(img).astype(int); r,g,b=a[...,0],a[...,1],a[...,2]
    cand=(r>=49)&(r<=104)&(g-r>=2)&(g-r<=13)&(b-r>=9)&(b-r<=24)
    h,w=cand.shape
    edge=np.zeros((h,w),bool); edge[0]=edge[-1]=True; edge[:,0]=edge[:,-1]=True
    bg=flood(edge,cand)
    for pts in components(cand&~bg):
        if len(pts)>=40:
            for y,x in pts: bg[y,x]=True
    op=~bg
    n=sum(np.roll(np.roll(op,dy,0),dx,1) for dy in (-1,0,1) for dx in (-1,0,1))-op
    bg|= op&(n<=1)
    return Image.fromarray(np.dstack([a.astype(np.uint8),np.where(bg,0,255).astype(np.uint8)]),'RGBA')

keyed={n:[key2(c) for c in cs] for n,cs in out.items() if n!='laser'}

from PIL import Image
import numpy as np, os
FW,FH,OX,OY=192,144,96,140
rows={'idle':(4,0.40,'bbox0'),'move':(4,0.35,'cell'),'punch':(5,0.42,'helmet')}
def helmet_x(arr):
    al=arr[...,3]>0; ys=np.nonzero(al.any(1))[0]; top=ys[0]
    band=arr[top:top+45].astype(int)
    gold=(band[...,3]>0)&(band[...,0]>90)&(band[...,0]-band[...,2]>25)
    return float(np.median(np.nonzero(gold)[1]))
res={}; eyes={}
for name,(n,sc,mode) in rows.items():
    frames=keyed[name]
    a0=np.array(frames[0]); xs=np.nonzero((a0[...,3]>0).any(0))[0]
    base=(xs[0]+xs[-1])/2
    h0=helmet_x(a0)
    out=[]; ey=[]
    for fr in frames:
        arr=np.array(fr)
        if mode=='bbox0': ax=base
        elif mode=='cell': ax=fr.width*0.55
        else: ax=helmet_x(arr)-(h0-base)   # mantém o capacete onde estava no frame 0
        s=fr.resize((round(fr.width*sc),round(fr.height*sc)),Image.LANCZOS)
        sa=np.array(s); sa[...,3]=np.where(sa[...,3]>=110,255,0); s=Image.fromarray(sa)
        bottom=np.nonzero((sa[...,3]>0).any(1))[0][-1]
        canvas=Image.new('RGBA',(FW,FH)); canvas.paste(s,(round(OX-ax*sc),OY-bottom),s)
        c=np.array(canvas).astype(int)
        red=(c[...,0]>200)&(c[...,1]<90)&(c[...,2]<110)&(c[...,3]>0); red[FH//2:]=False
        ry,rx=np.nonzero(red); ey.append((round(rx.mean()-OX),round(ry.mean()-OY)) if len(rx) else None)
        out.append(canvas)
    res[name]=out; eyes[name]=ey
print(eyes)
def strip(fs):
    st=Image.new('RGBA',(FW*len(fs),FH)); [st.paste(f,(i*FW,0)) for i,f in enumerate(fs)]; return st
dst='assets/kane'
strip(res['idle']).save(f'{dst}/idle_sheet.png',optimize=True)
strip(res['move']).save(f'{dst}/run_flight_sheet.png',optimize=True)
strip(res['punch']).save(f'{dst}/attack_sheet.png',optimize=True)
