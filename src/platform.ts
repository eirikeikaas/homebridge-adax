import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import fetch from 'node-fetch';
import moment from 'moment';
import equal from 'deep-equal';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { ADAXPlatformAccessory } from './platformAccessory';

export class ADAXHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  public baseUrl = 'https://api-1.adax.no/client-api';
  public token = {
    access_token: '',
    refresh_token: '',
  };

  public homeStamp = moment().subtract(1, 'm');
  public homeState:Home = { rooms: [] };
  public planned:Array<Room> = [];

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

    this.setState = this.setState.bind(this);

    setInterval(this.setState, 3000);
  }

  setState() {
    const state = this.cleanRooms(this.homeState.rooms);

    if (!equal(this.planned, state)) {
      fetch('https://api-1.adax.no/client-api/rest/v1/control', {
        method: 'POST',
        body: JSON.stringify({
          rooms: this.planned,
        }),
        headers: {
          Authorization: `Bearer ${this.token.access_token}`,
          'Content-Type': 'application/json',
        },
      }).then(() => {
        return this.getHome(true, true);
      });
    }
  }

  getToken() {
    return fetch(`${this.baseUrl}/auth/token`, {
      method: 'POST',
      body: `grant_type=password&username=${this.config.clientId}&password=${this.config.secret}`,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    }).then((res) => {
      if(!res.ok) {
        throw res;
      }
      
      return res.json();
    }).then((json) => {
      this.token = json;
      
      this.discoverDevices();
    }).catch((error) => {
      error.text().then((text) => {
        this.log.error(`Could not authenticate with error: ${text}`);
      });
    });
  }
      return res.json();
    }).then((json) => {
      this.token = json;
      
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
          Authorization: `Bearer ${this.token.access_token}`,
        },
      });
    });
  }

  getHome(useIdeal = true, setPlanned = false) {
    if(moment(this.homeStamp).add(5, 's').isAfter(moment())) {
      return Promise.resolve(this.idealState());
    }

    const secondInterval = moment().seconds() % 3;
    const delay = secondInterval > 0 ? secondInterval*1000 : 0;

    return this._getHome(delay).then((res) => {
      if (res.status === 429) {
        return this._getHome(3000);
      }
      return Promise.resolve(res);
    }).then((res) => {
      return res.text();
    }).then((text) => {
      try {
        const json = JSON.parse(text);
        return Promise.resolve(json);
      } catch {
        return Promise.reject(`JSON rejected with following response: ${text}`);
      }
    }).then((home) => {
      this.homeStamp = moment();
      this.homeState = home;

      if (setPlanned) {
        this.planned = this.cleanRooms(home.rooms);
      }

      return useIdeal ? this.idealState() : home;
    }).catch(() => {
      return Promise.resolve(this.idealState());
    });
  }

  idealState() {
    const ideal = this.homeState;

    ideal.rooms.forEach((room, idx) => {
      const id = ideal.rooms[idx].id;
      const planned = this.planned.find((room) => room.id === id);

      if (planned) {
        ideal.rooms[idx].targetTemperature = planned.targetTemperature;
      }
    });

    return ideal;
  }

  setRoom(id, state: Record<string, unknown>) {
    const index = this.planned.findIndex((room) => room.id === id);

    if(index !== undefined) {
      this.planned[index] = {
        id: id,
        ...state,
      };
    }

    return Promise.resolve({
      id: id,
      ...state,
    });
  }

  cleanRooms(rooms) {
    return rooms.map((room) => {
      return {
        id: room.id,
        targetTemperature: room.targetTemperature,
        heatingEnabled: room.heatingEnabled,
      };
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    this.accessories.push(accessory);
  }

  discoverDevices() {
    this.getHome(false).then((home) => {
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

interface Home {
  rooms: Array<Room>;
}

interface Room {
  id: number;
  temperature?: number;
  targetTemperature?: number;
}
