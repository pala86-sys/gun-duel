/**
 * 線上對戰 WebSocket 客戶端
 */

export class OnlineClient {
  constructor() {
    /** @type {WebSocket|null} */
    this.ws = null;
    /** @type {((state: object) => void)|null} */
    this.onState = null;
    /** @type {((msg: string) => void)|null} */
    this.onError = null;
    /** @type {((info: {lanIp?:string,port?:number}) => void)|null} */
    this.onJoined = null;
    this.connected = false;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('連線逾時（雲端免費方案可能正在喚醒，請等 30 秒再試）'));
        }
      }, 45000);

      this.ws = new WebSocket(url);
      this.ws.onopen = () => {
        clearTimeout(timeout);
        if (settled) return;
        settled = true;
        this.connected = true;
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error('無法連線伺服器'));
        }
      };
      this.ws.onclose = () => {
        this.connected = false;
      };
      this.ws.onmessage = (ev) => {
        let data;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (data.type === 'state' && this.onState) this.onState(data.state);
        if (data.type === 'joined' && this.onJoined) {
          this.onJoined({ lanIp: data.lanIp, port: data.port });
          if (data.state && this.onState) this.onState(data.state);
        }
        if (data.type === 'error' && this.onError) this.onError(data.message);
      };
    });
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== 1) {
      this.onError?.('尚未連線');
      return;
    }
    this.ws.send(JSON.stringify({ type, ...payload }));
  }

  create(mode, name, maxPlayers, aiCount) {
    this.send('create', { mode, name, maxPlayers, aiCount });
  }

  join(code, name) {
    this.send('join', { code, name });
  }

  start() {
    this.send('start');
  }

  pick(action) {
    this.send('pick', { action });
  }

  next() {
    this.send('next');
  }

  chCreate(name, playerCount, effectMode) {
    this.send('ch-create', { name, playerCount, effectMode });
  }

  chJoin(code, name) {
    this.send('ch-join', { code, name });
  }

  chStart() {
    this.send('ch-start');
  }

  chPick(spot) {
    this.send('ch-pick', { spot });
  }

  chPickGuard(spots) {
    this.send('ch-pick', { spots });
  }

  chNext() {
    this.send('ch-next');
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}
