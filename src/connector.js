const CONNECTION_TARGETS = [
  {
    name: "This PC",
    url: "ws://127.0.0.1:49001/ws"
  },
  {
    name: "AviMap Companion",
    url: "ws://avimap.local:49001/ws"
  }
];

export class Connector {
  constructor({ onState, onPosition, onError, onTarget }) {
    this.onState = onState;
    this.onPosition = onPosition;
    this.onError = onError;
    this.onTarget = onTarget;

    this.ws = null;
    this.timer = null;
    this.telemetryTimer = null;
    this.closedByUser = false;
    this.targetIndex = 0;
    this.lastTelemetryAt = 0;
    this.attemptNumber = 0;
  }

  connect() {
    this.closedByUser = false;
    this.targetIndex = 0;
    this.attemptNumber = 0;
    this.tryNextTarget();
  }

  tryNextTarget() {
    if (this.closedByUser) return;

    const target = CONNECTION_TARGETS[this.targetIndex];
    if (!target) {
      this.onState("UNAVAILABLE");
      this.scheduleRetry();
      return;
    }

    this.onState("CONNECTING");
    this.onTarget?.(target.name);

    try {
      this.ws?.close();
      this.ws = new WebSocket(target.url);
    } catch (error) {
      this.failAttempt(error);
      return;
    }

    let opened = false;

    this.ws.addEventListener("open", () => {
      opened = true;
      this.attemptNumber = 0;
      this.lastTelemetryAt = Date.now();
      this.onState("CONNECTED");
      this.startTelemetryWatch();
    });

    this.ws.addEventListener("message", event => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "telemetry") {
          this.lastTelemetryAt = Date.now();
          this.onPosition(message.data);
        }

        if (message.type === "status") {
          this.onState(message.state);
        }
      } catch (error) {
        this.onError?.(error);
      }
    });

    this.ws.addEventListener("error", () => {
      if (!this.closedByUser && !opened) {
        this.failAttempt(new Error(`Unable to connect to ${target.name}`));
      }
    });

    this.ws.addEventListener("close", () => {
      this.stopTelemetryWatch();

      if (this.closedByUser) return;

      this.onState("DISCONNECTED");

      if (!opened) {
        this.targetIndex += 1;
        if (this.targetIndex < CONNECTION_TARGETS.length) {
          setTimeout(() => this.tryNextTarget(), 250);
        } else {
          this.scheduleRetry();
        }
      } else {
        this.scheduleRetry();
      }
    });
  }

  startTelemetryWatch() {
    this.stopTelemetryWatch();

    this.telemetryTimer = setInterval(() => {
      if (Date.now() - this.lastTelemetryAt > 2500) {
        this.onState("CONNECTED_WAITING");
      }
    }, 1000);
  }

  stopTelemetryWatch() {
    clearInterval(this.telemetryTimer);
    this.telemetryTimer = null;
  }

  scheduleRetry() {
    clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      this.targetIndex = 0;
      this.attemptNumber += 1;
      this.tryNextTarget();
    }, 3000);
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.timer);
    this.stopTelemetryWatch();
    this.ws?.close();
  }

  failAttempt(error) {
    this.onError?.(error);
    this.onState("UNAVAILABLE");

    this.targetIndex += 1;

    if (this.targetIndex < CONNECTION_TARGETS.length) {
      setTimeout(() => this.tryNextTarget(), 250);
    } else {
      this.scheduleRetry();
    }
  }
}

export { CONNECTION_TARGETS };
