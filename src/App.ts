import path from 'path';
import os from 'os';
import fs from 'fs';
import yargs from 'yargs';
import readline from 'readline';
import { Logger } from './Logger';
import { api, ApiError, discovery } from 'node-hue-api';
import { BridgeDiscoveryResponse, DiscoveryBridgeDescription } from 'node-hue-api/dist/esm/api/discovery/discoveryTypes';
import { CreatedUser } from 'node-hue-api/dist/esm/api/http/endpoints/configuration';

export class App {
  private readonly logger: Logger;
  private readonly configDir: string;
  private readonly configPath: string;

  public constructor() {
    this.logger = Logger.Internal;
    this.configDir = path.join(os.homedir(), '.hue-backup-service');
    this.configPath = path.join(this.configDir, 'config.json');
  }

  public static async Run(): Promise<void> {
    const app = new App();
    await app.Run();
  }

  private async Run(): Promise<void> {
    await this.CollectArguments();

    const config = await this.CollectConfiguration();

    if (config === null) {
      return;
    }

    await this.CreateBackup(config);
  }

  private async CollectConfiguration(): Promise<HueBackupServiceConfiguration | null> {
    let config: HueBackupServiceConfiguration | null = null;
    if (fs.existsSync(this.configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(this.configPath, { encoding: 'utf8' }));
      } catch (err) {
        this.logger.error('There was a problem reading your config.json file.');
        this.logger.error('Please try pasting your config.json file here to validate it: http://jsonlint.com');
        this.logger.error('');
        throw err;
      }
    } else {
      this.logger.debug(`Configuration file (${this.configPath}) not found`);
    }

    if (!config?.ipAddress) {
      this.logger.info('No Hue bridge configured. Discovering Hue bridge..');
      const bridge = await this.Discover();
      if (bridge) {
        this.logger.info(`Found Hue bridge: ${bridge.name ?? bridge.ipAddress}`);

        config = {
          ...bridge,
          userName: null,
        };

        this.WriteConfiguration(config);
      } else {
        return null;
      }
    } else {
      this.logger.info(`Using configured bridge: ${config.name ?? config.ipAddress}`);
    }

    if (!config.userName) {
      this.logger.debug('Configuration has no credentials');
      this.logger.info('The Hue Backup service is not authenticated yet. To do so, please press the link button on your hue bridge.');
      await this.Prompt('If you have pressed the link button, press any key to continue..');

      if (!await this.createUser(config)) {
        return null;
      }
      this.logger.info('Successfully authenticated with the hue bridge');
    } else {
      this.logger.debug(`Using stored credentials: ${config.userName}`);
    }

