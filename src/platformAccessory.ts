import { Service, PlatformAccessory } from 'homebridge';

import fetch from 'node-fetch';
import moment from 'moment';

import { ADAXHomebridgePlatform } from './platform';

export class ADAXPlatformAccessory {
  private service: Service;


  private roomState = {
    stamp: moment(),
    room: {
      id: null,
      heatingEnabled: true,
      targetTemperature: 1800,
      temperature: 1800,
    },
  };

  constructor(
    private readonly platform: ADAXHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ADAX')
      .setCharacteristic(this.platform.Characteristic.Model, 'N/A')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'N/A');

    this.service = this.accessory.getService(this.platform.Service.Thermostat) ||
                   this.accessory.addService(this.platform.Service.Thermostat);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on('get', this.handleTargetHeatingCoolingStateGet.bind(this))
      .on('set', this.handleTargetHeatingCoolingStateSet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', this.handleTemperatureDisplayUnitsGet.bind(this));
    
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('get', this.handleTargetTemperatureGet.bind(this))
      .on('set', this.handleTargetTemperatureSet.bind(this));

    this.roomState.room = accessory.context.device;
  }

  getDeviceStatus() {
    if(this.roomState.room.id !== undefined && moment(this.roomState.stamp).add(30, 's').isAfter(moment())) {
      return Promise.resolve(this.roomState.room);
    }

    return fetch('https://api-1.adax.no/client-api/rest/v1/content', {
      headers: {
        Authorization: `Bearer ${this.platform.token}`,
      },
    }).then((res) => {
      if (res.status === 429) {
        return Promise.resolve({ rooms: [this.roomState.room] });
      }

      return res.json();
    }).then((json) => {
      const room = json.rooms.filter((e) => {
        return e.id === this.accessory.context.device.id;
      })[0];

      this.roomState = {
        stamp: moment(),
        room: room,
      };

      return room;
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  precision(number: number) {
    return parseFloat(number.toFixed(1));
  }

  heatingState() {
    const { AUTO, HEAT, COOL } = this.platform.Characteristic.TargetHeaterCoolerState;
    let { targetTemperature, temperature } = this.roomState.room;

    targetTemperature = this.precision(targetTemperature);
    temperature = this.precision(temperature);

    if (targetTemperature === temperature) {
      return AUTO; 
    }

    return targetTemperature > temperature ? HEAT : COOL;
  }

  _setDeviceStatus(state, delay = 0) {
    return this.sleep(delay).then(() => {
      return fetch('https://api-1.adax.no/client-api/rest/v1/control', {
        method: 'POST',
        body: JSON.stringify({
          rooms: [
            {
              id: this.accessory.context.device.id,
              ...state,
            },
          ],
        }),
        headers: {
          Authorization: `Bearer ${this.platform.token}`,
          'Content-Type': 'application/json',
        },
      });
    });
  }

  setDeviceStatus(state, delay = 0) {
    return this._setDeviceStatus(state, delay).then((res) => {
      if(res.status === 429) {
        return this._setDeviceStatus(state, 5000);
      } else {
        return Promise.resolve(res);
      }
    }).then((res) => {
      return res.text();
    });
  }

  handleCurrentHeatingCoolingStateGet(callback) {
    callback(null, this.heatingState());
  }

  handleTargetHeatingCoolingStateGet(callback) {
    callback(null, this.heatingState());
  }

  handleTargetHeatingCoolingStateSet(value, callback) {
    callback(null, this.heatingState());
  }

  handleCurrentTemperatureGet(callback) {
    this.getDeviceStatus().then((state) => {
      callback(null, this.precision(state.temperature/100));
    });
  }

  handleTemperatureDisplayUnitsGet(callback) {
    callback(this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
  }

  handleTargetTemperatureGet(callback) {
    this.getDeviceStatus().then((state) => {
      callback(null, this.precision(state.targetTemperature/100));
    });
  }

  handleTargetTemperatureSet(value, callback) {
    this.setDeviceStatus({
      targetTemperature: value*100,
    }).then(() => {
      callback(null);
    });
  }
}
