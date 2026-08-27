"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ObdConnectionStatus =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "initializing"
  | "live"
  | "disconnected"
  | "unsupported"
  | "error";

type ObdMetrics = {
  speed: number | null;
  rpm: number | null;
  coolant: number | null;
  voltage: number | null;
};

type ObdCharacteristic = EventTarget & {
  value?: DataView;
  startNotifications: () => Promise<ObdCharacteristic>;
  stopNotifications?: () => Promise<ObdCharacteristic>;
  writeValue?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
};

type ObdService = {
  getCharacteristic: (uuid: number) => Promise<ObdCharacteristic>;
};

type ObdGattServer = {
  getPrimaryService: (uuid: number) => Promise<ObdService>;
};

type ObdDevice = EventTarget & {
  name?: string;
  gatt?: {
    connect: () => Promise<ObdGattServer>;
    disconnect: () => void;
  };
};

type BluetoothNavigator = Navigator & {
  bluetooth?: {
    requestDevice: (options: {
      acceptAllDevices: boolean;
      optionalServices: number[];
    }) => Promise<ObdDevice>;
  };
};

type PendingCommand = {
  session: number;
  command: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timer: number;
};

const SERVICE_UUID = 0xfff0;
const NOTIFY_UUID = 0xfff1;
const WRITE_UUID = 0xfff2;

const GATT_TIMEOUT = 10_000;
const WRITE_TIMEOUT = 4_000;
const COMMAND_TIMEOUT = 3_500;
const RESET_TIMEOUT = 8_000;
const ECU_SEARCH_TIMEOUT = 25_000;
const PID_COMMAND_GAP = 160;
const POLL_CYCLE_GAP = 220;

const EMPTY_METRICS: ObdMetrics = {
  speed: null,
  rpm: null,
  coolant: null,
  voltage: null,
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

class ObdStageError extends Error {
  readonly label: string;

  constructor(code: string, label: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ObdStageError";
    this.label = label;
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, code: string) {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(code)), milliseconds);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timer);
  });
}

function cleanResponse(response: string) {
  return response.replace(/\0/g, "").replace(/\s+/g, " ").trim();
}

function compactHex(response: string) {
  return response.toUpperCase().replace(/[^0-9A-F]/g, "");
}

function pidBytes(response: string, pid: string, count: number) {
  const compact = compactHex(response);
  const marker = `41${pid}`;
  const index = compact.lastIndexOf(marker);
  if (index < 0) return null;

  const payload = compact.slice(
    index + marker.length,
    index + marker.length + count * 2,
  );
  if (payload.length !== count * 2) return null;

  const bytes = Array.from({ length: count }, (_, byteIndex) =>
    Number.parseInt(payload.slice(byteIndex * 2, byteIndex * 2 + 2), 16),
  );
  return bytes.every(Number.isFinite) ? bytes : null;
}

function isElmFailure(response: string) {
  const upper = response.toUpperCase();
  return (
    upper.includes("UNABLE TO CONNECT") ||
    (upper.includes("BUS INIT") && upper.includes("ERROR")) ||
    upper.includes("BUS ERROR") ||
    upper.includes("CAN ERROR") ||
    upper.includes("STOPPED") ||
    upper.trim() === "?"
  );
}

function responseDetail(response: string) {
  return cleanResponse(response).slice(0, 100) || "EMPTY RESPONSE";
}

