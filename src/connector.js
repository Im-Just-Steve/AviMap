const WS_URL = "ws://127.0.0.1:49001/ws";

export class Connector {
  constructor({ onState, onPosition, onError }) {
    this.onState = onState;
    this.onPosition = onPosition;
    this.onError = onError;
    this.ws = null;
    this.timer = null;
    this.closedByUser = false;
  }

  connect() {
    this.closedByUser = false;
    this.onState("CONNECTING");

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (error) {
      this.fail(error);
      return;
    }

    this.ws.addEventListener("open", () => this.onState("CONNECTED"));
    this.ws.addEventListener("message", event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "telemetry") this.onPosition(message.data);
        if (message.type === "status") this.onState(message.state);
      } catch (error) {
        this.onError?.(error);
      }
    });
    this.ws.addEventListener("error", () => {
      if (!this.closedByUser) this.onState("UNAVAILABLE");
    });
    this.ws.addEventListener("close", () => {
      if (this.closedByUser) return;
      this.onState("DISCONNECTED");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.connect(), 3000);
    });
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }

  fail(error) {
    this.onError?.(error);
    this.onState("UNAVAILABLE");
  }
}
