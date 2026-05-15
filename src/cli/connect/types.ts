export type ConnectOptions = {
  dryRun: boolean;
  force: boolean;
};

export type ConnectAdapter = {
  name: string;
  displayName: string;
  docs?: string;
  detect(): boolean;
  install(opts: ConnectOptions): Promise<ConnectResult>;
};

export type ConnectResult =
  | { kind: "installed"; mutatedPath?: string; backupPath?: string }
  | { kind: "already-wired"; mutatedPath?: string }
  | { kind: "stub"; reason: string }
  | { kind: "skipped"; reason: string };