    return config;
  }

  private async Discover(): Promise<HueDiscoveryResponse | null> {
    const strategies: Array<() => Promise<HueDiscoveryResponse | null>> = [
      () => {
        this.logger.debug('Attempting first discovery via NUPNP');
        return this.DiscoverNupnp();
      },
      () => {
        this.logger.debug('Attempting second discovery via MDNS');
        return this.DiscoverMdns();
      },
    ];

    const capturedErrors: Array<Error> = [];
    let response: HueDiscoveryResponse | null = null;

    for (const strategy of strategies) {
      try {
        response = await strategy();
      } catch (error) {
        const capturedError = error instanceof Error ? error : new Error(String(error));
        this.logger.debug(capturedError.message);
        capturedErrors.push(capturedError);
      }

      if (response) {
        return response;
      }
    }

    if (!response) {
      this.logger.error('Could not find any Hue bridges');
    }

    if (capturedErrors.length > 0) {
      this.logger.error('Additional errors:');
    }

    for (const error of capturedErrors) {
      this.logger.error('');
      this.logger.error(error.stack ?? error.message);
    }

    return null;
  }

  private async DiscoverNupnp(): Promise<HueDiscoveryResponse | null> {
    const results: BridgeDiscoveryResponse[] = await discovery.nupnpSearch();
    const bridge = this.CollectBridgeDiscoveryResult(results);
    if (!bridge) {
      return null;
    }

    if (bridge.error) {
      throw new Error(`Found bridge, but could not connect to it
${bridge}`);
    }

    const response: HueDiscoveryResponse = {
      ipAddress: bridge.ipaddress,
      name: bridge.config?.name ?? null,
      additionalInfo: bridge.config,
    };

    return response;
  }

  private async DiscoverMdns(): Promise<HueDiscoveryResponse | null> {
    const results: DiscoveryBridgeDescription[] = await discovery.mdnsSearch();
    const bridge = this.CollectBridgeDiscoveryResult(results);
    if (!bridge) {
      return null;
    }

    if (!bridge.ipaddress) {
      throw new Error(`Did not get ip address from discovered bridge
${bridge}`);
    }

    const response: HueDiscoveryResponse = {
      ipAddress: bridge.ipaddress,
      name: bridge.name ?? null,
      additionalInfo: bridge,
    };

    return response;
  }

  private CollectBridgeDiscoveryResult<T>(results: Array<T>) : T | null {
    if (results.length === 0) {
      this.logger.debug('Could not find any Hue bridges');
      return null;
    }

    if (results.length > 1) {
      this.logger.error(`Found multiple Hue bridges. This is currently not supported.
As a workaround you can edit the config.json manually.`);
      return null;
    }

    const bridge = results[0];
    return bridge;
  }

  private async createUser(config: HueBackupServiceConfiguration): Promise<boolean> {
    const unauthenticatedApi = await api.createLocal(config.ipAddress).connect();
    const appName = 'hue-backup-service';
    const deviceName = os.hostname();

    let createdUser: CreatedUser;
    try {
      this.logger.debug('Creating user on hue bridge');
      createdUser = await unauthenticatedApi.users.createUser(appName, deviceName);
      this.logger.debug(`Created user: ${createdUser.username}`);

      config.userName = createdUser.username;
      this.WriteConfiguration(config);
      return true;
    } catch (err: unknown) {
      if (err instanceof ApiError && err.getHueErrorType() === 101) {
        this.logger.error('The Link button on the bridge was not pressed. Please press the Link button and try again.');
      } else {
        throw err;
      }
    }

    return false;
  }

  private async CreateBackup(config: HueBackupServiceConfiguration): Promise<void> {
    const backupsDir = path.join(this.configDir, 'backups');
    const folderName = App.GetUniqueFolderName();
    const backupDir = path.join(backupsDir, folderName);
    this.EnsureDirectory(backupDir);

    const hueApi = await api.createLocal(config.ipAddress).connect(config.userName!);
    const hueConfig = await hueApi.configuration.getAll();
    const json = App.FormatJson(hueConfig);

    const backupPath = path.join(backupDir, 'config.json');
    this.logger.debug(`Writing file: ${backupPath}`);
    fs.writeFileSync(backupPath, json, { encoding: 'utf8' });
    this.logger.info(`Successfully created backup: ${backupPath}`);
  }

  private WriteConfiguration(config: HueBackupServiceConfiguration) {
    this.EnsureDirectory(this.configDir);
    const json = App.FormatJson(config);
    this.logger.debug(`Writing file: ${this.configPath}`);
    fs.writeFileSync(this.configPath, json, { encoding: 'utf8' });
  }

  private async CollectArguments(): Promise<void> {
    const argv = await yargs
      .options({
        verbose: {
          alias: 'v',
          type: 'boolean',
          description: 'Run with verbose logging',
        },
      })
      .argv;

    if (argv.verbose) {
      Logger.setDebugEnabled(true);
    }
  }

  private EnsureDirectory(directory: string): void {
    if (!fs.existsSync(directory)) {
      this.logger.debug(`Creating directory: ${directory}`);
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  private Prompt(query: string): Promise<string> {
    const queryMessage = this.logger.FormatMessage(query);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise(resolve => rl.question(queryMessage, ans => {
      rl.close();
      resolve(ans);
    }));
  }

  private static FormatJson(object: unknown): string {
    const json = JSON.stringify(object, null, 4);
    return json;
  }

  private static GetUniqueFolderName(): string {
    const date = new Date();
    const year = `${date.getUTCFullYear()}`;
    const month = `0${(date.getUTCMonth() + 1)}`.slice(-2);
    const day = `0${(date.getUTCDate())}`.slice(-2);
    const hour = `0${(date.getUTCHours())}`.slice(-2);
    const minute = `0${(date.getUTCMinutes())}`.slice(-2);
    const second = `0${(date.getUTCSeconds())}`.slice(-2);
    const millisecond = `00${(date.getUTCMilliseconds())}`.slice(-3);
    const folderName = `${year}-${month}-${day}_${hour}-${minute}-${second}.${millisecond}`;
    return folderName;
  }
}

interface HueDiscoveryResponse {
  ipAddress: string;
  name: string | null;
  additionalInfo: unknown;
}

interface HueBackupServiceConfiguration extends HueDiscoveryResponse {
  userName: string | null;
}