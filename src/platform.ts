import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import fetch from 'node-fetch';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ADAXPlatformAccessory } from './platformAccessory';

export class ADAXHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  public token = '';

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name, 'conf', this.config);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      
      fetch('https://api-1.adax.no/client-api/auth/token', {
        method: 'POST',
        body: `grant_type=password&username=${this.config.clientId}&password=${this.config.secret}`,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      }).then((res) => {
        return res.json();
      }).then((json) => {
        this.token = json.access_token;
        
        this.discoverDevices();
      });
    });
  }


  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  async discoverDevices() {
    const home = await fetch('https://api-1.adax.no/client-api/rest/v1/content', {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    }).then((res) => {
      return res.json();
    });

    for (const device of home.rooms) {
      const uuid = this.api.hap.uuid.generate(`${device.id}`);

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      if (existingAccessory) {
        if (device) {
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
          new ADAXPlatformAccessory(this, existingAccessory);
          
          this.api.updatePlatformAccessories([existingAccessory]);
        } else if (!device) {
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        }
      } else {
        this.log.info('Adding new accessory:', device.name);
        const accessory = new this.api.platformAccessory(device.name, uuid);

        accessory.context.device = device;
        new ADAXPlatformAccessory(this, accessory);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