export function useObd2() {
  const [status, setStatus] = useState<ObdConnectionStatus>("idle");
  const [metrics, setMetrics] = useState<ObdMetrics>(EMPTY_METRICS);
  const [deviceName, setDeviceName] = useState("CARISTA OBD2");
  const [connectionLabel, setConnectionLabel] = useState("OBD2 STANDBY");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const sessionRef = useRef(0);
  const connectingRef = useRef(false);
  const deviceRef = useRef<ObdDevice | null>(null);
  const notifyRef = useRef<ObdCharacteristic | null>(null);
  const writeRef = useRef<ObdCharacteristic | null>(null);
  const disconnectHandlerRef = useRef<((event: Event) => void) | null>(null);
  const bufferRef = useRef("");
  const pendingRef = useRef<PendingCommand | null>(null);

  const handleNotification = useCallback((event: Event) => {
    if (event.target !== notifyRef.current) return;

    const value = (event.target as ObdCharacteristic).value;
    if (!value) return;

    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    bufferRef.current += new TextDecoder().decode(bytes).replace(/\0/g, "");

    let promptIndex = bufferRef.current.indexOf(">");
    while (promptIndex >= 0) {
      const frame = bufferRef.current.slice(0, promptIndex);
      bufferRef.current = bufferRef.current.slice(promptIndex + 1);

      const pending = pendingRef.current;
      if (pending && pending.session === sessionRef.current) {
        window.clearTimeout(pending.timer);
        pendingRef.current = null;
        pending.resolve(frame);
      }

      promptIndex = bufferRef.current.indexOf(">");
    }

    if (bufferRef.current.length > 8_192) {
      bufferRef.current = bufferRef.current.slice(-4_096);
    }
  }, []);

  const clearTransport = useCallback(
    (reason: string) => {
      sessionRef.current += 1;
      connectingRef.current = false;

      const pending = pendingRef.current;
      if (pending) {
        window.clearTimeout(pending.timer);
        pendingRef.current = null;
        pending.reject(new Error(reason));
      }

      const notify = notifyRef.current;
      if (notify) {
        notify.removeEventListener("characteristicvaluechanged", handleNotification);
        void notify.stopNotifications?.().catch(() => undefined);
      }

      const device = deviceRef.current;
      const disconnectHandler = disconnectHandlerRef.current;
      if (device && disconnectHandler) {
        device.removeEventListener("gattserverdisconnected", disconnectHandler);
      }

      try {
        device?.gatt?.disconnect();
      } catch {
        // The adapter may already be disconnected.
      }

      deviceRef.current = null;
      notifyRef.current = null;
      writeRef.current = null;
      disconnectHandlerRef.current = null;
      bufferRef.current = "";

      return sessionRef.current;
    },
    [handleNotification],
  );

  const setPhase = useCallback(
    (
      session: number,
      nextStatus: ObdConnectionStatus,
      label: string,
    ) => {
      if (session !== sessionRef.current) return false;
      setStatus(nextStatus);
      setConnectionLabel(label);
      return true;
    },
    [],
  );

  const sendCommand = useCallback(
    async (session: number, command: string, timeout = COMMAND_TIMEOUT) => {
      if (session !== sessionRef.current) {
        throw new Error("OBD_SESSION_ENDED");
      }
      if (pendingRef.current) {
        throw new Error("OBD_COMMAND_BUSY");
      }

      const characteristic = writeRef.current;
      if (!characteristic) {
        throw new Error("OBD_WRITE_UNAVAILABLE");
      }

      bufferRef.current = "";
      let resolveResponse!: (response: string) => void;
      let rejectResponse!: (error: Error) => void;
      const responsePromise = new Promise<string>((resolve, reject) => {
        resolveResponse = resolve;
        rejectResponse = reject;
      });
      void responsePromise.catch(() => undefined);

      const timer = window.setTimeout(() => {
        const pending = pendingRef.current;
        if (pending?.session === session && pending.command === command) {
          pendingRef.current = null;
          pending.reject(new Error(`OBD_TIMEOUT_${command}`));
        }
      }, timeout);

      pendingRef.current = {
        session,
        command,
        resolve: resolveResponse,
        reject: rejectResponse,
        timer,
      };

      const payload = new TextEncoder().encode(`${command}\r`);
      try {
        if (characteristic.writeValueWithoutResponse) {
          try {
            await withTimeout(
              characteristic.writeValueWithoutResponse(payload),
              WRITE_TIMEOUT,
              `OBD_WRITE_TIMEOUT_${command}`,
            );
          } catch (error) {
            if (
              error instanceof DOMException &&
              error.name === "NotSupportedError" &&
              characteristic.writeValue
            ) {
              await withTimeout(
                characteristic.writeValue(payload),
                WRITE_TIMEOUT,
                `OBD_WRITE_TIMEOUT_${command}`,
              );
            } else {
              throw error;
            }
          }
        } else if (characteristic.writeValue) {
          await withTimeout(
            characteristic.writeValue(payload),
            WRITE_TIMEOUT,
            `OBD_WRITE_TIMEOUT_${command}`,
          );
        } else {
          throw new Error("OBD_WRITE_UNAVAILABLE");
        }
      } catch (error) {
        const pending = pendingRef.current;
        if (pending?.session === session && pending.command === command) {
          window.clearTimeout(pending.timer);
          pendingRef.current = null;
          pending.reject(
            error instanceof Error ? error : new Error("OBD_WRITE_FAILED"),
          );
        }
        throw error;
      }

      return responsePromise;
    },
    [],
  );

  const initializeAdapter = useCallback(
    async (session: number) => {
      setPhase(session, "initializing", "CARISTA READY");

      const resetResponse = await sendCommand(session, "ATZ", RESET_TIMEOUT);
      if (isElmFailure(resetResponse)) {
        throw new ObdStageError(
          "CARISTA_RESET_FAILED",
          "CARISTA RESET FAILED - TAP OBD2",
          responseDetail(resetResponse),
        );
      }
      await wait(750);

      // Keep initialization minimal. The response parser already tolerates
      // linefeeds, spaces, and headers, so those optional ELM commands are not
      // allowed to block a valid CARISTA connection.
      const setupCommands = ["ATE0", "ATSP0"];
      for (const command of setupCommands) {
        if (session !== sessionRef.current) throw new Error("OBD_SESSION_ENDED");
        const response = await sendCommand(session, command);
        if (isElmFailure(response) || !response.toUpperCase().includes("OK")) {
          throw new ObdStageError(
            `CARISTA_SETUP_FAILED_${command}`,
            "CARISTA SETUP FAILED - TAP OBD2",
            responseDetail(response),
          );
        }
      }

      setPhase(session, "initializing", "SEARCHING TANTO ECU");
      // The original working flow did not reject a prompt-terminated NO DATA
      // response here. Some vehicles answer the live PIDs even when the broad
      // supported-PID query is inconclusive, so continue into direct polling.
      await sendCommand(session, "0100", ECU_SEARCH_TIMEOUT);
      setPhase(session, "connected", "READING TANTO DATA");
    },
    [sendCommand, setPhase],
  );

  const markVehicleData = useCallback(
    (session: number, patch: Partial<ObdMetrics>) => {
      if (session !== sessionRef.current) return;
      setMetrics((current) => ({ ...current, ...patch }));
      setStatus("live");
      setConnectionLabel("TANTO LIVE DATA");
      setErrorMessage(null);
      setLastUpdatedAt(Date.now());
    },
    [],
  );

  const pollVehicle = useCallback(
    async (session: number) => {
      let cycle = 0;
      let missedCoreCycles = 0;

      try {
        while (session === sessionRef.current) {
          const patch: Partial<ObdMetrics> = {};
          let receivedVehiclePid = false;

          const speedResponse = await sendCommand(session, "010D");
          const speed = pidBytes(speedResponse, "0D", 1);
          if (speed) {
            patch.speed = speed[0];
            receivedVehiclePid = true;
          } else if (isElmFailure(speedResponse)) {
            throw new Error(`ELM_STOPPED_010D:${responseDetail(speedResponse)}`);
          }

          await wait(PID_COMMAND_GAP);

          const rpmResponse = await sendCommand(session, "010C");
          const rpm = pidBytes(rpmResponse, "0C", 2);
          if (rpm) {
            patch.rpm = Math.round((rpm[0] * 256 + rpm[1]) / 4);
            receivedVehiclePid = true;
          } else if (isElmFailure(rpmResponse)) {
            throw new Error(`ELM_STOPPED_010C:${responseDetail(rpmResponse)}`);
          }

          cycle += 1;
          if (cycle === 1 || cycle % 6 === 0) {
            await wait(PID_COMMAND_GAP);
            const coolantResponse = await sendCommand(session, "0105");
            const coolant = pidBytes(coolantResponse, "05", 1);
            if (coolant) {
              patch.coolant = coolant[0] - 40;
              receivedVehiclePid = true;
            } else if (isElmFailure(coolantResponse)) {
              throw new Error(`ELM_STOPPED_0105:${responseDetail(coolantResponse)}`);
            }

            await wait(PID_COMMAND_GAP);
            const voltageResponse = await sendCommand(session, "ATRV");
            const voltage = voltageResponse.match(/(\d+(?:\.\d+)?)\s*V/i);
            if (voltage) patch.voltage = Number.parseFloat(voltage[1]);
            if (isElmFailure(voltageResponse)) {
              throw new Error(`ELM_STOPPED_ATRV:${responseDetail(voltageResponse)}`);
            }
          }

          if (receivedVehiclePid) {
            missedCoreCycles = 0;
            markVehicleData(session, patch);
          } else {
            missedCoreCycles += 1;
            if (Object.keys(patch).length > 0 && session === sessionRef.current) {
              setMetrics((current) => ({ ...current, ...patch }));
            }
            if (missedCoreCycles >= 3) {
              setPhase(session, "connected", "WAITING FOR TANTO DATA");
            }
          }

          await wait(POLL_CYCLE_GAP);
        }
      } catch (error) {
        if (session !== sessionRef.current) return;
        clearTransport("OBD_DATA_SESSION_ENDED");
        setStatus("error");
        setConnectionLabel("VEHICLE DATA LOST - TAP OBD2");
        setErrorMessage(
          error instanceof Error ? error.message : "OBD_POLLING_FAILED",
        );
      }
    },
    [clearTransport, markVehicleData, sendCommand, setPhase],
  );

  const connect = useCallback(async () => {
    const bluetooth = (navigator as BluetoothNavigator).bluetooth;
    if (!bluetooth) {
      setStatus("unsupported");
      setConnectionLabel("CHROME BLUETOOTH UNAVAILABLE");
      setErrorMessage("WEB_BLUETOOTH_UNSUPPORTED");
      return;
    }

    if (connectingRef.current) return;

    const session = clearTransport("OBD_RECONNECTING");
    connectingRef.current = true;

    let selection: Promise<ObdDevice>;
    try {
      selection = bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      });
    } catch (error) {
      connectingRef.current = false;
      setStatus("error");
      setConnectionLabel("BLUETOOTH REQUEST FAILED - TAP OBD2");
      setErrorMessage(
        error instanceof Error ? error.message : "BLUETOOTH_REQUEST_FAILED",
      );
      return;
    }

    setMetrics(EMPTY_METRICS);
    setLastUpdatedAt(null);
    setStatus("requesting");
    setConnectionLabel("SELECT CARISTA");
    setErrorMessage(null);

    try {
      const device = await selection;
      if (session !== sessionRef.current) return;
      if (!device.gatt) {
        throw new ObdStageError(
          "BLUETOOTH_GATT_UNAVAILABLE",
          "CARISTA GATT UNAVAILABLE - TAP OBD2",
        );
      }

      deviceRef.current = device;
      setDeviceName(device.name || "CARISTA OBD2");
      setPhase(session, "connecting", "BLUETOOTH CONNECTING");

      const handleDisconnect = () => {
        if (session !== sessionRef.current) return;
        clearTransport("BLUETOOTH_DISCONNECTED");
        setStatus("disconnected");
        setConnectionLabel("CARISTA DISCONNECTED - TAP OBD2");
        setErrorMessage("BLUETOOTH_DISCONNECTED");
      };
      disconnectHandlerRef.current = handleDisconnect;
      device.addEventListener("gattserverdisconnected", handleDisconnect);

      const server = await withTimeout(
        device.gatt.connect(),
        GATT_TIMEOUT,
        "BLUETOOTH_CONNECT_TIMEOUT",
      );
      if (session !== sessionRef.current) return;

      setPhase(session, "connecting", "CARISTA SERVICE");
      const service = await withTimeout(
        server.getPrimaryService(SERVICE_UUID),
        GATT_TIMEOUT,
        "CARISTA_SERVICE_TIMEOUT",
      );
      if (session !== sessionRef.current) return;

      setPhase(session, "connecting", "CARISTA NOTIFY");
      const notify = await withTimeout(
        service.getCharacteristic(NOTIFY_UUID),
        GATT_TIMEOUT,
        "CARISTA_NOTIFY_CHARACTERISTIC_TIMEOUT",
      );
      const write = await withTimeout(
        service.getCharacteristic(WRITE_UUID),
        GATT_TIMEOUT,
        "CARISTA_WRITE_CHARACTERISTIC_TIMEOUT",
      );
      if (session !== sessionRef.current) return;

      notifyRef.current = notify;
      writeRef.current = write;
      notify.addEventListener("characteristicvaluechanged", handleNotification);
      await withTimeout(
        notify.startNotifications(),
        GATT_TIMEOUT,
        "CARISTA_NOTIFY_START_TIMEOUT",
      );
      if (session !== sessionRef.current) return;

      await wait(300);
      if (session !== sessionRef.current) return;

      setPhase(session, "connected", "CARISTA READY");
      await initializeAdapter(session);
      if (session !== sessionRef.current) return;

      connectingRef.current = false;
      void pollVehicle(session);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        if (session === sessionRef.current) {
          clearTransport("BLUETOOTH_SELECTION_CANCELLED");
          setStatus("idle");
          setConnectionLabel("OBD2 STANDBY");
          setErrorMessage(null);
        }
        return;
      }
      if (session !== sessionRef.current) return;

      const label =
        error instanceof ObdStageError
          ? error.label
          : error instanceof Error && error.message.includes("SERVICE")
            ? "CARISTA SERVICE FAILED - TAP OBD2"
            : error instanceof Error && error.message.includes("NOTIFY")
              ? "CARISTA NOTIFY FAILED - TAP OBD2"
              : error instanceof Error && error.message.includes("WRITE")
                ? "CARISTA WRITE FAILED - TAP OBD2"
                : error instanceof Error && error.message.includes("ATZ")
                  ? "CARISTA RESET TIMEOUT - TAP OBD2"
                  : error instanceof Error && error.message.includes("0100")
                    ? "TANTO ECU TIMEOUT - TAP OBD2"
                    : "CARISTA CONNECTION FAILED - TAP OBD2";

      clearTransport("OBD_CONNECTION_ABORTED");
      setStatus("error");
      setConnectionLabel(label);
      setErrorMessage(
        error instanceof Error ? error.message : "OBD_CONNECTION_FAILED",
      );
    } finally {
      connectingRef.current = false;
    }
  }, [
    clearTransport,
    handleNotification,
    initializeAdapter,
    pollVehicle,
    setPhase,
  ]);

  const disconnect = useCallback(() => {
    clearTransport("OBD_DISCONNECTED");
    setStatus("disconnected");
    setConnectionLabel("OBD2 DISCONNECTED");
    setErrorMessage(null);
  }, [clearTransport]);

  useEffect(
    () => () => {
      clearTransport("OBD_UNMOUNTED");
    },
    [clearTransport],
  );

  return {
    status,
    metrics,
    deviceName,
    connectionLabel,
    errorMessage,
    lastUpdatedAt,
    connect,
    disconnect,
  };
}
