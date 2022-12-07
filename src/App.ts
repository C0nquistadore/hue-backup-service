import path from 'path';
import os from 'os';
import fs from 'fs';
import { Logger } from './Logger';
import { discovery } from 'node-hue-api';
import { BridgeDiscoveryResponse, DiscoveryBridgeDescription } from 'node-hue-api/dist/esm/api/discovery/discoveryTypes';
import yargs from 'yargs';

export class App {
  private readonly logger: Logger;

  public constructor() {
    this.logger = Logger.Internal;
  }

  public static async Run(): Promise<void> {
    const app = new App();
    await app.Run();
  }

  private async Run(): Promise<void> {
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

    const configPath = path.join(path.join(os.homedir(), '.hue-backup-service'), 'config.json');
    let config: HueBackupServiceConfiguration | null = null;
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, { encoding: 'utf8' }));
      } catch (err) {
        this.logger.error('There was a problem reading your config.json file.');
        this.logger.error('Please try pasting your config.json file here to validate it: http://jsonlint.com');
        this.logger.error('');
        throw err;
      }
    } else {
      this.logger.debug(`Configuration file (${configPath}) not found`);
    }

    if (!config?.ipAddress) {
      this.logger.info('No Hue bridge configured. Discovering Hue bridge..');
      const bridge = await this.Discover();
      if (bridge) {
        this.logger.info(`Found Hue bridge: ${bridge.name ?? bridge.ipAddress}`);

        config = bridge;

        const json = JSON.stringify(config);
        fs.writeFileSync(configPath, json, { encoding: 'utf8' });
      }
    } else {
      this.logger.info(`Using configured bridge: ${config.name ?? config.ipAddress}`);
    }


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
        break;
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
}

interface HueDiscoveryResponse {
  ipAddress: string;
  name: string | null;
  additionalInfo: unknown;
}

type HueBackupServiceConfiguration = HueDiscoveryResponse;