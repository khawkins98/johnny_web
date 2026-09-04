import struct
f=open('dosbox/driveC/SCRANTIC.SCR','rb').read()
segs={4:(0x7600,0x1f85),10:(0x12200,0x1f1f)}
def parse_reloc(file_off,seg_len):
    # reloc table immediately after segment data
    p=file_off+seg_len
    cnt=struct.unpack_from('<H',f,p)[0]
    p+=2
    patched=set()  # segment-relative offsets touched by loader
    for i in range(cnt):
        atype,rtype = f[p],f[p+1]
        off=struct.unpack_from('<H',f,p+2)[0]
        p+=8
        # patch size by address type
        size={0:1,2:2,3:4,5:2,11:4,13:8}.get(atype,2)
        additive = rtype & 0x04
        # walk chain
        cur=off
        seen=0
        while cur!=0xffff and cur<seg_len and seen<10000:
            for k in range(size):
                if cur+k<seg_len: patched.add(cur+k)
            seen+=1
            if additive: break
            nxt=struct.unpack_from('<H',f,file_off+cur)[0]
            if nxt==0xffff or nxt<=cur and nxt!=0: 
                cur=nxt
            else:
                cur=nxt
            if cur==0xffff: break
    return cnt,patched
for seg,(fo,ln) in segs.items():
    cnt,patched=parse_reloc(fo,ln)
    print(f"seg{seg}: reloc_records={cnt} patched_bytes={len(patched)} seg_len={ln:#x}")
    # find longest run of unpatched bytes
    best_len=0;best_start=0;run=0;start=0
    for o in range(ln):
        if o not in patched:
            if run==0: start=o
            run+=1
            if run>best_len: best_len=run;best_start=start
        else:
            run=0
    print(f"   longest clean run: off={best_start:#06x} len={best_len} (file {fo+best_start:#08x})")
