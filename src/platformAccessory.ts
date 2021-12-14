import { PlatformAccessory, Service } from 'homebridge';

import { ADAXHomebridgePlatform } from './platform';

const TEMP_MIN = 5.0;
const TEMP_STEP = 0.5;
const TEMP_MAX = 35.0;

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
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'ADAX')
      .setCharacteristic(this.platform.Characteristic.Model, 'N/A')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'N/A');

    this.service =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name,
    );

    this.service
      .getCharacteristic(
        this.platform.Characteristic.CurrentHeatingCoolingState,
      )
      .on('get', this.handleCurrentHeatingCoolingStateGet.bind(this))
      .setProps({
        validValues: [
          this.platform.Characteristic.CurrentHeatingCoolingState.HEAT,
          this.platform.Characteristic.CurrentHeatingCoolingState.OFF,
        ],
      });

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on('get', this.handleTargetHeatingCoolingStateGet.bind(this))
      .on('set', this.handleTargetHeatingCoolingStateSet.bind(this))
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
          this.platform.Characteristic.TargetHeatingCoolingState.OFF,
        ],
      });
    this.service
      .getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', this.handleTemperatureDisplayUnitsGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.handleCurrentTemperatureGet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('get', this.handleTargetTemperatureGet.bind(this))
      .on('set', this.handleTargetTemperatureSet.bind(this))
      .setProps({
        minValue: TEMP_MIN,
        minStep: TEMP_STEP,
        maxValue: TEMP_MAX,
      });

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

  targetPrecision(number: number) {
    return parseFloat((Math.round(number/TEMP_STEP)*TEMP_STEP).toFixed(1));
  }

  currentPrecision(number: number) {
    return parseFloat(number.toFixed(1));
  }

  currentHeatingState() {
    const { OFF, HEAT } =
      this.platform.Characteristic.CurrentHeatingCoolingState;
    const { heatingEnabled, targetTemperature, temperature } = this.roomState;
    let state = OFF;

    if (heatingEnabled) {
      try {
        state = targetTemperature > temperature ? HEAT : OFF;
      } catch (e) {
        state = OFF;
      }
    } else {
      state = OFF;
    }

    return state;
  }

  targetHeatingState() {
    const { OFF, HEAT } =
      this.platform.Characteristic.TargetHeatingCoolingState;
    const { heatingEnabled } = this.roomState;

    return heatingEnabled ? HEAT : OFF;
  }

  handleCurrentHeatingCoolingStateGet(callback) {
    callback(null, this.currentHeatingState());
  }

  handleTargetHeatingCoolingStateGet(callback) {
    callback(null, this.targetHeatingState());
  }

  handleTargetHeatingCoolingStateSet(value, callback) {
    const { id } = this.accessory.context.device;

    if (value === this.platform.Characteristic.TargetHeatingCoolingState.OFF) {
      this.platform
        .setRoom(id, {
          heatingEnabled: false,
        })
        .then(() => {
          callback(null);
        });
    } else {
      this.platform
        .setRoom(id, {
          targetTemperature: `${this.roomState.temperature}`,
          heatingEnabled: true,
        })
        .then(() => {
          if (this.roomState.targetTemperature < TEMP_MIN) {
            this.roomState.targetTemperature = TEMP_MIN;
          }
          this.roomState.heatingEnabled = true;
          callback(null);
        });
    }
  }

  handleCurrentTemperatureGet(callback) {
    this.getRoom().then((state) => {
      if (!state.temperature) {
        state.temperature = TEMP_MIN * 100;
      }
      callback(null, this.currentPrecision(state.temperature / 100));
    });
  }

  handleTemperatureDisplayUnitsGet(callback) {
    callback(
      null,
      this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS,
    );
  }

  handleTargetTemperatureGet(callback) {
    this.getRoom().then((state) => {
      let temperature = TEMP_MIN;
      temperature = this.targetPrecision(state.targetTemperature / 100);
      if (Number.isNaN(temperature)) {
        temperature = TEMP_MIN;
      }

      callback(null, temperature);
    });
  }

  handleTargetTemperatureSet(value, callback) {
    const { id } = this.accessory.context.device;

    this.platform
      .setRoom(id, {
        targetTemperature: value * 100,
        heatingEnabled: true,
      })
      .then(() => {
        callback(null);
      });
  }
}
