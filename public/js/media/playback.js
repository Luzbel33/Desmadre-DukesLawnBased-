// Shared-time playback logic, isolated from DOM/Three for deterministic tests.
import { mediaPosition, clamp01, youtubeError } from './youtube.js';
export class MediaPlayback {
  constructor({screenId, now=()=>Date.now(), send=()=>{}, changed=()=>{}}) {
    this.id=screenId;this.now=now;this.send=send;this.changed=changed;
    this.state={cur:null,queue:[]};this.player=null;this.loadedKey=null;
    this.blocked=false;this.error='';this.wasActive=false;this.lastVolume=-1;
    this.lastCorrection=-Infinity;this.lastPlay=-Infinity;this.endedKey=null;this.metaKey=null;
    this.active=false;this.volume=0;this.suspended=false;
  }
  setState(st) {
    const old=this.key();this.state=st||{cur:null,queue:[]};
    if(old!==this.key()){this.error='';this.blocked=false;this.endedKey=null;this.metaKey=null;}
    this.lastCorrection=-Infinity;this.lastPlay=-Infinity;this.changed(this);
  }
  key(){const c=this.state.cur;return c ? `${c.v}:${c.playId||'legacy'}` : null;}
  attach(player){this.player=player;this.loadedKey=null;this.lastVolume=-1;this.lastCorrection=-Infinity;}
  detach(){this.player=null;this.loadedKey=null;this.wasActive=false;}
  onAutoplayBlocked(){this.blocked=true;this.changed(this);}
  onError(code){this.error=youtubeError(code);this.changed(this); /* never skip a shared queue due to one client's error */}
  onPlayerState(code){
    if(code===1 && this.blocked){this.blocked=false;this.changed(this);}
    const c=this.state.cur,p=this.player;
    if(code===0 && c && this.loadedKey===this.key() && !c.paused && this.endedKey!==this.key()) {
      // Ignore stale 'ended' events following stopVideo or a video switch.
      const data=p?.getVideoData?.(),duration=p?.getDuration?.()||0;
      if(data?.video_id===c.v && duration>0 && (p.getCurrentTime?.()||0)>=duration-2){
        this.endedKey=this.key();this.send({t:'media',s:this.id,a:'ended',v:c.v,playId:c.playId});
      }
    }
  }
  unlock(){
    this.blocked=false;this.error='';this.lastPlay=-Infinity;this.changed(this);
    if(this.player && this.state.cur){
      try {
        this.player.unMute();
        // Inactive screens must not start audibly on a general page click.
        if(this.active && !this.state.cur.paused){this.player.playVideo();this.lastPlay=this.now();}
      }catch{}
    }
  }
  tick({active=false,volume=0}={}) {
    this.active=active;this.volume=clamp01(volume);
    const p=this.player,c=this.state.cur;if(!p)return;
    try {
      const v=Math.round(this.volume*100);
      if(v!==this.lastVolume){p.setVolume(v);this.lastVolume=v;}
      if(!c){if(this.loadedKey){this.loadedKey=null;p.stopVideo();}this.wasActive=false;return;}
      if(!active){if(this.wasActive)p.pauseVideo();this.wasActive=false;return;}
      if(this.error)return;
      const now=this.now(), key=this.key(), wanted=mediaPosition(c,now);
      const future=!c.paused && Number.isFinite(c.start) && now<c.start;
      const pause=!!c.paused||future;
      if(this.loadedKey!==key){
        this.loadedKey=key;this.lastCorrection=now;this.lastPlay=now;
        const arg={videoId:c.v,startSeconds:wanted};
        if(pause || this.blocked)p.cueVideoById(arg);else p.loadVideoById(arg);
        this.wasActive=true;return;
      }
      // After a blocked autoplay, wait for a real click instead of retrying every frame.
      if(this.blocked){this.wasActive=true;return;}
      const current=p.getCurrentTime()||0, code=p.getPlayerState();
      const cameBack=!this.wasActive;this.wasActive=true;let sought=false;
      if((cameBack || now-this.lastCorrection>2500) && Math.abs(current-wanted)>(pause ? 0.4 : 2.5)){
        p.seekTo(wanted,true);this.lastCorrection=now;sought=true;
      }
      if(pause){if(code===1||code===3||sought)p.pauseVideo();}
      else if(code!==1&&code!==3&&(cameBack||now-this.lastPlay>1800)){
        p.playVideo();this.lastPlay=now;
      }
      if(this.metaKey!==key && (code===1||code===2||code===5)){
        const data=p.getVideoData?.(),d=p.getDuration?.();
        if(data?.video_id===c.v && Number.isFinite(d)&&d>0){
          this.metaKey=key;this.send({t:'media',s:this.id,a:'dur',v:c.v,playId:c.playId,d,title:String(data.title||c.v).slice(0,120)});
        }
      }
    }catch(e){this.error='El reproductor dejó de responder. Usá «Reintentar YouTube».';this.changed(this);}
  }
}
