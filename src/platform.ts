import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import fetch from 'node-fetch';
import moment from 'moment';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ADAXPlatformAccessory } from './platformAccessory';

export class ADAXHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  public baseUrl = 'https://api-1.adax.no/client-api';
  public token = '';

  public homeStamp = moment().subtract(1, 'm');
  public homeState = {};

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name, 'conf', this.config);

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      
      this.getToken();
    });
  }

  getToken() {
    return fetch(`${this.baseUrl}/auth/token`, {
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
  }

  sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _getHome(delay = 0) {
    return this.sleep(delay).then(() => {
      return fetch(`${this.baseUrl}/rest/v1/content`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      });
    });
  }

  getHome() {
    if(moment(this.homeStamp).add(5, 's').isAfter(moment())) {
      return Promise.resolve(this.homeState);
    }

    return this._getHome(0).then((res) => {
      if (res.status === 429) {
        return this._getHome(3000);
      }
      return Promise.resolve(res);
    }).then((res) => {
      return res.json();
    }).then((home) => {
      this.homeStamp = moment();
      this.homeState = home;
      return home;
    }).catch((err) => {
      console.log(err);
      return Promise.resolve(this.homeState);
    });
  }

  _setRoom(id: number, state: Record<string, unknown>, delay = 0) {
    return this.sleep(delay).then(() => {
      return fetch('https://api-1.adax.no/client-api/rest/v1/control', {
        method: 'POST',
        body: JSON.stringify({
          rooms: [
            {
              id: id,
              ...state,
            },
          ],
        }),
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });
    });
  }

  setRoom(id, state: Record<string, unknown>, delay = 0) {
    return this._setRoom(id, state, delay).then((res) => {
      if(res.status === 429) {
        return this._setRoom(id, state, 5000);
      } else {
        return Promise.resolve(res);
      }
    }).then((res) => {
      return res.text();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  discoverDevices() {
    this.getHome().then((home) => {
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
    });
  }
}
