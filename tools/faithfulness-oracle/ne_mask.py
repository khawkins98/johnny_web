import struct
f=open('dosbox/driveC/SCRANTIC.SCR','rb').read()
def parse_reloc(file_off,seg_len):
    p=file_off+seg_len; cnt=struct.unpack_from('<H',f,p)[0]; p+=2
    patched=set(); recs=[]
    for i in range(cnt):
        atype,rtype=f[p],f[p+1]; off=struct.unpack_from('<H',f,p+2)[0]
        tgt=struct.unpack_from('<I',f,p+4)[0]; p+=8
        recs.append((atype,rtype,off,tgt))
        size={0:1,2:2,3:4,5:2,11:4,13:8}.get(atype,2)
        additive=rtype&0x04; cur=off; seen=0
        while cur!=0xffff and cur<seg_len and seen<10000:
            for k in range(size):
                if cur+k<seg_len: patched.add(cur+k)
            seen+=1
            if additive: break
            nxt=struct.unpack_from('<H',f,file_off+cur)[0]; cur=nxt
            if cur==0xffff: break
    return patched,recs
seg4=(0x7600,0x1f85); seg10=(0x12200,0x1f1f)
p4,_=parse_reloc(*seg4); p10,_=parse_reloc(*seg10)
funcs=[('director',4,0x06bf,p4,seg4),('completion',10,0x0766,p10,seg10),
       ('action',10,0x1925,p10,seg10),('tick',10,0x1acb,p10,seg10)]
N=24
for name,seg,off,patched,(fo,ln) in funcs:
    b=f[fo+off:fo+off+N]
    masked=[i for i in range(N) if (off+i) in patched]
    print(f"{name} seg{seg} off={off:#06x}: patched_within_first{N}={masked}")
    print(f"   sig={b.hex()}")
