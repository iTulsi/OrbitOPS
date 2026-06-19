import{a as Kt,r as h}from"./react-core-DT047nHA.js";import{u as Y,a as st,V as A,D as qt,b as F,P as je,O as De,R as jt,M as be,T as ye,S as nt,Q as pt,c as Qt,d as Jt,I as en,F as vt,e as ot,f as xe,W as tn,B as rt,g as Dt,h as Ct,U as gt,i as bt,j as nn,k as Se,L as on,l as sn,m as rn,C as zt,n as at,o as ct,p as yt,A as an}from"./three-core-BDcCdEDv.js";var xt={},Rt,Et=Kt;Rt=xt.createRoot=Et.createRoot,xt.hydrateRoot=Et.hydrateRoot;const cn="modulepreload",ln=function(i){return"/"+i},wt={},to=function(t,o,e){let s=Promise.resolve();if(o&&o.length>0){document.getElementsByTagName("link");const f=document.querySelector("meta[property=csp-nonce]"),a=f?.nonce||f?.getAttribute("nonce");s=Promise.allSettled(o.map(l=>{if(l=ln(l),l in wt)return;wt[l]=!0;const w=l.endsWith(".css"),d=w?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${l}"]${d}`))return;const u=document.createElement("link");if(u.rel=w?"stylesheet":cn,w||(u.as="script"),u.crossOrigin="",u.href=l,a&&u.setAttribute("nonce",a),document.head.appendChild(u),w)return new Promise((b,y)=>{u.addEventListener("load",b),u.addEventListener("error",()=>y(new Error(`Unable to preload CSS for ${l}`)))})}))}function r(f){const a=new Event("vite:preloadError",{cancelable:!0});if(a.payload=f,window.dispatchEvent(a),!a.defaultPrevented)throw f}return s.then(f=>{for(const a of f||[])a.status==="rejected"&&r(a.reason);return t().catch(r)})};function Ee(){return Ee=Object.assign?Object.assign.bind():function(i){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var e in o)({}).hasOwnProperty.call(o,e)&&(i[e]=o[e])}return i},Ee.apply(null,arguments)}const Ce=new A,lt=new A,un=new A,St=new F;function fn(i,t,o){const e=Ce.setFromMatrixPosition(i.matrixWorld);e.project(t);const s=o.width/2,r=o.height/2;return[e.x*s+s,-(e.y*r)+r]}function dn(i,t){const o=Ce.setFromMatrixPosition(i.matrixWorld),e=lt.setFromMatrixPosition(t.matrixWorld),s=o.sub(e),r=t.getWorldDirection(un);return s.angleTo(r)>Math.PI/2}function hn(i,t,o,e){const s=Ce.setFromMatrixPosition(i.matrixWorld),r=s.clone();r.project(t),St.set(r.x,r.y),o.setFromCamera(St,t);const f=o.intersectObjects(e,!0);if(f.length){const a=f[0].distance;return s.distanceTo(o.ray.origin)<a}return!0}function mn(i,t){if(t instanceof De)return t.zoom;if(t instanceof je){const o=Ce.setFromMatrixPosition(i.matrixWorld),e=lt.setFromMatrixPosition(t.matrixWorld),s=t.fov*Math.PI/180,r=o.distanceTo(e);return 1/(2*Math.tan(s/2)*r)}else return 1}function pn(i,t,o){if(t instanceof je||t instanceof De){const e=Ce.setFromMatrixPosition(i.matrixWorld),s=lt.setFromMatrixPosition(t.matrixWorld),r=e.distanceTo(s),f=(o[1]-o[0])/(t.far-t.near),a=o[1]-f*t.far;return Math.round(f*r+a)}}const it=i=>Math.abs(i)<1e-10?0:i;function Ut(i,t,o=""){let e="matrix3d(";for(let s=0;s!==16;s++)e+=it(t[s]*i.elements[s])+(s!==15?",":")");return o+e}const vn=(i=>t=>Ut(t,i))([1,-1,1,1,1,-1,1,1,1,-1,1,1,1,-1,1,1]),gn=(i=>(t,o)=>Ut(t,i(o),"translate(-50%,-50%)"))(i=>[1/i,1/i,1/i,1,-1/i,-1/i,-1/i,-1,1/i,1/i,1/i,1,1,1,1,1]);function bn(i){return i&&typeof i=="object"&&"current"in i}const no=h.forwardRef(({children:i,eps:t=.001,style:o,className:e,prepend:s,center:r,fullscreen:f,portal:a,distanceFactor:l,sprite:w=!1,transform:d=!1,occlude:u,onOcclude:b,castShadow:y,receiveShadow:S,material:j,geometry:T,zIndexRange:O=[16777271,0],calculatePosition:D=fn,as:v="div",wrapperClass:M,pointerEvents:_="auto",...g},se)=>{const{gl:W,camera:L,scene:x,size:C,raycaster:ke,events:J,viewport:Me}=Y(),[R]=h.useState(()=>document.createElement(v)),me=h.useRef(),B=h.useRef(null),ee=h.useRef(0),re=h.useRef([0,0]),$=h.useRef(null),ue=h.useRef(null),te=a?.current||J.connected||W.domElement.parentNode,k=h.useRef(null),fe=h.useRef(!1),pe=h.useMemo(()=>u&&u!=="blending"||Array.isArray(u)&&u.length&&bn(u[0]),[u]);h.useLayoutEffect(()=>{const H=W.domElement;u&&u==="blending"?(H.style.zIndex=`${Math.floor(O[0]/2)}`,H.style.position="absolute",H.style.pointerEvents="none"):(H.style.zIndex=null,H.style.position=null,H.style.pointerEvents=null)},[u]),h.useLayoutEffect(()=>{if(B.current){const H=me.current=Rt(R);if(x.updateMatrixWorld(),d)R.style.cssText="position:absolute;top:0;left:0;pointer-events:none;overflow:hidden;";else{const P=D(B.current,L,C);R.style.cssText=`position:absolute;top:0;left:0;transform:translate3d(${P[0]}px,${P[1]}px,0);transform-origin:0 0;`}return te&&(s?te.prepend(R):te.appendChild(R)),()=>{te&&te.removeChild(R),H.unmount()}}},[te,d]),h.useLayoutEffect(()=>{M&&(R.className=M)},[M]);const Pe=h.useMemo(()=>d?{position:"absolute",top:0,left:0,width:C.width,height:C.height,transformStyle:"preserve-3d",pointerEvents:"none"}:{position:"absolute",transform:r?"translate3d(-50%,-50%,0)":"none",...f&&{top:-C.height/2,left:-C.width/2,width:C.width,height:C.height},...o},[o,r,f,C,d]),Ve=h.useMemo(()=>({position:"absolute",pointerEvents:_}),[_]);h.useLayoutEffect(()=>{if(fe.current=!1,d){var H;(H=me.current)==null||H.render(h.createElement("div",{ref:$,style:Pe},h.createElement("div",{ref:ue,style:Ve},h.createElement("div",{ref:se,className:e,style:o,children:i}))))}else{var P;(P=me.current)==null||P.render(h.createElement("div",{ref:se,style:Pe,className:e,children:i}))}});const ae=h.useRef(!0);st(H=>{if(B.current){L.updateMatrixWorld(),B.current.updateWorldMatrix(!0,!1);const P=d?re.current:D(B.current,L,C);if(d||Math.abs(ee.current-L.zoom)>t||Math.abs(re.current[0]-P[0])>t||Math.abs(re.current[1]-P[1])>t){const G=dn(B.current,L);let V=!1;pe&&(Array.isArray(u)?V=u.map(Z=>Z.current):u!=="blending"&&(V=[x]));const ce=ae.current;if(V){const Z=hn(B.current,L,ke,V);ae.current=Z&&!G}else ae.current=!G;ce!==ae.current&&(b?b(!ae.current):R.style.display=ae.current?"block":"none");const ve=Math.floor(O[0]/2),Ye=u?pe?[O[0],ve]:[ve-1,0]:O;if(R.style.zIndex=`${pn(B.current,L,Ye)}`,d){const[Z,_e]=[C.width/2,C.height/2],ge=L.projectionMatrix.elements[5]*_e,{isOrthographicCamera:Re,top:$e,left:Ue,bottom:Ae,right:de}=L,Ge=vn(L.matrixWorldInverse),Ze=Re?`scale(${ge})translate(${it(-(de+Ue)/2)}px,${it(($e+Ae)/2)}px)`:`translateZ(${ge}px)`;let X=B.current.matrixWorld;w&&(X=L.matrixWorldInverse.clone().transpose().copyPosition(X).scale(B.current.scale),X.elements[3]=X.elements[7]=X.elements[11]=0,X.elements[15]=1),R.style.width=C.width+"px",R.style.height=C.height+"px",R.style.perspective=Re?"":`${ge}px`,$.current&&ue.current&&($.current.style.transform=`${Ze}${Ge}translate(${Z}px,${_e}px)`,ue.current.style.transform=gn(X,1/((l||10)/400)))}else{const Z=l===void 0?1:mn(B.current,L)*l;R.style.transform=`translate3d(${P[0]}px,${P[1]}px,0) scale(${Z})`}re.current=P,ee.current=L.zoom}}if(!pe&&k.current&&!fe.current)if(d){if($.current){const P=$.current.children[0];if(P!=null&&P.clientWidth&&P!=null&&P.clientHeight){const{isOrthographicCamera:G}=L;if(G||T)g.scale&&(Array.isArray(g.scale)?g.scale instanceof A?k.current.scale.copy(g.scale.clone().divideScalar(1)):k.current.scale.set(1/g.scale[0],1/g.scale[1],1/g.scale[2]):k.current.scale.setScalar(1/g.scale));else{const V=(l||10)/400,ce=P.clientWidth*V,ve=P.clientHeight*V;k.current.scale.set(ce,ve,1)}fe.current=!0}}}else{const P=R.children[0];if(P!=null&&P.clientWidth&&P!=null&&P.clientHeight){const G=1/Me.factor,V=P.clientWidth*G,ce=P.clientHeight*G;k.current.scale.set(V,ce,1),fe.current=!0}k.current.lookAt(H.camera.position)}});const ze=h.useMemo(()=>({vertexShader:d?void 0:`
          /*
            This shader is from the THREE's SpriteMaterial.
            We need to turn the backing plane into a Sprite
            (make it always face the camera) if "transfrom"
            is false.
          */
          #include <common>

          void main() {
            vec2 center = vec2(0., 1.);
            float rotation = 0.0;

            // This is somewhat arbitrary, but it seems to work well
            // Need to figure out how to derive this dynamically if it even matters
            float size = 0.03;

            vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
            vec2 scale;
            scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );
            scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );

            bool isPerspective = isPerspectiveMatrix( projectionMatrix );
            if ( isPerspective ) scale *= - mvPosition.z;

            vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale * size;
            vec2 rotatedPosition;
            rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
            rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
            mvPosition.xy += rotatedPosition;

            gl_Position = projectionMatrix * mvPosition;
          }
      `,fragmentShader:`
        void main() {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }
      `}),[d]);return h.createElement("group",Ee({},g,{ref:B}),u&&!pe&&h.createElement("mesh",{castShadow:y,receiveShadow:S,ref:k},T||h.createElement("planeGeometry",null),j||h.createElement("shaderMaterial",{side:qt,vertexShader:ze.vertexShader,fragmentShader:ze.fragmentShader})))}),It=parseInt(jt.replace(/\D+/g,"")),Nt=It>=125?"uv1":"uv2";var yn=Object.defineProperty,xn=(i,t,o)=>t in i?yn(i,t,{enumerable:!0,configurable:!0,writable:!0,value:o}):i[t]=o,En=(i,t,o)=>(xn(i,t+"",o),o);class wn{constructor(){En(this,"_listeners")}addEventListener(t,o){this._listeners===void 0&&(this._listeners={});const e=this._listeners;e[t]===void 0&&(e[t]=[]),e[t].indexOf(o)===-1&&e[t].push(o)}hasEventListener(t,o){if(this._listeners===void 0)return!1;const e=this._listeners;return e[t]!==void 0&&e[t].indexOf(o)!==-1}removeEventListener(t,o){if(this._listeners===void 0)return;const s=this._listeners[t];if(s!==void 0){const r=s.indexOf(o);r!==-1&&s.splice(r,1)}}dispatchEvent(t){if(this._listeners===void 0)return;const e=this._listeners[t.type];if(e!==void 0){t.target=this;const s=e.slice(0);for(let r=0,f=s.length;r<f;r++)s[r].call(this,t);t.target=null}}}var Sn=Object.defineProperty,Mn=(i,t,o)=>t in i?Sn(i,t,{enumerable:!0,configurable:!0,writable:!0,value:o}):i[t]=o,m=(i,t,o)=>(Mn(i,typeof t!="symbol"?t+"":t,o),o);const Ne=new Qt,Mt=new Jt,Pn=Math.cos(70*(Math.PI/180)),Pt=(i,t)=>(i%t+t)%t;let _n=class extends wn{constructor(t,o){super(),m(this,"object"),m(this,"domElement"),m(this,"enabled",!0),m(this,"target",new A),m(this,"minDistance",0),m(this,"maxDistance",1/0),m(this,"minZoom",0),m(this,"maxZoom",1/0),m(this,"minPolarAngle",0),m(this,"maxPolarAngle",Math.PI),m(this,"minAzimuthAngle",-1/0),m(this,"maxAzimuthAngle",1/0),m(this,"enableDamping",!1),m(this,"dampingFactor",.05),m(this,"enableZoom",!0),m(this,"zoomSpeed",1),m(this,"enableRotate",!0),m(this,"rotateSpeed",1),m(this,"enablePan",!0),m(this,"panSpeed",1),m(this,"screenSpacePanning",!0),m(this,"keyPanSpeed",7),m(this,"zoomToCursor",!1),m(this,"autoRotate",!1),m(this,"autoRotateSpeed",2),m(this,"reverseOrbit",!1),m(this,"reverseHorizontalOrbit",!1),m(this,"reverseVerticalOrbit",!1),m(this,"keys",{LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"}),m(this,"mouseButtons",{LEFT:be.ROTATE,MIDDLE:be.DOLLY,RIGHT:be.PAN}),m(this,"touches",{ONE:ye.ROTATE,TWO:ye.DOLLY_PAN}),m(this,"target0"),m(this,"position0"),m(this,"zoom0"),m(this,"_domElementKeyEvents",null),m(this,"getPolarAngle"),m(this,"getAzimuthalAngle"),m(this,"setPolarAngle"),m(this,"setAzimuthalAngle"),m(this,"getDistance"),m(this,"getZoomScale"),m(this,"listenToKeyEvents"),m(this,"stopListenToKeyEvents"),m(this,"saveState"),m(this,"reset"),m(this,"update"),m(this,"connect"),m(this,"dispose"),m(this,"dollyIn"),m(this,"dollyOut"),m(this,"getScale"),m(this,"setScale"),this.object=t,this.domElement=o,this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this.getPolarAngle=()=>d.phi,this.getAzimuthalAngle=()=>d.theta,this.setPolarAngle=n=>{let c=Pt(n,2*Math.PI),p=d.phi;p<0&&(p+=2*Math.PI),c<0&&(c+=2*Math.PI);let E=Math.abs(c-p);2*Math.PI-E<E&&(c<p?c+=2*Math.PI:p+=2*Math.PI),u.phi=c-p,e.update()},this.setAzimuthalAngle=n=>{let c=Pt(n,2*Math.PI),p=d.theta;p<0&&(p+=2*Math.PI),c<0&&(c+=2*Math.PI);let E=Math.abs(c-p);2*Math.PI-E<E&&(c<p?c+=2*Math.PI:p+=2*Math.PI),u.theta=c-p,e.update()},this.getDistance=()=>e.object.position.distanceTo(e.target),this.listenToKeyEvents=n=>{n.addEventListener("keydown",Xe),this._domElementKeyEvents=n},this.stopListenToKeyEvents=()=>{this._domElementKeyEvents.removeEventListener("keydown",Xe),this._domElementKeyEvents=null},this.saveState=()=>{e.target0.copy(e.target),e.position0.copy(e.object.position),e.zoom0=e.object.zoom},this.reset=()=>{e.target.copy(e.target0),e.object.position.copy(e.position0),e.object.zoom=e.zoom0,e.object.updateProjectionMatrix(),e.dispatchEvent(s),e.update(),l=a.NONE},this.update=(()=>{const n=new A,c=new A(0,1,0),p=new pt().setFromUnitVectors(t.up,c),E=p.clone().invert(),z=new A,ne=new pt,le=2*Math.PI;return function(){const mt=e.object.position;p.setFromUnitVectors(t.up,c),E.copy(p).invert(),n.copy(mt).sub(e.target),n.applyQuaternion(p),d.setFromVector3(n),e.autoRotate&&l===a.NONE&&Me(ke()),e.enableDamping?(d.theta+=u.theta*e.dampingFactor,d.phi+=u.phi*e.dampingFactor):(d.theta+=u.theta,d.phi+=u.phi);let oe=e.minAzimuthAngle,ie=e.maxAzimuthAngle;isFinite(oe)&&isFinite(ie)&&(oe<-Math.PI?oe+=le:oe>Math.PI&&(oe-=le),ie<-Math.PI?ie+=le:ie>Math.PI&&(ie-=le),oe<=ie?d.theta=Math.max(oe,Math.min(ie,d.theta)):d.theta=d.theta>(oe+ie)/2?Math.max(oe,d.theta):Math.min(ie,d.theta)),d.phi=Math.max(e.minPolarAngle,Math.min(e.maxPolarAngle,d.phi)),d.makeSafe(),e.enableDamping===!0?e.target.addScaledVector(y,e.dampingFactor):e.target.add(y),e.zoomToCursor&&L||e.object.isOrthographicCamera?d.radius=k(d.radius):d.radius=k(d.radius*b),n.setFromSpherical(d),n.applyQuaternion(E),mt.copy(e.target).add(n),e.object.matrixAutoUpdate||e.object.updateMatrix(),e.object.lookAt(e.target),e.enableDamping===!0?(u.theta*=1-e.dampingFactor,u.phi*=1-e.dampingFactor,y.multiplyScalar(1-e.dampingFactor)):(u.set(0,0,0),y.set(0,0,0));let Oe=!1;if(e.zoomToCursor&&L){let Le=null;if(e.object instanceof je&&e.object.isPerspectiveCamera){const Te=n.length();Le=k(Te*b);const Ie=Te-Le;e.object.position.addScaledVector(se,Ie),e.object.updateMatrixWorld()}else if(e.object.isOrthographicCamera){const Te=new A(W.x,W.y,0);Te.unproject(e.object),e.object.zoom=Math.max(e.minZoom,Math.min(e.maxZoom,e.object.zoom/b)),e.object.updateProjectionMatrix(),Oe=!0;const Ie=new A(W.x,W.y,0);Ie.unproject(e.object),e.object.position.sub(Ie).add(Te),e.object.updateMatrixWorld(),Le=n.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),e.zoomToCursor=!1;Le!==null&&(e.screenSpacePanning?e.target.set(0,0,-1).transformDirection(e.object.matrix).multiplyScalar(Le).add(e.object.position):(Ne.origin.copy(e.object.position),Ne.direction.set(0,0,-1).transformDirection(e.object.matrix),Math.abs(e.object.up.dot(Ne.direction))<Pn?t.lookAt(e.target):(Mt.setFromNormalAndCoplanarPoint(e.object.up,e.target),Ne.intersectPlane(Mt,e.target))))}else e.object instanceof De&&e.object.isOrthographicCamera&&(Oe=b!==1,Oe&&(e.object.zoom=Math.max(e.minZoom,Math.min(e.maxZoom,e.object.zoom/b)),e.object.updateProjectionMatrix()));return b=1,L=!1,Oe||z.distanceToSquared(e.object.position)>w||8*(1-ne.dot(e.object.quaternion))>w?(e.dispatchEvent(s),z.copy(e.object.position),ne.copy(e.object.quaternion),Oe=!1,!0):!1}})(),this.connect=n=>{e.domElement=n,e.domElement.style.touchAction="none",e.domElement.addEventListener("contextmenu",dt),e.domElement.addEventListener("pointerdown",Ue),e.domElement.addEventListener("pointercancel",de),e.domElement.addEventListener("wheel",X)},this.dispose=()=>{var n,c,p,E,z,ne;e.domElement&&(e.domElement.style.touchAction="auto"),(n=e.domElement)==null||n.removeEventListener("contextmenu",dt),(c=e.domElement)==null||c.removeEventListener("pointerdown",Ue),(p=e.domElement)==null||p.removeEventListener("pointercancel",de),(E=e.domElement)==null||E.removeEventListener("wheel",X),(z=e.domElement)==null||z.ownerDocument.removeEventListener("pointermove",Ae),(ne=e.domElement)==null||ne.ownerDocument.removeEventListener("pointerup",de),e._domElementKeyEvents!==null&&e._domElementKeyEvents.removeEventListener("keydown",Xe)};const e=this,s={type:"change"},r={type:"start"},f={type:"end"},a={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6};let l=a.NONE;const w=1e-6,d=new nt,u=new nt;let b=1;const y=new A,S=new F,j=new F,T=new F,O=new F,D=new F,v=new F,M=new F,_=new F,g=new F,se=new A,W=new F;let L=!1;const x=[],C={};function ke(){return 2*Math.PI/60/60*e.autoRotateSpeed}function J(){return Math.pow(.95,e.zoomSpeed)}function Me(n){e.reverseOrbit||e.reverseHorizontalOrbit?u.theta+=n:u.theta-=n}function R(n){e.reverseOrbit||e.reverseVerticalOrbit?u.phi+=n:u.phi-=n}const me=(()=>{const n=new A;return function(p,E){n.setFromMatrixColumn(E,0),n.multiplyScalar(-p),y.add(n)}})(),B=(()=>{const n=new A;return function(p,E){e.screenSpacePanning===!0?n.setFromMatrixColumn(E,1):(n.setFromMatrixColumn(E,0),n.crossVectors(e.object.up,n)),n.multiplyScalar(p),y.add(n)}})(),ee=(()=>{const n=new A;return function(p,E){const z=e.domElement;if(z&&e.object instanceof je&&e.object.isPerspectiveCamera){const ne=e.object.position;n.copy(ne).sub(e.target);let le=n.length();le*=Math.tan(e.object.fov/2*Math.PI/180),me(2*p*le/z.clientHeight,e.object.matrix),B(2*E*le/z.clientHeight,e.object.matrix)}else z&&e.object instanceof De&&e.object.isOrthographicCamera?(me(p*(e.object.right-e.object.left)/e.object.zoom/z.clientWidth,e.object.matrix),B(E*(e.object.top-e.object.bottom)/e.object.zoom/z.clientHeight,e.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),e.enablePan=!1)}})();function re(n){e.object instanceof je&&e.object.isPerspectiveCamera||e.object instanceof De&&e.object.isOrthographicCamera?b=n:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),e.enableZoom=!1)}function $(n){re(b/n)}function ue(n){re(b*n)}function te(n){if(!e.zoomToCursor||!e.domElement)return;L=!0;const c=e.domElement.getBoundingClientRect(),p=n.clientX-c.left,E=n.clientY-c.top,z=c.width,ne=c.height;W.x=p/z*2-1,W.y=-(E/ne)*2+1,se.set(W.x,W.y,1).unproject(e.object).sub(e.object.position).normalize()}function k(n){return Math.max(e.minDistance,Math.min(e.maxDistance,n))}function fe(n){S.set(n.clientX,n.clientY)}function pe(n){te(n),M.set(n.clientX,n.clientY)}function Pe(n){O.set(n.clientX,n.clientY)}function Ve(n){j.set(n.clientX,n.clientY),T.subVectors(j,S).multiplyScalar(e.rotateSpeed);const c=e.domElement;c&&(Me(2*Math.PI*T.x/c.clientHeight),R(2*Math.PI*T.y/c.clientHeight)),S.copy(j),e.update()}function ae(n){_.set(n.clientX,n.clientY),g.subVectors(_,M),g.y>0?$(J()):g.y<0&&ue(J()),M.copy(_),e.update()}function ze(n){D.set(n.clientX,n.clientY),v.subVectors(D,O).multiplyScalar(e.panSpeed),ee(v.x,v.y),O.copy(D),e.update()}function H(n){te(n),n.deltaY<0?ue(J()):n.deltaY>0&&$(J()),e.update()}function P(n){let c=!1;switch(n.code){case e.keys.UP:ee(0,e.keyPanSpeed),c=!0;break;case e.keys.BOTTOM:ee(0,-e.keyPanSpeed),c=!0;break;case e.keys.LEFT:ee(e.keyPanSpeed,0),c=!0;break;case e.keys.RIGHT:ee(-e.keyPanSpeed,0),c=!0;break}c&&(n.preventDefault(),e.update())}function G(){if(x.length==1)S.set(x[0].pageX,x[0].pageY);else{const n=.5*(x[0].pageX+x[1].pageX),c=.5*(x[0].pageY+x[1].pageY);S.set(n,c)}}function V(){if(x.length==1)O.set(x[0].pageX,x[0].pageY);else{const n=.5*(x[0].pageX+x[1].pageX),c=.5*(x[0].pageY+x[1].pageY);O.set(n,c)}}function ce(){const n=x[0].pageX-x[1].pageX,c=x[0].pageY-x[1].pageY,p=Math.sqrt(n*n+c*c);M.set(0,p)}function ve(){e.enableZoom&&ce(),e.enablePan&&V()}function Ye(){e.enableZoom&&ce(),e.enableRotate&&G()}function Z(n){if(x.length==1)j.set(n.pageX,n.pageY);else{const p=Ke(n),E=.5*(n.pageX+p.x),z=.5*(n.pageY+p.y);j.set(E,z)}T.subVectors(j,S).multiplyScalar(e.rotateSpeed);const c=e.domElement;c&&(Me(2*Math.PI*T.x/c.clientHeight),R(2*Math.PI*T.y/c.clientHeight)),S.copy(j)}function _e(n){if(x.length==1)D.set(n.pageX,n.pageY);else{const c=Ke(n),p=.5*(n.pageX+c.x),E=.5*(n.pageY+c.y);D.set(p,E)}v.subVectors(D,O).multiplyScalar(e.panSpeed),ee(v.x,v.y),O.copy(D)}function ge(n){const c=Ke(n),p=n.pageX-c.x,E=n.pageY-c.y,z=Math.sqrt(p*p+E*E);_.set(0,z),g.set(0,Math.pow(_.y/M.y,e.zoomSpeed)),$(g.y),M.copy(_)}function Re(n){e.enableZoom&&ge(n),e.enablePan&&_e(n)}function $e(n){e.enableZoom&&ge(n),e.enableRotate&&Z(n)}function Ue(n){var c,p;e.enabled!==!1&&(x.length===0&&((c=e.domElement)==null||c.ownerDocument.addEventListener("pointermove",Ae),(p=e.domElement)==null||p.ownerDocument.addEventListener("pointerup",de)),Zt(n),n.pointerType==="touch"?$t(n):Ge(n))}function Ae(n){e.enabled!==!1&&(n.pointerType==="touch"?Gt(n):Ze(n))}function de(n){var c,p,E;Xt(n),x.length===0&&((c=e.domElement)==null||c.releasePointerCapture(n.pointerId),(p=e.domElement)==null||p.ownerDocument.removeEventListener("pointermove",Ae),(E=e.domElement)==null||E.ownerDocument.removeEventListener("pointerup",de)),e.dispatchEvent(f),l=a.NONE}function Ge(n){let c;switch(n.button){case 0:c=e.mouseButtons.LEFT;break;case 1:c=e.mouseButtons.MIDDLE;break;case 2:c=e.mouseButtons.RIGHT;break;default:c=-1}switch(c){case be.DOLLY:if(e.enableZoom===!1)return;pe(n),l=a.DOLLY;break;case be.ROTATE:if(n.ctrlKey||n.metaKey||n.shiftKey){if(e.enablePan===!1)return;Pe(n),l=a.PAN}else{if(e.enableRotate===!1)return;fe(n),l=a.ROTATE}break;case be.PAN:if(n.ctrlKey||n.metaKey||n.shiftKey){if(e.enableRotate===!1)return;fe(n),l=a.ROTATE}else{if(e.enablePan===!1)return;Pe(n),l=a.PAN}break;default:l=a.NONE}l!==a.NONE&&e.dispatchEvent(r)}function Ze(n){if(e.enabled!==!1)switch(l){case a.ROTATE:if(e.enableRotate===!1)return;Ve(n);break;case a.DOLLY:if(e.enableZoom===!1)return;ae(n);break;case a.PAN:if(e.enablePan===!1)return;ze(n);break}}function X(n){e.enabled===!1||e.enableZoom===!1||l!==a.NONE&&l!==a.ROTATE||(n.preventDefault(),e.dispatchEvent(r),H(n),e.dispatchEvent(f))}function Xe(n){e.enabled===!1||e.enablePan===!1||P(n)}function $t(n){switch(ht(n),x.length){case 1:switch(e.touches.ONE){case ye.ROTATE:if(e.enableRotate===!1)return;G(),l=a.TOUCH_ROTATE;break;case ye.PAN:if(e.enablePan===!1)return;V(),l=a.TOUCH_PAN;break;default:l=a.NONE}break;case 2:switch(e.touches.TWO){case ye.DOLLY_PAN:if(e.enableZoom===!1&&e.enablePan===!1)return;ve(),l=a.TOUCH_DOLLY_PAN;break;case ye.DOLLY_ROTATE:if(e.enableZoom===!1&&e.enableRotate===!1)return;Ye(),l=a.TOUCH_DOLLY_ROTATE;break;default:l=a.NONE}break;default:l=a.NONE}l!==a.NONE&&e.dispatchEvent(r)}function Gt(n){switch(ht(n),l){case a.TOUCH_ROTATE:if(e.enableRotate===!1)return;Z(n),e.update();break;case a.TOUCH_PAN:if(e.enablePan===!1)return;_e(n),e.update();break;case a.TOUCH_DOLLY_PAN:if(e.enableZoom===!1&&e.enablePan===!1)return;Re(n),e.update();break;case a.TOUCH_DOLLY_ROTATE:if(e.enableZoom===!1&&e.enableRotate===!1)return;$e(n),e.update();break;default:l=a.NONE}}function dt(n){e.enabled!==!1&&n.preventDefault()}function Zt(n){x.push(n)}function Xt(n){delete C[n.pointerId];for(let c=0;c<x.length;c++)if(x[c].pointerId==n.pointerId){x.splice(c,1);return}}function ht(n){let c=C[n.pointerId];c===void 0&&(c=new F,C[n.pointerId]=c),c.set(n.pageX,n.pageY)}function Ke(n){const c=n.pointerId===x[0].pointerId?x[1]:x[0];return C[c.pointerId]}this.dollyIn=(n=J())=>{ue(n),e.update()},this.dollyOut=(n=J())=>{$(n),e.update()},this.getScale=()=>b,this.setScale=n=>{re(n),e.update()},this.getZoomScale=()=>J(),o!==void 0&&this.connect(o),this.update()}};const _t=new rt,Be=new A;class ut extends en{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type="LineSegmentsGeometry";const t=[-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],o=[-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],e=[0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5];this.setIndex(e),this.setAttribute("position",new vt(t,3)),this.setAttribute("uv",new vt(o,2))}applyMatrix4(t){const o=this.attributes.instanceStart,e=this.attributes.instanceEnd;return o!==void 0&&(o.applyMatrix4(t),e.applyMatrix4(t),o.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(t){let o;t instanceof Float32Array?o=t:Array.isArray(t)&&(o=new Float32Array(t));const e=new ot(o,6,1);return this.setAttribute("instanceStart",new xe(e,3,0)),this.setAttribute("instanceEnd",new xe(e,3,3)),this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(t,o=3){let e;t instanceof Float32Array?e=t:Array.isArray(t)&&(e=new Float32Array(t));const s=new ot(e,o*2,1);return this.setAttribute("instanceColorStart",new xe(s,o,0)),this.setAttribute("instanceColorEnd",new xe(s,o,o)),this}fromWireframeGeometry(t){return this.setPositions(t.attributes.position.array),this}fromEdgesGeometry(t){return this.setPositions(t.attributes.position.array),this}fromMesh(t){return this.fromWireframeGeometry(new tn(t.geometry)),this}fromLineSegments(t){const o=t.geometry;return this.setPositions(o.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new rt);const t=this.attributes.instanceStart,o=this.attributes.instanceEnd;t!==void 0&&o!==void 0&&(this.boundingBox.setFromBufferAttribute(t),_t.setFromBufferAttribute(o),this.boundingBox.union(_t))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Dt),this.boundingBox===null&&this.computeBoundingBox();const t=this.attributes.instanceStart,o=this.attributes.instanceEnd;if(t!==void 0&&o!==void 0){const e=this.boundingSphere.center;this.boundingBox.getCenter(e);let s=0;for(let r=0,f=t.count;r<f;r++)Be.fromBufferAttribute(t,r),s=Math.max(s,e.distanceToSquared(Be)),Be.fromBufferAttribute(o,r),s=Math.max(s,e.distanceToSquared(Be));this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&console.error("THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.",this)}}toJSON(){}applyMatrix(t){return console.warn("THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4()."),this.applyMatrix4(t)}}class Bt extends ut{constructor(){super(),this.isLineGeometry=!0,this.type="LineGeometry"}setPositions(t){const o=t.length-3,e=new Float32Array(2*o);for(let s=0;s<o;s+=3)e[2*s]=t[s],e[2*s+1]=t[s+1],e[2*s+2]=t[s+2],e[2*s+3]=t[s+3],e[2*s+4]=t[s+4],e[2*s+5]=t[s+5];return super.setPositions(e),this}setColors(t,o=3){const e=t.length-o,s=new Float32Array(2*e);if(o===3)for(let r=0;r<e;r+=o)s[2*r]=t[r],s[2*r+1]=t[r+1],s[2*r+2]=t[r+2],s[2*r+3]=t[r+3],s[2*r+4]=t[r+4],s[2*r+5]=t[r+5];else for(let r=0;r<e;r+=o)s[2*r]=t[r],s[2*r+1]=t[r+1],s[2*r+2]=t[r+2],s[2*r+3]=t[r+3],s[2*r+4]=t[r+4],s[2*r+5]=t[r+5],s[2*r+6]=t[r+6],s[2*r+7]=t[r+7];return super.setColors(s,o),this}fromLine(t){const o=t.geometry;return this.setPositions(o.attributes.position.array),this}}class ft extends Ct{constructor(t){super({type:"LineMaterial",uniforms:gt.clone(gt.merge([bt.common,bt.fog,{worldUnits:{value:1},linewidth:{value:1},resolution:{value:new F(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}}])),vertexShader:`
				#include <common>
				#include <fog_pars_vertex>
				#include <logdepthbuf_pars_vertex>
				#include <clipping_planes_pars_vertex>

				uniform float linewidth;
				uniform vec2 resolution;

				attribute vec3 instanceStart;
				attribute vec3 instanceEnd;

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
						attribute vec4 instanceColorStart;
						attribute vec4 instanceColorEnd;
					#else
						varying vec3 vLineColor;
						attribute vec3 instanceColorStart;
						attribute vec3 instanceColorEnd;
					#endif
				#endif

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#ifdef USE_DASH

					uniform float dashScale;
					attribute float instanceDistanceStart;
					attribute float instanceDistanceEnd;
					varying float vLineDistance;

				#endif

				void trimSegment( const in vec4 start, inout vec4 end ) {

					// trim end segment so it terminates between the camera plane and the near plane

					// conservative estimate of the near plane
					float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
					float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
					float nearEstimate = - 0.5 * b / a;

					float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

					end.xyz = mix( start.xyz, end.xyz, alpha );

				}

				void main() {

					#ifdef USE_COLOR

						vLineColor = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

					#endif

					#ifdef USE_DASH

						vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
						vUv = uv;

					#endif

					float aspect = resolution.x / resolution.y;

					// camera space
					vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
					vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

					#ifdef WORLD_UNITS

						worldStart = start.xyz;
						worldEnd = end.xyz;

					#else

						vUv = uv;

					#endif

					// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
					// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
					// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
					// perhaps there is a more elegant solution -- WestLangley

					bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

					if ( perspective ) {

						if ( start.z < 0.0 && end.z >= 0.0 ) {

							trimSegment( start, end );

						} else if ( end.z < 0.0 && start.z >= 0.0 ) {

							trimSegment( end, start );

						}

					}

					// clip space
					vec4 clipStart = projectionMatrix * start;
					vec4 clipEnd = projectionMatrix * end;

					// ndc space
					vec3 ndcStart = clipStart.xyz / clipStart.w;
					vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

					// direction
					vec2 dir = ndcEnd.xy - ndcStart.xy;

					// account for clip-space aspect ratio
					dir.x *= aspect;
					dir = normalize( dir );

					#ifdef WORLD_UNITS

						// get the offset direction as perpendicular to the view vector
						vec3 worldDir = normalize( end.xyz - start.xyz );
						vec3 offset;
						if ( position.y < 0.5 ) {

							offset = normalize( cross( start.xyz, worldDir ) );

						} else {

							offset = normalize( cross( end.xyz, worldDir ) );

						}

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						float forwardOffset = dot( worldDir, vec3( 0.0, 0.0, 1.0 ) );

						// don't extend the line if we're rendering dashes because we
						// won't be rendering the endcaps
						#ifndef USE_DASH

							// extend the line bounds to encompass  endcaps
							start.xyz += - worldDir * linewidth * 0.5;
							end.xyz += worldDir * linewidth * 0.5;

							// shift the position of the quad so it hugs the forward edge of the line
							offset.xy -= dir * forwardOffset;
							offset.z += 0.5;

						#endif

						// endcaps
						if ( position.y > 1.0 || position.y < 0.0 ) {

							offset.xy += dir * 2.0 * forwardOffset;

						}

						// adjust for linewidth
						offset *= linewidth * 0.5;

						// set the world position
						worldPos = ( position.y < 0.5 ) ? start : end;
						worldPos.xyz += offset;

						// project the worldpos
						vec4 clip = projectionMatrix * worldPos;

						// shift the depth of the projected points so the line
						// segments overlap neatly
						vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
						clip.z = clipPose.z * clip.w;

					#else

						vec2 offset = vec2( dir.y, - dir.x );
						// undo aspect ratio adjustment
						dir.x /= aspect;
						offset.x /= aspect;

						// sign flip
						if ( position.x < 0.0 ) offset *= - 1.0;

						// endcaps
						if ( position.y < 0.0 ) {

							offset += - dir;

						} else if ( position.y > 1.0 ) {

							offset += dir;

						}

						// adjust for linewidth
						offset *= linewidth;

						// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
						offset /= resolution.y;

						// select end
						vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

						// back to clip space
						offset *= clip.w;

						clip.xy += offset;

					#endif

					gl_Position = clip;

					vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

					#include <logdepthbuf_vertex>
					#include <clipping_planes_vertex>
					#include <fog_vertex>

				}
			`,fragmentShader:`
				uniform vec3 diffuse;
				uniform float opacity;
				uniform float linewidth;

				#ifdef USE_DASH

					uniform float dashOffset;
					uniform float dashSize;
					uniform float gapSize;

				#endif

				varying float vLineDistance;

				#ifdef WORLD_UNITS

					varying vec4 worldPos;
					varying vec3 worldStart;
					varying vec3 worldEnd;

					#ifdef USE_DASH

						varying vec2 vUv;

					#endif

				#else

					varying vec2 vUv;

				#endif

				#include <common>
				#include <fog_pars_fragment>
				#include <logdepthbuf_pars_fragment>
				#include <clipping_planes_pars_fragment>

				#ifdef USE_COLOR
					#ifdef USE_LINE_COLOR_ALPHA
						varying vec4 vLineColor;
					#else
						varying vec3 vLineColor;
					#endif
				#endif

				vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

					float mua;
					float mub;

					vec3 p13 = p1 - p3;
					vec3 p43 = p4 - p3;

					vec3 p21 = p2 - p1;

					float d1343 = dot( p13, p43 );
					float d4321 = dot( p43, p21 );
					float d1321 = dot( p13, p21 );
					float d4343 = dot( p43, p43 );
					float d2121 = dot( p21, p21 );

					float denom = d2121 * d4343 - d4321 * d4321;

					float numer = d1343 * d4321 - d1321 * d4343;

					mua = numer / denom;
					mua = clamp( mua, 0.0, 1.0 );
					mub = ( d1343 + d4321 * ( mua ) ) / d4343;
					mub = clamp( mub, 0.0, 1.0 );

					return vec2( mua, mub );

				}

				void main() {

					#include <clipping_planes_fragment>

					#ifdef USE_DASH

						if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

						if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

					#endif

					float alpha = opacity;

					#ifdef WORLD_UNITS

						// Find the closest points on the view ray and the line segment
						vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
						vec3 lineDir = worldEnd - worldStart;
						vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

						vec3 p1 = worldStart + lineDir * params.x;
						vec3 p2 = rayEnd * params.y;
						vec3 delta = p1 - p2;
						float len = length( delta );
						float norm = len / linewidth;

						#ifndef USE_DASH

							#ifdef USE_ALPHA_TO_COVERAGE

								float dnorm = fwidth( norm );
								alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

							#else

								if ( norm > 0.5 ) {

									discard;

								}

							#endif

						#endif

					#else

						#ifdef USE_ALPHA_TO_COVERAGE

							// artifacts appear on some hardware if a derivative is taken within a conditional
							float a = vUv.x;
							float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
							float len2 = a * a + b * b;
							float dlen = fwidth( len2 );

							if ( abs( vUv.y ) > 1.0 ) {

								alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

							}

						#else

							if ( abs( vUv.y ) > 1.0 ) {

								float a = vUv.x;
								float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
								float len2 = a * a + b * b;

								if ( len2 > 1.0 ) discard;

							}

						#endif

					#endif

					vec4 diffuseColor = vec4( diffuse, alpha );
					#ifdef USE_COLOR
						#ifdef USE_LINE_COLOR_ALPHA
							diffuseColor *= vLineColor;
						#else
							diffuseColor.rgb *= vLineColor;
						#endif
					#endif

					#include <logdepthbuf_fragment>

					gl_FragColor = diffuseColor;

					#include <tonemapping_fragment>
					#include <${It>=154?"colorspace_fragment":"encodings_fragment"}>
					#include <fog_fragment>
					#include <premultiplied_alpha_fragment>

				}
			`,clipping:!0}),this.isLineMaterial=!0,this.onBeforeCompile=function(){this.transparent?this.defines.USE_LINE_COLOR_ALPHA="1":delete this.defines.USE_LINE_COLOR_ALPHA},Object.defineProperties(this,{color:{enumerable:!0,get:function(){return this.uniforms.diffuse.value},set:function(o){this.uniforms.diffuse.value=o}},worldUnits:{enumerable:!0,get:function(){return"WORLD_UNITS"in this.defines},set:function(o){o===!0?this.defines.WORLD_UNITS="":delete this.defines.WORLD_UNITS}},linewidth:{enumerable:!0,get:function(){return this.uniforms.linewidth.value},set:function(o){this.uniforms.linewidth.value=o}},dashed:{enumerable:!0,get:function(){return"USE_DASH"in this.defines},set(o){!!o!="USE_DASH"in this.defines&&(this.needsUpdate=!0),o===!0?this.defines.USE_DASH="":delete this.defines.USE_DASH}},dashScale:{enumerable:!0,get:function(){return this.uniforms.dashScale.value},set:function(o){this.uniforms.dashScale.value=o}},dashSize:{enumerable:!0,get:function(){return this.uniforms.dashSize.value},set:function(o){this.uniforms.dashSize.value=o}},dashOffset:{enumerable:!0,get:function(){return this.uniforms.dashOffset.value},set:function(o){this.uniforms.dashOffset.value=o}},gapSize:{enumerable:!0,get:function(){return this.uniforms.gapSize.value},set:function(o){this.uniforms.gapSize.value=o}},opacity:{enumerable:!0,get:function(){return this.uniforms.opacity.value},set:function(o){this.uniforms.opacity.value=o}},resolution:{enumerable:!0,get:function(){return this.uniforms.resolution.value},set:function(o){this.uniforms.resolution.value.copy(o)}},alphaToCoverage:{enumerable:!0,get:function(){return"USE_ALPHA_TO_COVERAGE"in this.defines},set:function(o){!!o!="USE_ALPHA_TO_COVERAGE"in this.defines&&(this.needsUpdate=!0),o===!0?(this.defines.USE_ALPHA_TO_COVERAGE="",this.extensions.derivatives=!0):(delete this.defines.USE_ALPHA_TO_COVERAGE,this.extensions.derivatives=!1)}}}),this.setValues(t)}}const qe=new Se,At=new A,Ot=new A,U=new Se,I=new Se,K=new Se,Qe=new A,Je=new sn,N=new on,Lt=new A,He=new rt,We=new Dt,q=new Se;let Q,he;function Tt(i,t,o){return q.set(0,0,-t,1).applyMatrix4(i.projectionMatrix),q.multiplyScalar(1/q.w),q.x=he/o.width,q.y=he/o.height,q.applyMatrix4(i.projectionMatrixInverse),q.multiplyScalar(1/q.w),Math.abs(Math.max(q.x,q.y))}function An(i,t){const o=i.matrixWorld,e=i.geometry,s=e.attributes.instanceStart,r=e.attributes.instanceEnd,f=Math.min(e.instanceCount,s.count);for(let a=0,l=f;a<l;a++){N.start.fromBufferAttribute(s,a),N.end.fromBufferAttribute(r,a),N.applyMatrix4(o);const w=new A,d=new A;Q.distanceSqToSegment(N.start,N.end,d,w),d.distanceTo(w)<he*.5&&t.push({point:d,pointOnLine:w,distance:Q.origin.distanceTo(d),object:i,face:null,faceIndex:a,uv:null,[Nt]:null})}}function On(i,t,o){const e=t.projectionMatrix,r=i.material.resolution,f=i.matrixWorld,a=i.geometry,l=a.attributes.instanceStart,w=a.attributes.instanceEnd,d=Math.min(a.instanceCount,l.count),u=-t.near;Q.at(1,K),K.w=1,K.applyMatrix4(t.matrixWorldInverse),K.applyMatrix4(e),K.multiplyScalar(1/K.w),K.x*=r.x/2,K.y*=r.y/2,K.z=0,Qe.copy(K),Je.multiplyMatrices(t.matrixWorldInverse,f);for(let b=0,y=d;b<y;b++){if(U.fromBufferAttribute(l,b),I.fromBufferAttribute(w,b),U.w=1,I.w=1,U.applyMatrix4(Je),I.applyMatrix4(Je),U.z>u&&I.z>u)continue;if(U.z>u){const v=U.z-I.z,M=(U.z-u)/v;U.lerp(I,M)}else if(I.z>u){const v=I.z-U.z,M=(I.z-u)/v;I.lerp(U,M)}U.applyMatrix4(e),I.applyMatrix4(e),U.multiplyScalar(1/U.w),I.multiplyScalar(1/I.w),U.x*=r.x/2,U.y*=r.y/2,I.x*=r.x/2,I.y*=r.y/2,N.start.copy(U),N.start.z=0,N.end.copy(I),N.end.z=0;const j=N.closestPointToPointParameter(Qe,!0);N.at(j,Lt);const T=rn.lerp(U.z,I.z,j),O=T>=-1&&T<=1,D=Qe.distanceTo(Lt)<he*.5;if(O&&D){N.start.fromBufferAttribute(l,b),N.end.fromBufferAttribute(w,b),N.start.applyMatrix4(f),N.end.applyMatrix4(f);const v=new A,M=new A;Q.distanceSqToSegment(N.start,N.end,M,v),o.push({point:M,pointOnLine:v,distance:Q.origin.distanceTo(M),object:i,face:null,faceIndex:b,uv:null,[Nt]:null})}}}class Ht extends nn{constructor(t=new ut,o=new ft({color:Math.random()*16777215})){super(t,o),this.isLineSegments2=!0,this.type="LineSegments2"}computeLineDistances(){const t=this.geometry,o=t.attributes.instanceStart,e=t.attributes.instanceEnd,s=new Float32Array(2*o.count);for(let f=0,a=0,l=o.count;f<l;f++,a+=2)At.fromBufferAttribute(o,f),Ot.fromBufferAttribute(e,f),s[a]=a===0?0:s[a-1],s[a+1]=s[a]+At.distanceTo(Ot);const r=new ot(s,2,1);return t.setAttribute("instanceDistanceStart",new xe(r,1,0)),t.setAttribute("instanceDistanceEnd",new xe(r,1,1)),this}raycast(t,o){const e=this.material.worldUnits,s=t.camera;s===null&&!e&&console.error('LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.');const r=t.params.Line2!==void 0&&t.params.Line2.threshold||0;Q=t.ray;const f=this.matrixWorld,a=this.geometry,l=this.material;he=l.linewidth+r,a.boundingSphere===null&&a.computeBoundingSphere(),We.copy(a.boundingSphere).applyMatrix4(f);let w;if(e)w=he*.5;else{const u=Math.max(s.near,We.distanceToPoint(Q.origin));w=Tt(s,u,l.resolution)}if(We.radius+=w,Q.intersectsSphere(We)===!1)return;a.boundingBox===null&&a.computeBoundingBox(),He.copy(a.boundingBox).applyMatrix4(f);let d;if(e)d=he*.5;else{const u=Math.max(s.near,He.distanceToPoint(Q.origin));d=Tt(s,u,l.resolution)}He.expandByScalar(d),Q.intersectsBox(He)!==!1&&(e?An(this,o):On(this,s,o))}onBeforeRender(t){const o=this.material.uniforms;o&&o.resolution&&(t.getViewport(qe),this.material.uniforms.resolution.value.set(qe.z,qe.w))}}class Ln extends Ht{constructor(t=new Bt,o=new ft({color:Math.random()*16777215})){super(t,o),this.isLine2=!0,this.type="Line2"}}const io=h.forwardRef(function({points:t,color:o=16777215,vertexColors:e,linewidth:s,lineWidth:r,segments:f,dashed:a,...l},w){var d,u;const b=Y(O=>O.size),y=h.useMemo(()=>f?new Ht:new Ln,[f]),[S]=h.useState(()=>new ft),j=(e==null||(d=e[0])==null?void 0:d.length)===4?4:3,T=h.useMemo(()=>{const O=f?new ut:new Bt,D=t.map(v=>{const M=Array.isArray(v);return v instanceof A||v instanceof Se?[v.x,v.y,v.z]:v instanceof F?[v.x,v.y,0]:M&&v.length===3?[v[0],v[1],v[2]]:M&&v.length===2?[v[0],v[1],0]:v});if(O.setPositions(D.flat()),e){o=16777215;const v=e.map(M=>M instanceof zt?M.toArray():M);O.setColors(v.flat(),j)}return O},[t,f,e,j]);return h.useLayoutEffect(()=>{y.computeLineDistances()},[t,y]),h.useLayoutEffect(()=>{a?S.defines.USE_DASH="":delete S.defines.USE_DASH,S.needsUpdate=!0},[a,S]),h.useEffect(()=>()=>{T.dispose(),S.dispose()},[T]),h.createElement("primitive",Ee({object:y,ref:w},l),h.createElement("primitive",{object:T,attach:"geometry"}),h.createElement("primitive",Ee({object:S,attach:"material",color:o,vertexColors:!!e,resolution:[b.width,b.height],linewidth:(u=s??r)!==null&&u!==void 0?u:1,dashed:a,transparent:j===4},l)))}),et=i=>i===Object(i)&&!Array.isArray(i)&&typeof i!="function";function Wt(i,t){const o=Y(r=>r.gl),e=at(ct,et(i)?Object.values(i):i);return h.useLayoutEffect(()=>{t?.(e)},[t]),h.useEffect(()=>{if("initTexture"in o){let r=[];Array.isArray(e)?r=e:e instanceof yt?r=[e]:et(e)&&(r=Object.values(e)),r.forEach(f=>{f instanceof yt&&o.initTexture(f)})}},[o,e]),h.useMemo(()=>{if(et(i)){const r={};let f=0;for(const a in i)r[a]=e[f++];return r}else return e},[i,e])}Wt.preload=i=>at.preload(ct,i);Wt.clear=i=>at.clear(ct,i);const Tn=()=>parseInt(jt.replace(/\D+/g,"")),jn=Tn(),so=h.forwardRef(({makeDefault:i,camera:t,regress:o,domElement:e,enableDamping:s=!0,keyEvents:r=!1,onChange:f,onStart:a,onEnd:l,...w},d)=>{const u=Y(g=>g.invalidate),b=Y(g=>g.camera),y=Y(g=>g.gl),S=Y(g=>g.events),j=Y(g=>g.setEvents),T=Y(g=>g.set),O=Y(g=>g.get),D=Y(g=>g.performance),v=t||b,M=e||S.connected||y.domElement,_=h.useMemo(()=>new _n(v),[v]);return st(()=>{_.enabled&&_.update()},-1),h.useEffect(()=>(r&&_.connect(r===!0?M:r),_.connect(M),()=>void _.dispose()),[r,M,o,_,u]),h.useEffect(()=>{const g=L=>{u(),o&&D.regress(),f&&f(L)},se=L=>{a&&a(L)},W=L=>{l&&l(L)};return _.addEventListener("change",g),_.addEventListener("start",se),_.addEventListener("end",W),()=>{_.removeEventListener("start",se),_.removeEventListener("end",W),_.removeEventListener("change",g)}},[f,a,l,_,u,j]),h.useEffect(()=>{if(i){const g=O().controls;return T({controls:_}),()=>T({controls:g})}},[i,_]),h.createElement("primitive",Ee({ref:d,object:_,enableDamping:s},w))});class Dn extends Ct{constructor(){super({uniforms:{time:{value:0},fade:{value:1}},vertexShader:`
      uniform float time;
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 0.5);
        gl_PointSize = size * (30.0 / -mvPosition.z) * (3.0 + sin(time + 100.0));
        gl_Position = projectionMatrix * mvPosition;
      }`,fragmentShader:`
      uniform sampler2D pointTexture;
      uniform float fade;
      varying vec3 vColor;
      void main() {
        float opacity = 1.0;
        if (fade == 1.0) {
          float d = distance(gl_PointCoord, vec2(0.5, 0.5));
          opacity = 1.0 / (1.0 + exp(16.0 * (d - 0.25)));
        }
        gl_FragColor = vec4(vColor, opacity);

        #include <tonemapping_fragment>
	      #include <${jn>=154?"colorspace_fragment":"encodings_fragment"}>
      }`})}}const Cn=i=>new A().setFromSpherical(new nt(i,Math.acos(1-Math.random()*2),Math.random()*2*Math.PI)),ro=h.forwardRef(({radius:i=100,depth:t=50,count:o=5e3,saturation:e=0,factor:s=4,fade:r=!1,speed:f=1},a)=>{const l=h.useRef(),[w,d,u]=h.useMemo(()=>{const y=[],S=[],j=Array.from({length:o},()=>(.5+.5*Math.random())*s),T=new zt;let O=i+t;const D=t/o;for(let v=0;v<o;v++)O-=D*Math.random(),y.push(...Cn(O).toArray()),T.setHSL(v/o,e,.9),S.push(T.r,T.g,T.b);return[new Float32Array(y),new Float32Array(S),new Float32Array(j)]},[o,t,s,i,e]);st(y=>l.current&&(l.current.uniforms.time.value=y.clock.elapsedTime*f));const[b]=h.useState(()=>new Dn);return h.createElement("points",{ref:a},h.createElement("bufferGeometry",null,h.createElement("bufferAttribute",{attach:"attributes-position",args:[w,3]}),h.createElement("bufferAttribute",{attach:"attributes-color",args:[d,3]}),h.createElement("bufferAttribute",{attach:"attributes-size",args:[u,1]})),h.createElement("primitive",{ref:l,object:b,attach:"material",blending:an,"uniforms-fade-value":r,depthWrite:!1,transparent:!0,vertexColors:!0}))});var Ft={exports:{}},kt={},Vt={exports:{}},Yt={};/**
 * @license React
 * use-sync-external-store-shim.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var we=h;function zn(i,t){return i===t&&(i!==0||1/i===1/t)||i!==i&&t!==t}var Rn=typeof Object.is=="function"?Object.is:zn,Un=we.useState,In=we.useEffect,Nn=we.useLayoutEffect,Bn=we.useDebugValue;function Hn(i,t){var o=t(),e=Un({inst:{value:o,getSnapshot:t}}),s=e[0].inst,r=e[1];return Nn(function(){s.value=o,s.getSnapshot=t,tt(s)&&r({inst:s})},[i,o,t]),In(function(){return tt(s)&&r({inst:s}),i(function(){tt(s)&&r({inst:s})})},[i]),Bn(o),o}function tt(i){var t=i.getSnapshot;i=i.value;try{var o=t();return!Rn(i,o)}catch{return!0}}function Wn(i,t){return t()}var Fn=typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"?Wn:Hn;Yt.useSyncExternalStore=we.useSyncExternalStore!==void 0?we.useSyncExternalStore:Fn;Vt.exports=Yt;var kn=Vt.exports;/**
 * @license React
 * use-sync-external-store-shim/with-selector.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Fe=h,Vn=kn;function Yn(i,t){return i===t&&(i!==0||1/i===1/t)||i!==i&&t!==t}var $n=typeof Object.is=="function"?Object.is:Yn,Gn=Vn.useSyncExternalStore,Zn=Fe.useRef,Xn=Fe.useEffect,Kn=Fe.useMemo,qn=Fe.useDebugValue;kt.useSyncExternalStoreWithSelector=function(i,t,o,e,s){var r=Zn(null);if(r.current===null){var f={hasValue:!1,value:null};r.current=f}else f=r.current;r=Kn(function(){function l(y){if(!w){if(w=!0,d=y,y=e(y),s!==void 0&&f.hasValue){var S=f.value;if(s(S,y))return u=S}return u=y}if(S=u,$n(d,y))return S;var j=e(y);return s!==void 0&&s(S,j)?(d=y,S):(d=y,u=j)}var w=!1,d,u,b=o===void 0?null:o;return[function(){return l(t())},b===null?void 0:function(){return l(b())}]},[t,o,e,s]);var a=Gn(i,r[0],r[1]);return Xn(function(){f.hasValue=!0,f.value=a},[a]),qn(a),a};Ft.exports=kt;var ao=Ft.exports;export{no as H,io as L,so as O,ro as S,to as _,xt as c,Wt as u,ao as w};
