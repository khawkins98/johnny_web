import { resolveScale } from './scaling.mjs';
import { createVga } from './vga.mjs';
import { createLottes } from './lottes.mjs';
import { createGuest } from './guest.mjs';
import { maskVisibility } from './vga-model.mjs';
import { createCrt } from './crt.mjs';
const factories = { crt:createCrt, vga:createVga, lottes:createLottes, guest:createGuest };

/** One output target. Source acquisition stays shared in the lab. */
export function createStage(viewport) {
    const makeCanvas = () => { const c=document.createElement('canvas'); c.width=640;c.height=480;c.className='output';viewport.append(c);return c; };
    const baseline=makeCanvas(),raster=makeCanvas();let output=makeCanvas();
    let crt=null,rendererEffect='',failure='',geometry,effect='none',dpr=1,available,sizing,lastCrtSettings;
    function fail(message){failure=message;output.hidden=true;raster.hidden=true;baseline.hidden=false;}
    function configure(width,height,ratio,mode,presentation){
        dpr=ratio;effect=presentation;sizing=mode;available=[width,height];
        if(factories[effect]&&rendererEffect!==effect){
            crt?.dispose();crt=null;rendererEffect=effect;output.remove();output=makeCanvas();
        }
        viewport.style.width=`${width}px`;viewport.style.height=`${height}px`;viewport.style.marginLeft='0px';viewport.style.top='0px';viewport.style.transform='none';
        const rect=viewport.getBoundingClientRect();
        viewport.style.transform=`translate(${Math.round(rect.left*dpr)/dpr-rect.left}px, ${Math.round(rect.top*dpr)/dpr-rect.top}px)`;
        geometry=resolveScale(width,height,dpr,mode);
        for(const c of [baseline,raster,output])Object.assign(c.style,{width:`${geometry.width}px`,height:`${geometry.height}px`,left:`${geometry.x}px`,top:`${geometry.y}px`,imageRendering:geometry.sharp?'pixelated':'auto'});
        output.style.imageRendering='auto';raster.style.imageRendering='auto';
        failure='';output.hidden=true;raster.hidden=true;baseline.hidden=false;
        if(effect==='unavailable')fail('Forced WebGL unavailable · unfiltered fallback');
        if(factories[effect]&&!crt){try{crt=factories[effect](output,fail)}catch(error){fail(error.message)}}
    }
    function draw(source,settings){
        lastCrtSettings=settings;baseline.getContext('2d').drawImage(source,0,0);
        const width=Math.round(geometry.width*dpr),height=Math.round(geometry.height*dpr);
        if(effect==='raster'){
            if(raster.width!==width||raster.height!==height){raster.width=width;raster.height=height}
            const context=raster.getContext('2d');context.imageSmoothingEnabled=!geometry.sharp;context.drawImage(source,0,0,width,height);raster.hidden=false;baseline.hidden=true;
        }
        if(factories[effect]&&settings.bypass){output.hidden=true;raster.hidden=true;baseline.hidden=false;}
        if(factories[effect]&&!settings.bypass&&crt&&!failure){
            try{const ready=crt.draw(source,width,height,settings,geometry.sharp)!==false;output.hidden=!ready;baseline.hidden=ready}catch(error){fail(error.message)}
        }
    }
    function metrics(){
        const rect=viewport.getBoundingClientRect();
        return{available,mode:sizing,geometry,effect,failure,crt:factories[effect]?lastCrtSettings:null,
            guest:effect==='guest'?crt?.metrics?.():null,
            vgaMaskVisibility:effect==='vga'&&lastCrtSettings?maskVisibility(output.width,lastCrtSettings.triads):null,
            layoutDeviceOrigin:[(rect.left+geometry.x)*dpr,(rect.top+geometry.y)*dpr],glSize:[output.width,output.height],rasterSize:[raster.width,raster.height]};
    }
    return{configure,draw,metrics,fail,lose:()=>crt?.lose(),dispose:()=>crt?.dispose()};
}
