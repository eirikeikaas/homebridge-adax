import { Service, PlatformAccessory } from 'homebridge';

import moment from 'moment';

import { ADAXHomebridgePlatform } from './platform';

export class ADAXPlatformAccessory {
  private service: Service;


  private roomState = {
    id: null,
    heatingEnabled: true,
    targetTemperature: 1800,
    temperature: 1800,
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

    this.roomState = accessory.context.device;
  }

  getRoom() {
    return this.platform.getHome().then((home) => {
      const room = home.rooms.filter((e) => {
        return e.id === this.accessory.context.device.id;
      })[0];

      this.roomState = room;

      return room;
    });
  }

  precision(number: number) {
    return parseFloat(number.toFixed(1));
  }

  heatingState() {
    const { AUTO, HEAT, COOL } = this.platform.Characteristic.TargetHeaterCoolerState;
    let { targetTemperature, temperature } = this.roomState;

    targetTemperature = this.precision(targetTemperature);
    temperature = this.precision(temperature);

    if (targetTemperature === temperature) {
      return AUTO; 
    }

    return targetTemperature > temperature ? HEAT : COOL;
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
    this.getRoom().then((state) => {
      callback(null, this.precision(state.temperature/100));
    });
  }

  handleTemperatureDisplayUnitsGet(callback) {
    callback(this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
  }

  handleTargetTemperatureGet(callback) {
    this.getRoom().then((state) => {
      callback(null, this.precision(state.targetTemperature/100));
    });
  }

  handleTargetTemperatureSet(value, callback) {
    const { id } = this.accessory.context.device;

    this.platform.setRoom(id, {
      targetTemperature: value*100,
    }).then(() => {
      callback(null);
    });
  }
}
