import { guestParameterList } from './guest.mjs';
export function setupGuestControls(container,onChange){
    const tools=document.createElement('div');tools.className='crt-tools';
    const label=document.createElement('label');label.textContent='Guest HD profile';
    const profile=document.createElement('select');profile.id='guest-profile';profile.append(new Option('Progressive RGB · explicit overrides','progressive'),new Option('Pinned upstream defaults','upstream'));label.append(profile);
    const bypassLabel=document.createElement('label');bypassLabel.className='crt-toggle';const bypass=document.createElement('input');bypass.type='checkbox';bypass.id='guest-bypass';bypassLabel.append(bypass,'Bypass Guest HD');
    const reset=document.createElement('button');reset.type='button';reset.textContent='Reset profile parameters';tools.append(label,bypassLabel,reset);
    const grid=document.createElement('div');grid.className='crt-grid';const rows=new Map();
    for(const key of ['shadowMask','masksize','glow','bloom','halation','AS','brightboost','gamma_in','gamma_out','warpX','warpY','PR','PG','PB']){
        const p=guestParameterList.get(key);if(!p)continue;
        const card=document.createElement('div');card.className='crt-control';const label=document.createElement('label');label.htmlFor='guest-'+key;label.textContent=p.label;
        const input=document.createElement('input');input.type='range';input.id=label.htmlFor;Object.assign(input,{min:p.min,max:p.max,step:p.step,value:p.value});
        const output=document.createElement('output');output.htmlFor=input.id;output.textContent=input.value;input.oninput=()=>{output.textContent=input.value;onChange()};card.append(label,input,output);grid.append(card);rows.set(key,{input,output,p});
    }
    let overrides={};
    function resetProfile(){overrides=profile.value==='progressive'?{interm:0,inter:800,AS:0,PR:0,PG:0,PB:0}:{};for(const[key,row]of rows){row.input.value=overrides[key]??row.p.value;row.output.textContent=row.input.value}onChange()}
    profile.onchange=resetProfile;reset.onclick=resetProfile;bypass.onchange=onChange;
    for(const[key,row]of rows)if(profile.value==='progressive'&&['AS','PR','PG','PB'].includes(key)){row.input.value=0;row.output.textContent='0'}
    container.append(tools,grid);
    return{getSettings:()=>({...overrides,...Object.fromEntries([...rows].map(([k,r])=>[k,Number(r.input.value)])),profile:profile.value,bypass:bypass.checked})};
}
